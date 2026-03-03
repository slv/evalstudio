# Proposal: Custom Connector Plugins

## Summary

Allow authors to define custom connector types as plugins, using the same config-based loading pattern established by custom evaluators. A custom connector type defines *how* to communicate with a specific agent protocol or API. Users then create connector instances of that type via the "Add Agent" form, which dynamically renders config fields based on the type's schema.

## Motivation

EvalStudio currently ships with a single built-in connector type: **LangGraph**. But teams evaluate agents built on many different frameworks and protocols:

- OpenAI Assistants API
- Amazon Bedrock Agents
- Custom REST/gRPC APIs with proprietary message formats
- WebSocket-based agents
- Dialogflow CX, Rasa, Botpress, etc.

Today, supporting a new protocol requires modifying core source code. Custom connectors would let anyone extend EvalStudio by publishing an npm package or dropping a file into their workspace — the same developer experience as custom evaluators.

## Design

### Architecture Overview

```
evalstudio.config.json
  └── connectors: ["./connectors/dist/openai-assistants.js", "evalstudio-connector-bedrock"]
        │
        ▼
  ConnectorRegistry (new)
  ├── Built-in: langgraph (always available)
  └── Custom: loaded from config paths
        │
        ▼
  "Add Agent" form renders dynamic config fields per type
```

The system mirrors the evaluator plugin architecture:

| Concept | Evaluators (existing) | Connectors (proposed) |
|---------|----------------------|----------------------|
| Definition | `EvaluatorDefinition` | `ConnectorDefinition` |
| Registry | `EvaluatorRegistry` | `ConnectorRegistry` |
| Config key | `evaluators: [...]` | `connectors: [...]` |
| Helper | `defineEvaluator()` | `defineConnector()` |
| Strategy | — | `ConnectorStrategy` (existing) |
| UI | Evaluator picker on scenario | Type picker + dynamic form on "Add Agent" |

### ConnectorDefinition Interface

A custom connector type must export a `ConnectorDefinition`:

```typescript
interface ConnectorDefinition {
  // Required
  type: string;               // Unique identifier, e.g. "openai-assistants"
  label: string;              // Human-readable name for the UI, e.g. "OpenAI Assistants"
  strategy: ConnectorStrategy;  // Request/response handling (existing interface)

  // Optional
  description?: string;       // Shown in the type dropdown
  configSchema?: JsonSchema;  // JSON Schema for type-specific config fields
  baseUrlHint?: string;       // Placeholder/hint for the Base URL field, e.g. "https://api.openai.com/v1"
  baseUrlRequired?: boolean;  // Whether Base URL is required (default: true)
}
```

The `ConnectorStrategy` interface already exists in `packages/core/src/connectors/base.ts` and is unchanged:

```typescript
interface ConnectorStrategy {
  buildTestRequest(connector: Connector): ConnectorRequestConfig;
  buildInvokeRequest(connector: Connector, input: ConnectorInvokeInput): ConnectorRequestConfig;
  parseTestResponse(responseText: string): string;
  parseInvokeResponse(responseText: string, seenMessageIds: Set<string>): {
    messages: Message[];
    metadata: ConnectorResponseMetadata;
  };
}
```

### `defineConnector()` Helper

Similar to `defineEvaluator()`, a one-liner export API:

```typescript
// packages/core/src/connector-registry.ts
export function defineConnector(def: ConnectorDefinition): { connectors: ConnectorDefinition[] } {
  return { connectors: [def] };
}
```

### Config File

Same pattern as evaluators — relative paths or npm package names:

```json
{
  "version": 3,
  "name": "My Workspace",
  "evaluators": ["./evaluators/dist/max-latency.js"],
  "connectors": [
    "./connectors/dist/openai-assistants.js",
    "evalstudio-connector-bedrock"
  ]
}
```

### ConnectorRegistry

New class in `packages/core/src/connector-registry.ts`:

```typescript
class ConnectorRegistry {
  register(def: ConnectorDefinition, builtin?: boolean): void;
  get(type: string): ConnectorDefinition | undefined;
  list(): ConnectorTypeInfo[];
}

interface ConnectorTypeInfo {
  type: string;
  label: string;
  description?: string;
  configSchema?: Record<string, unknown>;
  baseUrlHint?: string;
  baseUrlRequired?: boolean;
  builtin: boolean;
}
```

Loading follows the same pattern as `loadCustomEvaluators()`:

1. Register built-in `langgraph` connector definition
2. Read `connectors` array from `evalstudio.config.json`
3. For each path: `import()` → validate export shape → `registry.register(def)`
4. Duplicate type names throw an error

### Strategy Resolution

Today, `getStrategy()` is a hardcoded map. It becomes a registry lookup:

```typescript
// Before (hardcoded)
const connectorStrategies: Record<ConnectorType, ConnectorStrategy> = {
  langgraph: langGraphStrategy,
};

// After (registry-based)
function getStrategy(type: string): ConnectorStrategy {
  const def = connectorRegistry.get(type);
  if (!def) throw new Error(`Unknown connector type: ${type}`);
  return def.strategy;
}
```

### ConnectorType Becomes Open-Ended

The `ConnectorType` union type changes from a closed literal union to `string`:

```typescript
// Before
export type ConnectorType = "langgraph";

// After
export type ConnectorType = string;
```

Built-in types are still validated at registration time. Custom types are validated by the registry.

### Connector Entity (unchanged)

The stored `Connector` entity is unchanged. The `type` field already holds a string, and `config` is already `Record<string, unknown>` compatible. Custom connectors store their type-specific config in the same `config` field:

```typescript
interface Connector {
  id: string;
  name: string;
  type: string;          // "langgraph", "openai-assistants", etc.
  baseUrl: string;
  headers?: Record<string, string>;
  config?: Record<string, unknown>;  // Type-specific config
  createdAt: string;
  updatedAt: string;
}
```

## API Changes

### `GET /api/connectors/types`

Currently returns a hardcoded `Record<string, string>`. Changes to return full type info from the registry:

```typescript
// Response: ConnectorTypeInfo[]
[
  {
    "type": "langgraph",
    "label": "LangGraph",
    "description": "LangGraph Dev API connector for langgraph-backed agents",
    "configSchema": {
      "type": "object",
      "properties": {
        "assistantId": { "type": "string", "description": "Assistant ID to invoke" }
      },
      "required": ["assistantId"]
    },
    "baseUrlHint": "http://localhost:8123",
    "builtin": true
  },
  {
    "type": "openai-assistants",
    "label": "OpenAI Assistants",
    "description": "Connect to OpenAI Assistants API",
    "configSchema": {
      "type": "object",
      "properties": {
        "assistantId": { "type": "string", "description": "The assistant ID (asst_...)" },
        "model": { "type": "string", "description": "Model override (optional)" }
      },
      "required": ["assistantId"]
    },
    "baseUrlHint": "https://api.openai.com/v1",
    "builtin": false
  }
]
```

All other connector endpoints remain unchanged — they operate on connector *instances*, not types.

## Web UI Changes

### "Add Agent" Form — Dynamic Config Fields

The current `ConnectorForm` has hardcoded fields for LangGraph (Assistant ID). This changes to a dynamic form driven by `configSchema`:

1. **Type dropdown** — populated from `GET /api/connectors/types` (shows `label` + `description`)
2. **Base URL** — always shown, `placeholder` set from `baseUrlHint`, hidden if `baseUrlRequired: false`
3. **Config fields** — rendered dynamically from the selected type's `configSchema`:
   - `string` → text input
   - `number` → number input
   - `boolean` → checkbox
   - `enum` → select dropdown
   - `required` fields marked with asterisk
   - `description` shown as hint text below each field

```
┌─────────────────────────────────────┐
│ Add Agent                           │
│                                     │
│ Name      [My Agent            ]    │
│                                     │
│ Type      [OpenAI Assistants  ▾]    │
│                                     │
│ Base URL  [https://api.openai.com ] │
│           Connect to OpenAI Assi... │
│                                     │
│ ── OpenAI Assistants Config ──────  │
│                                     │
│ Assistant ID *  [asst_abc123   ]    │
│                 The assistant ID... │
│                                     │
│ Model           [gpt-4o        ]    │
│                 Model override...   │
│                                     │
│           [Cancel]  [Add Agent]     │
└─────────────────────────────────────┘
```

### Connector Detail / Edit

The connector detail view already shows type, base URL, and config. No structural changes needed — the config fields display as key-value pairs regardless of type.

## Example: Writing a Custom Connector

### OpenAI Assistants Connector

```typescript
// connectors/openai-assistants.ts
import { defineConnector } from "@evalstudio/core";
import type { ConnectorStrategy, ConnectorRequestConfig, ConnectorResponseMetadata } from "@evalstudio/core";
import type { Connector, ConnectorInvokeInput } from "@evalstudio/core";
import type { Message } from "@evalstudio/core";

const strategy: ConnectorStrategy = {
  buildTestRequest(connector: Connector): ConnectorRequestConfig {
    const config = connector.config as { assistantId: string };
    return {
      url: `${connector.baseUrl}/assistants/${config.assistantId}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${connector.headers?.["Authorization"]?.replace("Bearer ", "") || ""}`,
        "OpenAI-Beta": "assistants=v2",
      },
    };
  },

  buildInvokeRequest(connector: Connector, input: ConnectorInvokeInput): ConnectorRequestConfig {
    const config = connector.config as { assistantId: string; model?: string };

    // OpenAI Assistants use thread-based conversations
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
        "Authorization": `Bearer ${connector.headers?.["Authorization"]?.replace("Bearer ", "") || ""}`,
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

  parseTestResponse(responseText: string): string {
    try {
      const data = JSON.parse(responseText);
      return `Assistant "${data.name}" (${data.model}) — ${data.instructions?.slice(0, 100) || "no instructions"}`;
    } catch {
      return responseText;
    }
  },

  parseInvokeResponse(responseText: string, seenMessageIds: Set<string>): {
    messages: Message[];
    metadata: ConnectorResponseMetadata;
  } {
    const data = JSON.parse(responseText);
    const messages: Message[] = [];

    // Extract assistant messages from the run result
    if (data.data) {
      for (const step of data.data) {
        if (step.type === "message_creation") {
          messages.push({
            role: "assistant",
            content: step.step_details?.message_creation?.content || "",
            id: step.id,
          });
        }
      }
    }

    return {
      messages,
      metadata: {
        threadId: data.thread_id,
        tokensUsage: data.usage ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        } : undefined,
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

### Simple Webhook Connector

A minimal connector for agents that expose a simple POST endpoint:

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
      const field = config?.inputField || "message";
      const lastUserMsg = [...input.messages].reverse().find((m) => m.role === "user");

      return {
        url: connector.baseUrl,
        method: "POST",
        headers: { "Content-Type": "application/json", ...connector.headers },
        body: JSON.stringify({ [field]: lastUserMsg?.content || "" }),
      };
    },

    parseTestResponse(responseText) {
      return responseText.slice(0, 500);
    },

    parseInvokeResponse(responseText) {
      const data = JSON.parse(responseText);
      const content = typeof data === "string" ? data
        : data.response || data.message || data.content || data.text || JSON.stringify(data);

      return {
        messages: [{ role: "assistant", content }],
        metadata: {},
      };
    },
  },
});
```

## Implementation Plan

### Phase 1: Dogfood — LangGraph uses `defineConnector()`

The first step is purely internal: introduce the `ConnectorDefinition` interface and `ConnectorRegistry`, then migrate the built-in LangGraph connector to use them. **No custom plugin loading yet.** This proves the interfaces work end-to-end before any external author touches them.

Files to create/modify in `@evalstudio/core`:

1. **Create** `src/connector-registry.ts` — `ConnectorRegistry` class and `defineConnector()` helper (no `loadCustomConnectors()` yet)
2. **Modify** `src/connectors/langgraph.ts` — export a full `ConnectorDefinition` (wraps existing `langGraphStrategy` with `type`, `label`, `description`, `configSchema`, `baseUrlHint`):
   ```typescript
   // connectors/langgraph.ts
   export const langGraphDefinition: ConnectorDefinition = {
     type: "langgraph",
     label: "LangGraph",
     description: "LangGraph Dev API connector for langgraph-backed agents",
     baseUrlHint: "http://localhost:8123",
     configSchema: {
       type: "object",
       properties: {
         assistantId: {
           type: "string",
           description: "The assistant ID to invoke",
         },
         configurable: {
           type: "object",
           description: "Extra configurable values passed in config.configurable",
         },
       },
       required: ["assistantId"],
     },
     strategy: langGraphStrategy,
   };
   ```
3. **Modify** `src/connector.ts`:
   - Change `ConnectorType` from `"langgraph"` literal to `string`
   - Remove hardcoded `connectorStrategies` map and `getConnectorTypes()`
   - `createConnectorModule()` accepts a `ConnectorRegistry` parameter and uses it for strategy lookup
4. **Modify** `src/connectors/index.ts` — re-export the definition
5. **Export** from `src/index.ts`: `defineConnector`, `ConnectorDefinition`, `ConnectorRegistry`, `ConnectorStrategy` types

**Validation:** After this phase, the entire test suite and CLI/API/Web stack work exactly as before, but the LangGraph connector is wired through the registry instead of a hardcoded map. The `GET /connectors/types` endpoint returns the same data, now sourced from the registry.

### Phase 2: Dynamic "Add Agent" Form

With `configSchema` now available on every connector type (including LangGraph), make the Web UI data-driven.

Files to modify in `@evalstudio/web`:

1. **Modify** `lib/api.ts` — widen `ConnectorType` to `string`, add `ConnectorTypeInfo` interface
2. **Modify** `components/ConnectorForm.tsx` — replace hardcoded LangGraph fields with dynamic rendering from `configSchema` (fetched via `GET /api/connectors/types`)
3. **Add** `useConnectorTypes()` hook to fetch and cache type info

Files to modify in `@evalstudio/api`:

1. **Modify** `routes/connectors.ts` — update `GET /connectors/types` to return full `ConnectorTypeInfo[]` from registry (including `configSchema`, `baseUrlHint`, `builtin`)

**Validation:** The "Add Agent" form renders the same LangGraph fields as before, but they're now generated from `configSchema`. No user-visible change — just proving the dynamic form works.

### Phase 3: Custom Plugin Loading

Now that the interfaces are proven with LangGraph, enable external loading.

Files to modify in `@evalstudio/core`:

1. **Add** `loadCustomConnectors()` to `src/connector-registry.ts` — same `import()` + validate pattern as `loadCustomEvaluators()`
2. **Modify** `src/project.ts` — read `connectors` array from `evalstudio.config.json`, add to `ProjectConfig` type

Files to modify in `@evalstudio/api`:

1. **Modify** server setup — call `loadCustomConnectors(registry, paths, configDir)` during startup

**Validation:** A local `.js` file with `defineConnector()` export appears in the "Add Agent" type dropdown and can be used to create and invoke connectors.

### Phase 4: Documentation

1. **Create** `packages/docs/docs/guides/custom-connectors.md` — user guide (parallel to custom evaluators guide)
2. **Update** `packages/docs/docs/guides/custom-evaluators.md` — cross-reference

## Migration & Backwards Compatibility

- **No breaking changes.** Existing `langgraph` connectors in `data/connectors.json` continue to work — the stored `type: "langgraph"` resolves against the same built-in definition, now registered via the registry instead of a hardcoded map.
- The `connectors` config key is new and optional — existing `evalstudio.config.json` files without it work as before.
- `ConnectorType` widening from `"langgraph"` to `string` is backwards-compatible at runtime. TypeScript consumers may need to update type assertions, but since `@evalstudio/core` is the only consumer, this is internal.

## Open Questions

1. **Config validation** — Should the registry validate connector `config` against `configSchema` on create/update? (Evaluators validate at the scenario level.) Recommendation: yes, validate on `POST /connectors` and `PUT /connectors/:id`.

2. **Multiple connectors per file** — Should a file be able to export multiple connector definitions (like evaluator packs)? Recommendation: yes, support `{ connectors: ConnectorDefinition[] }` for packs, and `defineConnector()` for single exports.

3. **Headers schema** — Some connector types need specific headers (e.g., `Authorization: Bearer ...`, `OpenAI-Beta: assistants=v2`). Should the definition declare required headers via schema, or leave that to documentation? Recommendation: add an optional `headersSchema?: JsonSchema` field for types that need specific headers, rendered as additional form fields.

4. **Streaming support** — The current `ConnectorStrategy` assumes request/response (fetch + text). Should custom connectors support streaming? Recommendation: defer to a future proposal. The strategy interface can be extended with an optional `buildStreamRequest()` + `parseStreamChunk()` later.
