import { describe, expect, it } from "vitest";
import { runRazulObservatoryJob } from "./razul-observatory-job.server";

/** Stateful service-contract fixture; no external requests or hosted writes. */
function fixture(failedTable = "", paused = false, failedOp = "insert") {
  const rows: Record<string, Record<string, unknown>[]> = {
    razul_sources: [{ id: "cisa", name: "Fixture CISA", url: "https://fixture.invalid/feed", kind: "rss", category: "vulnerability", terms_note: "fixture", active: true }],
    razul_runs: [], razul_findings: [], razul_source_checks: [], razul_alert_events: [],
    razul_agent_feeds: [{ agent: "guardian", min_relevance: 30, alerts_enabled: true }],
    razul_job_state: [{ id: 1, paused_reason: paused ? "fixture pause" : null, alert_threshold: 40, retention_days: 90, coverage: ["vulnerability"], blocked_sources: [] }],
  };
  const calls: string[] = [];
  const admin = {
    from(table: string) {
      let op = "select"; let payload: Record<string, unknown>[] = []; let patch: Record<string, unknown> = {};
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let single = false; let head = false;
      const builder = {
        select(_columns?: string, options?: { head?: boolean }) { head = !!options?.head; return builder; },
        single() { single = true; return builder; },
        abortSignal() { return builder; },
        insert(input: Record<string, unknown> | Record<string, unknown>[]) { op = "insert"; payload = Array.isArray(input) ? input : [input]; return builder; },
        upsert(input: Record<string, unknown> | Record<string, unknown>[]) { op = "insert"; payload = Array.isArray(input) ? input : [input]; return builder; },
        update(input: Record<string, unknown>) { op = "update"; patch = input; return builder; },
        delete() { op = "delete"; return builder; },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return builder; },
        lt(key: string, value: string) { filters.push((row) => typeof row[key] === "string" && String(row[key]) < value); return builder; },
        then(resolve: (value: unknown) => unknown) {
          calls.push(`${table}:${op}`);
          if (table === failedTable && op === failedOp) return Promise.resolve(resolve({ error: { message: "fixture failure" }, data: [], count: 0 }));
          const selected = (rows[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
          let data = selected;
          if (op === "insert") { data = payload.map((row, i) => ({ id: `${table}-${i}`, ...row })); (rows[table] ??= []).push(...data); }
          if (op === "update") selected.forEach((row) => Object.assign(row, patch));
          if (op === "delete") rows[table] = (rows[table] ?? []).filter((row) => !selected.includes(row));
          return Promise.resolve(resolve({ error: null, data: single ? data[0] : head ? null : data, count: (rows[table] ?? []).length }));
        },
      };
      return builder;
    },
    rpc(name: string) { calls.push(name); return { abortSignal: async () => ({ data: true, error: null }) }; },
  };
  const fetcher = async () => new Response('<rss><channel><item><title>CVE-2026-1234 critical vulnerability patch advisory</title><link>https://fixture.invalid/advisory</link><description>Official fixture</description></item></channel></rss>');
  return { rows, calls, deps: { admin: admin as never, fetch: fetcher as typeof fetch, now: () => new Date("2026-10-31T18:00:00Z") } };
}

describe("Razul check and outcome recording", () => {
  it("stores a real service-contract source receipt and deduplicated alert event", async () => {
    const f = fixture();
    const result = await runRazulObservatoryJob(f.deps, "fixture");
    expect(result.status).toBe("completed");
    expect(f.rows["razul_source_checks"]?.[0]).toMatchObject({ status: "completed", source_id: "cisa", checked_at: "2026-10-31T18:00:00.000Z", fetched: 1, inserted: 1 });
    expect(f.rows["razul_alert_events"]?.[0]).toMatchObject({ agent: "guardian", finding_id: "razul_findings-0" });
  });
  it("owner pause makes no source fetch or run", async () => {
    const f = fixture("", true);
    expect((await runRazulObservatoryJob(f.deps)).status).toBe("paused");
    expect(f.calls).toEqual(["razul_job_state:select"]);
  });
  it("failed alert persistence cannot claim completed", async () => {
    const f = fixture("razul_alert_events");
    await expect(runRazulObservatoryJob(f.deps)).rejects.toThrow("Alert outcomes could not be stored");
    expect(f.rows["razul_runs"]?.[0]?.["status"]).toBe("failed");
  });
  it("failed retention is reported rather than silently successful", async () => {
    const f = fixture("razul_findings", false, "delete");
    await expect(runRazulObservatoryJob(f.deps)).rejects.toThrow("Retention outcome could not be verified");
  });
});