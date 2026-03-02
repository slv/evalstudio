---
sidebar_position: 7
---

# Connectors API

REST endpoints for managing connector configurations. Connectors define how to connect to target systems like LangGraph agents.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/connectors` | List connectors |
| GET | `/api/projects/:projectId/connectors/types` | List available connector types |
| POST | `/api/projects/:projectId/connectors` | Create a connector |
| GET | `/api/projects/:projectId/connectors/:id` | Get a connector by ID |
| PUT | `/api/projects/:projectId/connectors/:id` | Update a connector |
| DELETE | `/api/projects/:projectId/connectors/:id` | Delete a connector |
| POST | `/api/projects/:projectId/connectors/:id/test` | Test connector connectivity |

---

## GET /api/projects/:projectId/connectors

List all connectors.

### Response (200 OK)

```json
[
  {
    "id": "987fcdeb-51a2-3bc4-d567-890123456789",
    "name": "LangGraph Dev",
    "type": "langgraph",
    "baseUrl": "http://localhost:8123",
    "headers": {
      "X-API-Key": "lg-dev-key"
    },
    "config": {
      "assistantId": "my-assistant"
    },
    "createdAt": "2026-01-29T10:00:00.000Z",
    "updatedAt": "2026-01-29T10:00:00.000Z"
  }
]
```

### Example

```bash
curl http://localhost:3000/api/projects/PROJECT_ID/connectors
```

---

## GET /api/projects/:projectId/connectors/types

Get available connector types with descriptions.

### Response (200 OK)

```json
{
  "langgraph": "LangGraph Dev API connector for langgraph-backed agents"
}
```

### Example

```bash
curl http://localhost:3000/api/projects/PROJECT_ID/connectors/types
```

---

## POST /api/projects/:projectId/connectors

Create a new connector.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Connector name |
| `type` | string | Yes | Connector type: "langgraph" |
| `baseUrl` | string | Yes | Base URL for the API endpoint |
| `headers` | object | No | Custom headers sent with every request (key-value pairs) |
| `config` | object | No | Type-specific configuration (see below) |

**Config for LangGraph connectors:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assistantId` | string | Yes | The assistant ID to invoke |
| `configurable` | object | No | Values sent as `config.configurable` in invoke requests |

```json
{
  "name": "LangGraph Dev",
  "type": "langgraph",
  "baseUrl": "http://localhost:8123",
  "headers": {
    "X-API-Key": "lg-dev-key"
  },
  "config": {
    "assistantId": "my-assistant"
  }
}
```

### Response (201 Created)

```json
{
  "id": "987fcdeb-51a2-3bc4-d567-890123456789",
  "name": "LangGraph Dev",
  "type": "langgraph",
  "baseUrl": "http://localhost:8123",
  "headers": {
    "X-API-Key": "lg-dev-key"
  },
  "config": {
    "assistantId": "my-assistant"
  },
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:00:00.000Z"
}
```

### Errors

| Status | Description |
|--------|-------------|
| 400 | Missing required field (name, type, or baseUrl) |
| 409 | Connector with name already exists |

### Example

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "LangGraph Dev",
    "type": "langgraph",
    "baseUrl": "http://localhost:8123",
    "headers": {"X-API-Key": "lg-dev-key"},
    "config": {"assistantId": "my-assistant"}
  }'
```

---

## GET /api/projects/:projectId/connectors/:id

Get a connector by its ID.

### Response (200 OK)

```json
{
  "id": "987fcdeb-51a2-3bc4-d567-890123456789",
  "name": "LangGraph Dev",
  "type": "langgraph",
  "baseUrl": "http://localhost:8123",
  "config": {
    "assistantId": "my-assistant"
  },
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:00:00.000Z"
}
```

### Errors

| Status | Description |
|--------|-------------|
| 404 | Connector not found |

### Example

```bash
curl http://localhost:3000/api/projects/PROJECT_ID/connectors/987fcdeb-51a2-3bc4-d567-890123456789
```

---

## PUT /api/projects/:projectId/connectors/:id

Update an existing connector.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New connector name |
| `type` | string | No | New connector type |
| `baseUrl` | string | No | New base URL |
| `headers` | object | No | New custom headers (replaces existing) |
| `config` | object | No | New configuration (replaces existing) |

```json
{
  "baseUrl": "http://localhost:8124",
  "headers": {
    "X-API-Key": "new-key"
  },
  "config": {
    "assistantId": "new-assistant"
  }
}
```

### Response (200 OK)

```json
{
  "id": "987fcdeb-51a2-3bc4-d567-890123456789",
  "name": "LangGraph Dev",
  "type": "langgraph",
  "baseUrl": "http://localhost:8124",
  "headers": {
    "X-API-Key": "new-key"
  },
  "config": {
    "assistantId": "new-assistant"
  },
  "createdAt": "2026-01-29T10:00:00.000Z",
  "updatedAt": "2026-01-29T10:30:00.000Z"
}
```

### Errors

| Status | Description |
|--------|-------------|
| 404 | Connector not found |
| 409 | Connector with name already exists |

### Example

```bash
curl -X PUT http://localhost:3000/api/projects/PROJECT_ID/connectors/987fcdeb-51a2-3bc4-d567-890123456789 \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "http://localhost:8124"}'
```

---

## DELETE /api/projects/:projectId/connectors/:id

Delete a connector.

### Response (204 No Content)

Empty response on success.

### Errors

| Status | Description |
|--------|-------------|
| 404 | Connector not found |

### Example

```bash
curl -X DELETE http://localhost:3000/api/projects/PROJECT_ID/connectors/987fcdeb-51a2-3bc4-d567-890123456789
```

---

## POST /api/projects/:projectId/connectors/:id/test

Test a connector's connectivity by sending a "hello" message and checking the response.

### Response (200 OK)

```json
{
  "success": true,
  "latencyMs": 145,
  "response": "Hello! How can I help you today?"
}
```

### Response (200 OK - Test Failed)

```json
{
  "success": false,
  "latencyMs": 0,
  "error": "Connection refused"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the test passed |
| `latencyMs` | number | Response time in milliseconds |
| `response` | string | Response message (on success) |
| `error` | string | Error message (on failure) |

### Example

```bash
curl -X POST http://localhost:3000/api/projects/PROJECT_ID/connectors/987fcdeb-51a2-3bc4-d567-890123456789/test
```

