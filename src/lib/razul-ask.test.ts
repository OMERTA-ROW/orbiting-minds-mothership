/**
 * Integration test for the Ask Razul pipeline: retrieval → ranking → citations
 * → cache → privacy-safe log, exercised against an in-memory fake of the
 * Supabase query builder (same call shapes the real client uses).
 */
import { describe, expect, it } from "vitest";
import { answerRazulQuery } from "./razul-ask.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fakeAdmin(tables: Record<string, Row[]>) {
  const inserted: { table: string; rows: Row[] }[] = [];
  const upserted: { table: string; rows: Row[] }[] = [];

  function makeQuery(table: string) {
    const state: { eq: [string, unknown][]; in?: [string, unknown[]] } = { eq: [] };
    const applyFilters = () =>
      (tables[table] ?? []).filter(
        (r) =>
          state.eq.every(([k, v]) => r[k] === v) &&
          (!state.in || (state.in[1] as unknown[]).includes(r[state.in[0]])),
      );
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => {
        state.eq.push([k, v]);
        return builder;
      },
      in: (k: string, v: unknown[]) => {
        state.in = [k, v];
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: applyFilters()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: applyFilters(), error: null }),
    };
    return builder;
  }

  const admin = {
    from: (table: string) => ({
      select: () => makeQuery(table),
      insert: async (row: Row) => {
        inserted.push({ table, rows: [row] });
        (tables[table] ??= []).push(row);
        return { error: null };
      },
      upsert: async (row: Row) => {
        upserted.push({ table, rows: [row] });
        (tables[table] ??= []).push(row);
        return { error: null };
      },
    }),
  };
  return { admin: admin as never, inserted, upserted, tables };
}

const finding = {
  id: "f1",
  title: "CISA warns of ransomware exploiting CVE-2026-9999",
  url: "https://www.cisa.gov/alert1",
  source_name: "CISA Cybersecurity Alerts",
  summary: "Advisory for a critical vulnerability.",
  category: "vulnerability",
  topic: "ransomware",
  entities: ["CVE-2026-9999"],
  evidence_class: "established",
  relevance: 70,
  corroborations: 2,
  published_at: "2026-10-30T00:00:00Z",
  collected_at: "2026-10-31T00:00:00Z",
};

describe("answerRazulQuery integration", () => {
  it("answers one agent query with cited sources, confidence and evidence class", async () => {
    const { admin, inserted, upserted, tables } = fakeAdmin({
      razul_findings: [finding],
      razul_query_cache: [],
      razul_query_log: [],
    });
    const answer = await answerRazulQuery(
      { admin, now: () => new Date("2026-10-31T12:00:00Z") },
      { question: "latest ransomware vulnerability advisory", agent: "guardian" },
    );
    expect(answer.cached).toBe(false);
    expect(answer.citations).toHaveLength(1);
    const cite = answer.citations[0]!;
    expect(cite.url).toBe("https://www.cisa.gov/alert1");
    expect(cite.evidenceClass).toBe("established");
    expect(cite.confidence).toBeGreaterThan(60);
    expect(cite.publishedAt).toBe("2026-10-30T00:00:00Z");
    // Cache written, query logged with hash only.
    expect(upserted.some((u) => u.table === "razul_query_cache")).toBe(true);
    const log = inserted.find((i) => i.table === "razul_query_log")!.rows[0]!;
    expect(log.agent).toBe("guardian");
    expect(log.result_count).toBe(1);
    expect(String(log.question_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(tables.razul_query_log)).not.toContain("ransomware vulnerability advisory");
  });

  it("serves a repeated question from cache and logs it as cached", async () => {
    const { admin, tables } = fakeAdmin({
      razul_findings: [finding],
      razul_query_cache: [],
      razul_query_log: [],
    });
    const deps = { admin, now: () => new Date("2026-10-31T12:00:00Z") };
    const input = { question: "ransomware advisory", agent: "omni" };
    const first = await answerRazulQuery(deps, input);
    expect(first.cached).toBe(false);
    const second = await answerRazulQuery(deps, input);
    expect(second.cached).toBe(true);
    expect(second.citations).toEqual(first.citations);
    const logs = tables.razul_query_log!;
    expect(logs).toHaveLength(2);
    expect(logs[1]!.cached).toBe(true);
  });

  it("narrows retrieval to the requested project scope categories", async () => {
    const { admin } = fakeAdmin({
      razul_findings: [finding],
      razul_query_cache: [],
      razul_query_log: [],
    });
    const answer = await answerRazulQuery(
      { admin, now: () => new Date() },
      {
        question: "ransomware advisory",
        agent: "sabrina",
        scopeCategories: ["culture"],
      },
    );
    expect(answer.citations).toHaveLength(0);
    expect(answer.answerSummary).toContain("No matching findings");
  });
});
