import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EvaluatorRegistry, createEvaluatorRegistry } from "../evaluator-registry.js";
import type { EvaluatorDefinition } from "../evaluator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<EvaluatorDefinition> = {}): EvaluatorDefinition {
  return {
    type: "test-eval",
    label: "Test Eval",
    kind: "metric",
    async evaluate() {
      return { success: true, reason: "ok" };
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EvaluatorRegistry class
// ---------------------------------------------------------------------------

describe("EvaluatorRegistry", () => {
  it("registers and retrieves an evaluator", () => {
    const registry = new EvaluatorRegistry();
    const def = makeDef();

    registry.register(def);

    expect(registry.get("test-eval")).toBe(def);
  });

  it("returns undefined for unknown type", () => {
    const registry = new EvaluatorRegistry();

    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("throws on duplicate type registration", () => {
    const registry = new EvaluatorRegistry();
    registry.register(makeDef());

    expect(() => registry.register(makeDef())).toThrow(
      'Evaluator type "test-eval" is already registered'
    );
  });

  it("distinguishes built-in vs custom in error message", () => {
    const registry = new EvaluatorRegistry();
    registry.register(makeDef(), true);

    expect(() => registry.register(makeDef())).toThrow("(built-in)");
  });

  it("lists all registered evaluators with metadata", () => {
    const registry = new EvaluatorRegistry();
    registry.register(makeDef({ type: "metric-a", label: "Metric A", kind: "metric", auto: true }), true);
    registry.register(makeDef({ type: "assert-b", label: "Assert B", kind: "assertion" }), false);

    const list = registry.list();

    expect(list).toHaveLength(2);

    const metricA = list.find(e => e.type === "metric-a");
    expect(metricA).toMatchObject({
      type: "metric-a",
      label: "Metric A",
      kind: "metric",
      builtin: true,
      auto: true,
    });

    const assertB = list.find(e => e.type === "assert-b");
    expect(assertB).toMatchObject({
      type: "assert-b",
      label: "Assert B",
      kind: "assertion",
      builtin: false,
      auto: false,
    });
  });

  it("includes configSchema in list output", () => {
    const registry = new EvaluatorRegistry();
    const schema = { type: "object", properties: { maxMs: { type: "number" } } };
    registry.register(makeDef({ type: "with-schema", configSchema: schema }));

    const list = registry.list();

    expect(list[0].configSchema).toEqual(schema);
  });
});

// ---------------------------------------------------------------------------
// createEvaluatorRegistry — loads built-ins + custom from config
// ---------------------------------------------------------------------------

describe("createEvaluatorRegistry", () => {
  const dirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "evalstudio-reg-test-"));
    dirs.push(dir);
    return dir;
  }

  afterAll(() => {
    for (const dir of dirs) {
      if (existsSync(dir)) rmSync(dir, { recursive: true });
    }
  });

  it("includes built-in evaluators when no config exists", async () => {
    const dir = makeTempDir();
    // No evalstudio.config.json — should skip custom evaluators

    const registry = await createEvaluatorRegistry(dir);

    const list = registry.list();
    expect(list.some(e => e.type === "tool-call-count" && e.builtin)).toBe(true);
    expect(list.some(e => e.type === "token-usage" && e.builtin)).toBe(true);
  });

  it("includes built-in evaluators when config has no evaluators field", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({ version: 3, name: "test", projects: [] }),
    );

    const registry = await createEvaluatorRegistry(dir);

    const list = registry.list();
    expect(list.some(e => e.type === "tool-call-count")).toBe(true);
    expect(list.every(e => e.builtin)).toBe(true);
  });

  it("loads custom evaluators from relative file paths", async () => {
    const dir = makeTempDir();
    const evalDir = join(dir, "evaluators");
    mkdirSync(evalDir, { recursive: true });

    // Write a valid evaluator module (CommonJS-compatible ESM)
    writeFileSync(
      join(evalDir, "custom.mjs"),
      `export default {
        evaluators: [{
          type: "custom-test",
          label: "Custom Test",
          kind: "metric",
          evaluate: async () => ({ success: true, value: 42, reason: "custom" }),
        }],
      };`,
    );

    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({
        version: 3,
        name: "test",
        evaluators: ["./evaluators/custom.mjs"],
        projects: [],
      }),
    );

    const registry = await createEvaluatorRegistry(dir);

    const custom = registry.get("custom-test");
    expect(custom).toBeDefined();
    expect(custom!.label).toBe("Custom Test");
    expect(custom!.kind).toBe("metric");

    // Verify it appears as non-builtin in list
    const entry = registry.list().find(e => e.type === "custom-test");
    expect(entry?.builtin).toBe(false);
  });

  it("throws when evaluator file does not exist", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({
        version: 3,
        name: "test",
        evaluators: ["./nonexistent.js"],
        projects: [],
      }),
    );

    await expect(createEvaluatorRegistry(dir)).rejects.toThrow(
      /could not be loaded/
    );
  });

  it("throws with helpful hint for missing npm packages", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({
        version: 3,
        name: "test",
        evaluators: ["@nonexistent/evaluator-pack"],
        projects: [],
      }),
    );

    await expect(createEvaluatorRegistry(dir)).rejects.toThrow(
      /npm install @nonexistent\/evaluator-pack/
    );
  });

  it("throws when evaluator has invalid export shape", async () => {
    const dir = makeTempDir();
    const evalDir = join(dir, "evaluators");
    mkdirSync(evalDir, { recursive: true });

    // Write a module that doesn't use defineEvaluator pattern
    writeFileSync(
      join(evalDir, "bad.mjs"),
      `export default { notEvaluators: true };`,
    );

    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({
        version: 3,
        name: "test",
        evaluators: ["./evaluators/bad.mjs"],
        projects: [],
      }),
    );

    await expect(createEvaluatorRegistry(dir)).rejects.toThrow(
      /invalid export/
    );
  });

  it("throws when custom evaluator type conflicts with built-in", async () => {
    const dir = makeTempDir();
    const evalDir = join(dir, "evaluators");
    mkdirSync(evalDir, { recursive: true });

    // Try to register a type that conflicts with built-in "token-usage"
    writeFileSync(
      join(evalDir, "conflict.mjs"),
      `export default {
        evaluators: [{
          type: "token-usage",
          label: "Override Token Usage",
          kind: "metric",
          evaluate: async () => ({ success: true, reason: "conflict" }),
        }],
      };`,
    );

    writeFileSync(
      join(dir, "evalstudio.config.json"),
      JSON.stringify({
        version: 3,
        name: "test",
        evaluators: ["./evaluators/conflict.mjs"],
        projects: [],
      }),
    );

    await expect(createEvaluatorRegistry(dir)).rejects.toThrow(
      /already registered/
    );
  });
});
