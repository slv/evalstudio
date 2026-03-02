---
sidebar_position: 8
---

# evalstudio connector

Manage connector configurations for bridging EvalStudio to external API endpoints. Connectors define how to connect to target systems like [LangGraph](/guides/langgraph-setup) Dev API.

## Usage

```bash
evalstudio connector <command> [options]
```

## Commands

### create

Create a new connector configuration.

```bash
evalstudio connector create <name> [options]
```

| Option | Description |
|--------|-------------|
| `--type <type>` | Connector type: langgraph (required) |
| `--base-url <url>` | Base URL for the API endpoint (required) |
| `--header <key:value>` | Custom header as key:value pair (repeatable) |
| `--config <json>` | Configuration as JSON string |
| `--json` | Output as JSON |

**Example:**

```bash
# LangGraph connector (assistantId is required in config)
evalstudio connector create "LangGraph Dev" \
  --type langgraph \
  --base-url http://localhost:8123 \
  --header "X-API-Key:my-key" \
  --config '{"assistantId": "my-assistant"}'
```

Output:
```
Connector created successfully
  ID:       987fcdeb-51a2-3bc4-d567-890123456789
  Name:     LangGraph Dev
  Type:     langgraph
  Base URL: http://localhost:8123
  Headers:  X-API-Key: my-k...y-key
  Config:   {"assistantId":"my-assistant"}
  Created:  2026-01-29T10:00:00.000Z
```

### list

List connector configurations.

```bash
evalstudio connector list [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio connector list
```

Output:
```
Connectors:
-----------
  LangGraph Dev (987fcdeb-51a2-3bc4-d567-890123456789)
    Type:     langgraph
    Base URL: http://localhost:8123
```

### show

Show connector details.

```bash
evalstudio connector show <identifier> [options]
```

The identifier can be the connector ID or name.

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio connector show "LangGraph Dev"
```

Output:
```
Connector: LangGraph Dev
-----------
  ID:       987fcdeb-51a2-3bc4-d567-890123456789
  Name:     LangGraph Dev
  Type:     langgraph
  Base URL: http://localhost:8123
  Headers:  X-API-Key: my-k...y-key
  Config:   {"assistantId":"my-assistant"}
  Created:  2026-01-29T10:00:00.000Z
  Updated:  2026-01-29T10:00:00.000Z
```

### update

Update a connector configuration.

```bash
evalstudio connector update <identifier> [options]
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | New connector name |
| `--type <type>` | New connector type (langgraph) |
| `--base-url <url>` | New base URL |
| `--header <key:value>` | Custom header as key:value pair (repeatable, replaces existing) |
| `--config <json>` | New configuration as JSON string |
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio connector update 987fcdeb-51a2-3bc4-d567-890123456789 \
  --base-url http://localhost:8124 \
  --header "X-API-Key:new-key" \
  --config '{"assistantId": "new-assistant"}'
```

### delete

Delete a connector configuration.

```bash
evalstudio connector delete <identifier> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio connector delete 987fcdeb-51a2-3bc4-d567-890123456789
```

Output:
```
Connector "LangGraph Dev" deleted successfully
```

### types

List available connector types.

```bash
evalstudio connector types [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio connector types
```

Output:
```
Available Connector Types:
--------------------------
  langgraph
    LangGraph Dev API connector for langgraph-backed agents
```

## JSON Output

All commands support `--json` for machine-readable output:

```bash
evalstudio connector list --json
```

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
