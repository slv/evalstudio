/**
 * Custom evaluator examples.
 *
 * Demonstrates both evaluator kinds:
 *   - "assertion": pass/fail gate — failure marks the run as failed
 *   - "metric":    measurement only — never causes failure, shows as a chart
 *
 * Registered via the `evaluators` field in evalstudio.config.json.
 *
 * Setup:
 *   npm install
 *   npx @evalstudio/cli serve
 */

import { defineEvaluator } from "@evalstudio/core";

/**
 * Assertion: enforces a minimum response length.
 * Fails the run if the assistant's reply is shorter than `minChars` (default: 20).
 * Add to a scenario's evaluators[] array to activate:
 *   { "type": "min-response-length", "config": { "minChars": 50 } }
 */
const minResponseLength = defineEvaluator({
  type: "min-response-length",
  label: "Minimum Response Length",
  description: "Fails if the assistant reply is shorter than the configured character minimum.",
  kind: "assertion",
  configSchema: {
    type: "object",
    properties: {
      minChars: {
        type: "number",
        description: "Minimum number of characters required in the reply (default: 20)",
      },
    },
  },

  async evaluate(ctx) {
    const minChars = typeof ctx.config.minChars === "number" ? ctx.config.minChars : 20;
    const lastAssistant = [...ctx.lastInvocation.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const content = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
    const length = content.length;
    const success = length >= minChars;

    return {
      success,
      value: length,
      reason: success
        ? `Reply has ${length} chars (min: ${minChars})`
        : `Reply too short: ${length} chars (min: ${minChars})`,
    };
  },
});

/**
 * Metric: measures reply length in characters per turn.
 * Auto-runs on every scenario — no need to add it to evaluators[].
 * Results are shown as a line chart on the scenario stats page.
 */
const replyLength = defineEvaluator({
  type: "reply-length",
  label: "Reply Length",
  description: "Measures the character count of the assistant reply each turn.",
  kind: "metric",
  auto: true,
  chartType: "line",
  configSchema: { type: "object", properties: {} },

  async evaluate(ctx) {
    const lastAssistant = [...ctx.lastInvocation.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const content = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
    const length = content.length;

    return {
      success: true,
      value: length,
      reason: `Reply is ${length} characters`,
    };
  },
});

export default {
  evaluators: [
    ...minResponseLength.evaluators,
    ...replyLength.evaluators,
  ],
};
