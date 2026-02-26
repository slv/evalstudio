---
sidebar_position: 7
---

# Connectors

Manage connector configurations for bridging EvalStudio to external API endpoints. Connectors define how to connect to target systems like LangGraph Dev API.

## Import

```typescript
import {
  createProjectModules,
  createStorageProvider,
  resolveWorkspace,
  getConnectorTypes,
  type Connector,
  type ConnectorType,
  type ConnectorConfig,
  type LangGraphConnectorConfig,
  type CreateConnectorInput,
  type UpdateConnectorInput,
  type ConnectorTestResult,
  type ConnectorInvokeInput,
  type ConnectorInvokeResult,
  type Message,
} from "@evalstudio/core";
```

## Setup

All entity operations are accessed through project modules:

```typescript
const workspaceDir = resolveWorkspace();
const storage = await createStorageProvider(workspaceDir);
const modules = createProjectModules(storage, projectId);
```

## Types

### ConnectorType

```typescript
type ConnectorType = "langgraph";
```

Supported connector types:
- `langgraph` - LangGraph Dev API connector for langgraph-backed agents

### Connector

```typescript
interface Connector {
  id: string;              // Unique identifier (UUID)
  name: string;            // Connector name (unique)
  type: ConnectorType;     // Connector type (langgraph)
  baseUrl: string;         // Base URL for the API endpoint
  headers?: Record<string, string>; // Custom headers sent with every request
  config?: ConnectorConfig; // Optional type-specific configuration
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
}
```

### CreateConnectorInput

```typescript
interface CreateConnectorInput {
  name: string;
  type: ConnectorType;
  baseUrl: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}
```

### UpdateConnectorInput

```typescript
interface UpdateConnectorInput {
  name?: string;
  type?: ConnectorType;
  baseUrl?: string;
  headers?: Record<string, string>;
  config?: ConnectorConfig;
}
```

### ConnectorTestResult

```typescript
interface ConnectorTestResult {
  success: boolean;    // Whether the test passed
  latencyMs: number;   // Response time in milliseconds
  response?: string;   // Response message (on success)
  error?: string;      // Error message (on failure)
}
```

### ConnectorInvokeInput

```typescript
interface ConnectorInvokeInput {
  messages: Message[];  // Array of messages to send
  runId?: string;       // Optional run ID to use as thread_id (LangGraph only)
  seenMessageIds?: Set<string>; // IDs of messages already sent/received (for filtering)
  extraHeaders?: Record<string, string>; // Extra headers merged with connector headers (take precedence)
}
```

### ConnectorInvokeResult

```typescript
interface ConnectorInvokeResult {
  success: boolean;             // Whether the invocation succeeded
  latencyMs: number;            // Response time in milliseconds
  messages?: Message[];         // Response messages (on success)
  rawResponse?: string;         // Raw response text
  error?: string;               // Error message (on failure)
  tokensUsage?: TokensUsage;    // Token usage metadata
  threadId?: string;            // Thread ID (LangGraph)
}
```

### Message

Messages support both standard OpenAI chat format and LangGraph extensions:

```typescript
interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  tool_calls?: ToolCall[];           // Tool invocations by assistant
  tool_call_id?: string;             // ID for tool response messages
  name?: string;                     // Tool name for tool messages
  additional_kwargs?: Record<string, unknown>;  // Extra metadata
  response_metadata?: Record<string, unknown>;  // Model response metadata
  id?: string;                       // Message ID
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string, not parsed object
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}
```

### LangGraphConnectorConfig

Type-safe configuration for LangGraph Dev API connectors.

```typescript
interface LangGraphConnectorConfig {
  assistantId: string;              // The assistant ID to invoke (required)
  configurable?: Record<string, unknown>; // Values sent as config.configurable in invoke requests
}
```

### ConnectorConfig

Type alias for connector configuration.

```typescript
type ConnectorConfig = LangGraphConnectorConfig;
```

## Methods

### modules.connectors.create()

Creates a new connector.

```typescript
async function create(input: CreateConnectorInput): Promise<Connector>;
```

**Throws**: Error if a connector with the same name already exists.

```typescript
// LangGraph connector
const langGraphConnector = await modules.connectors.create({
  name: "LangGraph Dev",
  type: "langgraph",
  baseUrl: "http://localhost:8123",
  headers: { "X-API-Key": "my-key" },
  config: {
    assistantId: "my-assistant",
    configurable: { model_name: "gpt-4o" },
  },
});
```

### modules.connectors.get()

Gets a connector by its ID.

```typescript
async function get(id: string): Promise<Connector | undefined>;
```

```typescript
const connector = await modules.connectors.get("987fcdeb-51a2-3bc4-d567-890123456789");
if (connector) {
  console.log(connector.name);
}
```

### modules.connectors.getByName()

Gets a connector by name.

```typescript
async function getByName(name: string): Promise<Connector | undefined>;
```

```typescript
const connector = await modules.connectors.getByName("LangGraph Dev");
```

### modules.connectors.list()

Lists all connectors in the project.

```typescript
async function list(): Promise<Connector[]>;
```

```typescript
const allConnectors = await modules.connectors.list();
```

### modules.connectors.update()

Updates an existing connector.

```typescript
async function update(id: string, input: UpdateConnectorInput): Promise<Connector | undefined>;
```

**Throws**: Error if updating to a name that already exists.

```typescript
const updated = await modules.connectors.update(connector.id, {
  baseUrl: "https://new.api.com",
  headers: { Authorization: "Bearer new-token" },
});
```

### modules.connectors.delete()

Deletes a connector by its ID.

```typescript
async function delete(id: string): Promise<boolean>;
```

```typescript
const deleted = await modules.connectors.delete(connector.id);
console.log(deleted ? "Deleted" : "Not found");
```

### modules.connectors.test()

Tests a connector's connectivity by sending a request to the `/info` endpoint.

```typescript
async function test(id: string): Promise<ConnectorTestResult>;
```

```typescript
const result = await modules.connectors.test(connector.id);

if (result.success) {
  console.log(`Connected in ${result.latencyMs}ms`);
  console.log(`Response: ${result.response}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### modules.connectors.invoke()

Invokes a connector by sending messages and returning the assistant's response. For LangGraph connectors, this waits for the run to complete before returning.

```typescript
async function invoke(id: string, input: ConnectorInvokeInput): Promise<ConnectorInvokeResult>;
```

```typescript
const result = await modules.connectors.invoke(connector.id, {
  messages: [
    { role: "user", content: "Hello, how can you help me?" }
  ]
});

if (result.success && result.messages) {
  for (const msg of result.messages) {
    console.log(`Response: ${msg.content}`);

    // Responses may include tool calls
    if (msg.tool_calls) {
      for (const call of msg.tool_calls) {
        console.log(`Tool: ${call.function.name}, Args: ${call.function.arguments}`);
      }
    }
  }
} else {
  console.error(`Error: ${result.error}`);
}
```

Uses the `/threads/{thread_id}/runs/wait` endpoint which waits for the run to complete before returning the full response including any tool calls.

When `runId` is provided, a thread is created with that ID (if it doesn't exist) and all runs are executed within that thread. This enables better organization and tracing of evaluation runs in LangSmith. Multi-turn conversations use `multitask_strategy: "enqueue"` to properly queue requests on the same thread.

## Standalone Functions

### getConnectorTypes()

Returns the supported connector types with descriptions. This is a standalone function, not a module method.

```typescript
function getConnectorTypes(): Record<ConnectorType, string>;
```

```typescript
const types = getConnectorTypes();
console.log(types.langgraph); // "LangGraph Dev API connector for langgraph-backed agents"
```

## Configuration Examples

### LangGraph Connector Config

```typescript
const config: LangGraphConnectorConfig = {
  assistantId: "my-assistant",  // Required: Assistant ID to use
  configurable: {               // Optional: Values sent as config.configurable
    model_name: "gpt-4o",
    system_prompt: "You are a helpful assistant",
  },
};
```

## Storage

Connectors are stored in `data/connectors.json` within the project directory.
