import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectModules } from "../index.js";
import { RunProcessor } from "../run-processor.js";
import { createFilesystemStorage } from "../filesystem-storage.js";
import type { StorageProvider } from "../storage-provider.js";

// Mock the evaluator to return success on first evaluation
vi.mock("../evaluator.js", () => ({
  runLLMJudge: vi.fn().mockResolvedValue({
    successMet: true,
    failureMet: false,
    confidence: 1.0,
    reasoning: "Test passed",
  }),
}));

/**
 * Helper to set up the workspace structure required by RunProcessor:
 *   workspaceDir/
 *     evalstudio.config.json     (workspace config, version 3, with project entries)
 *     projects/
 *       {projectId}/
 *         data/                  (entity storage)
 */
function setupWorkspace(
  workspaceDir: string,
  projectId: string,
  wsOverrides: Record<string, unknown> = {},
  projOverrides: Record<string, unknown> = {},
): StorageProvider {
  const projectDir = join(workspaceDir, "projects", projectId);
  const dataDir = join(projectDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const projectEntry = {
    id: projectId,
    name: "Test Project",
    llmSettings: {
      provider: "openai",
      apiKey: "test-api-key",
    },
    ...projOverrides,
  };
  const wsConfig = {
    version: 3,
    name: "test-workspace",
    projects: [projectEntry],
    ...wsOverrides,
  };
  writeFileSync(
    join(workspaceDir, "evalstudio.config.json"),
    JSON.stringify(wsConfig, null, 2),
  );

  return createFilesystemStorage(workspaceDir);
}

let workspaceDir: string;
let storage: StorageProvider;

describe("RunProcessor", () => {
  let evalId: string;
  let connectorId: string;

  const mockFetch = vi.fn();
  const projectId = "test-project-1";

  // Helper to mock all required fetch calls for a successful run
  const mockSuccessfulRun = (userMessage = "Hello", assistantMessage = "Hello there!") => {
    // Mock LLM response for persona message generation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: userMessage } }],
      }),
      text: async () => JSON.stringify({ choices: [{ message: { role: "assistant", content: userMessage } }] }),
    });

    // Mock connector response - LangGraph returns ALL thread messages.
    // The echoed user message keeps our ID so ID-based filtering removes it.
    // We use a placeholder that will be matched by the seenMessageIds filter.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          messages: [
            { role: "assistant", content: assistantMessage, id: "assistant_resp" },
          ],
        }),
      json: async () => ({
        messages: [
          { role: "assistant", content: assistantMessage, id: "assistant_resp" },
        ],
      }),
    });

    // Mock LLM response for evaluation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "success" } }],
      }),
      text: async () => JSON.stringify({ choices: [{ message: { role: "assistant", content: "success" } }] }),
    });
  };

  beforeAll(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "evalstudio-processor-test-"));
    storage = setupWorkspace(workspaceDir, projectId);

    const modules = createProjectModules(storage, projectId);

    await modules.personas.create({
      name: "Test Persona",
      description: "A test persona",
      systemPrompt: "You are a helpful test user.",
    });

    const scenario = await modules.scenarios.create({
      name: "Test Scenario",
      instructions: "Test the greeting feature",
      successCriteria: "The agent responds with a greeting",
    });

    const connector = await modules.connectors.create({
      name: "Test Connector",
      type: "langgraph",
      config: { assistantId: "test-assistant" },
      baseUrl: "https://api.example.com",
    });
    connectorId = connector.id;

    const evalItem = await modules.evals.create({
      name: "Test Eval",
      connectorId,
      scenarioIds: [scenario.id],
    });
    evalId = evalItem.id;
  });

  afterAll(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true });
    }
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    // Clear runs before each test
    const dataDir = join(workspaceDir, "projects", projectId, "data");
    const runsPath = join(dataDir, "runs.json");
    if (existsSync(runsPath)) {
      rmSync(runsPath);
    }
    // Clear executions before each test
    const executionsPath = join(dataDir, "executions.json");
    if (existsSync(executionsPath)) {
      rmSync(executionsPath);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    it("creates processor with default options", () => {
      const processor = new RunProcessor({ workspaceDir, storage });
      expect(processor.isRunning()).toBe(false);
      expect(processor.getActiveRunCount()).toBe(0);
    });

    it("creates processor with custom options", () => {
      const processor = new RunProcessor({
        workspaceDir,
        storage,
        pollIntervalMs: 1000,
        maxConcurrent: 5,
      });
      expect(processor.isRunning()).toBe(false);
    });

    it("reads maxConcurrency from workspace config when not provided", async () => {
      // Write workspace config with maxConcurrency
      writeFileSync(
        join(workspaceDir, "evalstudio.config.json"),
        JSON.stringify({
          version: 3,
          name: "test-workspace",
          projects: [{ id: projectId, name: "Test Project", llmSettings: { provider: "openai", apiKey: "test-api-key" } }],
          maxConcurrency: 7,
        }, null, 2)
      );

      const runMod = createProjectModules(storage, projectId).runs;

      // Create 8 queued runs
      for (let i = 0; i < 8; i++) {
        await runMod.create({ evalId });
      }

      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            messages: [{ role: "user", content: "Hello!" }, { role: "assistant", content: "Done" }],
          }),
      }));

      // Processor should read maxConcurrency=7 from workspace config
      const processor = new RunProcessor({ workspaceDir, storage });
      const started = await processor.processOnce();
      expect(started).toBe(7);

      // Restore workspace config
      writeFileSync(
        join(workspaceDir, "evalstudio.config.json"),
        JSON.stringify({
          version: 3,
          name: "test-workspace",
          projects: [{ id: projectId, name: "Test Project", llmSettings: { provider: "openai", apiKey: "test-api-key" } }],
        }, null, 2)
      );
    });

    it("uses explicit maxConcurrent over workspace config", async () => {
      // Write workspace config with maxConcurrency=10
      writeFileSync(
        join(workspaceDir, "evalstudio.config.json"),
        JSON.stringify({
          version: 3,
          name: "test-workspace",
          projects: [{ id: projectId, name: "Test Project", llmSettings: { provider: "openai", apiKey: "test-api-key" } }],
          maxConcurrency: 10,
        }, null, 2)
      );

      const runMod = createProjectModules(storage, projectId).runs;

      // Create 5 queued runs
      for (let i = 0; i < 5; i++) {
        await runMod.create({ evalId });
      }

      mockFetch.mockImplementation(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            messages: [{ role: "user", content: "Hello!" }, { role: "assistant", content: "Done" }],
          }),
      }));

      // Explicit maxConcurrent=2 should override workspace config's 10
      const processor = new RunProcessor({ workspaceDir, storage, maxConcurrent: 2 });
      const started = await processor.processOnce();
      expect(started).toBe(2);

      // Restore workspace config
      writeFileSync(
        join(workspaceDir, "evalstudio.config.json"),
        JSON.stringify({
          version: 3,
          name: "test-workspace",
          projects: [{ id: projectId, name: "Test Project", llmSettings: { provider: "openai", apiKey: "test-api-key" } }],
        }, null, 2)
      );
    });
  });

  describe("start/stop", () => {
    it("starts and stops the processor", async () => {
      const processor = new RunProcessor({ workspaceDir, storage, pollIntervalMs: 100 });

      processor.start();
      expect(processor.isRunning()).toBe(true);

      await processor.stop();
      expect(processor.isRunning()).toBe(false);
    });

    it("does not start twice", () => {
      const processor = new RunProcessor({ workspaceDir, storage, pollIntervalMs: 100 });

      processor.start();
      processor.start(); // Should be a no-op

      expect(processor.isRunning()).toBe(true);

      processor.stop();
    });
  });

  describe("processOnce", () => {
    it("processes queued runs", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      const run = await runMod.create({
        evalId,
      });

      mockSuccessfulRun("Hello", "Hello there!");

      const processor = new RunProcessor({ workspaceDir, storage });
      const started = await processor.processOnce();

      expect(started).toBe(1);

      // processOnce waits for completion, so run should be done
      const updatedRun = await runMod.get(run.id);
      if (updatedRun?.status === "error") {
        console.log("Run error:", updatedRun.error);
      }
      expect(updatedRun?.status).toBe("completed");
      // Messages include: system prompt, user input, assistant response
      expect(updatedRun?.messages).toHaveLength(3);
      expect(updatedRun?.messages[0].role).toBe("system");
      expect(updatedRun?.messages[1].role).toBe("user");
      expect(updatedRun?.messages[1].content).toBe("Hello");
      expect(updatedRun?.messages[2].role).toBe("assistant");
      expect(updatedRun?.messages[2].content).toBe("Hello there!");
    });

    it("respects maxConcurrent limit", async () => {
      const runMod = createProjectModules(storage, projectId).runs;

      // Create multiple queued runs
      await runMod.create({ evalId });
      await runMod.create({ evalId });
      await runMod.create({ evalId });

      mockFetch.mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              messages: [{ role: "user", content: "Hello!" }, { role: "assistant", content: "Done" }],
            }),
        };
      });

      const processor = new RunProcessor({ workspaceDir, storage, maxConcurrent: 2 });
      const started = await processor.processOnce();

      // Should only start 2 due to maxConcurrent (processOnce processes one batch)
      expect(started).toBe(2);
    });
  });

  describe("callbacks", () => {
    it("calls onRunStart callback", async () => {
      const onRunStart = vi.fn();
      const runMod = createProjectModules(storage, projectId).runs;
      await runMod.create({ evalId });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            messages: [{ role: "user", content: "Hello!" }, { role: "assistant", content: "Hi" }],
          }),
      });

      const processor = new RunProcessor({ workspaceDir, storage, onRunStart });
      await processor.processOnce();

      expect(onRunStart).toHaveBeenCalledTimes(1);
      expect(onRunStart).toHaveBeenCalledWith(expect.objectContaining({ evalId }));
    });

    it("calls onRunComplete callback on success", async () => {
      const onRunComplete = vi.fn();
      const runMod = createProjectModules(storage, projectId).runs;
      await runMod.create({ evalId });

      mockSuccessfulRun("Hello", "Hi");

      const processor = new RunProcessor({ workspaceDir, storage, onRunComplete });
      await processor.processOnce();

      expect(onRunComplete).toHaveBeenCalledTimes(1);
      expect(onRunComplete).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
        expect.objectContaining({ success: true })
      );
    });

    it("calls onRunError callback on failure", async () => {
      const onRunError = vi.fn();
      const runMod = createProjectModules(storage, projectId).runs;
      await runMod.create({ evalId });

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const processor = new RunProcessor({ workspaceDir, storage, onRunError });
      await processor.processOnce();

      expect(onRunError).toHaveBeenCalledTimes(1);
      expect(onRunError).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error" }),
        expect.any(Error)
      );
    });

    it("calls onStatusChange callback", async () => {
      const onStatusChange = vi.fn();
      const runMod = createProjectModules(storage, projectId).runs;
      await runMod.create({ evalId });

      mockSuccessfulRun("Hello", "Hi");

      const processor = new RunProcessor({ workspaceDir, storage, onStatusChange });
      await processor.processOnce();

      expect(onStatusChange).toHaveBeenCalledTimes(2); // running + completed
      expect(onStatusChange).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        "running",
        expect.any(Object)
      );
      expect(onStatusChange).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        "completed",
        expect.any(Object)
      );
    });
  });

  describe("error handling", () => {
    it("marks run as error when connector invocation fails", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      const run = await runMod.create({ evalId });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const processor = new RunProcessor({ workspaceDir, storage });
      await processor.processOnce();

      const updatedRun = await runMod.get(run.id);
      expect(updatedRun?.status).toBe("error");
      expect(updatedRun?.error).toContain("500");
    });

    it("processes run successfully when eval exists", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      const run = await runMod.create({ evalId });

      mockSuccessfulRun("Hello!", "Hi");

      const processor = new RunProcessor({ workspaceDir, storage });
      await processor.processOnce();

      // Run should be completed since eval exists
      const updatedRun = await runMod.get(run.id);
      expect(updatedRun?.status).toBe("completed");
    });
  });

  describe("atomic claiming", () => {
    it("prevents duplicate processing of the same run", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      const run = await runMod.create({ evalId });

      // Manually set status to running (simulating another processor claimed it)
      await runMod.update(run.id, { status: "running" });

      const processor = new RunProcessor({ workspaceDir, storage });
      const started = await processor.processOnce();

      // Should not claim the already-running run
      expect(started).toBe(0);
    });
  });

  describe("crash recovery", () => {
    it("resets running runs to queued on start", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      // Create a run and set it to "running" (simulating crash)
      const run = await runMod.create({ evalId });
      await runMod.update(run.id, { status: "running" });

      // Use maxConcurrent: 0 to prevent tick() from claiming the run
      // This allows us to verify recovery happened before processing
      const processor = new RunProcessor({ workspaceDir, storage, maxConcurrent: 0 });
      processor.start();

      // Give recovery a moment to complete (it's fire-and-forget async)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that run was reset to queued
      const resetRun = await runMod.get(run.id);
      expect(resetRun?.status).toBe("queued");

      await processor.stop();
    });
  });

  describe("seed flow routing", () => {
    it("invokes connector when last seed message is from user", async () => {
      const runMod = createProjectModules(storage, projectId).runs;
      const run = await runMod.create({ evalId });

      mockSuccessfulRun("Hello!", "Hello there!");

      const processor = new RunProcessor({ workspaceDir, storage });
      await processor.processOnce();

      // Connector should have been called
      expect(mockFetch).toHaveBeenCalled();

      const updatedRun = await runMod.get(run.id);
      expect(updatedRun?.status).toBe("completed");
      expect(updatedRun?.messages.some((m) => m.role === "assistant")).toBe(true);
    });
  });
});

describe("listRuns with options", () => {
  let tempDir: string;
  let storage: StorageProvider;
  let evalId: string;

  const projectId = "listruns-project";

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "evalstudio-listruns-test-"));
    storage = setupWorkspace(tempDir, projectId);

    const modules = createProjectModules(storage, projectId);

    const scenario = await modules.scenarios.create({ name: "List Test Scenario" });

    const connector = await modules.connectors.create({
      name: "List Test Connector",
      type: "langgraph",
      config: { assistantId: "test-assistant" },
      baseUrl: "https://api.example.com",
    });

    const evalItem = await modules.evals.create({
      name: "List Test Eval",
      connectorId: connector.id,
      scenarioIds: [scenario.id],
    });
    evalId = evalItem.id;
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const dataDir = join(tempDir, "projects", projectId, "data");
    const runsPath = join(dataDir, "runs.json");
    if (existsSync(runsPath)) {
      rmSync(runsPath);
    }
    const executionsPath = join(dataDir, "executions.json");
    if (existsSync(executionsPath)) {
      rmSync(executionsPath);
    }
  });

  it("filters by status", async () => {
    const runMod = createProjectModules(storage, projectId).runs;
    const run1 = await runMod.create({ evalId });
    const run2 = await runMod.create({ evalId });
    await runMod.update(run1.id, { status: "running" });

    const queued = await runMod.list({ status: "queued" });
    const running = await runMod.list({ status: "running" });

    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(run2.id);
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe(run1.id);
  });

  it("applies limit", async () => {
    const runMod = createProjectModules(storage, projectId).runs;
    await runMod.create({ evalId });
    await runMod.create({ evalId });
    await runMod.create({ evalId });

    const limited = await runMod.list({ limit: 2 });

    expect(limited).toHaveLength(2);
  });

  it("combines multiple filters", async () => {
    const runMod = createProjectModules(storage, projectId).runs;
    await runMod.create({ evalId });
    const run2 = await runMod.create({ evalId });
    await runMod.create({ evalId });
    await runMod.update(run2.id, { status: "running" });

    const result = await runMod.list({ status: "queued", limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("queued");
  });
});
