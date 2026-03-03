import { Command } from "commander";
import {
  resolveProjectFromCwd,
  createProjectModules,
  createStorageProvider,
  createConnectorRegistry,
  type ConnectorType,
  type LangGraphConnectorConfig,
} from "@evalstudio/core";

export const connectorCommand = new Command("connector")
  .description("Manage connectors for bridging EvalStudio to external APIs")
  .addCommand(
    new Command("create")
      .description("Create a new connector configuration")
      .argument("<name>", "Connector name")
      .requiredOption(
        "--type <type>",
        "Connector type (langgraph)"
      )
      .requiredOption("--base-url <url>", "Base URL for the API endpoint")
      .option("--config <json>", "Configuration as JSON string (e.g., '{\"assistantId\": \"my-agent\"}' for langgraph)")
      .option("--header <key:value...>", "Custom headers as key:value pairs (repeatable)")
      .option("--json", "Output as JSON")
      .action(
        async (
          name: string,
          options: {
            type: string;
            baseUrl: string;
            config?: string;
            header?: string[];
            json?: boolean;
          }
        ) => {
          try {
            const registry = createConnectorRegistry();
            const validTypes = registry.list().map(t => t.type);
            if (!validTypes.includes(options.type)) {
              console.error(
                `Error: Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
              );
              process.exit(1);
            }

            let config: LangGraphConnectorConfig | undefined;
            if (options.config) {
              try {
                config = JSON.parse(options.config) as LangGraphConnectorConfig;
              } catch {
                console.error(`Error: Invalid JSON in --config`);
                process.exit(1);
              }
            }

            const headers = parseHeaders(options.header);

            const ctx = resolveProjectFromCwd();
            const storage = await createStorageProvider(ctx.workspaceDir);
            const { connectors } = createProjectModules(storage, ctx.id);

            const connector = await connectors.create({
              name,
              type: options.type as ConnectorType,
              baseUrl: options.baseUrl,
              headers,
              config,
            });

            if (options.json) {
              console.log(JSON.stringify(connector, null, 2));
            } else {
              console.log(`Connector created successfully`);
              console.log(`  ID:       ${connector.id}`);
              console.log(`  Name:     ${connector.name}`);
              console.log(`  Type:     ${connector.type}`);
              console.log(`  Base URL: ${connector.baseUrl}`);
              if (connector.headers && Object.keys(connector.headers).length > 0) {
                console.log(`  Headers:  ${formatHeaders(connector.headers)}`);
              }
              if (connector.config) {
                console.log(`  Config:   ${JSON.stringify(connector.config)}`);
              }
              console.log(`  Created:  ${connector.createdAt}`);
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
      .description("List connector configurations")
      .option("--json", "Output as JSON")
      .action(async (options: { json?: boolean }) => {
        const ctx = resolveProjectFromCwd();
        const storage = await createStorageProvider(ctx.workspaceDir);
        const { connectors } = createProjectModules(storage, ctx.id);
        const connectorList = await connectors.list();

        if (options.json) {
          console.log(JSON.stringify(connectorList, null, 2));
        } else {
          if (connectorList.length === 0) {
            console.log("No connectors found");
            return;
          }

          console.log("Connectors:");
          console.log("-----------");
          for (const connector of connectorList) {
            console.log(`  ${connector.name} (${connector.id})`);
            console.log(`    Type:     ${connector.type}`);
            console.log(`    Base URL: ${connector.baseUrl}`);
          }
        }
      })
  )
  .addCommand(
    new Command("show")
      .description("Show connector details")
      .argument("<identifier>", "Connector ID or name")
      .option("--json", "Output as JSON")
      .action(
        async (
          identifier: string,
          options: { json?: boolean }
        ) => {
          const ctx = resolveProjectFromCwd();
          const storage = await createStorageProvider(ctx.workspaceDir);
          const { connectors } = createProjectModules(storage, ctx.id);
          const connector = await connectors.get(identifier) ?? await connectors.getByName(identifier);

          if (!connector) {
            console.error(`Error: Connector "${identifier}" not found`);
            process.exit(1);
          }

          if (options.json) {
            console.log(JSON.stringify(connector, null, 2));
          } else {
            console.log(`Connector: ${connector.name}`);
            console.log(`-----------`);
            console.log(`  ID:       ${connector.id}`);
            console.log(`  Name:     ${connector.name}`);
            console.log(`  Type:     ${connector.type}`);
            console.log(`  Base URL: ${connector.baseUrl}`);
            if (connector.headers && Object.keys(connector.headers).length > 0) {
              console.log(`  Headers:  ${formatHeaders(connector.headers)}`);
            }
            if (connector.config) {
              console.log(`  Config:   ${JSON.stringify(connector.config)}`);
            }
            console.log(`  Created:  ${connector.createdAt}`);
            console.log(`  Updated:  ${connector.updatedAt}`);
          }
        }
      )
  )
  .addCommand(
    new Command("update")
      .description("Update a connector configuration")
      .argument("<identifier>", "Connector ID")
      .option("-n, --name <name>", "New connector name")
      .option("--type <type>", "New connector type (langgraph)")
      .option("--base-url <url>", "New base URL")
      .option("--config <json>", "New configuration as JSON string")
      .option("--header <key:value...>", "Custom headers as key:value pairs (repeatable)")
      .option("--json", "Output as JSON")
      .action(
        async (
          identifier: string,
          options: {
            name?: string;
            type?: string;
            baseUrl?: string;
            config?: string;
            header?: string[];
            json?: boolean;
          }
        ) => {
          const ctx = resolveProjectFromCwd();
          const storage = await createStorageProvider(ctx.workspaceDir);
          const { connectors } = createProjectModules(storage, ctx.id);
          const existing = await connectors.get(identifier);

          if (!existing) {
            console.error(`Error: Connector "${identifier}" not found`);
            process.exit(1);
          }

          const registry = createConnectorRegistry();
          const validTypes = registry.list().map(t => t.type);
          if (
            options.type &&
            !validTypes.includes(options.type)
          ) {
            console.error(
              `Error: Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
            );
            process.exit(1);
          }

          let config: LangGraphConnectorConfig | undefined;
          if (options.config) {
            try {
              config = JSON.parse(options.config) as LangGraphConnectorConfig;
            } catch {
              console.error(`Error: Invalid JSON in --config`);
              process.exit(1);
            }
          }

          const headers = parseHeaders(options.header);

          try {
            const updated = await connectors.update(existing.id, {
              name: options.name,
              type: options.type as ConnectorType | undefined,
              baseUrl: options.baseUrl,
              headers,
              config,
            });

            if (!updated) {
              console.error(`Error: Failed to update connector`);
              process.exit(1);
            }

            if (options.json) {
              console.log(JSON.stringify(updated, null, 2));
            } else {
              console.log(`Connector updated successfully`);
              console.log(`  ID:       ${updated.id}`);
              console.log(`  Name:     ${updated.name}`);
              console.log(`  Type:     ${updated.type}`);
              console.log(`  Base URL: ${updated.baseUrl}`);
              if (updated.headers && Object.keys(updated.headers).length > 0) {
                console.log(`  Headers:  ${formatHeaders(updated.headers)}`);
              }
              if (updated.config) {
                console.log(`  Config:   ${JSON.stringify(updated.config)}`);
              }
              console.log(`  Updated:  ${updated.updatedAt}`);
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
    new Command("delete")
      .description("Delete a connector configuration")
      .argument("<identifier>", "Connector ID")
      .option("--json", "Output as JSON")
      .action(async (identifier: string, options: { json?: boolean }) => {
        const ctx = resolveProjectFromCwd();
        const storage = await createStorageProvider(ctx.workspaceDir);
        const { connectors } = createProjectModules(storage, ctx.id);
        const existing = await connectors.get(identifier);

        if (!existing) {
          console.error(`Error: Connector "${identifier}" not found`);
          process.exit(1);
        }

        const deleted = await connectors.delete(existing.id);

        if (!deleted) {
          console.error(`Error: Failed to delete connector`);
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ deleted: true, id: existing.id }));
        } else {
          console.log(`Connector "${existing.name}" deleted successfully`);
        }
      })
  )
  .addCommand(
    new Command("types")
      .description("List available connector types")
      .option("--json", "Output as JSON")
      .action((options: { json?: boolean }) => {
        const registry = createConnectorRegistry();
        const types = registry.list();

        if (options.json) {
          console.log(JSON.stringify(types, null, 2));
        } else {
          console.log("Available Connector Types:");
          console.log("--------------------------");
          for (const t of types) {
            console.log(`  ${t.type}${t.builtin ? " (built-in)" : ""}`);
            if (t.description) console.log(`    ${t.description}`);
          }
        }
      })
  );

function maskValue(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseHeaders(headerArgs?: string[]): Record<string, string> | undefined {
  if (!headerArgs || headerArgs.length === 0) return undefined;
  const headers: Record<string, string> = {};
  for (const h of headerArgs) {
    const colonIndex = h.indexOf(":");
    if (colonIndex === -1) {
      console.error(`Error: Invalid header format "${h}". Use key:value`);
      process.exit(1);
    }
    const key = h.slice(0, colonIndex).trim();
    const value = h.slice(colonIndex + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${maskValue(v)}`)
    .join(", ");
}
