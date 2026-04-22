---
sidebar_position: 3
---

# Custom Connectors

EvalStudio communicates with agents through **connectors**. A connector type defines the protocol — how to build requests and parse responses for a specific agent framework or API. A connector instance holds the configuration for one particular agent (its URL, credentials, and type-specific settings).

EvalStudio ships with a built-in **LangGraph** connector type and supports custom connector types you write yourself.

## Project Setup

Custom connectors are loaded from paths declared in `evalstudio.config.json`. Your workspace needs to be an npm project so you can import `@evalstudio/core` and any connector packages.

### File Structure

A typical project with custom connectors:

```
my-workspace/
├── evalstudio.config.json
├── package.json
├── data/
└── connectors/
    ├── openai-assistants.ts
    └── webhook.ts
```

### Dependencies

Your project needs `@evalstudio/core` as a dependency:

```bash
npm init -y
npm install @evalstudio/core
```

## Loading Custom Connectors

Add your connector paths to `evalstudio.config.json` under `connectors`:

```json
{
  "version": 3,
  "name": "My Workspace",
  "connectors": [
    "./connectors/dist/openai-assistants.js",
    "./connectors/dist/webhook.js"
  ],
  "projects": []
}
```

Each entry can be:
- **A relative file path** — resolved from the workspace root directory (e.g., `./connectors/dist/openai-assistants.js`)
- **An npm package name** — resolved via Node's module resolution (e.g., `"evalstudio-connector-bedrock"`)

Custom connectors are loaded automatically when the API server or CLI starts. They appear in the **Add Agent** type picker in the Web UI alongside built-in connector types.

### Using npm Packages

Install the package in your workspace:

```bash
npm install evalstudio-connector-bedrock
```

Then reference it by name:

```json
{
  "connectors": ["evalstudio-connector-bedrock"]
}
```

The package must export a `defineConnector()` call as its default export.

## Writing a Custom Connector

Create a TypeScript file that exports a `defineConnector()` call. A connector definition has two parts:

- **Metadata** — the type identifier, label, description, and a JSON Schema describing the config fields shown in the UI
- **Strategy** — four methods that handle building requests and parsing responses

### Example: Simple Webhook Connector

A minimal connector for agents that expose a POST endpoint:

```typescript
// connectors/webhook.ts
import { defineConnector } from "@evalstudio/core";

export default defineConnector({
  type: "webhook",
  label: "Webhook",
  description: "Simple POST webhook that receives messages and returns a response.",
  baseUrlHint: "https://my-agent.example.com/chat",

  configSchema: {
    type: "object",
    properties: {
      inputField: {
        type: "string",
        description: "JSON field name for the input message (default: 'message')",
      },
      outputField: {
        type: "string",
        description: "JSON field name for the output message (default: 'response')",
      },
    },
  },

  strategy: {
    buildTestRequest(connector) {
      return {
        url: connector.baseUrl,
        method: "POST",
        headers: { "Content-Type": "application/json", ...connector.headers },
        body: JSON.stringify({ message: "ping" }),
      };
    },

    buildInvokeRequest(connector, input) {
      const config = connector.config as { inputField?: string } | undefined;
      const field = config?.inputField ?? "message";
      const lastUserMsg = [...input.messages].reverse().find((m) => m.role === "user");

      return {
        url: connector.baseUrl,
        method: "POST",
        headers: { "Content-Type": "application/json", ...connector.headers },
        body: JSON.stringify({ [field]: lastUserMsg?.content ?? "" }),
      };
    },

    parseTestResponse(responseText) {
      return responseText.slice(0, 500);
    },

    parseInvokeResponse(responseText) {
      const data = JSON.parse(responseText);
      const content =
        typeof data === "string"
          ? data
          : data.response ?? data.message ?? data.content ?? data.text ?? JSON.stringify(data);

      return {
        messages: [{ role: "assistant", content }],
        metadata: {},
      };
    },
  },
});
```

Build it before loading:

```bash
npx tsc --module nodenext --moduleResolution nodenext connectors/webhook.ts
```

### Example: OpenAI Assistants Connector

A connector for agents built on the OpenAI Assistants API (v2):

```typescript
// connectors/openai-assistants.ts
import { defineConnector } from "@evalstudio/core";
import type { ConnectorStrategy } from "@evalstudio/core";

const strategy: ConnectorStrategy = {
  buildTestRequest(connector) {
    const config = connector.config as { assistantId: string };
    return {
      url: `${connector.baseUrl}/assistants/${config.assistantId}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${connector.headers?.["Authorization"]?.replace("Bearer ", "") ?? ""}`,
        "OpenAI-Beta": "assistants=v2",
      },
    };
  },

  buildInvokeRequest(connector, input) {
    const config = connector.config as { assistantId: string; model?: string };
    const url = input.runId
      ? `${connector.baseUrl}/threads/${input.runId}/runs`
      : `${connector.baseUrl}/threads/runs`;

    const messages = input.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    return {
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connector.headers?.["Authorization"]?.replace("Bearer ", "") ?? ""}`,
        "OpenAI-Beta": "assistants=v2",
        ...connector.headers,
      },
      body: JSON.stringify({
        assistant_id: config.assistantId,
        thread: { messages },
        ...(config.model && { model: config.model }),
      }),
    };
  },

  parseTestResponse(responseText) {
    try {
      const data = JSON.parse(responseText);
      return `Assistant "${data.name}" (${data.model}) — ${data.instructions?.slice(0, 100) ?? "no instructions"}`;
    } catch {
      return responseText;
    }
  },

  parseInvokeResponse(responseText, seenMessageIds) {
    const data = JSON.parse(responseText);
    const messages = [];

    if (data.data) {
      for (const step of data.data) {
        if (step.type === "message_creation" && !seenMessageIds.has(step.id)) {
          messages.push({
            role: "assistant",
            content: step.step_details?.message_creation?.content ?? "",
            id: step.id,
          });
        }
      }
    }

    return {
      messages,
      metadata: {
        threadId: data.thread_id,
        tokensUsage: data.usage
          ? {
              input_tokens: data.usage.prompt_tokens,
              output_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
      },
    };
  },
};

export default defineConnector({
  type: "openai-assistants",
  label: "OpenAI Assistants",
  description: "Connect to agents built on the OpenAI Assistants API (v2).",
  baseUrlHint: "https://api.openai.com/v1",

  configSchema: {
    type: "object",
    properties: {
      assistantId: {
        type: "string",
        description: "The assistant ID (starts with asst_)",
      },
      model: {
        type: "string",
        description: "Model override (optional, uses assistant default if empty)",
      },
    },
    required: ["assistantId"],
  },

  strategy,
});
```

## `defineConnector()` Reference

```typescript
import { defineConnector } from "@evalstudio/core";

export default defineConnector({
  // Required
  type: string,        // Unique identifier, e.g. "openai-assistants"
  label: string,       // Human-readable name shown in the UI
  strategy: ConnectorStrategy,

  // Optional
  description?: string,       // Shown in the type picker dropdown
  configSchema?: object,      // JSON Schema for type-specific config fields
  baseUrlHint?: string,       // Placeholder for the Base URL input
  baseUrlRequired?: boolean,  // Whether Base URL is required (default: true)
});
```

### ConnectorStrategy

The strategy handles the HTTP layer. All four methods are required:

```typescript
interface ConnectorStrategy {
  /** Build the request for the "Test Connection" button. */
  buildTestRequest(connector: Connector): ConnectorRequestConfig;

  /** Build the request for a single conversation turn. */
  buildInvokeRequest(
    connector: Connector,
    input: ConnectorInvokeInput
  ): ConnectorRequestConfig;

  /** Parse the raw response text from a test request into a display string. */
  parseTestResponse(responseText: string): string;

  /** Parse the raw response text from an invoke request into messages + metadata. */
  parseInvokeResponse(
    responseText: string,
    seenMessageIds: Set<string>
  ): { messages: Message[]; metadata: ConnectorResponseMetadata };
}
```

### ConnectorRequestConfig

What `buildTestRequest` and `buildInvokeRequest` must return:

```typescript
interface ConnectorRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}
```

### ConnectorInvokeInput

What `buildInvokeRequest` receives as `input`:

```typescript
interface ConnectorInvokeInput {
  messages: Message[];             // Full conversation so far
  runId?: string;                  // Thread/run ID from a previous turn (for stateful agents)
  seenMessageIds: Set<string>;     // IDs of messages already sent/received (for dedup)
  extraHeaders?: Record<string, string>;
}
```

### ConnectorResponseMetadata

What `parseInvokeResponse` returns in `metadata`:

```typescript
interface ConnectorResponseMetadata {
  threadId?: string;       // Thread/run ID to pass back on the next turn as runId
  tokensUsage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}
```

Return `threadId` if your agent is stateful and uses a session/thread ID to continue a conversation across turns.

## configSchema and the UI Form

When a user clicks **Add Agent** and selects your connector type, the Web UI renders a dynamic form driven by `configSchema`. Each property in the schema becomes a form field:

| Schema type | Rendered as |
|-------------|-------------|
| `string` | Text input |
| `number` | Number input |
| `boolean` | Checkbox |
| `object` | Textarea (JSON) |

Fields listed in `required` are validated before the form submits. The `description` property is shown as hint text below each field.

## Connector Packs

A single file can export multiple connector definitions using the pack format:

```typescript
// connectors/my-pack.ts
import { defineConnector } from "@evalstudio/core";

const webhookConnector = defineConnector({ type: "webhook", /* ... */ });
const restConnector    = defineConnector({ type: "rest",    /* ... */ });

export default {
  connectors: [
    ...webhookConnector.connectors,
    ...restConnector.connectors,
  ],
};
```

Reference the pack with a single path entry in `evalstudio.config.json`.

## See Also

- [Custom Evaluators](./custom-evaluators.md) — add custom pass/fail assertions and metrics
- [Connecting to a LangGraph Agent](./langgraph-setup.md) — using the built-in LangGraph connector
