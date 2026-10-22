import { describe, expect, it } from "vitest";
import { dedupeEntries, groundBrief, normalizeUrl, parseFeed } from "@/lib/knowledge";
import { runKnowledgeJob } from "@/lib/knowledge-job.server";

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>Model &amp; Tools GA</title><link>https://ex.com/a?utm_source=x#top</link><pubDate>Wed, 21 Oct 2026 19:09:35 GMT</pubDate><description><![CDATA[<p>Now available</p>]]></description><category>agents</category></item>
<item><title>Second</title><link>https://ex.com/b/</link></item>
</channel></rss>`;
const atom = `<feed><entry><title>Atom item</title><link href="https://ex.com/c" rel="alternate"/><published>2026-10-20T00:00:00Z</published><summary>Hi</summary></entry></feed>`;

describe("feed parsing", () => {
  it("reads RSS titles, cleaned links, dates and categories", () => {
    const [a, b] = parseFeed(rss);
    expect(a).toEqual({
      title: "Model & Tools GA",
      url: "https://ex.com/a",
      summary: "Now available",
      categories: ["agents"],
      publishedAt: "2026-10-21T19:09:35.000Z",
    });
    expect(b?.url).toBe("https://ex.com/b");
  });
  it("reads Atom entries", () => {
    expect(parseFeed(atom)[0]?.url).toBe("https://ex.com/c");
  });
  it("rejects non-web links", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("https://name:synthetic-password@example.test/article")).toBeNull();
  });
});

describe("duplicate detection", () => {
  it("skips URLs already stored and repeated within a batch", () => {
    const r = dedupeEntries([{ url: "u1" }, { url: "u2" }, { url: "u2" }], new Set(["u1"]));
    expect(r.fresh).toEqual([{ url: "u2" }]);
    expect(r.duplicates).toBe(2);
  });
});

describe("brief grounding", () => {
  it("drops entries citing URLs that were not collected", () => {
    const e = {
      capability: "c",
      availability: "GA",
      evolution_value: "v",
      decision: "test" as const,
      evidence: "announcement" as const,
    };
    const out = groundBrief(
      {
        overview: "o",
        entries: [
          { ...e, url: "https://ex.com/a" },
          { ...e, url: "https://made.up/x" },
        ],
      },
      new Set(["https://ex.com/a"]),
    );
    expect(out.entries.map((x) => x.url)).toEqual(["https://ex.com/a"]);
  });
});

// Minimal in-memory stand-in for the database client, enough for the job's calls.
function fakeAdmin(
  opts: {
    leaseFree?: boolean;
    paused?: { reason: string; status: number };
    stateError?: boolean;
    missingState?: boolean;
    existingError?: boolean;
    finalizeError?: boolean;
    leaseError?: boolean;
    releaseError?: boolean;
    pauseWriteError?: boolean;
    guardWriteError?: boolean;
    briefSaveError?: boolean;
    zeroFinalization?: boolean;
  } = {},
) {
  const db = {
    items: [] as Record<string, unknown>[],
    runs: [] as Record<string, unknown>[],
    briefs: [] as Record<string, unknown>[],
    state: {
      paused_reason: opts.paused?.reason ?? null,
      paused_status: opts.paused?.status ?? null,
      brief_attempt_pending: false,
      brief_attempt_run: null as string | null,
      brief_attempt_date: null as string | null,
      lease_until: null as string | null,
    },
  };
  const builder = (table: string) => {
    let filterUrls: string[] | null = null;
    let payload: unknown = null;
    let op = "select";
    let idFilter: string | null = null;
    const exec = () => {
      if (table === "knowledge_items") {
        if (op === "upsert") {
          const rows = (payload as Record<string, unknown>[]).filter(
            (r) => !db.items.some((i) => i["url"] === r["url"]),
          );
          db.items.push(...rows.map((r) => ({ ...r, collected_at: new Date().toISOString() })));
          return { data: rows.map((_, i) => ({ id: String(i) })), error: null };
        }
        return {
          data: filterUrls
            ? db.items.filter((i) => filterUrls?.includes(i["url"] as string))
            : db.items,
          error: null,
        };
      }
      if (table === "knowledge_runs") {
        if (op === "insert") {
          const id = `run${db.runs.length + 1}`;
          db.runs.push({ id, ...(payload as object) });
          return { data: { id }, error: null };
        }
        if (op === "update" && idFilter) {
          if (opts.finalizeError) return { data: null, error: new Error("write unavailable") };
          if (opts.zeroFinalization) return { data: null, error: null };
          const row = db.runs.find((r) => r["id"] === idFilter);
          if (row) Object.assign(row, payload);
          return { data: row ?? null, error: null };
        }
        return { data: null, error: null };
      }
      if (table === "knowledge_briefs") {
        if (op === "insert") {
          if (opts.briefSaveError) return { data: null, error: new Error("save unavailable") };
          db.briefs.push(payload as Record<string, unknown>);
          return { data: { id: "brief1" }, error: null };
        }
        return {
          data: db.briefs[0] ?? null,
          error: opts.existingError ? new Error("read unavailable") : null,
        };
      }
      if (table === "knowledge_job_state") {
        if (op === "update") {
          const change = payload as Record<string, unknown>;
          if (opts.pauseWriteError && "paused_status" in change) return { data: null, error: new Error("pause unavailable") };
          if (opts.guardWriteError && "brief_attempt_pending" in change) return { data: null, error: new Error("guard unavailable") };
          Object.assign(db.state, payload);
        }
        return {
          data: opts.missingState ? null : db.state,
          error: opts.stateError ? new Error("read unavailable") : null,
        };
      }
      return { data: null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        if (column === "id" && typeof value === "string") idFilter = value;
        return q;
      },
      gte: () => q,
      order: () => q,
      limit: () => q,
      abortSignal: () => q,
      in: (_c: string, v: string[]) => {
        filterUrls = v;
        return q;
      },
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return q;
      },
      upsert: (p: unknown) => {
        op = "upsert";
        payload = p;
        return q;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return q;
      },
      single: () => q,
      maybeSingle: () => q,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    return q;
  };
  const admin = {
    from: builder,
    rpc: (name: string) => {
      const result =
        name === "release_owned_knowledge_lease"
          ? { data: true, error: opts.releaseError ? new Error("release error") : null }
          : {
              data: opts.leaseFree ?? true,
              error: opts.leaseError ? new Error("lease error") : null,
            };
      return {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        abortSignal() {
          return this;
        },
      };
    },
  };
  return { db, admin: admin as never };
}
const source = [{ id: "s", name: "Sample", feed: "https://ex.com/feed", kind: "vendor" as const }];
const brief = {
  overview: "Daily view",
  entries: [
    {
      url: "https://ex.com/a",
      capability: "c",
      availability: "GA",
      evolution_value: "v",
      decision: "adopt",
      evidence: "verified_release",
    },
  ],
};
const fetchStub = (aiStatus = 200): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    if (String(input).includes("ai.gateway"))
      return new Response(
        JSON.stringify(
          aiStatus === 200
            ? { output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }] }
            : { message: "Credits needed" },
        ),
        { status: aiStatus },
      );
    return new Response(rss, { status: 200 });
  }) as typeof fetch;

describe("daily knowledge job (no browser or owner session)", () => {
  it("collects, stores and writes a cited brief, then dedupes on the next run", async () => {
    const { db, admin } = fakeAdmin();
    const first = await runKnowledgeJob({
      admin,
      fetch: fetchStub(),
      now: () => new Date("2026-10-22T06:00:00Z"),
      apiKey: "test-key",
      sources: source,
    });
    expect(first).toMatchObject({ status: "completed", inserted: 2, brief: "written" });
    expect(db.briefs[0]).toMatchObject({ brief_date: "2026-10-22", overview: "Daily view" });
    const second = await runKnowledgeJob({
      admin,
      fetch: fetchStub(),
      now: () => new Date("2026-10-22T07:00:00Z"),
      apiKey: "test-key",
      sources: source,
    });
    expect(second).toMatchObject({ inserted: 0, duplicates: 2, brief: "already_written" });
  });
  it("exits without work when another run holds the lease", async () => {
    const { admin } = fakeAdmin({ leaseFree: false });
    expect(
      (
        await runKnowledgeJob({
          admin,
          fetch: fetchStub(),
          now: () => new Date(),
          apiKey: "k",
          sources: source,
        })
      ).status,
    ).toBe("skipped_locked");
  });
  it("pauses the brief on 402 but still stores items", async () => {
    const { db, admin } = fakeAdmin();
    const r = await runKnowledgeJob({
      admin,
      fetch: fetchStub(402),
      now: () => new Date("2026-10-22T06:00:00Z"),
      apiKey: "k",
      sources: source,
    });
    expect(r).toMatchObject({ status: "partial", inserted: 2, brief: "paused" });
    expect(db.state.paused_status).toBe(402);
  });
  it("does not call AI while an access denial pause is active", async () => {
    const { admin } = fakeAdmin({ paused: { reason: "Denied", status: 403 } });
    let aiCalls = 0;
    const f = (async (i: RequestInfo | URL) => {
      if (String(i).includes("ai.gateway")) aiCalls++;
      return new Response(rss);
    }) as typeof fetch;
    await runKnowledgeJob({ admin, fetch: f, now: () => new Date(), apiKey: "k", sources: source });
    expect(aiCalls).toBe(0);
  });
  it.each([{ stateError: true }, { missingState: true }, { existingError: true }])(
    "fails closed on unavailable pause/idempotency reads: %o",
    async (opts) => {
      const { admin } = fakeAdmin(opts);
      let calls = 0;
      const f: typeof fetch = async (input) => {
        if (String(input).includes("ai.gateway")) calls++;
        return new Response(rss);
      };
      const result = await runKnowledgeJob({
        admin,
        fetch: f,
        now: () => new Date(),
        apiKey: "fixture",
        sources: source,
      });
      expect(calls).toBe(0);
      expect(result.brief).toBe("failed");
    },
  );
  it("does not automatically probe or clear a credit pause", async () => {
    const { admin, db } = fakeAdmin({ paused: { reason: "Credits required", status: 402 } });
    let calls = 0;
    const f: typeof fetch = async (input) => {
      if (String(input).includes("ai.gateway")) calls++;
      return new Response(rss);
    };
    await runKnowledgeJob({
      admin,
      fetch: f,
      now: () => new Date(),
      apiKey: "fixture",
      sources: source,
    });
    expect(calls).toBe(0);
    expect(db.state.paused_status).toBe(402);
  });
  it("persists a terminal HTTP-200 refusal so later automatic runs cannot replay it", async () => {
    const { admin, db } = fakeAdmin();
    let calls = 0;
    const f: typeof fetch = async (input) => {
      if (String(input).includes("ai.gateway")) {
        calls++;
        return new Response(
          JSON.stringify({ output: [{ content: [{ type: "refusal", refusal: "Declined" }] }] }),
        );
      }
      return new Response(rss);
    };
    const deps = { admin, fetch: f, now: () => new Date(), apiKey: "fixture", sources: source };
    expect((await runKnowledgeJob(deps)).brief).toBe("refused");
    expect((await runKnowledgeJob(deps)).brief).toBe("paused");
    expect(calls).toBe(1);
    expect(db.state.paused_status).toBe(200);
  });
  it("does not call a lease infrastructure error contention", async () => {
    const { admin } = fakeAdmin({ leaseError: true });
    await expect(
      runKnowledgeJob({
        admin,
        fetch: fetchStub(),
        now: () => new Date(),
        apiKey: "fixture",
        sources: source,
      }),
    ).rejects.toThrow("lease could not be checked");
  });
  it("cannot report completed when final history or lease release fails", async () => {
    for (const opts of [{ finalizeError: true }, { releaseError: true }, { zeroFinalization: true }]) {
      const { admin } = fakeAdmin(opts);
      await expect(
        runKnowledgeJob({
          admin,
          fetch: fetchStub(),
          now: () => new Date(),
          apiKey: "fixture",
          sources: source,
        }),
      ).rejects.toThrow();
    }
  });
  it.each([402, 403, 404, 200])("does not replay a terminal response when its pause write fails (%i)", async (status) => {
    const { admin, db } = fakeAdmin({ pauseWriteError: true }); let calls = 0;
    const f: typeof fetch = async (input) => {
      if (!String(input).includes("ai.gateway")) return new Response(rss);
      calls++;
      return new Response(JSON.stringify(status === 200 ? { output: [{ content: [{ type: "refusal", refusal: "Declined" }] }] } : { message: "Blocked" }), { status });
    };
    const deps = { admin, fetch: f, now: () => new Date(), apiKey: "fixture", sources: source };
    expect((await runKnowledgeJob(deps)).brief).toBe("failed");
    expect(db.state.brief_attempt_pending).toBe(true);
    expect((await runKnowledgeJob(deps)).brief).toBe("paused");
    expect(calls).toBe(1);
  });
  it("leaves unsuccessful result persistence blocked even across a new date", async () => {
    const { admin, db } = fakeAdmin({ briefSaveError: true }); let calls = 0;
    const f: typeof fetch = async (input, init) => { if (String(input).includes("ai.gateway")) calls++; return fetchStub()(input, init); };
    const deps = { admin, fetch: f, now: () => new Date("2026-10-22"), apiKey: "fixture", sources: source };
    expect((await runKnowledgeJob(deps)).brief).toBe("failed");
    expect(db.state.brief_attempt_pending).toBe(true);
    expect((await runKnowledgeJob({ ...deps, now: () => new Date("2026-10-23") })).brief).toBe("paused");
    expect(calls).toBe(1);
  });
  it("calls no AI if the pre-request durable guard cannot be persisted", async () => {
    const { admin } = fakeAdmin({ guardWriteError: true }); let calls = 0;
    const f: typeof fetch = async (input, init) => { if (String(input).includes("ai.gateway")) calls++; return fetchStub()(input, init); };
    await runKnowledgeJob({ admin, fetch: f, now: () => new Date(), apiKey: "fixture", sources: source });
    expect(calls).toBe(0);
  });
});
