import { describe, it, expect } from "vitest";
import {
  runEvaluators,
  type EvaluatorDefinition,
  type EvaluatorContext,
} from "../evaluator.js";
import { defineEvaluator } from "../evaluator-registry.js";
import * as evaluatorModule from "../evaluator.js";
import * as coreIndex from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<EvaluatorContext> = {}): Omit<EvaluatorContext, "config"> {
  return {
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ],
    scenario: { name: "test-scenario" },
    lastInvocation: {
      latencyMs: 100,
      messages: [{ role: "assistant", content: "Hi there!" }],
    },
    turn: 1,
    isFinal: false,
    ...overrides,
  };
}

function makeMetric(type: string, value: number): EvaluatorDefinition {
  return {
    type,
    label: `Metric ${type}`,
    kind: "metric",
    async evaluate() {
      return { success: true, value, reason: `${type} = ${value}` };
    },
  };
}

function makeAssertion(type: string, success: boolean): EvaluatorDefinition {
  return {
    type,
    label: `Assertion ${type}`,
    kind: "assertion",
    async evaluate() {
      return { success, reason: success ? "Passed" : "Failed" };
    },
  };
}

// ---------------------------------------------------------------------------
// runEvaluators
// ---------------------------------------------------------------------------

describe("runEvaluators", () => {
  it("returns empty results when no evaluators are provided", async () => {
    const result = await runEvaluators([], makeContext());

    expect(result.evaluatorResults).toEqual([]);
    expect(result.metrics).toEqual({});
  });

  it("collects metric values into the metrics map", async () => {
    const evaluators = [
      { definition: makeMetric("latency", 150), config: {} },
      { definition: makeMetric("tokens", 42), config: {} },
    ];

    const result = await runEvaluators(evaluators, makeContext());

    expect(result.metrics).toEqual({ latency: 150, tokens: 42 });
    expect(result.evaluatorResults).toHaveLength(2);
  });

  it("does not add assertion results to metrics map", async () => {
    const evaluators = [
      { definition: makeAssertion("check-greeting", true), config: {} },
    ];

    const result = await runEvaluators(evaluators, makeContext());

    expect(result.metrics).toEqual({});
    expect(result.evaluatorResults).toHaveLength(1);
    expect(result.evaluatorResults[0].kind).toBe("assertion");
    expect(result.evaluatorResults[0].success).toBe(true);
  });

  it("records failed assertions without stopping other evaluators", async () => {
    const evaluators = [
      { definition: makeAssertion("will-fail", false), config: {} },
      { definition: makeMetric("still-runs", 10), config: {} },
    ];

    const result = await runEvaluators(evaluators, makeContext());

    expect(result.evaluatorResults).toHaveLength(2);

    const failed = result.evaluatorResults.find(r => r.type === "will-fail");
    expect(failed?.success).toBe(false);

    const metric = result.evaluatorResults.find(r => r.type === "still-runs");
    expect(metric?.success).toBe(true);
    expect(result.metrics["still-runs"]).toBe(10);
  });

  it("handles evaluator that throws as a failed assertion", async () => {
    const throwing: EvaluatorDefinition = {
      type: "kaboom",
      label: "Kaboom",
      kind: "metric",
      async evaluate() {
        throw new Error("Something broke");
      },
    };

    const result = await runEvaluators(
      [{ definition: throwing, config: {} }],
      makeContext(),
    );

    expect(result.evaluatorResults).toHaveLength(1);
    expect(result.evaluatorResults[0].success).toBe(false);
    expect(result.evaluatorResults[0].kind).toBe("assertion");
    expect(result.evaluatorResults[0].reason).toContain("Something broke");
  });

  it("passes config to each evaluator", async () => {
    let receivedConfig: Record<string, unknown> = {};

    const def: EvaluatorDefinition = {
      type: "config-check",
      label: "Config Check",
      kind: "metric",
      async evaluate(ctx) {
        receivedConfig = ctx.config;
        return { success: true, value: 1, reason: "ok" };
      },
    };

    await runEvaluators(
      [{ definition: def, config: { maxMs: 5000, strict: true } }],
      makeContext(),
    );

    expect(receivedConfig).toEqual({ maxMs: 5000, strict: true });
  });

  it("passes context fields to evaluators", async () => {
    let receivedCtx: EvaluatorContext | null = null;

    const def: EvaluatorDefinition = {
      type: "ctx-check",
      label: "Ctx Check",
      kind: "metric",
      async evaluate(ctx) {
        receivedCtx = ctx;
        return { success: true, value: 1, reason: "ok" };
      },
    };

    const context = makeContext({
      turn: 3,
      isFinal: true,
      persona: { name: "Angry Customer", description: "Very upset" },
    });

    await runEvaluators([{ definition: def, config: {} }], context);

    expect(receivedCtx!.turn).toBe(3);
    expect(receivedCtx!.isFinal).toBe(true);
    expect(receivedCtx!.persona).toEqual({ name: "Angry Customer", description: "Very upset" });
    expect(receivedCtx!.scenario.name).toBe("test-scenario");
  });

  it("includes metadata in results when provided", async () => {
    const def: EvaluatorDefinition = {
      type: "with-meta",
      label: "With Meta",
      kind: "metric",
      async evaluate() {
        return {
          success: true,
          value: 5,
          reason: "ok",
          metadata: { tools: ["search", "calc"] },
        };
      },
    };

    const result = await runEvaluators(
      [{ definition: def, config: {} }],
      makeContext(),
    );

    expect(result.evaluatorResults[0].metadata).toEqual({ tools: ["search", "calc"] });
  });

  it("runs evaluators in parallel", async () => {
    const order: string[] = [];

    const slow: EvaluatorDefinition = {
      type: "slow",
      label: "Slow",
      kind: "metric",
      async evaluate() {
        await new Promise(r => setTimeout(r, 50));
        order.push("slow");
        return { success: true, value: 1, reason: "slow done" };
      },
    };

    const fast: EvaluatorDefinition = {
      type: "fast",
      label: "Fast",
      kind: "metric",
      async evaluate() {
        order.push("fast");
        return { success: true, value: 2, reason: "fast done" };
      },
    };

    await runEvaluators(
      [
        { definition: slow, config: {} },
        { definition: fast, config: {} },
      ],
      makeContext(),
    );

    // Fast should complete before slow since they run in parallel
    expect(order).toEqual(["fast", "slow"]);
  });
});

// ---------------------------------------------------------------------------
// defineEvaluator
// ---------------------------------------------------------------------------

describe("defineEvaluator", () => {
  it("wraps a definition in { evaluators: [...] } shape", () => {
    const def: EvaluatorDefinition = {
      type: "my-eval",
      label: "My Eval",
      kind: "metric",
      async evaluate() {
        return { success: true, reason: "ok" };
      },
    };

    const result = defineEvaluator(def);

    expect(result).toEqual({ evaluators: [def] });
    expect(result.evaluators).toHaveLength(1);
    expect(result.evaluators[0].type).toBe("my-eval");
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

describe("regressions", () => {
  describe("evaluator module exports the renamed LLM judge API", () => {
    it("exports runLLMJudge function", () => {
      expect(typeof evaluatorModule.runLLMJudge).toBe("function");
    });

    it("exports LLMJudgeResult type (via interface presence in runtime)", () => {
      // Type-level check: these compile without error
      const _result: evaluatorModule.LLMJudgeResult = {
        successMet: true,
        failureMet: false,
        confidence: 1,
        reasoning: "test",
      };
      expect(_result.successMet).toBe(true);
    });

    it("exports LLMJudgeInput type (via interface presence in runtime)", () => {
      const _input: evaluatorModule.LLMJudgeInput = {
        messages: [],
        llmProvider: { provider: "openai", apiKey: "test" },
      };
      expect(_input.messages).toEqual([]);
    });

    it("does NOT export old criteria names", () => {
      const exports = Object.keys(evaluatorModule);
      expect(exports).not.toContain("evaluateCriteria");
      expect(exports).not.toContain("CriteriaEvaluationResult");
      expect(exports).not.toContain("EvaluateCriteriaInput");
    });
  });

  describe("core index re-exports the renamed API", () => {
    it("exports runLLMJudge from core index", () => {
      expect(typeof coreIndex.runLLMJudge).toBe("function");
    });

    it("exports runEvaluators from core index", () => {
      expect(typeof coreIndex.runEvaluators).toBe("function");
    });

    it("exports defineEvaluator from core index", () => {
      expect(typeof coreIndex.defineEvaluator).toBe("function");
    });

    it("exports EvaluatorRegistry from core index", () => {
      expect(typeof coreIndex.EvaluatorRegistry).toBe("function");
    });

    it("exports createEvaluatorRegistry from core index", () => {
      expect(typeof coreIndex.createEvaluatorRegistry).toBe("function");
    });

    it("does NOT export old criteria names from core index", () => {
      const exports = Object.keys(coreIndex);
      expect(exports).not.toContain("evaluateCriteria");
      expect(exports).not.toContain("createEvaluatorRegistryFromConfig");
      expect(exports).not.toContain("loadCustomEvaluators");
    });
  });

  describe("runEvaluators returns flat results without aggregate decisions", () => {
    it("returns evaluatorResults array and metrics map only", async () => {
      const evaluators = [
        { definition: makeMetric("test-metric", 42), config: {} },
      ];

      const result = await runEvaluators(evaluators, makeContext());

      // Should have exactly these two fields — no 'success', 'score', or 'reason'
      expect(Object.keys(result).sort()).toEqual(["evaluatorResults", "metrics"]);
    });

    it("does not include aggregate success/score/reason fields", async () => {
      const evaluators = [
        { definition: makeAssertion("test-assert", false), config: {} },
      ];

      const result = await runEvaluators(evaluators, makeContext());
      const resultObj = result as unknown as Record<string, unknown>;

      expect(resultObj).not.toHaveProperty("success");
      expect(resultObj).not.toHaveProperty("score");
      expect(resultObj).not.toHaveProperty("reason");
    });
  });
});
