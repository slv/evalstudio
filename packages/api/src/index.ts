import { readFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import {
  ERR_NO_PROJECT,
  RunProcessor,
  resolveWorkspace,
  createStorageProvider,
  createEvaluatorRegistry,
  createConnectorRegistry,
  type EvaluatorRegistry,
  type ConnectorRegistry,
  type ProjectContext,
  type StorageProvider,
} from "@evalstudio/core";
import { connectorsRoute } from "./routes/connectors.js";
import { evalsRoute } from "./routes/evals.js";
import { llmProvidersRoute } from "./routes/llm-providers.js";
import { personasRoute } from "./routes/personas.js";
import { projectsRoute } from "./routes/projects.js";
import { runsRoute } from "./routes/runs.js";
import { scenariosRoute } from "./routes/scenarios.js";
import { imagesRoute } from "./routes/images.js";
import { evaluatorTypesRoute } from "./routes/evaluator-types.js";
import { statusRoute } from "./routes/status.js";

// Extend Fastify with storage provider, registries, and project context
declare module "fastify" {
  interface FastifyInstance {
    storage: StorageProvider;
    evaluatorRegistry: EvaluatorRegistry;
    connectorRegistry: ConnectorRegistry;
  }
  interface FastifyRequest {
    projectCtx: ProjectContext | null;
  }
}

export interface ServerOptions {
  logger?: boolean;
  /** Workspace root directory (defaults to resolving from cwd) */
  workspaceDir?: string;
  /** Enable background run processing (default: true) */
  runProcessor?: boolean;
  /** Run processor polling interval in ms (default: 5000) */
  runProcessorPollMs?: number;
  /** Maximum concurrent runs (default: 3) */
  runProcessorMaxConcurrent?: number;
  /** Path to built web UI files (enables static file serving) */
  webDistPath?: string;
}

// Global processor instance for graceful shutdown
let runProcessor: RunProcessor | null = null;

interface ProjectIdParams {
  projectId: string;
}

export async function createServer(options: ServerOptions = {}) {
  const workspaceDir = options.workspaceDir ?? resolveWorkspace();

  const storage = await createStorageProvider(workspaceDir);

  const fastify = Fastify({
    logger: options.logger ?? false,
  });

  // Create evaluator registry with built-in + custom evaluators from config
  const evaluatorRegistry = await createEvaluatorRegistry(workspaceDir);
  const customCount = evaluatorRegistry.list().filter(e => !e.builtin).length;
  if (customCount > 0) {
    console.log(`[Evaluators] Loaded ${customCount} custom evaluator(s)`);
  }

  // Create connector registry with built-in + custom connectors from config
  const connectorRegistry = await createConnectorRegistry(workspaceDir);
  const customConnectorCount = connectorRegistry.list().filter(c => !c.builtin).length;
  if (customConnectorCount > 0) {
    console.log(`[Connectors] Loaded ${customConnectorCount} custom connector(s)`);
  }

  // Decorate instance with storage provider, registries, and request with projectCtx
  fastify.decorate("storage", storage);
  fastify.decorate("evaluatorRegistry", evaluatorRegistry);
  fastify.decorate("connectorRegistry", connectorRegistry);
  fastify.decorateRequest("projectCtx", null);

  // Handle "no project found" errors with a helpful message
  fastify.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    if (error.code === ERR_NO_PROJECT) {
      reply.code(503).send({ error: error.message });
      return;
    }
    reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  // Register all API routes under /api prefix
  await fastify.register(
    async (api) => {
      // Workspace-level routes (no project context needed)
      await api.register(statusRoute);
      await api.register(evaluatorTypesRoute);
      await api.register(llmProvidersRoute);
      await api.register(projectsRoute, { workspaceDir, storage });

      // Project-scoped routes under /projects/:projectId/
      await api.register(
        async (scoped) => {
          // Validate project exists and set context from URL param
          scoped.addHook("preHandler", async (request) => {
            const { projectId } = request.params as ProjectIdParams;
            const entry = await storage.getProjectEntry(projectId);
            request.projectCtx = { id: projectId, name: entry.name, workspaceDir };
          });

          await scoped.register(connectorsRoute);
          await scoped.register(evalsRoute);
          await scoped.register(imagesRoute);
          await scoped.register(personasRoute);
          await scoped.register(runsRoute);
          await scoped.register(scenariosRoute);
        },
        { prefix: "/projects/:projectId" },
      );
    },
    { prefix: "/api" }
  );

  // Serve static web UI files if webDistPath is provided
  if (options.webDistPath) {
    await fastify.register(fastifyStatic, {
      root: options.webDistPath,
      wildcard: false,
    });

    // SPA fallback: non-API, non-static routes return index.html
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        const indexPath = join(options.webDistPath!, "index.html");
        const html = readFileSync(indexPath, "utf-8");
        reply.type("text/html").send(html);
      }
    });
  }

  // Start the run processor if enabled (default: true)
  const enableProcessor = options.runProcessor ?? true;
  if (enableProcessor) {
    const pollMs = options.runProcessorPollMs ?? 5000;
    const maxConcurrent = options.runProcessorMaxConcurrent;

    runProcessor = new RunProcessor({
      workspaceDir,
      storage,
      pollIntervalMs: pollMs,
      evaluatorRegistry,
      connectorRegistry,
      ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
      onRunStart: (run) => {
        console.log(`[RunProcessor] Starting run ${run.id}`);
      },
      onRunComplete: (run, result) => {
        console.log(
          `[RunProcessor] Run ${run.id} completed (${result.latencyMs}ms)`
        );
      },
      onRunError: (run, error) => {
        console.error(`[RunProcessor] Run ${run.id} failed: ${error.message}`);
      },
    });

    runProcessor.start();
    console.log(
      `[RunProcessor] Started (poll: ${pollMs}ms)`
    );
  }

  // Register shutdown hook
  fastify.addHook("onClose", async () => {
    if (runProcessor) {
      console.log("[RunProcessor] Stopping...");
      await runProcessor.stop();
      console.log("[RunProcessor] Stopped");
    }
  });

  return fastify;
}

export async function startServer(port = parseInt(process.env.EVALSTUDIO_PORT || "3000", 10)) {
  const server = await createServer({ logger: true });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    const address = await server.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening at ${address}`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

/** Get the current run processor instance (for testing/monitoring) */
export function getRunProcessor(): RunProcessor | null {
  return runProcessor;
}
