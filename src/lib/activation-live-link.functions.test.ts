/**
 * Step 9 "Check live connection" server action: one connection-only signed handshake,
 * gated by Steps 1–9, fresh MFA, Emergency Stop and link readiness. Never submits a job,
 * never runs the self-test, never records an approval decision.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<Record<string, unknown>>>,
  owner: vi.fn(),
  stop: vi.fn(),
  connect: vi.fn(),
  execute: vi.fn(),
  adminInsert: vi.fn(),
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
    constructor(message: string, stage: string, extra: Record<string, unknown> = {}) {
      super(message);
      this.stage = stage;
      Object.assign(this, extra);
    }
  }
  class JackboyLink {
    audit: (event: string) => Promise<void>;
    constructor(_c: unknown, audit: (event: string) => Promise<void>) {
      this.audit = audit;
    }
    async connect() {
      await this.audit("connecting");
      await mocks.connect();
      await this.audit("connected");
    }
    async execute(action: string, jobId: string) {
      return mocks.execute(action, jobId);
    }
  }
  return {
    JackboyLink,
    JackboyLinkError,
    configuredJackboyLink: mocks.linkConfig,
    configuredLinkIdentityValid: () => true,
    configuredLinkIdentityIssues: () => [],
    configuredJackboyConfiguration: () => ({}),
    checkJackboyRunnerConfiguration: vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: mocks.adminInsert }), rpc: vi.fn() },
}));

import "./activation-approvals.functions";
// Registration order: ..., checkLiveLinkConnection, refreshJackboySafety (last).
// Registration order: …, checkLiveLinkConnection, refreshJackboySafety, activateLiveLink, activateAutonomy, deactivateActivation.
const checkLive = () => mocks.handlers[mocks.handlers.length - 5]!;
const OWNER = "11111111-1111-4111-8111-111111111111";

function chain(result: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "gte", "maybeSingle"]) q[m] = () => q;
  q["then"] = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(ok, bad);
  return q;
}

function invocation(opts: { approvedThrough?: number; mfaFresh?: boolean; step7Ends?: number } = {}) {
  const rpc = vi.fn(async () => ({ error: null }));
  const rows = Array.from({ length: 10 }, (_, i) => {
    const step = i + 1;
    const approved = step <= (opts.approvedThrough ?? 9);
    return {
      step,
      status: approved ? "approved" : "pending",
      decided_at: approved ? "2026-11-14T00:51:00Z" : null,
      approval_expires_at:
        step === 7 ? new Date(opts.step7Ends ?? Date.now() + 6 * 3600_000).toISOString() : null,
    };
  });
  const tables: Record<string, () => unknown> = {
    activation_approvals: () => ({ data: rows, error: null }),
    owner_mfa_recovery_events: () => ({ data: [], error: null }),
  };
  return {
    rpc,
    input: {
      data: { confirm: true },
      context: {
        userId: OWNER,
        claims: {
          aal: "aal2",
          amr: [
            {
              method: "totp",
              timestamp: Math.floor(Date.now() / 1000) - (opts.mfaFresh === false ? 3600 : 0),
            },
          ],
        },
        supabase: { from: (t: string) => chain(tables[t]!), rpc },
      },
    },
  };
}
const audited = () => mocks.adminInsert.mock.calls.map((c) => c[0].action);

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  mocks.owner.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset().mockResolvedValue(undefined);
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.execute.mockReset();
  mocks.linkConfig.mockReset().mockResolvedValue({});
  mocks.adminInsert.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("JACKBOY_LINK_ORIGIN", "https://jackboy.lovable.app");
  vi.stubEnv("JACKBOY_LINK_RUNNER_ORIGIN", "https://runner.up.railway.app");
  vi.stubEnv("JACKBOY_LINK_MOTHERSHIP_OWNER_ID", OWNER);
  vi.stubEnv("JACKBOY_LINK_ENABLED", "true");
  // The self-test switch is irrelevant to a handshake; leave it off to prove it.
  vi.stubEnv("JACKBOY_LINK_SELF_TEST_ENABLED", "");
  vi.stubEnv("OMNI_LINK_APPROVAL_EXPIRES_AT", new Date(Date.now() + 6 * 3600_000).toISOString());
});

describe("Step 9 connection-only live link check", () => {
  it("after Step 9, sends one handshake only, audits it and records no decision", async () => {
    const { input, rpc } = invocation();
    expect(await checkLive()(input)).toMatchObject({ ok: true });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(audited()).toEqual(["connecting", "connected"]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses before Step 9 is approved and sends nothing", async () => {
    const out = await checkLive()(invocation({ approvedThrough: 8 }).input);
    expect(out).toMatchObject({ ok: false, reason: "not_ready" });
    expect(JSON.stringify(out)).toMatch(/Approve Step 9/);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("refuses once Step 7's window has ended", async () => {
    const out = await checkLive()(invocation({ step7Ends: Date.now() - 1000 }).input);
    expect(out).toMatchObject({ ok: false, reason: "not_ready" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires a fresh two-step code", async () => {
    expect(await checkLive()(invocation({ mfaFresh: false }).input)).toMatchObject({
      ok: false,
      reason: "mfa",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("is a safety denial while Mothership's Emergency Stop is engaged, and never releases it", async () => {
    mocks.stop.mockRejectedValue(new Error("Emergency Stop is engaged."));
    const { input, rpc } = invocation();
    const out = await checkLive()(input);
    expect(out).toMatchObject({ ok: false, reason: "safety_denial" });
    expect(JSON.stringify(out)).toMatch(/It was not released/);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when the link switch is off", async () => {
    vi.stubEnv("JACKBOY_LINK_ENABLED", "false");
    expect(await checkLive()(invocation().input)).toMatchObject({ ok: false, reason: "not_ready" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("refuses a different signed-in owner than the configured link owner", async () => {
    vi.stubEnv("JACKBOY_LINK_MOTHERSHIP_OWNER_ID", "99999999-9999-4999-8999-999999999999");
    expect(await checkLive()(invocation().input)).toMatchObject({ ok: false, reason: "not_ready" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("reports Jackboy's paused-system refusal as a safety denial, distinct from a timeout", async () => {
    mocks.connect.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 403"), { stage: "http", status: 403, code: "grant_unavailable" }),
    );
    const denied = await checkLive()(invocation().input);
    expect(denied).toMatchObject({ ok: false, reason: "safety_denial" });
    expect(JSON.stringify(denied)).toMatch(/Kill Switch/);
    mocks.connect.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { stage: "timeout", limitMs: 5000 }),
    );
    expect(await checkLive()(invocation().input)).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("stops before sending if the audit cannot be written", async () => {
    mocks.adminInsert.mockResolvedValueOnce({ error: { message: "nope" } });
    const out = await checkLive()(invocation().input);
    expect(out).toMatchObject({ ok: false, reason: "link_failure" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
