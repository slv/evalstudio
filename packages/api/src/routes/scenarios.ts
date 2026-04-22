import type { FastifyInstance } from "fastify";
import {
  buildTestAgentMessages,
  buildTestAgentSystemPrompt,
  createProjectModules,
  type FailureCriteriaMode,
  type Message,
  type ScenarioEvaluator,
} from "@evalstudio/core";

interface CreateScenarioBody {
  name: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
  evaluators?: ScenarioEvaluator[];
  personaIds?: string[];
}

interface UpdateScenarioBody {
  name?: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
  evaluators?: ScenarioEvaluator[];
  personaIds?: string[];
}

interface ScenarioParams {
  id: string;
}

interface ScenarioPromptQuerystring {
  personaId?: string;
}

export async function scenariosRoute(fastify: FastifyInstance) {
  fastify.get("/scenarios", async (request) => {
    const { scenarios } = createProjectModules(fastify.storage, request.projectCtx!.id);
    return await scenarios.list();
  });

  fastify.get<{ Params: ScenarioParams }>(
    "/scenarios/:id",
    async (request, reply) => {
      const { scenarios } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const scenario = await scenarios.get(request.params.id);

      if (!scenario) {
        reply.code(404);
        return { error: "Scenario not found" };
      }

      return scenario;
    }
  );

  // Get the test agent prompt and messages for a scenario with optional persona
  fastify.get<{ Params: ScenarioParams; Querystring: ScenarioPromptQuerystring }>(
    "/scenarios/:id/prompt",
    async (request, reply) => {
      const { scenarios, personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const scenario = await scenarios.get(request.params.id);

      if (!scenario) {
        reply.code(404);
        return { error: "Scenario not found" };
      }

      // Get persona if provided
      let persona = null;
      if (request.query.personaId) {
        persona = await personas.get(request.query.personaId);
        if (!persona) {
          reply.code(404);
          return { error: "Persona not found" };
        }
      }

      const promptInput = {
        persona,
        scenario,
      };

      const systemPrompt = buildTestAgentSystemPrompt(promptInput);
      const messages = buildTestAgentMessages(promptInput);

      return { systemPrompt, messages };
    }
  );

  fastify.post<{ Body: CreateScenarioBody }>(
    "/scenarios",
    async (request, reply) => {
      const { name, instructions, messages, maxMessages, successCriteria, failureCriteria, failureCriteriaMode, evaluators, personaIds } = request.body;

      if (!name) {
        reply.code(400);
        return { error: "Name is required" };
      }

      try {
        const { scenarios } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const scenario = await scenarios.create({
          name,
          instructions,
          messages,
          maxMessages,
          successCriteria,
          failureCriteria,
          failureCriteriaMode,
          evaluators,
          personaIds,
        });
        reply.code(201);
        return scenario;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.put<{ Params: ScenarioParams; Body: UpdateScenarioBody }>(
    "/scenarios/:id",
    async (request, reply) => {
      const { name, instructions, messages, maxMessages, successCriteria, failureCriteria, failureCriteriaMode, evaluators, personaIds } = request.body;

      try {
        const { scenarios } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const scenario = await scenarios.update(request.params.id, {
          name,
          instructions,
          messages,
          maxMessages,
          successCriteria,
          failureCriteria,
          failureCriteriaMode,
          evaluators,
          personaIds,
        });

        if (!scenario) {
          reply.code(404);
          return { error: "Scenario not found" };
        }

        return scenario;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: ScenarioParams }>(
    "/scenarios/:id",
    async (request, reply) => {
      const { scenarios } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const deleted = await scenarios.delete(request.params.id);

      if (!deleted) {
        reply.code(404);
        return { error: "Scenario not found" };
      }

      reply.code(204);
      return;
    }
  );
}
