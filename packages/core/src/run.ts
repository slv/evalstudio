import { randomUUID } from "node:crypto";
import type { Repository } from "./repository.js";
import type { EvalModule, Message } from "./eval.js";
import type { ScenarioModule } from "./scenario.js";
import type { PersonaModule } from "./persona.js";
import type { ConnectorModule } from "./connector.js";
import type { ExecutionModule } from "./execution.js";

/**
 * Run status types:
 * - queued: Waiting to be processed
 * - pending: Reserved for future use
 * - running: Currently executing
 * - completed: Finished (check result.success for pass/fail)
 * - error: System error occurred (retryable)
 * - chat: Live chat session (not processed by RunProcessor)
 */
export type RunStatus = "queued" | "pending" | "running" | "completed" | "error" | "chat";

export interface RunResult {
  success: boolean;
  score?: number;
  reason?: string;
}

export interface Run {
  id: string;
  evalId?: string;
  personaId?: string;
  scenarioId?: string;
  connectorId?: string;
  executionId?: number;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  threadId?: string;
  messages: Message[];
  output?: Record<string, unknown>;
  result?: RunResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunInput {
  evalId: string;
}

export interface CreatePlaygroundRunInput {
  scenarioId: string;
  connectorId: string;
  personaId?: string;
}

export interface CreateChatRunInput {
  connectorId: string;
}

export interface ChatMessageInput {
  content: string;
}

export interface ChatMessageResult {
  run: Run;
  messages: Message[];
  latencyMs: number;
  error?: string;
}

export interface UpdateRunInput {
  status?: RunStatus;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  threadId?: string;
  messages?: Message[];
  output?: Record<string, unknown>;
  result?: RunResult;
  error?: string;
}

export interface ListRunsOptions {
  evalId?: string;
  scenarioId?: string;
  status?: RunStatus;
  limit?: number;
}

export interface RunModuleDeps {
  evals: EvalModule;
  scenarios: ScenarioModule;
  personas: PersonaModule;
  connectors: ConnectorModule;
  executions: ExecutionModule;
}

export function createRunModule(repo: Repository<Run>, deps: RunModuleDeps) {
  const { evals, scenarios, personas, connectors, executions } = deps;

  return {
    async createMany(input: CreateRunInput): Promise<Run[]> {
      const evalItem = await evals.get(input.evalId);
      if (!evalItem) {
        throw new Error(`Eval with id "${input.evalId}" not found`);
      }

      const scenarioList = await Promise.all(
        evalItem.scenarioIds.map(async (scenarioId) => {
          const scenario = await scenarios.get(scenarioId);
          if (!scenario) {
            throw new Error(`Scenario with id "${scenarioId}" not found`);
          }
          return scenario;
        }),
      );

      if (scenarioList.length === 0) {
        throw new Error("Eval has no scenarios configured");
      }

      const allPersonaIds = new Set<string>();
      for (const scenario of scenarioList) {
        if (scenario.personaIds) {
          for (const personaId of scenario.personaIds) {
            allPersonaIds.add(personaId);
          }
        }
      }

      for (const personaId of allPersonaIds) {
        const persona = await personas.get(personaId);
        if (!persona) {
          throw new Error(`Persona with id "${personaId}" not found`);
        }
      }

      const now = new Date().toISOString();
      const createdRuns: Run[] = [];

      const execution = await executions.create({ evalId: input.evalId });

      for (const scenario of scenarioList) {
        const personaIds: (string | undefined)[] =
          scenario.personaIds && scenario.personaIds.length > 0
            ? scenario.personaIds
            : [undefined];

        for (const personaId of personaIds) {
          createdRuns.push({
            id: randomUUID(),
            evalId: input.evalId,
            connectorId: evalItem.connectorId,
            personaId,
            scenarioId: scenario.id,
            executionId: execution.id,
            status: "queued",
            messages: [],
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await repo.saveMany(createdRuns);
      return createdRuns;
    },

    async create(input: CreateRunInput): Promise<Run> {
      const runs = await this.createMany(input);
      return runs[0];
    },

    async createPlayground(input: CreatePlaygroundRunInput): Promise<Run> {
      const { scenarioId, connectorId, personaId } = input;

      const scenario = await scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`Scenario with id "${scenarioId}" not found`);
      }

      const connector = await connectors.get(connectorId);
      if (!connector) {
        throw new Error(`Connector with id "${connectorId}" not found`);
      }

      if (personaId) {
        const persona = await personas.get(personaId);
        if (!persona) {
          throw new Error(`Persona with id "${personaId}" not found`);
        }
      }

      const now = new Date().toISOString();
      const run: Run = {
        id: randomUUID(),
        scenarioId,
        connectorId,
        personaId,
        status: "queued",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };

      await repo.save(run);
      return run;
    },

    async createChatRun(input: CreateChatRunInput): Promise<Run> {
      const { connectorId } = input;

      const connector = await connectors.get(connectorId);
      if (!connector) {
        throw new Error(`Connector with id "${connectorId}" not found`);
      }

      const now = new Date().toISOString();
      const run: Run = {
        id: randomUUID(),
        connectorId,
        status: "chat",
        startedAt: now,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };

      await repo.save(run);
      return run;
    },

    async sendChatMessage(id: string, input: ChatMessageInput): Promise<ChatMessageResult> {
      const run = await repo.findById(id);
      if (!run) {
        throw new Error(`Run with id "${id}" not found`);
      }
      if (run.status !== "chat") {
        throw new Error(`Run "${id}" is not a chat run (status: ${run.status})`);
      }
      if (!run.connectorId) {
        throw new Error(`Run "${id}" has no connector configured`);
      }

      const userMessage: Message = { role: "user", content: input.content };
      const allMessages = [...run.messages, userMessage];

      const invokeResult = await connectors.invoke(run.connectorId, {
        messages: allMessages,
        runId: run.id,
      });

      const responseMessages = invokeResult.messages?.filter(
        (m) => m.role === "assistant" || m.role === "tool"
      ) ?? [];

      const updatedMessages = [...allMessages, ...responseMessages];
      const updated: Run = {
        ...run,
        messages: updatedMessages,
        threadId: invokeResult.threadId ?? run.threadId,
        updatedAt: new Date().toISOString(),
      };

      await repo.save(updated);

      return {
        run: updated,
        messages: responseMessages,
        latencyMs: invokeResult.latencyMs,
        error: invokeResult.success ? undefined : invokeResult.error,
      };
    },

    async get(id: string): Promise<Run | undefined> {
      return repo.findById(id);
    },

    async list(options?: ListRunsOptions): Promise<Run[]> {
      let runs: Run[];

      if (options) {
        const filter: Record<string, unknown> = {};
        if (options.evalId) filter.evalId = options.evalId;
        if (options.scenarioId) filter.scenarioId = options.scenarioId;
        if (options.status) filter.status = options.status;

        runs = Object.keys(filter).length > 0
          ? await repo.findBy(filter)
          : await repo.findAll();
      } else {
        runs = await repo.findAll();
      }

      runs.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      if (options?.limit && options.limit > 0) {
        runs = runs.slice(0, options.limit);
      }

      return runs;
    },

    async listByEval(evalId: string): Promise<Run[]> {
      return (await repo.findBy({ evalId }))
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    },

    async listByScenario(scenarioId: string): Promise<Run[]> {
      return (await repo.findBy({ scenarioId }))
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    },

    async listByPersona(personaId: string): Promise<Run[]> {
      return (await repo.findBy({ personaId }))
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    },

    async listByConnector(connectorId: string): Promise<Run[]> {
      return (await repo.findBy({ connectorId }))
        .sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    },

    async update(id: string, input: UpdateRunInput): Promise<Run | undefined> {
      const run = await repo.findById(id);
      if (!run) return undefined;

      const updated: Run = {
        ...run,
        status: input.status ?? run.status,
        startedAt: "startedAt" in input ? input.startedAt : run.startedAt,
        completedAt: "completedAt" in input ? input.completedAt : run.completedAt,
        latencyMs: "latencyMs" in input ? input.latencyMs : run.latencyMs,
        threadId: "threadId" in input ? input.threadId : run.threadId,
        messages: input.messages ?? run.messages,
        output: "output" in input ? input.output : run.output,
        result: "result" in input ? input.result : run.result,
        error: "error" in input ? input.error : run.error,
        updatedAt: new Date().toISOString(),
      };

      await repo.save(updated);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      return repo.deleteById(id);
    },

    async retry(id: string): Promise<Run | undefined> {
      const run = await this.get(id);
      if (!run) return undefined;

      if (run.status !== "error") {
        throw new Error(`Cannot retry run with status "${run.status}". Only runs with system errors can be retried.`);
      }

      const updates: UpdateRunInput = {
        status: "queued",
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
        threadId: randomUUID(),
        output: undefined,
        messages: [],
      };

      return this.update(id, updates);
    },
  };
}

export type RunModule = ReturnType<typeof createRunModule>;
