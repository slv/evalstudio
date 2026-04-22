import { randomUUID } from "node:crypto";
import type { ConnectorInvokeResult } from "./connector.js";
import { getLLMProviderFromProjectConfig, type LLMProvider } from "./llm-provider.js";
import type { Persona } from "./persona.js";
import type { Scenario } from "./scenario.js";
import type { Run, RunStatus, RunResult } from "./run.js";
import { getProjectConfig } from "./project.js";
import { readWorkspaceConfig } from "./project.js";
import type { Message } from "./types.js";
import { buildTestAgentSystemPrompt } from "./prompt.js";
import {
  runLLMJudge,
  runEvaluators,
  type LLMJudgeResult,
  type EvaluatorResults,
  type EvaluatorDefinition,
} from "./evaluator.js";
import { generatePersonaMessage } from "./persona-generator.js";
import { createProjectModules, type ProjectModules } from "./module-factory.js";
import type { StorageProvider } from "./storage-provider.js";
import type { EvaluatorRegistry } from "./evaluator-registry.js";
import { ConnectorRegistry } from "./connector-registry.js";
import { builtinConnectors } from "./connectors/index.js";

export type { RunStatus };

export interface RunProcessorOptions {
  /** Workspace root directory */
  workspaceDir: string;
  /** Storage provider for entity and project access */
  storage: StorageProvider;
  /** Polling interval in milliseconds (default: 5000) */
  pollIntervalMs?: number;
  /** Maximum concurrent run executions (default: from workspace config, then 3) */
  maxConcurrent?: number;
  /** Evaluator registry for custom evaluators (optional — if not provided, only LLM-as-judge runs) */
  evaluatorRegistry?: EvaluatorRegistry;
  /** Connector registry for connector type resolution (optional — defaults to built-in connectors) */
  connectorRegistry?: ConnectorRegistry;
  /** Callback for status changes */
  onStatusChange?: (runId: string, status: RunStatus, run: Run) => void;
  /** Callback when a run starts */
  onRunStart?: (run: Run) => void;
  /** Callback when a run completes */
  onRunComplete?: (run: Run, result: ConnectorInvokeResult) => void;
  /** Callback when a run fails */
  onRunError?: (run: Run, error: Error) => void;
}

interface InternalOptions {
  workspaceDir: string;
  storage: StorageProvider;
  pollIntervalMs: number;
  maxConcurrent: number;
  evaluatorRegistry?: EvaluatorRegistry;
  connectorRegistry?: ConnectorRegistry;
  onStatusChange?: (runId: string, status: RunStatus, run: Run) => void;
  onRunStart?: (run: Run) => void;
  onRunComplete?: (run: Run, result: ConnectorInvokeResult) => void;
  onRunError?: (run: Run, error: Error) => void;
}

/** All resolved dependencies needed to execute a run */
interface RunContext {
  modules: ProjectModules;
  run: Run;
  connectorId: string;
  llmProvider: LLMProvider;
  evaluationModel?: string;
  personaModel?: string;
  scenario: Scenario;
  persona: Persona | undefined;
  maxMessages: number;
  hasLLMJudge: boolean;
  resolvedEvaluators: Array<{ definition: EvaluatorDefinition; config: Record<string, unknown> }>;
}

/** Mutable state accumulated during the evaluation loop */
class LoopState {
  messages: Message[];
  totalLatencyMs = 0;
  connectorCallCount = 0;
  totalInputTokens = 0;
  totalOutputTokens = 0;
  threadId: string | undefined;
  lastResult: ConnectorInvokeResult | undefined;
  llmJudgeResult: LLMJudgeResult | undefined;
  evalResults: EvaluatorResults | undefined;

  // seenMessageIds: INPUT-side filtering only.
  // Tells buildInvokeRequest which messages have already been sent
  // so it only sends NEW messages on subsequent connector calls.
  // Starts EMPTY so the first call sends everything.
  readonly seenMessageIds = new Set<string>();

  constructor(initialMessages: Message[]) {
    this.messages = [...initialMessages];
  }

  /** Count only user and assistant messages (exclude system) */
  get conversationMessageCount(): number {
    return this.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
  }

  /** Record a connector invocation result */
  recordInvocation(result: ConnectorInvokeResult, sentMessages: Message[]): void {
    this.lastResult = result;
    this.totalLatencyMs += result.latencyMs;
    this.connectorCallCount++;

    if (result.tokensUsage) {
      this.totalInputTokens += result.tokensUsage.input_tokens;
      this.totalOutputTokens += result.tokensUsage.output_tokens;
    }

    if (result.threadId) {
      this.threadId = result.threadId;
    }

    // Track all message IDs we've seen (both sent and received) for next iteration
    for (const msg of sentMessages) {
      if (msg.id) this.seenMessageIds.add(msg.id);
    }
    for (const msg of result.messages!) {
      if (msg.id) this.seenMessageIds.add(msg.id);
    }
  }

  /** Build the token usage object, or undefined if no tokens were tracked */
  get tokensUsage(): { input_tokens: number; output_tokens: number; total_tokens: number } | undefined {
    if (this.totalInputTokens === 0 && this.totalOutputTokens === 0) return undefined;
    return {
      input_tokens: this.totalInputTokens,
      output_tokens: this.totalOutputTokens,
      total_tokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }
}

/**
 * Background processor for executing queued evaluation runs.
 *
 * A single RunProcessor serves all projects in a workspace.
 * On each poll cycle, it iterates over all projects to find queued runs
 * and executes them using each project's effective config.
 */

function builtinFallbackRegistry(): ConnectorRegistry {
  const r = new ConnectorRegistry();
  for (const def of builtinConnectors) r.register(def, true);
  return r;
}

export class RunProcessor {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private activeRuns = new Map<string, Promise<void>>();
  private options: InternalOptions;

  constructor(options: RunProcessorOptions) {
    // Read maxConcurrency from workspace config as fallback
    let configMaxConcurrency: number | undefined;
    if (options.maxConcurrent === undefined) {
      try {
        const wsConfig = readWorkspaceConfig(options.workspaceDir);
        configMaxConcurrency = wsConfig.maxConcurrency;
      } catch {
        // No workspace config available, use default
      }
    }

    this.options = {
      workspaceDir: options.workspaceDir,
      storage: options.storage,
      pollIntervalMs: options.pollIntervalMs ?? 5000,
      maxConcurrent: options.maxConcurrent ?? configMaxConcurrency ?? 3,
      evaluatorRegistry: options.evaluatorRegistry,
      onStatusChange: options.onStatusChange,
      onRunStart: options.onRunStart,
      onRunComplete: options.onRunComplete,
      onRunError: options.onRunError,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.recoverStuckRuns();
    this.intervalId = setInterval(() => this.tick(), this.options.pollIntervalMs);
    this.tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await Promise.all(this.activeRuns.values());
  }

  async processOnce(): Promise<number> {
    return this.tick(true);
  }

  isRunning(): boolean {
    return this.running;
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  // ── Tick / scheduling ────────────────────────────────────────────────────

  private async tick(oneShot = false): Promise<number> {
    if (!oneShot && !this.running && this.activeRuns.size === 0) return 0;

    const availableSlots = this.options.maxConcurrent - this.activeRuns.size;
    if (availableSlots <= 0) return 0;

    const { storage } = this.options;

    let projects: Array<{ id: string; name: string }>;
    try {
      projects = await storage.listProjects();
    } catch {
      return 0;
    }

    let started = 0;
    const promises: Promise<void>[] = [];
    let remaining = availableSlots;

    for (const project of projects) {
      if (remaining <= 0) break;

      const modules = createProjectModules(storage, project.id, this.options.connectorRegistry ?? builtinFallbackRegistry());
      const queuedRuns = await modules.runs.list({ status: "queued", limit: remaining });

      for (const run of queuedRuns) {
        if (remaining <= 0) break;
        if (this.activeRuns.has(run.id)) continue;

        const claimed = await this.claimRun(modules, run.id);
        if (!claimed) continue;

        const promise = this.executeRun(project.id, modules, run);
        this.activeRuns.set(run.id, promise);
        started++;
        remaining--;

        if (oneShot) promises.push(promise);
        promise.finally(() => this.activeRuns.delete(run.id));
      }
    }

    if (oneShot && promises.length > 0) {
      await Promise.all(promises);
    }

    return started;
  }

  private async claimRun(modules: ProjectModules, runId: string): Promise<boolean> {
    const run = await modules.runs.get(runId);
    if (!run || run.status !== "queued") return false;

    const updated = await modules.runs.update(runId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    return updated !== undefined;
  }

  // ── Run execution ────────────────────────────────────────────────────────

  private async executeRun(projectId: string, modules: ProjectModules, run: Run): Promise<void> {
    let currentRun = await modules.runs.get(run.id);
    if (!currentRun) return;

    try {
      this.options.onStatusChange?.(currentRun.id, "running", currentRun);
      this.options.onRunStart?.(currentRun);

      const ctx = await this.resolveRunContext(projectId, modules, currentRun);
      await this.executeEvaluationLoop(ctx);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      const updatedRun = await modules.runs.update(currentRun.id, {
        status: "error",
        error: err.message,
        completedAt: new Date().toISOString(),
      });

      if (updatedRun) {
        this.options.onStatusChange?.(currentRun.id, "error", updatedRun);
        this.options.onRunError?.(updatedRun, err);
      }
    }

    await this.maybePruneProject(projectId, modules);
  }

  /** Prune old executions/runs when no more work is queued or running */
  private async maybePruneProject(projectId: string, modules: ProjectModules): Promise<void> {
    try {
      const queued = await modules.runs.list({ status: "queued", limit: 1 });
      const running = await modules.runs.list({ status: "running", limit: 1 });
      if (queued.length === 0 && running.length === 0) {
        await this.options.storage.pruneProjectData?.(projectId);
      }
    } catch {
      // Pruning is best-effort
    }
  }

  /** Resolves all dependencies needed for a run into a RunContext */
  private async resolveRunContext(
    projectId: string,
    modules: ProjectModules,
    currentRun: Run
  ): Promise<RunContext> {
    const { storage, workspaceDir } = this.options;

    // Determine connector ID
    let connectorId: string;
    if (currentRun.evalId) {
      const evalItem = await modules.evals.get(currentRun.evalId);
      if (!evalItem) throw new Error(`Eval not found: ${currentRun.evalId}`);
      if (!evalItem.connectorId) throw new Error("Eval has no connector assigned");
      connectorId = evalItem.connectorId;
    } else {
      if (!currentRun.connectorId) throw new Error("Playground run has no connector assigned");
      connectorId = currentRun.connectorId;
    }

    // Resolve LLM config
    const config = await getProjectConfig(storage, workspaceDir, projectId);
    const llmProvider = await getLLMProviderFromProjectConfig(storage, workspaceDir, projectId);
    const models = config.llmSettings?.models;
    const evaluationModel = models?.evaluation;
    const personaModel = models?.persona || evaluationModel;

    // Resolve scenario and persona
    if (!currentRun.scenarioId) throw new Error(`Run ${currentRun.id} has no scenario`);
    const scenario = await modules.scenarios.get(currentRun.scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${currentRun.scenarioId}`);

    const persona = currentRun.personaId
      ? await modules.personas.get(currentRun.personaId)
      : undefined;

    // Build initial messages and store in run
    const allMessages = this.buildAllMessages(scenario, persona);
    const runWithMessages = await modules.runs.update(currentRun.id, { messages: allMessages });
    const run = runWithMessages ?? currentRun;

    // Resolve evaluators: always-active first, then scenario-specific
    const hasLLMJudge = !!(scenario.successCriteria || scenario.failureCriteria);
    const resolvedEvaluators: RunContext["resolvedEvaluators"] = [];
    const resolvedTypes = new Set<string>();

    // Inject auto evaluators from registry
    if (this.options.evaluatorRegistry) {
      for (const info of this.options.evaluatorRegistry.list()) {
        if (info.auto) {
          const def = this.options.evaluatorRegistry.get(info.type)!;
          resolvedEvaluators.push({ definition: def, config: {} });
          resolvedTypes.add(info.type);
        }
      }
    }

    // Add scenario-specific evaluators (skip if already injected as auto)
    if (scenario.evaluators && scenario.evaluators.length > 0 && this.options.evaluatorRegistry) {
      for (const se of scenario.evaluators) {
        if (resolvedTypes.has(se.type)) continue;
        const def = this.options.evaluatorRegistry.get(se.type);
        if (!def) throw new Error(`Unknown evaluator type: "${se.type}"`);
        resolvedEvaluators.push({ definition: def, config: se.config ?? {} });
      }
    }

    if (!hasLLMJudge && resolvedEvaluators.length === 0) {
      throw new Error("Scenario must have success/failure criteria or evaluators defined");
    }

    return {
      modules,
      run,
      connectorId,
      llmProvider,
      evaluationModel,
      personaModel,
      scenario,
      persona,
      maxMessages: scenario.maxMessages ?? 10,
      hasLLMJudge,
      resolvedEvaluators,
    };
  }

  // ── Evaluation loop ──────────────────────────────────────────────────────

  private async executeEvaluationLoop(ctx: RunContext): Promise<void> {
    const { modules, run, connectorId, scenario, persona, maxMessages, hasLLMJudge, resolvedEvaluators } = ctx;
    const state = new LoopState(run.messages);
    const failureMode = scenario.failureCriteriaMode ?? "on_max_messages";

    // Generate initial user message if needed
    await this.ensureInitialUserMessage(ctx, state);

    while (state.conversationMessageCount < maxMessages) {
      // Invoke connector
      const conversationMessages = state.messages.filter((m) => m.role !== "system");
      const result = await modules.connectors.invoke(connectorId, {
        messages: conversationMessages,
        runId: run.threadId ?? run.id,
        seenMessageIds: state.seenMessageIds,
        extraHeaders: persona?.headers,
      });

      if (!result.success || !result.messages || result.messages.length === 0) {
        throw new Error(result.error || "No response messages from connector");
      }

      state.messages = [...state.messages, ...result.messages];
      state.recordInvocation(result, conversationMessages);
      await modules.runs.update(run.id, { messages: state.messages });

      // Evaluate criteria
      if (hasLLMJudge) {
        state.llmJudgeResult = await runLLMJudge({
          messages: state.messages,
          successCriteria: scenario.successCriteria,
          failureCriteria: scenario.failureCriteria,
          llmProvider: ctx.llmProvider,
          model: ctx.evaluationModel,
        });
      }

      // Run custom evaluators
      if (resolvedEvaluators.length > 0) {
        const llmJudgeWantsStop = state.llmJudgeResult && (
          state.llmJudgeResult.successMet ||
          (state.llmJudgeResult.failureMet && failureMode === "every_turn")
        );
        state.evalResults = await runEvaluators(resolvedEvaluators, {
          messages: state.messages,
          scenario: { name: scenario.name, instructions: scenario.instructions, maxMessages: scenario.maxMessages },
          persona: persona ? { name: persona.name, description: persona.description } : undefined,
          lastInvocation: {
            latencyMs: result.latencyMs,
            messages: result.messages,
            tokensUsage: result.tokensUsage,
          },
          turn: state.connectorCallCount,
          isFinal: state.conversationMessageCount >= maxMessages || !!llmJudgeWantsStop,
        });
      }

      // Check stop conditions
      const llmJudgeSuccess = state.llmJudgeResult?.successMet ?? false;
      const llmJudgeFailureEarly = !!(state.llmJudgeResult?.failureMet && failureMode === "every_turn");
      const failedAssertion = state.evalResults?.evaluatorResults.find(
        r => r.kind === "assertion" && !r.success
      );

      if (llmJudgeSuccess || llmJudgeFailureEarly || failedAssertion) {
        const reason = llmJudgeFailureEarly
          ? `Failure criteria was triggered. ${state.llmJudgeResult!.reasoning}`
          : failedAssertion
            ? `Evaluator assertion failed. ${failedAssertion.reason}`
            : state.llmJudgeResult?.reasoning ?? "Evaluation complete";

        const llmJudgeOk = !hasLLMJudge || llmJudgeSuccess;
        const evaluatorsOk = !failedAssertion;

        await this.finalizeRun(ctx, state, {
          success: llmJudgeOk && evaluatorsOk,
          score: state.llmJudgeResult?.confidence,
          reason,
        });
        return;
      }

      // Check max messages
      if (state.conversationMessageCount >= maxMessages) break;

      // Generate next persona message
      await this.generateAndAppendPersonaMessage(ctx, state);
    }

    // Max messages reached — determine final result
    const failureTriggered = state.llmJudgeResult?.failureMet ?? false;
    const finalFailedAssertion = state.evalResults?.evaluatorResults.find(
      r => r.kind === "assertion" && !r.success
    );
    const evaluatorsOk = !finalFailedAssertion;
    const success = !hasLLMJudge && evaluatorsOk;

    let reason: string;
    if (failureTriggered) {
      reason = `Failure criteria was triggered. ${state.llmJudgeResult?.reasoning || ""}`;
    } else if (!evaluatorsOk) {
      reason = `Evaluator assertion failed. ${finalFailedAssertion!.reason}`;
    } else if (hasLLMJudge) {
      reason = `Max messages (${maxMessages}) reached without meeting success criteria. ${state.llmJudgeResult?.reasoning || ""}`;
    } else {
      reason = `Completed ${maxMessages} messages. All evaluators passed.`;
    }

    await this.finalizeRun(ctx, state, {
      success,
      score: state.llmJudgeResult?.confidence ?? 0,
      reason,
    }, true);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Generate an initial user message if the conversation needs one */
  private async ensureInitialUserMessage(ctx: RunContext, state: LoopState): Promise<void> {
    const nonSystem = state.messages.filter((m) => m.role !== "system");
    const lastRole = nonSystem.length > 0 ? nonSystem[nonSystem.length - 1].role : undefined;

    if (!lastRole || lastRole === "assistant") {
      await this.generateAndAppendPersonaMessage(ctx, state);
    }
  }

  /** Generate a persona message and append it to the loop state */
  private async generateAndAppendPersonaMessage(ctx: RunContext, state: LoopState): Promise<void> {
    const personaResponse = await generatePersonaMessage({
      messages: state.messages,
      persona: ctx.persona,
      scenario: ctx.scenario,
      llmProvider: ctx.llmProvider,
      model: ctx.personaModel,
    });

    const userMessage: Message = {
      role: "user",
      content: personaResponse.content,
      id: `persona_${randomUUID()}`,
    };
    state.messages = [...state.messages, userMessage];
    await ctx.modules.runs.update(ctx.run.id, { messages: state.messages });
  }

  /** Persist final run result and fire callbacks */
  private async finalizeRun(
    ctx: RunContext,
    state: LoopState,
    result: RunResult,
    maxMessagesReached = false
  ): Promise<void> {
    const output: Record<string, unknown> = {
      avgLatencyMs: state.connectorCallCount > 0 ? Math.round(state.totalLatencyMs / state.connectorCallCount) : 0,
      totalLatencyMs: state.totalLatencyMs,
      messageCount: state.conversationMessageCount,
    };

    if (maxMessagesReached) {
      output.maxMessagesReached = true;
    }

    if (state.llmJudgeResult) {
      output.evaluation = {
        successMet: state.llmJudgeResult.successMet,
        failureMet: state.llmJudgeResult.failureMet,
        confidence: state.llmJudgeResult.confidence,
        reasoning: state.llmJudgeResult.reasoning,
      };
    }

    if (state.evalResults) {
      output.evaluatorResults = state.evalResults.evaluatorResults;
      if (Object.keys(state.evalResults.metrics).length > 0) {
        output.metrics = state.evalResults.metrics;
      }
    }

    const updatedRun = await ctx.modules.runs.update(ctx.run.id, {
      status: "completed",
      messages: state.messages,
      result,
      output,
      latencyMs: state.totalLatencyMs,
      threadId: state.threadId,
      completedAt: new Date().toISOString(),
    });

    if (updatedRun && state.lastResult) {
      this.options.onStatusChange?.(ctx.run.id, "completed", updatedRun);
      this.options.onRunComplete?.(updatedRun, state.lastResult);
    }
  }

  private buildAllMessages(scenario: Scenario, persona: Persona | undefined): Message[] {
    const messages: Message[] = [];

    const systemPrompt = buildTestAgentSystemPrompt({
      persona: persona
        ? { name: persona.name, description: persona.description, systemPrompt: persona.systemPrompt }
        : undefined,
      scenario: { name: scenario.name, instructions: scenario.instructions, messages: scenario.messages },
    });
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt });
    }

    if (scenario.messages) {
      const seedMessages = scenario.messages.map((msg) => ({
        ...msg,
        id: msg.id || `seed_${randomUUID()}`,
      }));
      messages.push(...seedMessages);
    }

    return messages;
  }

  private async recoverStuckRuns(): Promise<void> {
    const { storage } = this.options;

    let projects: Array<{ id: string; name: string }>;
    try {
      projects = await storage.listProjects();
    } catch {
      return;
    }

    for (const project of projects) {
      try {
        const modules = createProjectModules(storage, project.id, this.options.connectorRegistry ?? builtinFallbackRegistry());
        const stuckRuns = await modules.runs.list({ status: "running" });
        for (const run of stuckRuns) {
          await modules.runs.update(run.id, { status: "queued" });
        }
      } catch {
        // Skip projects that can't be resolved
      }
    }
  }
}
