---
sidebar_position: 1
---

# Connecting to a LangGraph Agent

This guide explains how to connect EvalStudio to a [LangGraph](https://langchain-ai.github.io/langgraph/) agent. It covers the prerequisites, how to configure the connector, and what happens under the hood.

## Prerequisites

You need a running LangGraph server. EvalStudio connects to it over HTTP — it does not run or manage the LangGraph process itself.

### Option 1: Local Development Server

The fastest way to get started. See the [LangGraph local server docs](https://langchain-ai.github.io/langgraph/tutorials/langgraph-platform/local-server/) for full details.

For **JavaScript/TypeScript** agents:

```bash
npx @langchain/langgraph-cli dev
```

For **Python** agents:

```bash
pip install "langgraph-cli[inmem]"
langgraph dev
```

Both start a server at `http://127.0.0.1:2024` with in-memory storage and hot reloading.

Your project needs a `langgraph.json` that registers your graph. A minimal JS/TS config:

```json
{
  "graphs": {
    "agent": "./src/agent.ts:graph"
  }
}
```

The value points to the file and exported `CompiledStateGraph` instance. See the [LangGraph CLI docs](https://docs.langchain.com/langsmith/cli) for all configuration options.

### Option 2: Docker (with persistence)

For a more production-like setup with PostgreSQL-backed persistence:

```bash
# JS/TS
npx @langchain/langgraph-cli up

# Python
langgraph up
```

This starts a server at `http://localhost:8123`. See the [LangGraph CLI docs](https://docs.langchain.com/langsmith/cli) for configuration options.

### Option 3: LangGraph Platform (Cloud)

For hosted deployments, see [LangGraph deployment options](https://langchain-ai.github.io/langgraph/concepts/langgraph_platform/). Your base URL will be provided by the platform.

### Verifying the server is running

You can check that the server is reachable:

```bash
curl http://127.0.0.1:2024/info
```

A successful response means the server is ready. This is the same endpoint EvalStudio uses for the agent health check.

## Configuring the Connector

### Via the Web UI (Agents page)

1. Navigate to the **Agents** page
2. Click **+ New Agent**
3. Fill in:
   - **Name**: A display name (e.g., "My LangGraph Agent")
   - **Type**: `langgraph`
   - **Base URL**: Your server URL (e.g., `http://127.0.0.1:2024`)
   - **Assistant ID**: The assistant to invoke (see [Assistant ID](#assistant-id) below)
4. Click **Create**
5. Use the **Test** button to verify connectivity — it calls `GET /info` on your server

After creating the agent, you can configure optional settings in the agent's **Settings** tab:
- **Headers**: Custom HTTP headers (e.g., API keys)
- **Configurable**: Runtime config values passed to your agent

### Via the CLI

```bash
evalstudio connector create "My LangGraph Agent" \
  --type langgraph \
  --url http://127.0.0.1:2024 \
  --config '{"assistantId": "my-assistant"}'
```

### Via the API

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My LangGraph Agent",
    "type": "langgraph",
    "baseUrl": "http://127.0.0.1:2024",
    "config": {"assistantId": "my-assistant"}
  }'
```

## Concept Mapping

EvalStudio's connector configuration maps to LangGraph concepts as follows:

| EvalStudio Field | LangGraph Concept | Notes |
|---|---|---|
| `baseUrl` | Server URL | The root URL of the LangGraph server |
| `config.assistantId` | [Assistant](https://langchain-ai.github.io/langgraph/concepts/langgraph_platform/#assistants) | Which assistant to invoke. Defaults to `"default"` if not set |
| `config.configurable` | [Configurable](https://langchain-ai.github.io/langgraph/how-tos/configuration/) | Runtime parameters passed as `config.configurable` in invoke requests |
| `headers` | HTTP headers | Merged into every request. Use for API keys (`x-api-key`) or auth tokens |
| Run `threadId` | [Thread](https://langchain-ai.github.io/langgraph/concepts/langgraph_platform/#threads) | Managed automatically — EvalStudio creates threads on first message and reuses them for multi-turn conversations |

### Assistant ID

When you deploy a LangGraph graph, the platform auto-creates a **default assistant** for it. If you only have one graph, you can leave `assistantId` blank — EvalStudio defaults to `"default"`.

If you have multiple assistants or want to target a specific one, set the `assistantId` in the connector config. You can find available assistants by querying your LangGraph server:

```bash
curl http://127.0.0.1:2024/assistants/search
```

### Configurable Values

LangGraph agents can accept runtime configuration via `config.configurable`. Common use cases:

- Selecting a model: `{"model": "gpt-4o"}`
- Setting a system prompt: `{"system_message": "You are a helpful assistant"}`
- Feature flags: `{"use_rag": true}`

Set these in the connector's **Configurable** field (JSON object). They're sent with every invoke request.

## How EvalStudio Communicates with LangGraph

### Health Check (Test)

```
GET {baseUrl}/info
```

Used by the agent status indicator and the Test button. Any 2xx response means the agent is online.

### Sending Messages (Invoke)

**First message** (no thread yet):
```
POST {baseUrl}/runs/wait
```

**Subsequent messages** (thread exists):
```
POST {baseUrl}/threads/{threadId}/runs/wait
```

The request body:

```json
{
  "assistant_id": "my-assistant",
  "input": {
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  },
  "multitask_strategy": "enqueue",
  "if_not_exists": "create",
  "config": {
    "configurable": {"key": "value"}
  }
}
```

Key behaviors:
- **Thread auto-creation**: `"if_not_exists": "create"` tells LangGraph to create the thread automatically on first use
- **Message deduplication**: On subsequent turns, EvalStudio only sends new messages (not the full history), since LangGraph already has the thread state
- **Synchronous wait**: Uses `/runs/wait` which blocks until the agent completes its response
- **Configurable**: Only included when configured on the connector

### Response Handling

LangGraph returns all messages on the thread. EvalStudio:
1. Filters to only new messages (ones not previously seen)
2. Maps LangGraph's `type` field to standard roles (`"human"` -> `"user"`, `"ai"` -> `"assistant"`, `"tool"` -> `"tool"`)
3. Normalizes tool calls from LangGraph format to OpenAI format
4. Extracts token usage from `usage_metadata` on assistant messages
5. Stores the `thread_id` for subsequent turns

## Troubleshooting

### Connection Refused

```
Error: fetch failed - Connection refused
```

The LangGraph server is not running or not reachable at the configured URL. Verify:
- The server is running (`npx @langchain/langgraph-cli dev` or `npx @langchain/langgraph-cli up`)
- The port matches your configuration (2024 for `dev`, 8123 for `up`)
- If running in Docker, the port is properly exposed

### HTTP 404: Not Found

```
Error: HTTP 404
```

The assistant ID doesn't exist on the server. Check:
- Query available assistants: `curl {baseUrl}/assistants/search`
- If unsure, use `"default"` or leave the assistant ID blank

### HTTP 401/403: Unauthorized

```
Error: HTTP 401: Unauthorized
```

The server requires authentication. Add the API key to the connector's headers:

```json
{
  "x-api-key": "your-langsmith-api-key"
}
```

For LangGraph Platform (Cloud), you'll need a LangSmith API key.

### Empty Responses

If the agent responds but EvalStudio shows no messages, the response format may not match what EvalStudio expects. Check:
- The response contains a `messages` array at the top level
- Each message has a `type` or `role` field
- The server returns the full thread state (default LangGraph behavior)

### Slow Responses

LangGraph's `/runs/wait` blocks until the agent finishes. If your agent makes multiple tool calls or has long-running operations, this is expected. The latency shown in EvalStudio includes the full end-to-end time.
