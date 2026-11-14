/**
 * Step 8 "Run protocol self-test & verify" server action: success, missing/expired evidence,
 * safety denial, timeout and idempotent retry. The signed Jackboy client is replaced by a fake;
 * the real stage logic, readiness and evidence recording run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<Record<string, unknown>>>,
  owner: vi.fn(),
  stop: vi.fn(),
  execute: vi.fn(),
  adminInsert: vi.fn(),
  record: vi.fn(),
  linkConfig: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: (input: unknown) => Promise<Record<string, unknown>>) => {
        mocks.handlers.push(handler);
        return handler;
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: mocks.owner }));
vi.mock("./omni-terminal.server", () => ({ assertEmergencyStopReleased: mocks.stop }));
vi.mock("./jackboy-link.server", () => {
  class JackboyLinkError extends Error {
    stage: string;
    status?: number;
    code?: string;
    limitMs?: number;
    phase?: string;
    constructor(message: string, stage: string, extra: Record<string, unknown> = {}) {
      super(message);
      this.stage = stage;
      Object.assign(this, extra);
    }
  }
  class JackboyLink {
    audit: (event: string, jobId?: string) => Promise<void>;
    constructor(_c: unknown, audit: (event: string, jobId?: string) => Promise<void>) {
      this.audit = audit;
    }
    async execute(action: string, jobId: string) {
      await this.audit(`request_${action}`, jobId);
      const job = await mocks.execute(action, jobId);
      await this.audit(`result_${job.status}`, jobId);
      return job;
    }
  }
  return {
    JackboyLink,
    JackboyLinkError,
    configuredJackboyLink: mocks.linkConfig,
    configuredLinkIdentityValid: () => true,
    configuredJackboyConfiguration: () => ({}),
    checkJackboyRunnerConfiguration: vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ insert: mocks.adminInsert }),
    rpc: mocks.record,
  },
}));

import { selfTestInput } from "./activation-self-test";
import "./activation-approvals.functions";
const runStep8 = () => mocks.handlers[3]!;

const OWNER = "11111111-1111-4111-8111-111111111111";
const ATTEMPT = "22222222-2222-4222-8222-222222222222";
type AuditRow = { action: string; record_id: string; occurred_at: string };

/** Query builder that honours the eq/gte filters used on the audit table. */
function chain(rows: () => unknown[] | { data: unknown; error: unknown }) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  const q: Record<string, unknown> = {};
  q["select"] = () => q;
  q["order"] = () => q;
  q["limit"] = () => q;
  q["in"] = (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), q);
  q["eq"] = (col: string, value: unknown) => (filters.push((r) => r[col] === undefined || r[col] === value), q);
  q["gte"] = (col: string, value: string) =>
    (filters.push((r) => String(r[col]) >= value), q);
  q["maybeSingle"] = () => q;
  q["then"] = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
    const value = rows();
    const result = Array.isArray(value)
      ? { data: value.filter((r) => filters.every((f) => f(r as Record<string, unknown>))), error: null }
      : value;
    return Promise.resolve(result).then(ok, bad);
  };
  return q;
}

let audit: AuditRow[];
function invocation(opts: { mfaFresh?: boolean; approvedThrough?: number; step8?: string } = {}) {
  const rpc = vi.fn(async () => ({ error: null }));
  const rows = Array.from({ length: 10 }, (_, i) => {
    const step = i + 1;
    const approved = step <= (opts.approvedThrough ?? 7);
    return {
      step,
      status: step === 8 ? (opts.step8 ?? "failed") : approved ? "approved" : "pending",
      decided_at: approved ? "2026-11-13T22:00:00Z" : null,
      approval_expires_at: step === 7 ? new Date(Date.now() + 6 * 3600_000).toISOString() : null,
    };
  });
  const tables: Record<string, () => unknown[] | { data: unknown; error: unknown }> = {
    activation_approvals: () => ({ data: rows, error: null }),
    owner_mfa_recovery_events: () => ({ data: [], error: null }),
    razul_control_audit: () => audit.map((r) => ({ ...r, record_type: "jackboy_link" })),
  };
  return {
    rpc,
    input: {
      data: { attemptId: ATTEMPT, confirm: true },
      context: {
        userId: OWNER,
        claims: {
          aal: "aal2",
          amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - (opts.mfaFresh === false ? 3600 : 0) }],
        },
        supabase: { from: (t: string) => chain(tables[t]!), rpc },
      },
    },
  };
}
const job = (status: string, passed = true) => ({
  id: ATTEMPT,
  status,
  result: status === "completed" ? { passed, checks: 3, runner: "restricted-protocol-self-test" } : null,
});
const sent = () => mocks.execute.mock.calls.map((c) => c[0]);
const auditActions = () => mocks.adminInsert.mock.calls.map((c) => c[0].action);

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  audit = [];
  mocks.owner.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset().mockResolvedValue(undefined);
  mocks.linkConfig.mockReset().mockResolvedValue({});
  mocks.record.mockReset().mockResolvedValue({ error: null });
  mocks.adminInsert.mockReset().mockImplementation(async (row: { action: string; record_id: string }) => {
    audit.push({ action: row.action, record_id: row.record_id, occurred_at: new Date().toISOString() });
    return { error: null };
  });
  mocks.execute.mockReset().mockImplementation(async (action: string) =>
    action === "submit" ? job("queued") : job("completed"),
  );
  vi.stubEnv("JACKBOY_LINK_ORIGIN", "https://jackboy.lovable.app");
  vi.stubEnv("JACKBOY_LINK_RUNNER_ORIGIN", "https://runner.up.railway.app");
  vi.stubEnv("JACKBOY_LINK_MOTHERSHIP_OWNER_ID", OWNER);
  vi.stubEnv("JACKBOY_LINK_ENABLED", "true");
  vi.stubEnv("JACKBOY_LINK_SELF_TEST_ENABLED", "true");
  vi.stubEnv("OMNI_LINK_APPROVAL_EXPIRES_AT", new Date(Date.now() + 6 * 3600_000).toISOString());
});

describe("Step 8 run protocol self-test & verify", () => {
  it("success: runs once, verifies the signed pass, records evidence and does NOT approve", async () => {
    const { input, rpc } = invocation();
    const out = await runStep8()(input);
    expect(out).toMatchObject({ ok: true, outcome: "passed", approvalNeeded: true, attemptFinal: true });
    expect(sent()).toEqual(["submit", "run"]);
    expect(auditActions()).toContain("self_test_passed");
    expect(mocks.record).toHaveBeenCalledWith(
      "activation_approval_record_check",
      expect.objectContaining({ _step: 8, _status: "passed" }),
    );
    // No approval decision of any kind was recorded for the owner.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failing self-test is recorded as failed evidence and the step stays failed", async () => {
    mocks.execute.mockImplementation(async (a: string) => (a === "submit" ? job("queued") : job("completed", false)));
    const { input, rpc } = invocation();
    expect(await runStep8()(input)).toMatchObject({ ok: true, outcome: "failed" });
    expect(auditActions()).toContain("self_test_failed");
    expect(rpc).toHaveBeenCalledWith("activation_approval_decide", expect.objectContaining({ _step: 8, _action: "fail" }));
  });

  it("missing self-test switch: nothing is sent and nothing is recorded", async () => {
    vi.stubEnv("JACKBOY_LINK_SELF_TEST_ENABLED", "");
    const { input } = invocation();
    const out = await runStep8()(input);
    expect(out).toMatchObject({ ok: false, reason: "not_ready", sent: false });
    expect(JSON.stringify(out)).toMatch(/JACKBOY_LINK_SELF_TEST_ENABLED/);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("expired link approval window: nothing is sent", async () => {
    vi.stubEnv("OMNI_LINK_APPROVAL_EXPIRES_AT", new Date(Date.now() - 60_000).toISOString());
    const { input } = invocation();
    const out = await runStep8()(input);
    expect(out).toMatchObject({ ok: false, reason: "not_ready" });
    expect(JSON.stringify(out)).toMatch(/Expired/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("engaged Emergency Stop: safety denial, nothing sent, stop not touched", async () => {
    mocks.stop.mockRejectedValue(new Error("Emergency Stop engaged"));
    const { input, rpc } = invocation();
    expect(await runStep8()(input)).toMatchObject({ ok: false, reason: "safety_denial", sent: false });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Jackboy Kill Switch denial is a safety denial; no evidence is fabricated", async () => {
    const { JackboyLinkError } = (await import("./jackboy-link.server")) as unknown as {
      JackboyLinkError: new (m: string, s: string, e: object) => Error;
    };
    mocks.execute.mockRejectedValue(new JackboyLinkError("denied", "http", { status: 403, code: "kill_switch_on" }));
    const { input } = invocation();
    const out = await runStep8()(input);
    expect(out).toMatchObject({ ok: false, reason: "safety_denial" });
    expect(String(out["message"])).toMatch(/Kill Switch is on/);
    expect(auditActions()).not.toContain("self_test_passed");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("timeout after the run was sent: keeps the attempt; retry reads status only and never reruns", async () => {
    const { JackboyLinkError } = (await import("./jackboy-link.server")) as unknown as {
      JackboyLinkError: new (m: string, s: string, e: object) => Error;
    };
    mocks.execute.mockImplementation(async (a: string) => {
      if (a === "submit") return job("queued");
      throw new JackboyLinkError("timeout", "timeout", { limitMs: 10_000, phase: "reply" });
    });
    const first = await runStep8()(invocation().input);
    expect(first).toMatchObject({ ok: false, reason: "timeout", attemptFinal: false, sent: true });
    expect(String(first["message"])).toMatch(/never runs it again/);
    expect(mocks.record).not.toHaveBeenCalled();

    mocks.execute.mockReset().mockResolvedValue(job("completed"));
    const retry = await runStep8()(invocation().input);
    expect(sent()).toEqual(["status"]);
    expect(retry).toMatchObject({ ok: true, outcome: "passed" });
  });

  it("retry of a finished attempt re-verifies the recorded result without contacting Jackboy", async () => {
    audit = [
      { action: "request_submit", record_id: ATTEMPT, occurred_at: new Date().toISOString() },
      { action: "request_run", record_id: ATTEMPT, occurred_at: new Date().toISOString() },
      { action: "self_test_passed", record_id: ATTEMPT, occurred_at: new Date().toISOString() },
    ];
    const out = await runStep8()(invocation().input);
    expect(out).toMatchObject({ ok: true, outcome: "passed", resumed: true });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses to start while another attempt's run has no result", async () => {
    audit = [
      { action: "request_run", record_id: "33333333-3333-4333-8333-333333333333", occurred_at: new Date().toISOString() },
    ];
    expect(await runStep8()(invocation().input)).toMatchObject({ ok: false, reason: "busy" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("still running after the bounded wait: pending, nothing approved", async () => {
    mocks.execute.mockImplementation(async (a: string) => (a === "submit" ? job("queued") : job("running")));
    const out = await runStep8()(invocation().input);
    expect(out).toMatchObject({ ok: false, reason: "pending", attemptFinal: false });
    expect(mocks.record).not.toHaveBeenCalled();
  }, 15_000);

  it("access controls: stale two-step code, earlier step unapproved, already approved, non-owner", async () => {
    expect(await runStep8()(invocation({ mfaFresh: false }).input)).toMatchObject({ reason: "mfa" });
    expect(await runStep8()(invocation({ approvedThrough: 6 }).input)).toMatchObject({ reason: "rule" });
    expect(await runStep8()(invocation({ step8: "approved" }).input)).toMatchObject({ reason: "already_approved" });
    mocks.owner.mockRejectedValueOnce(new Error("Verified owner identity is required."));
    await expect(runStep8()(invocation().input)).rejects.toThrow(/owner/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("the input requires the explicit confirmation and a UUID attempt", async () => {
    expect(selfTestInput.safeParse({ attemptId: ATTEMPT }).success).toBe(false);
    expect(selfTestInput.safeParse({ attemptId: "x", confirm: true }).success).toBe(false);
    expect(selfTestInput.safeParse({ attemptId: ATTEMPT, confirm: true }).success).toBe(true);
  });
});
