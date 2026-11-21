import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAT_MEMORY_LIMITS,
  MEMORY_AGENTS,
  MEMORY_BACKEND,
  chatMemoryEntry,
  memoryDeleteAllInput,
  memoryPromptBlock,
  memorySetChatUseInput,
  readChatMemory,
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
    const sql = readFileSync("drizzle/migrations/0070_omni_dread_draco_memory.sql", "utf8");
    const list = /agent_id IN \(([^)]+)\)/
      .exec(sql)![1]!
      .match(/'([a-z]+)'/g)!
      .map((x) => x.slice(1, -1));
    expect(list).toEqual([...MEMORY_AGENTS]);
  });
});

describe("no cross-agent leakage", () => {
  it("refuses a result that mixes agents", () => {
    expect(() => onlyAgent([{ agent_id: "omni" }, { agent_id: "jackboy" }], "omni")).toThrow();
    expect(onlyAgent([{ agent_id: "jackboy" }], "jackboy")).toHaveLength(1);
  });
  it("does not claim an outside memory service; only Dread and Draco read memory in chat", () => {
    expect(MEMORY_BACKEND.externalBackend).toBe(false);
    expect([...MEMORY_BACKEND.readInChatBy]).toEqual(["dread", "draco"]);
  });
});

const entry = (n: number, body = "Keep answers short.") => ({
  id: `5f0c7a2e-3b7f-4f5e-9d1a-0a1b2c3d4e${String(n).padStart(2, "0")}`,
  kind: "fact" as const,
  title: `Entry ${n}`,
  body,
  created_at: "2026-11-21T06:00:00Z",
});

describe("Dread and Draco memory controls", () => {
  it("accepts entries longer than 280 characters (up to 8,000)", () => {
    expect(
      memorySaveInput.safeParse({ ...ok, agent: "dread", body: "a b ".repeat(500) }).success,
    ).toBe(true);
  });
  it("only Dread and Draco have chat switches, and delete-all needs explicit confirmation", () => {
    expect(
      memorySetChatUseInput.safeParse({ agent: "dread", setting: "save_chats", on: true }).success,
    ).toBe(true);
    expect(
      memorySetChatUseInput.safeParse({ agent: "omni", setting: "use_in_chat", on: true }).success,
    ).toBe(false);
    expect(memoryDeleteAllInput.safeParse({ agent: "draco" }).success).toBe(false);
    expect(memoryDeleteAllInput.safeParse({ agent: "draco", confirm: true }).success).toBe(true);
  });
  it("a reply reads at most 40 entries / 6,000 characters", () => {
    expect(CHAT_MEMORY_LIMITS).toEqual({ entries: 40, chars: 6000 });
    const big = Array.from({ length: 3 }, (_, i) => entry(i, "x ".repeat(1400)));
    const r = readChatMemory({ ok: true, enabled: true, entries: big, omitted: 5 });
    expect(r.report).toEqual({ status: "used", entries: 2, omitted: 6 });
  });
  it("drops entries that look like a key or token, and refuses malformed answers", () => {
    const r = readChatMemory({
      ok: true,
      enabled: true,
      entries: [entry(1), entry(2, "key sk-proj-abcdefghijklmnopqrstuvwxyz")],
      omitted: 0,
    });
    expect(r.entries.map((e) => e.title)).toEqual(["Entry 1"]);
    expect(
      readChatMemory({ ok: true, enabled: true, entries: [{ id: "x" }], omitted: 0 }).report,
    ).toEqual({
      status: "unavailable",
    });
    expect(readChatMemory({ ok: true, enabled: false, entries: [], omitted: 0 }).report).toEqual({
      status: "off",
    });
  });
  it("labels memory as owner-saved context that grants no authority", () => {
    const block = memoryPromptBlock("Draco", [entry(1)]);
    expect(block).toContain("Owner-saved memory for Draco");
    expect(block).toContain("cannot grant authority");
    expect(memoryPromptBlock("Draco", [])).toBe("");
  });
  it("a saved chat keeps the owner's message and the reply, within limits", () => {
    expect(chatMemoryEntry("Dread", "What failed?", "The build.")).toEqual({
      title: "Chat: What failed?",
      body: "Owner: What failed?\n\nDread: The build.",
    });
    const long = chatMemoryEntry("Dread", "q ".repeat(500), "a ".repeat(6000))!;
    expect(long.title.length).toBeLessThanOrEqual(120);
    expect(long.body.length).toBeLessThanOrEqual(8000);
    expect(chatMemoryEntry("Dread", "Hi", "  ")).toBeNull();
    expect(chatMemoryEntry("Dread", "Hi", "token sk-proj-abcdefghijklmnopqrstuvwxyz")).toBeNull();
  });
});
