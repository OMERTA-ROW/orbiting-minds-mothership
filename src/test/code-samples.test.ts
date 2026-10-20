import { describe, expect, it } from "vitest";
import ts from "typescript";
import { codeContributions } from "@/data/evolution";

function sampleFunction(id: string, name: string): (...args: unknown[]) => unknown {
  const sample = codeContributions.find((item) => item.id === id);
  if (!sample) throw new Error(`Missing code sample ${id}`);
  const transpiled = ts.transpileModule(sample.code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  new Function("exports", transpiled)(exports);
  const fn = exports[name];
  if (!fn) throw new Error(`Missing sample function ${name}`);
  return fn;
}

describe("Actual displayed code samples", () => {
  it("rejects invalid synthetic amounts and repeated request keys", () => {
    const validate = sampleFunction("sandbox-transfer", "validateTransfer");
    const seen = new Set();
    for (const amountCents of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(validate({ amountCents, requestKey: "sample-key" }, seen)).toEqual({ accepted: false, reason: "invalid_amount" });
    expect(validate({ amountCents: 100, requestKey: "short" }, seen)).toEqual({ accepted: false, reason: "invalid_key" });
    expect(validate({ amountCents: 100, requestKey: "sample-key" }, seen)).toEqual({ accepted: true, reason: "sandbox_only" });
    expect(validate({ amountCents: 100, requestKey: "sample-key" }, seen)).toEqual({ accepted: false, reason: "duplicate" });
  });
  it("drops private fields rather than declaring anonymization", () => {
    const safe = sampleFunction("private-events", "safeEvent");
    expect(safe({ event: "page_view", email: "demo", token: "demo", durationMs: 12.6 })).toEqual({ event: "page_view", durationMs: 13 });
    expect(safe({ event: "action_completed", durationMs: -5 })).toEqual({ event: "action_completed", durationMs: 0 });
    expect(() => safe({ event: "unsupported" })).toThrow("unsupported_event");
  });
  it("preserves predictable keyboard boundaries", () => {
    const next = sampleFunction("keyboard-navigation", "nextIndex");
    expect(next(2, 3, "ArrowDown")).toBe(0);
    expect(next(0, 3, "ArrowUp")).toBe(2);
    expect(next(1, 3, "Home")).toBe(0);
    expect(next(0, 3, "End")).toBe(2);
    expect(next(0, 0, "ArrowDown")).toBe(-1);
    expect(() => next(0, -1, "ArrowDown")).toThrow("invalid_count");
  });
  it("does not invent dependency licenses", () => {
    const inventory = sampleFunction("dependency-ledger", "licenseInventory");
    expect(inventory({ zeta: { version: "1.0.0", license: "MIT" }, alpha: {} })).toEqual([{ name: "alpha", version: "UNKNOWN", license: "UNKNOWN" }, { name: "zeta", version: "1.0.0", license: "MIT" }]);
  });
});