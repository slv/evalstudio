import type { FastifyInstance } from "fastify";
import {
  createProjectModules,
  type RunStatus,
  type RunResult,
  type Message,
} from "@evalstudio/core";

interface CreateRunBody {
  evalId: string;
}

interface CreatePlaygroundRunBody {
  scenarioId: string;
  connectorId: string;
  personaId?: string;
}

interface UpdateRunBody {
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

interface RunParams {
  id: string;
}

interface CreateChatRunBody {
  connectorId: string;
}

interface RunQuerystring {
  evalId?: string;
  scenarioId?: string;
  personaId?: string;
  connectorId?: string;
  status?: string;
}

export async function runsRoute(fastify: FastifyInstance) {
  fastify.get<{ Querystring: RunQuerystring }>("/runs", async (request) => {
    const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
    const { evalId, scenarioId, personaId, connectorId, status } = request.query;

    if (evalId) {
      return await runs.listByEval(evalId);
    }

    if (scenarioId) {
      return await runs.listByScenario(scenarioId);
    }

    if (personaId) {
      return await runs.listByPersona(personaId);
    }

    if (connectorId) {
      let results = await runs.listByConnector(connectorId);
      if (status) {
        results = results.filter((r) => r.status === status);
      }
      return results;
    }

    if (status) {
      return await runs.list({ status: status as RunStatus });
    }

    return await runs.list();
  });

  fastify.get<{ Params: RunParams }>("/runs/:id", async (request, reply) => {
    const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
    const run = await runs.get(request.params.id);

    if (!run) {
      reply.code(404);
      return { error: "Run not found" };
    }

    return run;
  });

  fastify.post<{ Body: CreateRunBody }>("/runs", async (request, reply) => {
    const { evalId } = request.body;

    if (!evalId) {
      reply.code(400);
      return { error: "Eval ID is required" };
    }

    try {
      const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const created = await runs.createMany({ evalId });
      reply.code(201);
      return created;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          reply.code(404);
        } else {
          reply.code(400);
        }
        return { error: error.message };
      }
      throw error;
    }
  });

  // Create a playground run (without eval)
  fastify.post<{ Body: CreatePlaygroundRunBody }>(
    "/runs/playground",
    async (request, reply) => {
      const { scenarioId, connectorId, personaId } = request.body;

      if (!scenarioId) {
        reply.code(400);
        return { error: "Scenario ID is required" };
      }

      if (!connectorId) {
        reply.code(400);
        return { error: "Connector ID is required" };
      }

      try {
        const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const run = await runs.createPlayground({
          scenarioId,
          connectorId,
          personaId,
        });
        reply.code(201);
        return run;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.code(404);
          } else {
            reply.code(400);
          }
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  // Create a chat run (connector only, no scenario)
  fastify.post<{ Body: CreateChatRunBody }>(
    "/runs/chat",
    async (request, reply) => {
      const { connectorId } = request.body;

      if (!connectorId) {
        reply.code(400);
        return { error: "Connector ID is required" };
      }

      try {
        const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const run = await runs.createChatRun({ connectorId });
        reply.code(201);
        return run;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.code(404);
          } else {
            reply.code(400);
          }
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  // Send a chat message (invoke connector + persist to run)
  fastify.post<{ Params: RunParams; Body: { content: string } }>(
    "/runs/:id/chat",
    async (request, reply) => {
      const { content } = request.body;

      if (!content || typeof content !== "string" || !content.trim()) {
        reply.code(400);
        return { error: "Message content is required" };
      }

      try {
        const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const result = await runs.sendChatMessage(request.params.id, { content: content.trim() });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.code(404);
          } else {
            reply.code(400);
          }
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.put<{ Params: RunParams; Body: UpdateRunBody }>(
    "/runs/:id",
    async (request, reply) => {
      const {
        status,
        startedAt,
        completedAt,
        latencyMs,
        threadId,
        messages,
        output,
        result,
        error,
      } = request.body;

      const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const run = await runs.update(request.params.id, {
        status,
        startedAt,
        completedAt,
        latencyMs,
        threadId,
        messages,
        output,
        result,
        error,
      });

      if (!run) {
        reply.code(404);
        return { error: "Run not found" };
      }

      return run;
    }
  );

  // Retry a failed run
  fastify.post<{ Params: RunParams }>(
    "/runs/:id/retry",
    async (request, reply) => {
      try {
        const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const run = await runs.retry(request.params.id);

        if (!run) {
          reply.code(404);
          return { error: "Run not found" };
        }

        return run;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(400);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: RunParams }>(
    "/runs/:id",
    async (request, reply) => {
      const { runs } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const deleted = await runs.delete(request.params.id);

      if (!deleted) {
        reply.code(404);
        return { error: "Run not found" };
      }

      reply.code(204);
      return;
    }
  );
}
