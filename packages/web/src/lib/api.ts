const API_BASE = "/api";

export type ProviderType = "openai" | "anthropic";

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
 * Unified LLM configuration: provider, credentials, and model selection.
 * apiKey is optional in update payloads (omit to keep existing key).
 * In GET responses, apiKey contains a masked hint (e.g. "sk-...xxxx").
 */
export interface LLMSettings {
  provider: ProviderType;
  apiKey?: string;
  /** Model selection per use-case */
  models?: LLMModelSettings;
}

export interface ProjectConfig {
  name: string;
  llmSettings?: LLMSettings;
  maxConcurrency?: number;
}

export interface UpdateProjectConfigInput {
  name?: string;
  llmSettings?: LLMSettings | null;
  maxConcurrency?: number | null;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export interface Status {
  name: string;
  version: string;
  status: "ok" | "error";
  timestamp: string;
  node: string;
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  imageUrl?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonaInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  headers?: Record<string, string>;
}

export interface UpdatePersonaInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  imageUrl?: string;
  headers?: Record<string, string>;
}


export type FailureCriteriaMode = "every_turn" | "on_max_messages";

/** Reference to an evaluator on a scenario. */
export interface ScenarioEvaluator {
  type: string;
  config?: Record<string, unknown>;
}

/** Registered evaluator type metadata (returned by GET /api/evaluator-types). */
export interface EvaluatorTypeInfo {
  type: string;
  label: string;
  description?: string;
  kind: "assertion" | "metric";
  configSchema?: Record<string, unknown>;
  builtin: boolean;
  auto: boolean;
}

/** Single evaluator result stored on a run's output. */
export interface EvaluatorResultEntry {
  type: string;
  label: string;
  kind: "assertion" | "metric";
  success: boolean;
  value?: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  name: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
  evaluators?: ScenarioEvaluator[];
  /** IDs of personas associated with this scenario */
  personaIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenarioInput {
  name: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
  evaluators?: ScenarioEvaluator[];
  /** IDs of personas associated with this scenario */
  personaIds?: string[];
}

export interface UpdateScenarioInput {
  name?: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
  evaluators?: ScenarioEvaluator[];
  /** IDs of personas associated with this scenario */
  personaIds?: string[];
}

/**
 * A tool call made by an assistant message (OpenAI format).
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string, not parsed object
  };
}

/**
 * A content block within a message (for multi-part content).
 */
export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * A message in OpenAI chat format with optional LangGraph extensions.
 */
export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[] | null;
  /** Tool calls made by the assistant */
  tool_calls?: ToolCall[];
  /** Tool call ID (for tool response messages) */
  tool_call_id?: string;
  /** Message name (e.g., tool name for tool messages) */
  name?: string;
  /** Message ID */
  id?: string;
  /** Debug/passthrough metadata from external systems (not consumed by application) */
  metadata?: Record<string, unknown>;
}

/**
 * Normalizes message content to a string.
 * If content is already a string, returns it as-is.
 * If content is an array of ContentBlocks, extracts and joins text content.
 */
export function getMessageContent(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: ContentBlock) => {
        if (block.type === "text" && block.text) {
          return block.text;
        }
        return `[${block.type}]`;
      })
      .join("\n");
  }
  return "";
}

export interface ScenarioSummary {
  id: string;
  name: string;
  instructions?: string;
  messages?: Message[];
  maxMessages?: number;
  successCriteria?: string;
  failureCriteria?: string;
  failureCriteriaMode?: FailureCriteriaMode;
}

export interface Eval {
  id: string;
  /** Display name for the eval */
  name: string;
  /** Required: Scenarios define the test contexts and evaluation criteria */
  scenarioIds: string[];
  /** The connector to use for running this eval (required) */
  connectorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvalWithRelations extends Eval {
  /** Scenarios are always populated (required relation) */
  scenarios: ScenarioSummary[];
  connector?: {
    id: string;
    name: string;
    type: string;
    baseUrl: string;
  };
}

export interface CreateEvalInput {
  /** Display name for the eval */
  name: string;
  /** Required: Scenarios define the test contexts and evaluation criteria */
  scenarioIds: string[];
  /** The connector to use for running this eval (required) */
  connectorId: string;
}

export interface UpdateEvalInput {
  /** Display name for the eval */
  name?: string;
  /** Scenarios define the test contexts and evaluation criteria */
  scenarioIds?: string[];
  /** The connector to use for running this eval */
  connectorId?: string;
}

export interface ModelGroup {
  label: string;
  models: string[];
}

export interface DefaultModels {
  openai: ModelGroup[];
  anthropic: ModelGroup[];
}

export type ConnectorType = "langgraph";

/** Configuration for LangGraph Dev API connectors */
export interface LangGraphConnectorConfig {
  /** The assistant ID to use when invoking the LangGraph agent (required) */
  assistantId: string;
  /** Configurable values passed in config.configurable of invoke requests */
  configurable?: Record<string, unknown>;
}

/** Union type for connector configurations */
export type ConnectorConfig = LangGraphConnectorConfig;

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  baseUrl: string;
  /** Custom headers to include in every request */
  headers?: Record<string, string>;
  config?: ConnectorConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectorInput {
  name: string;
  type: ConnectorType;
  baseUrl: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}

export interface UpdateConnectorInput {
  name?: string;
  type?: ConnectorType;
  baseUrl?: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}

export interface ConnectorTypes {
  http: string;
  langgraph: string;
}

export interface ConnectorTestResult {
  success: boolean;
  latencyMs: number;
  response?: string;
  error?: string;
}

export interface TokensUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Run status types:
 * - queued: Waiting to be processed
 * - pending: Reserved for future use
 * - running: Currently executing
 * - completed: Finished (check result.success for pass/fail)
 * - error: System error occurred (retryable)
 * - chat: Live chat session (not processed by RunProcessor)
 */
export type RunStatus = "queued" | "pending" | "running" | "completed" | "error" | "chat";

export interface RunResult {
  success: boolean;
  score?: number;
  reason?: string;
}

export interface CreateChatRunInput {
  connectorId: string;
}

export interface ChatMessageResult {
  run: Run;
  messages: Message[];
  latencyMs: number;
  error?: string;
}

export interface Run {
  id: string;
  /** Eval ID (optional for playground runs) */
  evalId?: string;
  personaId?: string;
  scenarioId?: string;
  /** Connector ID (for playground/chat runs) */
  connectorId?: string;
  /** Execution ID - groups runs created together in a single execution */
  executionId?: number;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  threadId?: string;
  messages: Message[];
  output?: Record<string, unknown>;
  result?: RunResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunInput {
  evalId: string;
}

export interface CreatePlaygroundRunInput {
  scenarioId: string;
  connectorId: string;
  personaId?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

/** Build the project-scoped API base path */
function projectBase(projectId: string): string {
  return `${API_BASE}/projects/${projectId}`;
}

/** Build a URL for serving a project image by its ID */
export function projectImageUrl(projectId: string, imageId: string): string {
  return `${projectBase(projectId)}/images/${imageId}`;
}

export const api = {
  // Workspace-level endpoints (no project scope)
  status: {
    get: async (): Promise<Status> => {
      const response = await fetch(`${API_BASE}/status`);
      return handleResponse(response);
    },
  },

  evaluatorTypes: {
    list: async (): Promise<EvaluatorTypeInfo[]> => {
      const response = await fetch(`${API_BASE}/evaluator-types`);
      return handleResponse(response);
    },
  },

  llmProviders: {
    getModels: async (): Promise<DefaultModels> => {
      const response = await fetch(`${API_BASE}/llm-providers/models`);
      return handleResponse(response);
    },

    getProviderModels: async (providerType: ProviderType): Promise<ModelGroup[]> => {
      const response = await fetch(`${API_BASE}/llm-providers/${providerType}/models`);
      const data = await handleResponse<{ groups: ModelGroup[] }>(response);
      return data.groups;
    },
  },

  // Workspace-level project management
  projects: {
    list: async (): Promise<ProjectInfo[]> => {
      const response = await fetch(`${API_BASE}/projects`);
      return handleResponse(response);
    },

    create: async (name: string): Promise<ProjectInfo> => {
      const response = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string): Promise<void> => {
      const response = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },
  },

  // Project-scoped endpoints
  project: {
    getConfig: async (projectId: string): Promise<ProjectConfig> => {
      const response = await fetch(`${projectBase(projectId)}/config`);
      return handleResponse(response);
    },

    updateConfig: async (projectId: string, input: UpdateProjectConfigInput): Promise<ProjectConfig> => {
      const response = await fetch(`${projectBase(projectId)}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },
  },

  personas: {
    list: async (projectId: string): Promise<Persona[]> => {
      const response = await fetch(`${projectBase(projectId)}/personas`);
      return handleResponse(response);
    },

    get: async (projectId: string, id: string): Promise<Persona> => {
      const response = await fetch(`${projectBase(projectId)}/personas/${id}`);
      return handleResponse(response);
    },

    create: async (projectId: string, input: CreatePersonaInput): Promise<Persona> => {
      const response = await fetch(`${projectBase(projectId)}/personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    update: async (projectId: string, id: string, input: UpdatePersonaInput): Promise<Persona> => {
      const response = await fetch(`${projectBase(projectId)}/personas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/personas/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },

    generateImage: async (projectId: string, id: string): Promise<Persona> => {
      const response = await fetch(`${projectBase(projectId)}/personas/${id}/generate-image`, {
        method: "POST",
      });
      return handleResponse(response);
    },
  },

  images: {
    upload: async (projectId: string, imageBase64: string, role: string, filename?: string): Promise<{ id: string }> => {
      const response = await fetch(`${projectBase(projectId)}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, role, filename }),
      });
      return handleResponse(response);
    },

    listByRole: async (projectId: string, role: string): Promise<{ ids: string[] }> => {
      const response = await fetch(`${projectBase(projectId)}/images?role=${encodeURIComponent(role)}`);
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/images/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },
  },

  scenarios: {
    list: async (projectId: string): Promise<Scenario[]> => {
      const response = await fetch(`${projectBase(projectId)}/scenarios`);
      return handleResponse(response);
    },

    get: async (projectId: string, id: string): Promise<Scenario> => {
      const response = await fetch(`${projectBase(projectId)}/scenarios/${id}`);
      return handleResponse(response);
    },

    create: async (projectId: string, input: CreateScenarioInput): Promise<Scenario> => {
      const response = await fetch(`${projectBase(projectId)}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    update: async (projectId: string, id: string, input: UpdateScenarioInput): Promise<Scenario> => {
      const response = await fetch(`${projectBase(projectId)}/scenarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/scenarios/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },

    getPrompt: async (projectId: string, id: string, personaId?: string): Promise<{ systemPrompt: string; messages: Message[] }> => {
      const url = personaId
        ? `${projectBase(projectId)}/scenarios/${id}/prompt?personaId=${personaId}`
        : `${projectBase(projectId)}/scenarios/${id}/prompt`;
      const response = await fetch(url);
      return handleResponse(response);
    },
  },

  evals: {
    list: async (projectId: string): Promise<Eval[]> => {
      const response = await fetch(`${projectBase(projectId)}/evals`);
      return handleResponse(response);
    },

    get: async (projectId: string, id: string, expand?: boolean): Promise<Eval | EvalWithRelations> => {
      const url = expand
        ? `${projectBase(projectId)}/evals/${id}?expand=true`
        : `${projectBase(projectId)}/evals/${id}`;
      const response = await fetch(url);
      return handleResponse(response);
    },

    create: async (projectId: string, input: CreateEvalInput): Promise<Eval> => {
      const response = await fetch(`${projectBase(projectId)}/evals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    update: async (projectId: string, id: string, input: UpdateEvalInput): Promise<Eval> => {
      const response = await fetch(`${projectBase(projectId)}/evals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/evals/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },
  },

  connectors: {
    list: async (projectId: string): Promise<Connector[]> => {
      const response = await fetch(`${projectBase(projectId)}/connectors`);
      return handleResponse(response);
    },

    get: async (projectId: string, id: string): Promise<Connector> => {
      const response = await fetch(`${projectBase(projectId)}/connectors/${id}`);
      return handleResponse(response);
    },

    getTypes: async (projectId: string): Promise<ConnectorTypes> => {
      const response = await fetch(`${projectBase(projectId)}/connectors/types`);
      return handleResponse(response);
    },

    create: async (projectId: string, input: CreateConnectorInput): Promise<Connector> => {
      const response = await fetch(`${projectBase(projectId)}/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    update: async (projectId: string, id: string, input: UpdateConnectorInput): Promise<Connector> => {
      const response = await fetch(`${projectBase(projectId)}/connectors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/connectors/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },

    test: async (projectId: string, id: string): Promise<ConnectorTestResult> => {
      const response = await fetch(`${projectBase(projectId)}/connectors/${id}/test`, {
        method: "POST",
      });
      return handleResponse(response);
    },
  },

  runs: {
    list: async (projectId: string, evalId?: string, scenarioId?: string, personaId?: string, connectorId?: string, status?: RunStatus): Promise<Run[]> => {
      const params = new URLSearchParams();
      if (evalId) params.set("evalId", evalId);
      if (scenarioId) params.set("scenarioId", scenarioId);
      if (personaId) params.set("personaId", personaId);
      if (connectorId) params.set("connectorId", connectorId);
      if (status) params.set("status", status);
      const query = params.toString();
      const base = `${projectBase(projectId)}/runs`;
      const url = query ? `${base}?${query}` : base;
      const response = await fetch(url);
      return handleResponse(response);
    },

    get: async (projectId: string, id: string): Promise<Run> => {
      const response = await fetch(`${projectBase(projectId)}/runs/${id}`);
      return handleResponse(response);
    },

    create: async (projectId: string, input: CreateRunInput): Promise<Run[]> => {
      const response = await fetch(`${projectBase(projectId)}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    createPlayground: async (projectId: string, input: CreatePlaygroundRunInput): Promise<Run> => {
      const response = await fetch(`${projectBase(projectId)}/runs/playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    createChat: async (projectId: string, input: CreateChatRunInput): Promise<Run> => {
      const response = await fetch(`${projectBase(projectId)}/runs/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse(response);
    },

    sendChatMessage: async (projectId: string, runId: string, content: string): Promise<ChatMessageResult> => {
      const response = await fetch(`${projectBase(projectId)}/runs/${runId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      return handleResponse(response);
    },

    delete: async (projectId: string, id: string): Promise<void> => {
      const response = await fetch(`${projectBase(projectId)}/runs/${id}`, {
        method: "DELETE",
      });
      return handleResponse(response);
    },

    retry: async (projectId: string, id: string, options?: { clearMessages?: boolean }): Promise<Run> => {
      const response = await fetch(`${projectBase(projectId)}/runs/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options || {}),
      });
      return handleResponse(response);
    },
  },
};
