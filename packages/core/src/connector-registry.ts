import type { ConnectorStrategy } from "./connectors/base.js";
import type { JsonSchema } from "./evaluator.js";
import { builtinConnectors } from "./connectors/index.js";
import { readWorkspaceConfig } from "./project.js";

// ---------------------------------------------------------------------------
// ConnectorDefinition — describes a connector type (not an instance)
// ---------------------------------------------------------------------------

/**
 * Defines a connector type (built-in or user-provided).
 * A connector definition describes HOW to communicate with a specific
 * agent protocol/API. Users then create connector instances of that type.
 */
export interface ConnectorDefinition {
  /** Unique type identifier, e.g. "langgraph", "openai-assistants". */
  type: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Optional description shown in the type dropdown. */
  description?: string;
  /** JSON Schema for type-specific config fields. Used for validation and UI form generation. */
  configSchema?: JsonSchema;
  /** Strategy implementation for building requests and parsing responses. */
  strategy: ConnectorStrategy;
}

// ---------------------------------------------------------------------------
// ConnectorRegistry
// ---------------------------------------------------------------------------

/**
 * Registry that holds all known connector types (built-in + custom).
 */
export class ConnectorRegistry {
  private definitions = new Map<string, { definition: ConnectorDefinition; builtin: boolean }>();

  /** Register a connector type. Throws on duplicate type. */
  register(def: ConnectorDefinition, builtin = false): void {
    if (this.definitions.has(def.type)) {
      const existing = this.definitions.get(def.type)!;
      const source = existing.builtin ? "built-in" : "custom";
      throw new Error(
        `Connector type "${def.type}" is already registered (${source}). Custom connectors cannot override existing types.`
      );
    }
    this.definitions.set(def.type, { definition: def, builtin });
  }

  /** Get a connector definition by type. Returns undefined if not found. */
  get(type: string): ConnectorDefinition | undefined {
    return this.definitions.get(type)?.definition;
  }

  /** Get the strategy for a connector type. Throws if not found. */
  getStrategy(type: string): ConnectorStrategy {
    const def = this.definitions.get(type)?.definition;
    if (!def) {
      throw new Error(`Unknown connector type: "${type}". No connector definition is registered for this type.`);
    }
    return def.strategy;
  }

  /** List all registered connector types with metadata. */
  list(): Array<{
    type: string;
    label: string;
    description?: string;
    configSchema?: Record<string, unknown>;
    builtin: boolean;
  }> {
    return Array.from(this.definitions.values()).map(({ definition, builtin }) => ({
      type: definition.type,
      label: definition.label,
      description: definition.description,
      configSchema: definition.configSchema,
      builtin,
    }));
  }
}

// ---------------------------------------------------------------------------
// defineConnector helper
// ---------------------------------------------------------------------------

/**
 * Identity function that provides type safety for defining connectors.
 * Custom connector files should `export default defineConnector({ ... })`.
 */
export function defineConnector(
  def: ConnectorDefinition
): { connectors: ConnectorDefinition[] } {
  return { connectors: [def] };
}

// ---------------------------------------------------------------------------
// Factory: create registry with built-in + custom connectors
// ---------------------------------------------------------------------------

/**
 * Create a registry with built-in connectors registered, then load custom
 * connectors from the workspace config's connectors[] paths.
 *
 * @param workspaceDir - Workspace root directory (to read config and resolve relative paths)
 */
export async function createConnectorRegistry(workspaceDir: string): Promise<ConnectorRegistry> {
  const registry = new ConnectorRegistry();
  for (const def of builtinConnectors) {
    registry.register(def, true);
  }

  let connectorPaths: string[] | undefined;
  try {
    const config = readWorkspaceConfig(workspaceDir);
    connectorPaths = config.connectors;
  } catch {
    // No workspace config yet (e.g., during init) — skip custom connectors
  }

  if (connectorPaths && connectorPaths.length > 0) {
    await loadCustomConnectors(registry, connectorPaths, workspaceDir);
  }

  return registry;
}

/**
 * Load custom connectors from config paths and register them.
 *
 * @param registry - The registry to add connectors to
 * @param connectorPaths - Array of paths/package names from evalstudio.config.json
 * @param configDir - Directory to resolve relative paths from
 */
async function loadCustomConnectors(
  registry: ConnectorRegistry,
  connectorPaths: string[],
  configDir: string
): Promise<void> {
  const { resolve } = await import("node:path");

  for (const entry of connectorPaths) {
    const importPath = entry.startsWith(".") || entry.startsWith("/")
      ? resolve(configDir, entry)
      : entry;

    let mod: unknown;
    try {
      mod = await import(importPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isPackage = !entry.startsWith(".") && !entry.startsWith("/");
      const hint = isPackage
        ? `Install it with: npm install ${entry}`
        : "Make sure you've built your project.";
      throw new Error(
        `Connector plugin "${entry}" could not be loaded: ${msg}. ${hint}`
      );
    }

    const exported = (mod as Record<string, unknown>).default ?? mod;

    if (
      !exported ||
      typeof exported !== "object" ||
      !Array.isArray((exported as Record<string, unknown>).connectors)
    ) {
      throw new Error(
        `Connector plugin "${entry}" has an invalid export. Use defineConnector() to create the export.`
      );
    }

    const { connectors } = exported as { connectors: ConnectorDefinition[] };
    for (const def of connectors) {
      registry.register(def, false);
    }
  }
}
