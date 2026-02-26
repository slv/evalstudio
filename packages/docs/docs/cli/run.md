---
sidebar_position: 6
---

# evalstudio run

Manage and process evaluation runs. Runs represent individual test executions of a scenario/persona combination against a connector.

## Usage

```bash
evalstudio run <command> [options]
```

## Commands

### create

Create runs for an eval. Creates one run per scenario/persona combination.

```bash
evalstudio run create [options]
```

| Option | Description |
|--------|-------------|
| `-e, --eval <eval>` | Eval ID (required) |
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio run create -e 987fcdeb-51a2-3bc4-d567-890123456789
```

Output:
```
6 run(s) created successfully

  ID:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Eval:      987fcdeb-51a2-3bc4-d567-890123456789
  Persona:   impatient-user
  Connector: LangGraph Dev
  Status:    queued
  Created:   2026-01-28T10:00:00.000Z

  ...
```

### list

List runs with optional filters.

```bash
evalstudio run list [options]
```

| Option | Description |
|--------|-------------|
| `-e, --eval <eval>` | Filter by eval ID |
| `-s, --status <status>` | Filter by status: `queued`, `running`, `completed`, `error`, `chat` |
| `-l, --limit <number>` | Maximum number of runs to show |
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio run list -e 987fcdeb --status completed
```

Output:
```
Runs:
-----
  a1b2c3d4-e5f6-7890-abcd-ef1234567890
    Status:    completed
    Eval:      987fcdeb-51a2-3bc4-d567-890123456789
    Persona:   impatient-user
    Connector: LangGraph Dev
    Created:   2026-01-28T10:00:00.000Z
```

### show

Show run details including messages and result.

```bash
evalstudio run show <id> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio run show a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Output:
```
Run: a1b2c3d4-e5f6-7890-abcd-ef1234567890
-----
  Status:    completed
  Eval:      987fcdeb-51a2-3bc4-d567-890123456789
  Scenario:  Booking Cancellation
  Persona:   impatient-user
  Connector: LangGraph Dev
  Started:   2026-01-28T10:00:01.000Z
  Completed: 2026-01-28T10:00:05.000Z
  Messages:  4
  Result:    passed
  Score:     0.95
  Reason:    Agent correctly confirmed cancellation and explained refund policy
  Created:   2026-01-28T10:00:00.000Z
  Updated:   2026-01-28T10:00:05.000Z
```

### delete

Delete a run.

```bash
evalstudio run delete <id> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio run delete a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Output:
```
Run "a1b2c3d4-e5f6-7890-abcd-ef1234567890" deleted successfully
```

### process

Process queued runs. Can run once or in continuous watch mode.

```bash
evalstudio run process [options]
```

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch mode — continuously process runs |
| `-c, --concurrency <number>` | Maximum concurrent runs (default: from project config or 3) |
| `--poll <ms>` | Poll interval in milliseconds (default: 2000) |

**Example (one-shot):**

```bash
evalstudio run process
```

Output:
```
Processing queued runs...
✓ Run a1b2c3d4 completed (3200ms)
✓ Run b2c3d4e5 completed (2800ms)
Processed 2 run(s)
```

**Example (watch mode):**

```bash
evalstudio run process --watch --concurrency 5
```

Output:
```
Starting run processor in watch mode...
  Concurrency: 5
  Poll interval: 2000ms

Press Ctrl+C to stop

▶ Starting run a1b2c3d4
✓ Run a1b2c3d4 completed (3200ms)
▶ Starting run b2c3d4e5
✗ Run b2c3d4e5 failed: Connection refused
```

### playground

Create and immediately process a single run outside of an eval.

```bash
evalstudio run playground [options]
```

| Option | Description |
|--------|-------------|
| `-s, --scenario <scenario>` | Scenario ID or name (required) |
| `-c, --connector <connector>` | Connector ID or name (required) |
| `-p, --persona <persona>` | Persona ID or name |
| `--json` | Output as JSON |

**Example:**

```bash
evalstudio run playground \
  -s "Booking Cancellation" \
  -c "LangGraph Dev" \
  -p "impatient-user"
```

Output:
```
▶ Playground run created: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Scenario:  Booking Cancellation
  Connector: LangGraph Dev
  Persona:   impatient-user

Processing...

Conversation:
────────────────────────────────────────────────────────────
[system] You are an impatient user who values brevity...
[user] I need to cancel my booking for tomorrow
[assistant] I've cancelled your booking for tomorrow. Your refund will be processed within 3-5 business days.
────────────────────────────────────────────────────────────

Status:  completed
Latency: 3200ms
Result:  passed
Score:   0.95
Reason:  Agent correctly confirmed cancellation and explained refund policy
```

## JSON Output

All commands support the `--json` flag for machine-readable output, useful for scripts and CI/CD pipelines.

```bash
evalstudio run list --json
```
