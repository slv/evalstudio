import type { EvaluatorDefinition } from "./evaluator.js";
import { builtinEvaluators } from "./evaluators/index.js";
import { readWorkspaceConfig } from "./project.js";

/**
 * Registry that holds all known evaluator types (built-in + custom).
 */
export class EvaluatorRegistry {
  private evaluators = new Map<string, { definition: EvaluatorDefinition; builtin: boolean }>();

  /** Register an evaluator. Throws on duplicate type. */
  register(def: EvaluatorDefinition, builtin = false): void {
    if (this.evaluators.has(def.type)) {
      const existing = this.evaluators.get(def.type)!;
      const source = existing.builtin ? "built-in" : "custom";
      throw new Error(
        `Evaluator type "${def.type}" is already registered (${source}). Custom evaluators cannot override existing types.`
      );
    }
    this.evaluators.set(def.type, { definition: def, builtin });
  }

  /** Get an evaluator definition by type. Returns undefined if not found. */
  get(type: string): EvaluatorDefinition | undefined {
    return this.evaluators.get(type)?.definition;
  }

  /** List all registered evaluator types with metadata. */
  list(): Array<{
    type: string;
    label: string;
    description?: string;
    kind: "assertion" | "metric";
    configSchema?: Record<string, unknown>;
    builtin: boolean;
    auto: boolean;
  }> {
    return Array.from(this.evaluators.values()).map(({ definition, builtin }) => ({
      type: definition.type,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      configSchema: definition.configSchema,
      builtin,
      auto: !!definition.auto,
    }));
  }
}

/**
 * Identity function that provides type safety for defining evaluators.
 * Custom evaluator files should `export default defineEvaluator({ ... })`.
 */
export function defineEvaluator(
  def: EvaluatorDefinition
): { evaluators: EvaluatorDefinition[] } {
  return { evaluators: [def] };
}

/**
 * Create a registry with built-in evaluators, then load custom evaluators
 * from the workspace config's evaluators[] paths.
 *
 * @param workspaceDir - Workspace root directory (to read config and resolve relative paths)
 */
export async function createEvaluatorRegistry(
  workspaceDir: string
): Promise<EvaluatorRegistry> {
  const registry = new EvaluatorRegistry();
  for (const def of builtinEvaluators) {
    registry.register(def, true);
  }

  let evaluatorPaths: string[] | undefined;
  try {
    const config = readWorkspaceConfig(workspaceDir);
    evaluatorPaths = config.evaluators;
  } catch {
    // No workspace config yet (e.g., during init) — skip custom evaluators
  }

  if (evaluatorPaths && evaluatorPaths.length > 0) {
    await loadCustomEvaluators(registry, evaluatorPaths, workspaceDir);
  }

  return registry;
}

/**
 * Load custom evaluators from config paths and register them.
 *
 * @param registry - The registry to add evaluators to
 * @param evaluatorPaths - Array of paths/package names from evalstudio.config.json
 * @param configDir - Directory to resolve relative paths from
 */
async function loadCustomEvaluators(
  registry: EvaluatorRegistry,
  evaluatorPaths: string[],
  configDir: string
): Promise<void> {
  const { resolve } = await import("node:path");

  for (const entry of evaluatorPaths) {
    // Resolve path: relative paths resolve from configDir, package names resolve via import()
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
        `Evaluator plugin "${entry}" could not be loaded: ${msg}. ${hint}`
      );
    }

    // Support both default export and direct export
    const exported = (mod as Record<string, unknown>).default ?? mod;

    if (
      !exported ||
      typeof exported !== "object" ||
      !Array.isArray((exported as Record<string, unknown>).evaluators)
    ) {
      throw new Error(
        `Evaluator plugin "${entry}" has an invalid export. Use defineEvaluator() to create the export.`
      );
    }

    const { evaluators } = exported as { evaluators: EvaluatorDefinition[] };
    for (const def of evaluators) {
      registry.register(def, false);
    }
  }
}
