import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MEMORY_AGENTS,
  MEMORY_BACKEND,
  memoryDeleteInput,
  memoryListInput,
  memorySaveInput,
  onlyAgent,
} from "./omni-memory";

const ok = {
  agent: "omni",
  kind: "note",
  title: "Test command",
  body: "Run bunx vitest run before handing off.",
  sourceKind: "owner_typed",
  sourceRef: "",
};

describe("per-agent memory input", () => {
  it("accepts a plain owner note for one agent", () => {
    expect(memorySaveInput.safeParse(ok).success).toBe(true);
  });
  it("refuses unknown agents, so memory cannot be filed under an invented identity", () => {
    expect(memorySaveInput.safeParse({ ...ok, agent: "everyone" }).success).toBe(false);
    expect(memoryListInput.safeParse({ agent: "*" }).success).toBe(false);
  });
  it("refuses anything that looks like a key or token", () => {
    const r = memorySaveInput.safeParse({ ...ok, body: "key sk-proj-abcdefghijklmnopqrstuvwxyz" });
    expect(r.success).toBe(false);
  });
  it("requires one agent for every list and delete", () => {
    expect(memoryListInput.safeParse({}).success).toBe(false);
    expect(
      memoryDeleteInput.safeParse({ id: "5f0c7a2e-3b7f-4f5e-9d1a-0a1b2c3d4e5f" }).success,
    ).toBe(false);
  });
  it("matches the database's allowed agent IDs exactly", () => {
    const sql = readFileSync("drizzle/migrations/0045_omni_agent_memories.sql", "utf8");
    const list = /agent_id IN \(([^)]+)\)/.exec(sql)![1]!.match(/'([a-z]+)'/g)!.map((x) => x.slice(1, -1));
    expect(list).toEqual([...MEMORY_AGENTS]);
  });
});

describe("no cross-agent leakage", () => {
  it("refuses a result that mixes agents", () => {
    expect(() => onlyAgent([{ agent_id: "omni" }, { agent_id: "jackboy" }], "omni")).toThrow();
    expect(onlyAgent([{ agent_id: "jackboy" }], "jackboy")).toHaveLength(1);
  });
  it("does not claim an outside memory service or agent reads", () => {
    expect(MEMORY_BACKEND.externalBackend).toBe(false);
    expect(MEMORY_BACKEND.readByAgents).toBe(false);
  });
});
