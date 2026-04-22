import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderType } from "./llm-provider.js";
import { CONFIG_FILENAME } from "./project-resolver.js";
import type { StorageProvider } from "./storage-provider.js";

// ---------------------------------------------------------------------------
// Storage config types
// ---------------------------------------------------------------------------

export type StorageType = "filesystem" | "postgres";

export interface FilesystemStorageConfig {
  type: "filesystem";
}

export interface PostgresStorageConfig {
  type: "postgres";
  connectionString: string;
}

export type StorageConfig = FilesystemStorageConfig | PostgresStorageConfig;

/**
 * Masks an API key for safe display: shows first 4 and last 4 characters.
 * Returns "****" for keys with 8 or fewer characters.
 */
export function redactApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

/**
 * Model selection per use-case
 */
export interface LLMModelSettings {
  /** Model for evaluation/judging conversations */
  evaluation?: string;
  /** Model for persona response generation */
  persona?: string;
}

/**
 * Unified LLM configuration: provider, credentials, and model selection
 */
export interface LLMSettings {
  provider: ProviderType;
  apiKey: string;
  /** Model selection per use-case */
  models?: LLMModelSettings;
}

/**
 * Per-project entry stored in the projects[] array of evalstudio.config.json.
 * Sparse — only contains fields that differ from the workspace defaults.
 */
export interface ProjectEntry {
  id: string;
  name: string;
  llmSettings?: LLMSettings;
  maxConcurrency?: number;
}

/**
 * Effective project configuration (workspace defaults merged with per-project overrides).
 * This is what consumers see — the merged result.
 */
export interface ProjectConfig {
  version: number;
  name: string;
  /** LLM provider configuration and model selection */
  llmSettings?: LLMSettings;
  /** Maximum concurrent run executions (default: 3) */
  maxConcurrency?: number;
}

/**
 * Workspace config stored in evalstudio.config.json at the workspace root.
 * Contains the project registry and workspace-level defaults.
 */
export interface WorkspaceConfig extends ProjectConfig {
  /** Storage backend configuration. Defaults to filesystem when omitted. */
  storage?: StorageConfig;
  /** Custom evaluator paths (relative files or npm package names). */
  evaluators?: string[];
  /** Custom connector paths (relative files or npm package names). */
  connectors?: string[];
  projects: ProjectEntry[];
}

// ---------------------------------------------------------------------------
// Workspace config
// ---------------------------------------------------------------------------

/**
 * Reads and parses the workspace config from evalstudio.config.json.
 */
export function readWorkspaceConfig(workspaceDir: string): WorkspaceConfig {
  const configPath = join(workspaceDir, CONFIG_FILENAME);
  const data = readFileSync(configPath, "utf-8");
  return JSON.parse(data) as WorkspaceConfig;
}

/**
 * Writes the workspace config back to evalstudio.config.json.
 */
export function writeWorkspaceConfig(workspaceDir: string, config: WorkspaceConfig): void {
  const configPath = join(workspaceDir, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export interface UpdateWorkspaceConfigInput {
  name?: string;
  llmSettings?: LLMSettings | null;
  maxConcurrency?: number | null;
}

/**
 * Updates the workspace config (workspace-level defaults, not per-project).
 */
export function updateWorkspaceConfig(
  workspaceDir: string,
  input: UpdateWorkspaceConfigInput,
): WorkspaceConfig {
  const config = readWorkspaceConfig(workspaceDir);

  if (input.llmSettings) {
    if (!input.llmSettings.provider) {
      throw new Error("LLM provider type is required");
    }
    // apiKey is optional on update — if not provided, keep existing
    if (!input.llmSettings.apiKey) {
      const existingKey = config.llmSettings?.apiKey;
      if (!existingKey) {
        throw new Error("LLM provider API key is required");
      }
      input = {
        ...input,
        llmSettings: { ...input.llmSettings, apiKey: existingKey },
      };
    }
  }

  let newLLMSettings: LLMSettings | undefined;
  if (input.llmSettings === null) {
    newLLMSettings = undefined;
  } else if (input.llmSettings !== undefined) {
    newLLMSettings = input.llmSettings;
  } else {
    newLLMSettings = config.llmSettings;
  }

  let newMaxConcurrency: number | undefined;
  if (input.maxConcurrency === null) {
    newMaxConcurrency = undefined;
  } else if (input.maxConcurrency !== undefined) {
    if (input.maxConcurrency < 1) {
      throw new Error("maxConcurrency must be at least 1");
    }
    newMaxConcurrency = input.maxConcurrency;
  } else {
    newMaxConcurrency = config.maxConcurrency;
  }

  const updated: WorkspaceConfig = {
    ...config,
    name: input.name ?? config.name,
    llmSettings: newLLMSettings,
    maxConcurrency: newMaxConcurrency,
  };

  writeWorkspaceConfig(workspaceDir, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Effective config (merged)
// ---------------------------------------------------------------------------

/**
 * Reads the effective project config: workspace defaults merged with per-project overrides.
 *
 * Uses StorageProvider to fetch the per-project entry (works for both
 * filesystem and postgres backends). Workspace-level defaults always
 * come from the config file.
 *
 * Merge rules:
 * - Scalar fields: project value wins if present
 * - Objects (llmSettings): project replaces entire object if present
 * - version, projects: workspace-only, not in per-project entries
 */
export async function getProjectConfig(
  storage: StorageProvider,
  workspaceDir: string,
  projectId: string,
): Promise<ProjectConfig> {
  const wsConfig = readWorkspaceConfig(workspaceDir);
  const entry = await storage.getProjectEntry(projectId);

  return {
    version: wsConfig.version,
    name: entry.name,
    llmSettings: entry.llmSettings ?? wsConfig.llmSettings,
    maxConcurrency: entry.maxConcurrency ?? wsConfig.maxConcurrency,
  };
}

export interface UpdateProjectConfigInput {
  name?: string;
  /** Set to null to clear (inherit from workspace) */
  llmSettings?: LLMSettings | null;
  /** Set to null to clear (inherit from workspace) */
  maxConcurrency?: number | null;
}

/**
 * Updates the per-project config via StorageProvider.
 * Returns the new effective config (merged with workspace defaults).
 */
export async function updateProjectConfig(
  storage: StorageProvider,
  workspaceDir: string,
  projectId: string,
  input: UpdateProjectConfigInput,
): Promise<ProjectConfig> {
  const wsConfig = readWorkspaceConfig(workspaceDir);
  const entry = await storage.updateProjectEntry(projectId, input);

  // Return the effective (merged) config
  return {
    version: wsConfig.version,
    name: entry.name,
    llmSettings: entry.llmSettings ?? wsConfig.llmSettings,
    maxConcurrency: entry.maxConcurrency ?? wsConfig.maxConcurrency,
  };
}
