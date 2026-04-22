import type { FastifyInstance } from "fastify";
import { createProjectModules } from "@evalstudio/core";

interface CreateEvalBody {
  /** Display name for the eval (required) */
  name: string;
  /** Required: Scenarios define the test contexts and evaluation criteria */
  scenarioIds: string[];
  /** The connector to use for running this eval (required) */
  connectorId: string;
}

interface UpdateEvalBody {
  /** Display name for the eval */
  name?: string;
  /** Scenarios define the test contexts and evaluation criteria */
  scenarioIds?: string[];
  /** The connector to use for running this eval */
  connectorId?: string;
}

interface EvalParams {
  id: string;
}

interface EvalQuerystring {
  expand?: string;
}

export async function evalsRoute(fastify: FastifyInstance) {
  fastify.get("/evals", async (request) => {
    const { evals } = createProjectModules(fastify.storage, request.projectCtx!.id);
    return await evals.list();
  });

  fastify.get<{ Params: EvalParams; Querystring: EvalQuerystring }>(
    "/evals/:id",
    async (request, reply) => {
      const { evals } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const expand = request.query.expand === "true";

      const evalItem = expand
        ? await evals.getWithRelations(request.params.id)
        : await evals.get(request.params.id);

      if (!evalItem) {
        reply.code(404);
        return { error: "Eval not found" };
      }

      return evalItem;
    }
  );

  fastify.post<{ Body: CreateEvalBody }>(
    "/evals",
    async (request, reply) => {
      const {
        name,
        scenarioIds,
        connectorId,
      } = request.body;

      if (!name) {
        reply.code(400);
        return { error: "Name is required" };
      }

      if (!scenarioIds || scenarioIds.length === 0) {
        reply.code(400);
        return { error: "At least one Scenario ID is required" };
      }

      if (!connectorId) {
        reply.code(400);
        return { error: "Connector ID is required" };
      }

      try {
        const { evals } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const evalItem = await evals.create({
          name,
          scenarioIds,
          connectorId,
        });
        reply.code(201);
        return evalItem;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.code(404);
          } else {
            reply.code(409);
          }
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.put<{ Params: EvalParams; Body: UpdateEvalBody }>(
    "/evals/:id",
    async (request, reply) => {
      const {
        name,
        scenarioIds,
        connectorId,
      } = request.body;

      try {
        const { evals } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const evalItem = await evals.update(request.params.id, {
          name,
          scenarioIds,
          connectorId,
        });

        if (!evalItem) {
          reply.code(404);
          return { error: "Eval not found" };
        }

        return evalItem;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            reply.code(404);
          } else {
            reply.code(409);
          }
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: EvalParams }>(
    "/evals/:id",
    async (request, reply) => {
      const { evals } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const deleted = await evals.delete(request.params.id);

      if (!deleted) {
        reply.code(404);
        return { error: "Eval not found" };
      }

      reply.code(204);
      return;
    }
  );
}
