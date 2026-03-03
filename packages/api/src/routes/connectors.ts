import type { FastifyInstance } from "fastify";
import {
  createProjectModules,
  type ConnectorConfig,
  type ConnectorType,
} from "@evalstudio/core";

interface CreateConnectorBody {
  name: string;
  type: ConnectorType;
  baseUrl: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}

interface UpdateConnectorBody {
  name?: string;
  type?: ConnectorType;
  baseUrl?: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}

interface ConnectorParams {
  id: string;
}

export async function connectorsRoute(fastify: FastifyInstance) {
  fastify.get("/connectors", async (request) => {
    const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
    return await connectors.list();
  });

  fastify.get("/connectors/types", async () => {
    return fastify.connectorRegistry.list();
  });

  fastify.get<{ Params: ConnectorParams }>(
    "/connectors/:id",
    async (request, reply) => {
      const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
      const connector = await connectors.get(request.params.id);

      if (!connector) {
        reply.code(404);
        return { error: "Connector not found" };
      }

      return connector;
    }
  );

  fastify.post<{ Body: CreateConnectorBody }>(
    "/connectors",
    async (request, reply) => {
      const { name, type, baseUrl, headers, config } = request.body;

      if (!name) {
        reply.code(400);
        return { error: "Name is required" };
      }

      if (!type) {
        reply.code(400);
        return { error: "Type is required" };
      }

      if (!baseUrl) {
        reply.code(400);
        return { error: "Base URL is required" };
      }

      try {
        const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
        const connector = await connectors.create({
          name,
          type,
          baseUrl,
          headers,
          config,
        });
        reply.code(201);
        return connector;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.put<{ Params: ConnectorParams; Body: UpdateConnectorBody }>(
    "/connectors/:id",
    async (request, reply) => {
      const { name, type, baseUrl, headers, config } = request.body;

      try {
        const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
        const connector = await connectors.update(request.params.id, {
          name,
          type,
          baseUrl,
          headers,
          config,
        });

        if (!connector) {
          reply.code(404);
          return { error: "Connector not found" };
        }

        return connector;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: ConnectorParams }>(
    "/connectors/:id",
    async (request, reply) => {
      const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
      const deleted = await connectors.delete(request.params.id);

      if (!deleted) {
        reply.code(404);
        return { error: "Connector not found" };
      }

      reply.code(204);
      return;
    }
  );

  fastify.post<{ Params: ConnectorParams }>(
    "/connectors/:id/test",
    async (request) => {
      const { connectors } = createProjectModules(fastify.storage, request.projectCtx!.id, fastify.connectorRegistry);
      const result = await connectors.test(request.params.id);
      return result;
    }
  );
}
