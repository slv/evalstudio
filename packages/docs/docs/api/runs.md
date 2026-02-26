---
sidebar_position: 6
---

# Runs API

REST API endpoints for managing evaluation runs. Runs track the execution of evals with specific runtime configurations.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/runs` | List all runs |
| GET | `/api/projects/:projectId/runs/:id` | Get run by ID |
| POST | `/api/projects/:projectId/runs` | Create runs for an eval |
| POST | `/api/projects/:projectId/runs/playground` | Create a playground run (without eval) |
| POST | `/api/projects/:projectId/runs/chat` | Create a chat run (live chat session) |
| PUT | `/api/projects/:projectId/runs/:id` | Update a run |
| POST | `/api/projects/:projectId/runs/:id/retry` | Retry a run with system errors |
| DELETE | `/api/projects/:projectId/runs/:id` | Delete a run |

## List Runs

```http
GET /api/projects/:projectId/runs
GET /api/projects/:projectId/runs?evalId=<eval-id>
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `evalId` | string | Filter runs by eval ID (returns sorted by createdAt desc) |
| `scenarioId` | string | Filter runs by scenario ID (returns sorted by createdAt desc) |
| `personaId` | string | Filter runs by persona ID (returns sorted by createdAt desc) |
| `connectorId` | string | Filter runs by connector ID (returns sorted by createdAt desc, supports additional `status` filter) |
| `status` | string | Filter runs by status (used with `connectorId` or standalone) |

### Response

```json
[
  {
    "id": "run-uuid",
    "evalId": "eval-uuid",
    "personaId": "persona-uuid",
    "scenarioId": "scenario-uuid",
    "executionId": 1,
    "status": "completed",
    "startedAt": "2026-01-29T10:00:00.000Z",
    "completedAt": "2026-01-29T10:00:15.000Z",
    "messages": [
      { "role": "system", "content": "You are a test agent..." },
      { "role": "user", "content": "Hello" },
      { "role": "assistant", "content": "Hi there!" }
    ],
    "latencyMs": 1500,
    "result": {
      "success": true,
      "score": 0.95,
      "reason": "Agent responded appropriately"
    },
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:15.000Z"
  }
]
```

Note: Connector and LLM provider information is configured at the Eval level. The messages array includes the system prompt (generated from persona/scenario) and all conversation messages. To get connector information, fetch the parent eval with `?expand=true`.

## Get Run

```http
GET /api/projects/:projectId/runs/:id
```

### Response

```json
{
  "id": "run-uuid",
  "evalId": "eval-uuid",
  "status": "completed",
  "startedAt": "2026-01-29T10:00:00.000Z",
  "completedAt": "2026-01-29T10:00:15.000Z",
  "latencyMs": 1500,
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "result": {
    "success": true,
    "score": 0.95,
    "reason": "Agent responded appropriately"
  },
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:00:15.000Z"
}
```

### Error Response

```json
{
  "error": "Run not found"
}
```

**Status Code:** 404

## Create Run

Creates one or more runs for an eval. If the eval's scenario has multiple personas associated with it (`personaIds`), one run is created for each persona.

```http
POST /api/projects/:projectId/runs
Content-Type: application/json
```

### Request Body

```json
{
  "evalId": "eval-uuid"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evalId` | string | Yes | ID of the eval to run |

Note: Runs use the connector and LLM provider configured on the parent Eval. These cannot be overridden at the run level. The `personaId` and `scenarioId` are stored directly on the run at creation time. An `executionId` is automatically assigned to group runs created in the same batch.

### Response

**Status Code:** 201 Created

Returns an **array** of created runs. If the scenario has 3 personas, 3 runs are returned. All runs in the batch share the same `executionId`.

```json
[
  {
    "id": "run-uuid-1",
    "evalId": "eval-uuid",
    "personaId": "persona-uuid-1",
    "scenarioId": "scenario-uuid",
    "executionId": 1,
    "status": "queued",
    "messages": [],
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  },
  {
    "id": "run-uuid-2",
    "evalId": "eval-uuid",
    "personaId": "persona-uuid-2",
    "scenarioId": "scenario-uuid",
    "executionId": 1,
    "status": "queued",
    "messages": [],
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
]
```

If the scenario has no personas, a single run is created with `personaId` set to `null`.

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Eval ID is required |
| 404 | Eval, Scenario, or Persona not found |

## Create Playground Run

Creates a run directly from a scenario without requiring an eval. Useful for testing scenarios in a playground environment before setting up formal evaluations.

```http
POST /api/projects/:projectId/runs/playground
Content-Type: application/json
```

### Request Body

```json
{
  "scenarioId": "scenario-uuid",
  "connectorId": "connector-uuid",
  "personaId": "persona-uuid"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | string | Yes | ID of the scenario to run |
| `connectorId` | string | Yes | ID of the connector to use for invoking the agent |
| `personaId` | string | No | ID of the persona to simulate (optional) |

Note: Playground runs store `connectorId` directly on the run since there's no parent eval. LLM provider for evaluation is resolved from the project's `llmSettings`.

### Response

**Status Code:** 201 Created

```json
{
  "id": "run-uuid",
  "scenarioId": "scenario-uuid",
  "connectorId": "connector-uuid",
  "personaId": "persona-uuid",
  "status": "queued",
  "messages": [],
  "createdAt": "2026-02-03T10:00:00.000Z",
  "updatedAt": "2026-02-03T10:00:00.000Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Scenario ID is required / Connector ID is required |
| 404 | Scenario, Connector, or Persona not found |

## Create Chat Run

Creates a live chat run for a connector. Used by the Agents page for interactive chat sessions. Chat runs have `status: "chat"` and are not processed by RunProcessor.

```http
POST /api/projects/:projectId/runs/chat
Content-Type: application/json
```

### Request Body

```json
{
  "connectorId": "connector-uuid"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectorId` | string | Yes | ID of the connector for the chat session |

### Response

**Status Code:** 201 Created

```json
{
  "id": "run-uuid",
  "connectorId": "connector-uuid",
  "status": "chat",
  "messages": [],
  "startedAt": "2026-02-26T10:00:00.000Z",
  "createdAt": "2026-02-26T10:00:00.000Z",
  "updatedAt": "2026-02-26T10:00:00.000Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Connector ID is required |
| 404 | Connector not found |

## Update Run

```http
PUT /api/projects/:projectId/runs/:id
Content-Type: application/json
```

### Request Body

```json
{
  "status": "completed",
  "startedAt": "2026-01-29T10:00:00.000Z",
  "completedAt": "2026-01-29T10:00:15.000Z",
  "latencyMs": 1500,
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "result": {
    "success": true,
    "score": 0.95,
    "reason": "Agent responded appropriately"
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | "queued", "pending", "running", "completed", "error", or "chat" |
| `startedAt` | string | ISO timestamp when run started |
| `completedAt` | string | ISO timestamp when run completed |
| `latencyMs` | number | Total execution time in milliseconds |
| `threadId` | string | Thread ID for LangGraph |
| `messages` | array | Conversation messages |
| `output` | object | Structured output |
| `result` | object | Evaluation result with success, score, reason |
| `error` | string | Error message if run has system error |

All fields are optional. Only provided fields will be updated.

### Response

```json
{
  "id": "run-uuid",
  "evalId": "eval-uuid",
  "status": "completed",
  "...": "..."
}
```

### Error Response

| Status | Description |
|--------|-------------|
| 404 | Run not found |

## Delete Run

```http
DELETE /api/projects/:projectId/runs/:id
```

### Response

**Status Code:** 204 No Content

### Error Response

```json
{
  "error": "Run not found"
}
```

**Status Code:** 404

## Retry Run

Retry a run with system errors by resetting it to "queued" status. Only runs with `status: "error"` can be retried. Evaluation failures (`status: "completed"` with `result.success: false`) cannot be retried.

```http
POST /api/projects/:projectId/runs/:id/retry
```

No request body required. The run is reset to "queued" status with cleared messages and a new thread ID.

### Response

```json
{
  "id": "run-uuid",
  "evalId": "eval-uuid",
  "status": "queued",
  "messages": [],
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:05:00.000Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Cannot retry run with status "X". Only runs with system errors can be retried. |
| 404 | Run not found |

## Run Status

Runs have the following status values:

| Status | Description |
|--------|-------------|
| `queued` | Run created and waiting to be executed |
| `pending` | Run is being prepared for execution |
| `running` | Run is currently executing |
| `completed` | Run finished (check `result.success` for pass/fail). Evaluation failures use this status |
| `error` | Run encountered a system error (retryable). Check `error` field for details |
| `chat` | Live chat session from the Agents page. Not processed by RunProcessor |
