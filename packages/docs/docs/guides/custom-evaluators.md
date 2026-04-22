---
sidebar_position: 2
---

# Custom Evaluators

EvalStudio runs evaluators on each conversation turn during an evaluation. Evaluators come in two kinds:

- **Assertions** — pass/fail gates. If an assertion fails, the run fails immediately.
- **Metrics** — measurements only. They track numeric values (token count, tool calls) but never cause failure.

EvalStudio ships with built-in evaluators and supports custom evaluators you write yourself.

## Built-in Evaluators

These run automatically on every scenario (`auto: true`). You don't need to configure them.

| Type | Kind | Description |
|------|------|-------------|
| `tool-call-count` | metric | Counts tool calls in the agent's response per turn |
| `token-usage` | metric | Reports input/output/total token usage per turn |

Both require a connector that returns the relevant metadata (e.g., LangGraph returns tool calls and token usage automatically).

## Project Setup

Custom evaluators are loaded from paths declared in `evalstudio.config.json`. Your workspace needs to be an npm project so you can import `@evalstudio/core` and any evaluator packages.

### File Structure

A typical project with custom evaluators:

```
my-workspace/
├── evalstudio.config.json
├── package.json
├── data/
└── evaluators/
    ├── max-latency.ts
    └── response-length.ts
```

### Dependencies

Your project needs `@evalstudio/core` as a dependency:

```bash
npm init -y
npm install @evalstudio/core
```

## Loading Custom Evaluators

Add your evaluator paths to `evalstudio.config.json` under `evaluators`:

```json
{
  "version": 3,
  "name": "My Workspace",
  "evaluators": [
    "./evaluators/dist/max-latency.js",
    "./evaluators/dist/response-length.js"
  ],
  "projects": []
}
```

Each entry can be:
- **A relative file path** — resolved from the workspace root directory (e.g., `./evaluators/dist/max-latency.js`)
- **An npm package name** — resolved via Node's module resolution (e.g., `"my-evaluator-pack"`)

Custom evaluators are loaded automatically when the API server or CLI starts. They appear alongside built-in evaluators in the Web UI and can be added to any scenario.

### Using npm Packages

Install the package in your workspace:

```bash
npm install my-evaluator-pack
```

Then reference it by name:

```json
{
  "evaluators": ["my-evaluator-pack"]
}
```

The package must export a `defineEvaluator()` call as its default export.

## Writing a Custom Evaluator

Create a TypeScript file that exports a `defineEvaluator()` call. This is the only API you need.

### Example: Max Latency Assertion

An assertion that fails the run if a turn takes longer than a configured threshold:

```typescript
// evaluators/max-latency.ts
import { defineEvaluator } from "@evalstudio/core";

export default defineEvaluator({
  type: "max-latency",
  label: "Max Latency",
  description: "Fails if a turn exceeds the configured latency threshold.",
  kind: "assertion",

  configSchema: {
    type: "object",
    properties: {
      maxMs: { type: "number", description: "Maximum latency in ms" },
    },
    required: ["maxMs"],
  },

  async evaluate(ctx) {
    const maxMs = (ctx.config.maxMs as number) ?? 5000;
    const actual = ctx.lastInvocation.latencyMs;

    if (actual > maxMs) {
      return {
        success: false,
        value: actual,
        reason: `Latency ${actual}ms exceeded threshold of ${maxMs}ms`,
      };
    }

    return {
      success: true,
      value: actual,
      reason: `Latency ${actual}ms within threshold of ${maxMs}ms`,
    };
  },
});
```

### Example: Response Length Metric

A metric that measures how many characters the assistant's response contains:

```typescript
// evaluators/response-length.ts
import { defineEvaluator } from "@evalstudio/core";

export default defineEvaluator({
  type: "response-length",
  label: "Response Length",
  description: "Measures the character count of the assistant's response.",
  kind: "metric",

  async evaluate(ctx) {
    let length = 0;
    for (const msg of ctx.lastInvocation.messages) {
      if (msg.role === "assistant" && typeof msg.content === "string") {
        length += msg.content.length;
      }
    }

    return {
      success: true,
      value: length,
      reason: `Response: ${length} characters`,
    };
  },
});
```

## `defineEvaluator()` Reference

```typescript
import { defineEvaluator } from "@evalstudio/core";

export default defineEvaluator({
  // Required
  type: string,           // Unique identifier, e.g. "max-latency"
  label: string,          // Human-readable name for the UI
  kind: "assertion" | "metric",

  // Optional
  description?: string,   // Shown in the UI
  auto?: boolean,         // If true, runs on every scenario automatically
  configSchema?: object,  // JSON Schema for per-scenario config
  chartType?: "line" | "bar" | "scatter",  // Chart style on scenario stats page

  // Required
  async evaluate(ctx: EvaluatorContext): Promise<EvaluationResult>,
});
```

### EvaluatorContext

The `ctx` object passed to `evaluate()`:

```typescript
interface EvaluatorContext {
  messages: Message[];         // Full conversation history
  config: Record<string, unknown>;  // Per-scenario evaluator config

  scenario: {
    name: string;
    instructions?: string;
    maxMessages?: number;
  };

  persona?: {
    name: string;
    description?: string;
  };

  lastInvocation: {
    latencyMs: number;         // Response time for this turn
    messages: Message[];       // New messages from the connector
    tokensUsage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };

  turn: number;                // 1-indexed turn number
  isFinal: boolean;            // True on the last turn
}
```

### EvaluationResult

What `evaluate()` must return:

```typescript
interface EvaluationResult {
  success: boolean;              // Assertions: false = run fails. Metrics: always true.
  value?: number;                // The measured value (shown in metrics/charts)
  reason: string;                // Human-readable explanation
  metadata?: Record<string, unknown>;  // Extra data for debugging
}
```

## Running Only on the Final Turn

Evaluators run on every turn by default. If your evaluator should only produce a result on the last turn (e.g., evaluating the full conversation), use `ctx.isFinal` to skip earlier turns:

```typescript
export default defineEvaluator({
  type: "conversation-quality",
  label: "Conversation Quality",
  kind: "assertion",

  async evaluate(ctx) {
    // Skip non-final turns
    if (!ctx.isFinal) {
      return { success: true, reason: "Waiting for final turn" };
    }

    // Evaluate the complete conversation
    const totalMessages = ctx.messages.filter(m => m.role !== "system").length;
    return {
      success: totalMessages >= 2,
      value: totalMessages,
      reason: `Conversation had ${totalMessages} messages`,
    };
  },
});
```

On non-final turns, return `success: true` to avoid stopping the run early. The evaluator will only perform its real check on the last turn.

## Adding Evaluators to Scenarios

Once loaded, evaluators can be added to individual scenarios via their `evaluators` array in the Web UI or API.

The `config` object is validated against the evaluator's `configSchema` and passed to `evaluate()` as `ctx.config`.

## Chart Visualization

Evaluator results are displayed over time on the scenario Stats tab. Each evaluator gets its own chart. The `chartType` field controls which visualization is used:

| Chart Type | Description | Default for |
|------------|-------------|-------------|
| `"bar"` | Bar chart per execution | Assertions (pass rate %) |
| `"scatter"` | Per-run scatter dots with avg line | Metrics |
| `"line"` | Line chart connecting execution averages | — |

If `chartType` is not set, assertions default to bar and metrics default to scatter. The `token-usage` evaluator is excluded (already shown in the Trends performance chart).

```typescript
export default defineEvaluator({
  type: "response-length",
  label: "Response Length",
  kind: "metric",
  chartType: "line",  // override the default scatter chart
  async evaluate(ctx) { /* ... */ },
});
```

## How Evaluators Run

1. The RunProcessor executes each conversation turn (send message → get response)
2. After each turn, **all evaluators** for the scenario are run in parallel:
   - Built-in evaluators with `auto: true` always run
   - Evaluators listed in the scenario's `evaluators[]` array also run
3. **Assertions**: if any assertion returns `success: false`, the run fails immediately
4. **Metrics**: values are recorded in `run.output.metrics` (e.g., `{ "tool-call-count": 3 }`) and `run.output.evaluatorResults[]`
5. Results are visible in the Web UI on the run detail page

## See Also

- [Custom Connectors](./custom-connectors.md) — add support for new agent protocols and APIs
