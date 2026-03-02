import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectModules } from "../index.js";
import { RunProcessor } from "../run-processor.js";
import { EvaluatorRegistry } from "../evaluator-registry.js";
import { createFilesystemStorage } from "../filesystem-storage.js";
import type { StorageProvider } from "../storage-provider.js";
import type { EvaluatorDefinition } from "../evaluator.js";

// Keep runEvaluators real, only mock runLLMJudge
vi.mock("../evaluator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../evaluator.js")>();
  return {
    ...actual,
    runLLMJudge: vi.fn().mockResolvedValue({
      successMet: true,
      failureMet: false,
      confidence: 1.0,
      reasoning: "Test passed",
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupWorkspace(
  workspaceDir: string,
  projectId: string,
): StorageProvider {
  const projectDir = join(workspaceDir, "projects", projectId);
  const dataDir = join(projectDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const wsConfig = {
    version: 3,
    name: "test-workspace",
    projects: [{
      id: projectId,
      name: "Test Project",
      llmSettings: { provider: "openai", apiKey: "test-api-key" },
    }],
  };
  writeFileSync(
    join(workspaceDir, "evalstudio.config.json"),
    JSON.stringify(wsConfig, null, 2),
  );

  return createFilesystemStorage(workspaceDir);
}

function makeRegistry(...evaluators: EvaluatorDefinition[]): EvaluatorRegistry {
  const registry = new EvaluatorRegistry();
  for (const def of evaluators) {
    registry.register(def, false);
  }
  return registry;
}

// Mock a successful persona gen + connector response
function mockSuccessfulFetch(mockFetch: ReturnType<typeof vi.fn>) {
  // Persona message generation (LLM call)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: "assistant", content: "Hello" } }],
    }),
    text: async () => JSON.stringify({
      choices: [{ message: { role: "assistant", content: "Hello" } }],
    }),
  });

  // Connector response
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      messages: [{ role: "assistant", content: "Hi there!", id: "resp_1" }],
    }),
    json: async () => ({
      messages: [{ role: "assistant", content: "Hi there!", id: "resp_1" }],
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunProcessor with custom evaluators", () => {
  let workspaceDir: string;
  let storage: StorageProvider;
  let evalId: string;
  const mockFetch = vi.fn();
  const projectId = "eval-test-project";

  beforeAll(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "evalstudio-eval-integration-"));
    storage = setupWorkspace(workspaceDir, projectId);

    const modules = createProjectModules(storage, projectId);

    await modules.personas.create({
      name: "Test Persona",
      description: "A test persona",
      systemPrompt: "You are a helpful test user.",
    });

    const scenario = await modules.scenarios.create({
      name: "Evaluator Test Scenario",
      instructions: "Test evaluator integration",
      successCriteria: "The agent responds",
    });

    const connector = await modules.connectors.create({
      name: "Test Connector",
      type: "langgraph",
      config: { assistantId: "test-assistant" },
      baseUrl: "https://api.example.com",
    });

    const evalItem = await modules.evals.create({
      name: "Test Eval",
      connectorId: connector.id,
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
    const dataDir = join(workspaceDir, "projects", projectId, "data");
    for (const file of ["runs.json", "executions.json"]) {
      const path = join(dataDir, file);
      if (existsSync(path)) rmSync(path);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("runs auto metric evaluators and stores results in output", async () => {
    const latencyMetric: EvaluatorDefinition = {
      type: "test-latency",
      label: "Test Latency",
      kind: "metric",
      auto: true,
      async evaluate(ctx) {
        return {
          success: true,
          value: ctx.lastInvocation.latencyMs,
          reason: `Latency: ${ctx.lastInvocation.latencyMs}ms`,
        };
      },
    };

    const registry = makeRegistry(latencyMetric);

    const modules = createProjectModules(storage, projectId);
    const run = await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    const updatedRun = await modules.runs.get(run.id);
    expect(updatedRun?.status).toBe("completed");

    const output = updatedRun?.output as Record<string, unknown>;
    const evaluatorResults = output?.evaluatorResults as Array<Record<string, unknown>>;
    expect(evaluatorResults).toBeDefined();
    expect(evaluatorResults.some(r => r.type === "test-latency")).toBe(true);

    const metrics = output?.metrics as Record<string, number>;
    expect(metrics?.["test-latency"]).toBeDefined();
  });

  it("stops run when auto assertion fails", async () => {
    const failingAssertion: EvaluatorDefinition = {
      type: "always-fail",
      label: "Always Fail",
      kind: "assertion",
      auto: true,
      async evaluate() {
        return {
          success: false,
          reason: "Intentional failure for testing",
        };
      },
    };

    const registry = makeRegistry(failingAssertion);

    const modules = createProjectModules(storage, projectId);
    const run = await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    const updatedRun = await modules.runs.get(run.id);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedRun?.result?.success).toBe(false);
    expect(updatedRun?.result?.reason).toContain("Evaluator assertion failed");
    expect(updatedRun?.result?.reason).toContain("Intentional failure for testing");
  });

  it("runs auto evaluators even when not in scenario evaluators list", async () => {
    const autoMetric: EvaluatorDefinition = {
      type: "auto-metric",
      label: "Auto Metric",
      kind: "metric",
      auto: true,
      async evaluate() {
        return { success: true, value: 99, reason: "Auto ran" };
      },
    };

    const registry = makeRegistry(autoMetric);

    const modules = createProjectModules(storage, projectId);
    const run = await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    const updatedRun = await modules.runs.get(run.id);
    expect(updatedRun?.status).toBe("completed");

    const output = updatedRun?.output as Record<string, unknown>;
    const evaluatorResults = output?.evaluatorResults as Array<Record<string, unknown>>;
    expect(evaluatorResults.some(r => r.type === "auto-metric")).toBe(true);

    const metrics = output?.metrics as Record<string, number>;
    expect(metrics?.["auto-metric"]).toBe(99);
  });

  it("runs both metric and assertion evaluators together", async () => {
    const metric: EvaluatorDefinition = {
      type: "msg-count",
      label: "Message Count",
      kind: "metric",
      auto: true,
      async evaluate(ctx) {
        return {
          success: true,
          value: ctx.messages.length,
          reason: `${ctx.messages.length} messages`,
        };
      },
    };

    const passingAssertion: EvaluatorDefinition = {
      type: "has-response",
      label: "Has Response",
      kind: "assertion",
      auto: true,
      async evaluate(ctx) {
        const hasAssistant = ctx.lastInvocation.messages.some(m => m.role === "assistant");
        return {
          success: hasAssistant,
          reason: hasAssistant ? "Response found" : "No response",
        };
      },
    };

    const registry = makeRegistry(metric, passingAssertion);

    const modules = createProjectModules(storage, projectId);
    const run = await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    const updatedRun = await modules.runs.get(run.id);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedRun?.result?.success).toBe(true);

    const output = updatedRun?.output as Record<string, unknown>;
    const evaluatorResults = output?.evaluatorResults as Array<Record<string, unknown>>;
    expect(evaluatorResults).toHaveLength(2);
    expect(evaluatorResults.some(r => r.type === "msg-count" && r.kind === "metric")).toBe(true);
    expect(evaluatorResults.some(r => r.type === "has-response" && r.kind === "assertion")).toBe(true);
  });

  it("evaluator receives correct context fields", async () => {
    let capturedTurn = 0;
    let capturedIsFinal = false;
    let capturedScenarioName = "";

    const inspector: EvaluatorDefinition = {
      type: "inspector",
      label: "Inspector",
      kind: "metric",
      auto: true,
      async evaluate(ctx) {
        capturedTurn = ctx.turn;
        capturedIsFinal = ctx.isFinal;
        capturedScenarioName = ctx.scenario.name;
        return { success: true, value: ctx.turn, reason: `Turn ${ctx.turn}` };
      },
    };

    const registry = makeRegistry(inspector);

    const modules = createProjectModules(storage, projectId);
    await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    expect(capturedTurn).toBe(1);
    expect(capturedScenarioName).toBe("Evaluator Test Scenario");
    // isFinal depends on whether LLM judge said success — it did (mocked), so isFinal should be true
    expect(capturedIsFinal).toBe(true);
  });

  it("non-auto evaluators only run when listed in scenario", async () => {
    const nonAutoMetric: EvaluatorDefinition = {
      type: "opt-in-metric",
      label: "Opt-in Metric",
      kind: "metric",
      // auto is NOT set — should not run unless scenario references it
      async evaluate() {
        return { success: true, value: 1, reason: "Should not appear" };
      },
    };

    const registry = makeRegistry(nonAutoMetric);

    const modules = createProjectModules(storage, projectId);
    const run = await modules.runs.create({ evalId });

    mockSuccessfulFetch(mockFetch);

    const processor = new RunProcessor({
      workspaceDir,
      storage,
      evaluatorRegistry: registry,
    });
    await processor.processOnce();

    const updatedRun = await modules.runs.get(run.id);
    expect(updatedRun?.status).toBe("completed");

    const output = updatedRun?.output as Record<string, unknown>;
    // No evaluator results since the non-auto evaluator wasn't in the scenario
    expect(output?.evaluatorResults).toBeUndefined();
  });
});
