import { Command } from "commander";
import {
  resolveProjectFromCwd,
  resolveWorkspace,
  createProjectModules,
  createStorageProvider,
  createEvaluatorRegistry,
  RunProcessor,
  type Run,
  type Message,
} from "@evalstudio/core";

function formatRunStatus(run: Run): string {
  const statusColors: Record<string, string> = {
    queued: "\x1b[33m",    // yellow
    running: "\x1b[36m",   // cyan
    completed: "\x1b[32m", // green
    failed: "\x1b[31m",    // red
  };
  const reset = "\x1b[0m";
  const color = statusColors[run.status] ?? "";
  return `${color}${run.status}${reset}`;
}

function printMessage(msg: Message): void {
  const roleColors: Record<string, string> = {
    system: "\x1b[90m",    // gray
    user: "\x1b[34m",      // blue
    assistant: "\x1b[32m", // green
    tool: "\x1b[33m",      // yellow
  };
  const reset = "\x1b[0m";
  const color = roleColors[msg.role] ?? "";
  const content = typeof msg.content === "string"
    ? msg.content
    : JSON.stringify(msg.content);
  const preview = content.length > 300 ? content.slice(0, 300) + "..." : content;
  console.log(`${color}[${msg.role}]${reset} ${preview}`);
}

export const runCommand = new Command("run")
  .description("Manage and process evaluation runs")
  .addCommand(
    new Command("create")
      .description("Create a new run for an eval")
      .requiredOption("-e, --eval <eval>", "Eval ID")
      .option("--json", "Output as JSON")
      .action(
        async (options: {
          eval: string;
          json?: boolean;
        }) => {
          try {
            const ctx = resolveProjectFromCwd();
            const storage = await createStorageProvider(ctx.workspaceDir);
            const { runs, evals, connectors, personas } = createProjectModules(storage, ctx.id);

            const evalItem = await evals.get(options.eval);
            if (!evalItem) {
              console.error(`Error: Eval "${options.eval}" not found`);
              process.exit(1);
            }

            const createdRuns = await runs.createMany({ evalId: evalItem.id });

            // Get connector info from eval
            const connector = evalItem.connectorId
              ? await connectors.get(evalItem.connectorId)
              : undefined;

            if (options.json) {
              console.log(JSON.stringify(createdRuns, null, 2));
            } else {
              console.log(`${createdRuns.length} run(s) created successfully`);
              console.log("");
              for (const run of createdRuns) {
                const persona = run.personaId ? await personas.get(run.personaId) : null;
                console.log(`  ID:        ${run.id}`);
                console.log(`  Eval:      ${run.evalId}`);
                if (persona) {
                  console.log(`  Persona:   ${persona.name}`);
                }
                console.log(`  Connector: ${connector?.name ?? evalItem.connectorId}`);
                console.log(`  Status:    ${formatRunStatus(run)}`);
                console.log(`  Created:   ${run.createdAt}`);
                if (createdRuns.length > 1) console.log("");
              }
            }
          } catch (error) {
            if (error instanceof Error) {
              console.error(`Error: ${error.message}`);
              process.exit(1);
            }
            throw error;
          }
        }
      )
  )
  .addCommand(
    new Command("list")
      .description("List runs")
      .option("-e, --eval <eval>", "Filter by eval ID")
      .option("-s, --status <status>", "Filter by status (queued, running, completed, failed)")
      .option("-l, --limit <number>", "Maximum number of runs to show")
      .option("--json", "Output as JSON")
      .action(
        async (options: {
          eval?: string;
          status?: string;
          limit?: string;
          json?: boolean;
        }) => {
          const ctx = resolveProjectFromCwd();
          const storage = await createStorageProvider(ctx.workspaceDir);
          const { runs, personas, evals, connectors } = createProjectModules(storage, ctx.id);

          const runList = await runs.list({
            evalId: options.eval,
            status: options.status as Run["status"] | undefined,
            limit: options.limit ? parseInt(options.limit, 10) : undefined,
          });

          if (options.json) {
            console.log(JSON.stringify(runList, null, 2));
          } else {
            if (runList.length === 0) {
              console.log("No runs found");
              return;
            }

            console.log("Runs:");
            console.log("-----");
            for (const run of runList) {
              console.log(`  ${run.id}`);
              console.log(`    Status:  ${formatRunStatus(run)}`);
              console.log(`    Eval:    ${run.evalId ?? "Playground"}`);
              // Show persona if present
              if (run.personaId) {
                const persona = await personas.get(run.personaId);
                console.log(`    Persona: ${persona?.name ?? run.personaId}`);
              }
              // Get connector info from eval or directly from run (playground)
              if (run.evalId) {
                const evalItem = await evals.get(run.evalId);
                if (evalItem) {
                  const connector = evalItem.connectorId
                    ? await connectors.get(evalItem.connectorId)
                    : undefined;
                  console.log(`    Connector: ${connector?.name ?? evalItem.connectorId ?? "unknown"}`);
                }
              } else if (run.connectorId) {
                const connector = await connectors.get(run.connectorId);
                console.log(`    Connector: ${connector?.name ?? run.connectorId}`);
              }
              if (run.error) {
                console.log(`    Error:   ${run.error}`);
              }
              console.log(`    Created: ${run.createdAt}`);
            }
          }
        }
      )
  )
  .addCommand(
    new Command("show")
      .description("Show run details")
      .argument("<id>", "Run ID")
      .option("--json", "Output as JSON")
      .action(async (id: string, options: { json?: boolean }) => {
        const ctx = resolveProjectFromCwd();
        const storage = await createStorageProvider(ctx.workspaceDir);
        const { runs, scenarios, personas, evals, connectors } = createProjectModules(storage, ctx.id);

        const run = await runs.get(id);

        if (!run) {
          console.error(`Error: Run "${id}" not found`);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(run, null, 2));
        } else {
          console.log(`Run: ${run.id}`);
          console.log("-----");
          console.log(`  Status:    ${formatRunStatus(run)}`);
          console.log(`  Eval:      ${run.evalId ?? "Playground"}`);
          // Show scenario and persona
          const scenario = run.scenarioId
            ? await scenarios.get(run.scenarioId)
            : undefined;
          console.log(`  Scenario:  ${scenario?.name ?? run.scenarioId ?? "unknown"}`);
          if (run.personaId) {
            const persona = await personas.get(run.personaId);
            console.log(`  Persona:   ${persona?.name ?? run.personaId}`);
          }
          // Get connector info from eval or directly from run (playground)
          if (run.evalId) {
            const evalItem = await evals.get(run.evalId);
            if (evalItem) {
              const connector = evalItem.connectorId
                ? await connectors.get(evalItem.connectorId)
                : undefined;
              console.log(`  Connector: ${connector?.name ?? evalItem.connectorId ?? "unknown"}`);
            }
          } else if (run.connectorId) {
            const connector = await connectors.get(run.connectorId);
            console.log(`  Connector: ${connector?.name ?? run.connectorId}`);
          }
          if (run.startedAt) {
            console.log(`  Started:   ${run.startedAt}`);
          }
          if (run.completedAt) {
            console.log(`  Completed: ${run.completedAt}`);
          }
          if (run.error) {
            console.log(`  Error:     ${run.error}`);
          }
          if (run.messages.length > 0) {
            console.log(`  Messages:  ${run.messages.length}`);
          }
          if (run.result) {
            console.log(`  Result:    ${run.result.success ? "passed" : "failed"}`);
            if (run.result.score !== undefined) {
              console.log(`  Score:     ${run.result.score}`);
            }
            if (run.result.reason) {
              console.log(`  Reason:    ${run.result.reason}`);
            }
          }
          console.log(`  Created:   ${run.createdAt}`);
          console.log(`  Updated:   ${run.updatedAt}`);
        }
      })
  )
  .addCommand(
    new Command("delete")
      .description("Delete a run")
      .argument("<id>", "Run ID")
      .option("--json", "Output as JSON")
      .action(async (id: string, options: { json?: boolean }) => {
        const ctx = resolveProjectFromCwd();
        const storage = await createStorageProvider(ctx.workspaceDir);
        const { runs } = createProjectModules(storage, ctx.id);

        const run = await runs.get(id);

        if (!run) {
          console.error(`Error: Run "${id}" not found`);
          process.exit(1);
        }

        const deleted = await runs.delete(id);

        if (!deleted) {
          console.error(`Error: Failed to delete run`);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ deleted: true, id }));
        } else {
          console.log(`Run "${id}" deleted successfully`);
        }
      })
  )
  .addCommand(
    new Command("process")
      .description("Process queued runs")
      .option("-w, --watch", "Watch mode - continuously process runs")
      .option("-c, --concurrency <number>", "Maximum concurrent runs (default: project config or 3)")
      .option("--poll <ms>", "Poll interval in milliseconds (default: 2000)")
      .action(
        async (options: {
          watch?: boolean;
          concurrency?: string;
          poll?: string;
        }) => {
          const workspaceDir = resolveWorkspace();
          const storage = await createStorageProvider(workspaceDir);
          const maxConcurrent = options.concurrency
            ? parseInt(options.concurrency, 10)
            : undefined;
          const pollIntervalMs = options.poll
            ? parseInt(options.poll, 10)
            : 2000;

          const processor = new RunProcessor({
            workspaceDir,
            storage,
            pollIntervalMs,
            evaluatorRegistry: await createEvaluatorRegistry(workspaceDir),
            ...(maxConcurrent !== undefined ? { maxConcurrent } : {}),
            onRunStart: (run) => {
              console.log(`\x1b[36m▶\x1b[0m Starting run ${run.id}`);
            },
            onRunComplete: (run, result) => {
              console.log(
                `\x1b[32m✓\x1b[0m Run ${run.id} completed (${result.latencyMs}ms)`
              );
            },
            onRunError: (run, error) => {
              console.error(
                `\x1b[31m✗\x1b[0m Run ${run.id} failed: ${error.message}`
              );
            },
          });

          if (options.watch) {
            // Watch mode: run continuously
            console.log("Starting run processor in watch mode...");
            console.log(`  Concurrency: ${maxConcurrent ?? "project config or 3"}`);
            console.log(`  Poll interval: ${pollIntervalMs}ms`);
            console.log("\nPress Ctrl+C to stop\n");

            processor.start();

            // Handle shutdown
            const shutdown = async () => {
              console.log("\nStopping processor...");
              await processor.stop();
              console.log("Processor stopped");
              process.exit(0);
            };

            process.on("SIGINT", shutdown);
            process.on("SIGTERM", shutdown);

            // Keep the process alive
            await new Promise(() => {});
          } else {
            // One-shot mode: process all queued runs and exit
            console.log("Processing queued runs...\n");

            let totalProcessed = 0;
            let hasMore = true;

            while (hasMore) {
              const started = await processor.processOnce();
              totalProcessed += started;

              // Check if there are more queued runs across any project
              hasMore = started > 0;
            }

            if (totalProcessed === 0) {
              console.log("No queued runs found");
            } else {
              console.log(`\nProcessed ${totalProcessed} run(s)`);
            }
          }
        }
      )
  )
  .addCommand(
    new Command("playground")
      .description("Create and immediately process a playground run")
      .requiredOption("-s, --scenario <scenario>", "Scenario ID or name")
      .requiredOption("-c, --connector <connector>", "Connector ID or name")
      .option("-p, --persona <persona>", "Persona ID or name")
      .option("--json", "Output as JSON")
      .action(
        async (options: {
          scenario: string;
          connector: string;
          persona?: string;
          json?: boolean;
        }) => {
          try {
            const ctx = resolveProjectFromCwd();
            const storage = await createStorageProvider(ctx.workspaceDir);
            const modules = createProjectModules(storage, ctx.id);

            // Resolve scenario
            const scenario = await modules.scenarios.get(options.scenario)
              ?? await modules.scenarios.getByName(options.scenario);
            if (!scenario) {
              console.error(`Error: Scenario "${options.scenario}" not found`);
              process.exit(1);
            }

            // Resolve connector
            const connector = await modules.connectors.get(options.connector)
              ?? await modules.connectors.getByName(options.connector);
            if (!connector) {
              console.error(`Error: Connector "${options.connector}" not found`);
              process.exit(1);
            }

            // Resolve persona (optional)
            let personaId: string | undefined;
            if (options.persona) {
              const persona = await modules.personas.get(options.persona)
                ?? await modules.personas.getByName(options.persona);
              if (!persona) {
                console.error(`Error: Persona "${options.persona}" not found`);
                process.exit(1);
              }
              personaId = persona.id;
            }

            // Create the playground run
            const run = await modules.runs.createPlayground({
              scenarioId: scenario.id,
              connectorId: connector.id,
              personaId,
            });

            if (!options.json) {
              console.log(`\x1b[36m▶\x1b[0m Playground run created: ${run.id}`);
              console.log(`  Scenario:  ${scenario.name}`);
              console.log(`  Connector: ${connector.name}`);
              if (personaId) {
                const p = await modules.personas.get(personaId);
                console.log(`  Persona:   ${p?.name ?? personaId}`);
              }
              console.log(`\nProcessing...\n`);
            }

            // Process the run immediately
            const processor = new RunProcessor({
              workspaceDir: ctx.workspaceDir,
              storage,
              maxConcurrent: 1,
              evaluatorRegistry: await createEvaluatorRegistry(ctx.workspaceDir),
            });
            await processor.processOnce();

            // Fetch the completed run
            const completedRun = await modules.runs.get(run.id);
            if (!completedRun) {
              console.error("Error: Run disappeared after processing");
              process.exit(1);
            }

            if (options.json) {
              console.log(JSON.stringify(completedRun, null, 2));
            } else {
              // Print conversation
              console.log("Conversation:");
              console.log("─".repeat(60));
              for (const msg of completedRun.messages) {
                printMessage(msg);
              }
              console.log("─".repeat(60));

              // Print result
              console.log(`\nStatus:  ${formatRunStatus(completedRun)}`);
              if (completedRun.latencyMs) {
                console.log(`Latency: ${completedRun.latencyMs}ms`);
              }
              if (completedRun.error) {
                console.log(`Error:   ${completedRun.error}`);
              }
              if (completedRun.result) {
                console.log(`Result:  ${completedRun.result.success ? "\x1b[32mpassed\x1b[0m" : "\x1b[31mfailed\x1b[0m"}`);
                if (completedRun.result.score !== undefined) {
                  console.log(`Score:   ${completedRun.result.score}`);
                }
                if (completedRun.result.reason) {
                  console.log(`Reason:  ${completedRun.result.reason}`);
                }
              }
            }
          } catch (error) {
            if (error instanceof Error) {
              console.error(`Error: ${error.message}`);
              process.exit(1);
            }
            throw error;
          }
        }
      )
  );
