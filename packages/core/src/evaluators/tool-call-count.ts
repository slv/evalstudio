import type { EvaluatorDefinition } from "../evaluator.js";

/**
 * Built-in metric: counts tool calls in the agent's response.
 * Requires a connector that returns tool_calls in messages (e.g. LangGraph).
 */
export const toolCallCountEvaluator: EvaluatorDefinition = {
  type: "tool-call-count",
  label: "Tool Call Count",
  description:
    "Counts tool calls in the agent's response. Requires a connector that returns tool_calls in messages (e.g. LangGraph).",
  kind: "metric",
  auto: true,
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  chartType: 'bar',

  async evaluate(ctx) {
    let count = 0;
    const toolNames: string[] = [];

    for (const msg of ctx.lastInvocation.messages) {
      if (msg.role === "assistant" && msg.tool_calls) {
        count += msg.tool_calls.length;
        for (const tc of msg.tool_calls) {
          toolNames.push(tc.function.name);
        }
      }
    }

    return {
      success: true,
      value: count,
      reason:
        count === 0
          ? "No tool calls in this turn"
          : `${count} tool call(s): ${toolNames.join(", ")}`,
      metadata: { toolCallCount: count, toolNames },
    };
  },
};
