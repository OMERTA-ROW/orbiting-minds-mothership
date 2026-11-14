import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<Record<string, unknown>>>,
  owner: vi.fn(),
  stop: vi.fn(),
  probe: vi.fn(),
  insert: vi.fn(),
  record: vi.fn(),
  checks: vi.fn(),
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
vi.mock("./jackboy-link.server", () => ({
  configuredJackboyConfiguration: () => ({}),
  checkJackboyRunnerConfiguration: mocks.probe,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === "activation_approval_checks"
        ? chain(() => mocks.checks())
        : { insert: mocks.insert },
    rpc: mocks.record,
  },
}));

/** A thenable query builder: every filter returns itself; awaiting resolves the table result. */
function chain(result: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q["maybeSingle"] = () => q;
  q["then"] = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(ok, bad);
  return q;
}
import "./activation-approvals.functions";

const OWNER = "11111111-1111-4111-8111-111111111111";
function invocation(
  approved = true,
  fresh = true,
  opts: {
    events?: Array<{ event: string; created_at: string }>;
    data?: Record<string, unknown>;
    decidedAt?: string;
    role?: string;
    aal?: string;
  } = {},
) {
  const rpc = vi.fn(async () => ({ error: null }));
  const tables: Record<string, () => unknown> = {
    activation_approvals: () => ({
      data: [
        {
          step: 1,
          status: approved ? "approved" : "pending",
          decided_at: opts.decidedAt ?? "2026-11-12T21:25:56Z",
        },
      ],
      error: null,
    }),
    owner_mfa_recovery_events: () => ({ data: opts.events ?? [], error: null }),
    razul_control_audit: () => ({ data: [], error: null }),
    user_roles: () => ({ data: opts.role ? { role: opts.role } : null, error: null }),
  };
  return {
    rpc,
    input: {
      data: opts.data ?? { step: 2 },
      context: {
        userId: OWNER,
        claims: {
          aal: opts.aal ?? "aal2",
          amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - (fresh ? 0 : 3600) }],
        },
        supabase: { from: (t: string) => chain(tables[t]!), rpc },
      },
    },
  };
}
const proof = {
  runnerOrigin: "https://runner.up.railway.app",
  runnerMode: true,
  nodeRunnerEnabled: true,
  remoteRunnerSecretConfigured: true,
  runtimeAvailable: true,
};
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.owner.mockReset().mockResolvedValue(undefined);
  mocks.stop.mockReset().mockResolvedValue(undefined);
  mocks.probe.mockReset().mockResolvedValue(proof);
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.record.mockReset().mockResolvedValue({ error: null });
  mocks.checks.mockReset().mockReturnValue({ data: [], error: null });
  vi.stubEnv("JACKBOY_LINK_ORIGIN", "https://jackboy.lovable.app");
  vi.stubEnv("JACKBOY_LINK_RUNNER_ORIGIN", "https://runner.up.railway.app");
  vi.stubEnv("JACKBOY_LINK_MOTHERSHIP_OWNER_ID", OWNER);
  vi.stubEnv("OMNI_LINK_RUNNER_MODE", "");
  vi.stubEnv("OMNI_LINK_NODE_RUNNER_ENABLED", "");
  vi.stubEnv("OMNI_LINK_REMOTE_RUNNER_SECRET", "");
});
describe("Step 2 trusted remote evidence", () => {
  it("records a signed remote pass as evidence only, then approves on the owner's own decision", async () => {
    const { input, rpc } = invocation();
    expect(await mocks.handlers[1]!(input)).toMatchObject({
      ok: true,
      approvalNeeded: true,
      check: { step: 2, status: "passed", evidenceVersion: 2 },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(
      "activation_approval_record_check",
      expect.objectContaining({ _status: "passed", _version: 2 }),
    );
    const decision = invocation(true, true, {
      data: { step: 2, action: "approve", note: "", expiresAt: null },
    });
    expect(await mocks.handlers[2]!(decision.input)).toEqual({ ok: true, activation: null });
    expect(decision.rpc).toHaveBeenCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _step: 2, _action: "approve" }),
    );
  });
  it("records unresolved evidence and allows a subsequent signed retry to pass", async () => {
    mocks.probe.mockResolvedValueOnce(null);
    const { input, rpc } = invocation();
    expect(await mocks.handlers[1]!(input)).toMatchObject({ check: { status: "needs_attention" } });
    expect(rpc).toHaveBeenLastCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _action: "fail" }),
    );
    rpc.mockClear();
    expect(await mocks.handlers[1]!(input)).toMatchObject({ check: { status: "passed" } });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explains an older published Jackboy (link_disabled) without inferring missing Railway variables", async () => {
    mocks.probe.mockRejectedValueOnce(
      Object.assign(new Error("Jackboy request failed (HTTP 503)."), {
        stage: "http",
        status: 503,
        code: "link_disabled",
      }),
    );
    const { input, rpc } = invocation();
    const result = (await mocks.handlers[1]!(input)) as {
      check: { status: string; details: Array<{ label: string; detail: string }> };
    };
    expect(result.check.status).toBe("needs_attention");
    const byLabel = Object.fromEntries(result.check.details.map((d) => [d.label, d.detail]));
    expect(byLabel["Jackboy reply"]).toBe("HTTP 503 · link_disabled");
    expect(byLabel["Likely cause"]).toMatch(/lacks the configuration probe/);
    expect(byLabel["Existing Railway settings"]).toMatch(/Unverified does not mean missing/);
    expect(JSON.stringify(result)).not.toMatch(/OMNI_LINK_HMAC_SECRET=|sb_secret|service_role/);
    expect(rpc).toHaveBeenCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _step: 2, _action: "fail" }),
    );
  });
  it("does not approve an unknown remote target just because local flags are true", async () => {
    vi.stubEnv("JACKBOY_LINK_ORIGIN", "");
    vi.stubEnv("JACKBOY_LINK_RUNNER_ORIGIN", "");
    vi.stubEnv("OMNI_LINK_RUNNER_MODE", "true");
    vi.stubEnv("OMNI_LINK_NODE_RUNNER_ENABLED", "true");
    vi.stubEnv("OMNI_LINK_REMOTE_RUNNER_SECRET", "test-only-local-secret");
    expect(await mocks.handlers[1]!(invocation().input)).toMatchObject({
      check: { status: "needs_attention" },
    });
    expect(mocks.probe).not.toHaveBeenCalled();
  });
  it("preserves earlier-step, fresh-MFA, Emergency Stop and audit gates", async () => {
    expect(await mocks.handlers[1]!(invocation(false).input)).toMatchObject({
      ok: false,
      reason: "rule",
    });
    expect(await mocks.handlers[1]!(invocation(true, false).input)).toMatchObject({
      ok: false,
      reason: "mfa",
    });
    mocks.stop.mockRejectedValueOnce(new Error("stop engaged"));
    expect(await mocks.handlers[1]!(invocation().input)).toMatchObject({
      check: { status: "needs_attention" },
    });
    expect(mocks.probe).not.toHaveBeenCalled();
    mocks.record.mockResolvedValueOnce({ error: { message: "fixture audit unavailable" } });
    const { input, rpc } = invocation();
    expect(await mocks.handlers[1]!(input)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

const RESET = [{ event: "mfa_disabled", created_at: "2026-11-13T16:20:51Z" }];

describe("owner access on the approvals list", () => {
  it.each([
    ["Verified owner identity is required.", "identity"],
    ["All-Seeing Eye infrastructure is available only to the configured owner.", "not_owner"],
    ["Complete owner multi-factor verification before inspecting infrastructure.", "needs_code"],
  ])("returns a specific reason and no records when refused: %s", async (message, reason) => {
    mocks.owner.mockRejectedValueOnce(new Error(message));
    const result = await mocks.handlers[0]!(invocation().input);
    expect(result).toEqual({ denied: true, reason });
    expect(mocks.checks).not.toHaveBeenCalled();
  });
  it("tells the real owner at aal1 to enter a code, never that they are not the owner", async () => {
    mocks.owner.mockRejectedValue(
      new Error("All-Seeing Eye infrastructure is available only to the configured owner."),
    );
    expect(
      await mocks.handlers[0]!(invocation(true, true, { aal: "aal1", role: "owner" }).input),
    ).toEqual({ denied: true, reason: "needs_code" });
    expect(await mocks.handlers[0]!(invocation(true, true, { aal: "aal1" }).input)).toEqual({
      denied: true,
      reason: "not_owner",
    });
    expect(
      await mocks.handlers[0]!(invocation(true, true, { aal: "aal2", role: "owner" }).input),
    ).toEqual({ denied: true, reason: "not_owner" });
    expect(mocks.checks).not.toHaveBeenCalled();
  });
  it("still lists approvals when the check store is not installed", async () => {
    mocks.checks.mockReturnValue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    });
    const result = await mocks.handlers[0]!(invocation().input);
    expect(result).toMatchObject({ checksStore: "missing", checks: [] });
    expect((result as { rows: unknown[] }).rows).toHaveLength(10);
  });
  it("reports the last security reset", async () => {
    const result = await mocks.handlers[0]!(invocation(true, true, { events: RESET }).input);
    expect(result).toMatchObject({ securityResetAt: "2026-11-13T16:20:51Z", checksStore: "ready" });
  });
});

describe("security reset requires fresh approval on the server", () => {
  it("refuses a later check when step 1 was approved before the reset", async () => {
    const { input, rpc } = invocation(true, true, { events: RESET });
    expect(await mocks.handlers[1]!(input)).toMatchObject({
      ok: false,
      reason: "rule",
      message: "Step 1 must be approved first.",
    });
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows it again once step 1 is re-approved after the reset", async () => {
    const { input } = invocation(true, true, { events: RESET, decidedAt: "2026-11-13T16:25:00Z" });
    expect(await mocks.handlers[1]!(input)).toMatchObject({ ok: true });
  });
  it("refuses an owner-step approval that depends on a pre-reset approval", async () => {
    // Step 3 is an owner step; step 1 was approved before the reset.
    const { input, rpc } = invocation(true, true, {
      events: RESET,
      data: { step: 3, action: "approve", note: "", expiresAt: null },
    });
    expect(await mocks.handlers[2]!(input)).toMatchObject({ ok: false, reason: "rule" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("still allows revoking without reading prerequisites", async () => {
    const { input, rpc } = invocation(true, true, { events: RESET });
    input.data = { step: 1, action: "revoke", note: "", expiresAt: null };
    expect(await mocks.handlers[2]!(input)).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _step: 1, _action: "revoke" }),
    );
  });
  it("refuses decisions without a fresh code", async () => {
    const { input, rpc } = invocation(true, false);
    input.data = { step: 3, action: "approve", note: "", expiresAt: null };
    expect(await mocks.handlers[2]!(input)).toMatchObject({ ok: false, reason: "mfa" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("no duplicate approvals", () => {
  it("refuses to rerun the check of an already approved step", async () => {
    const { input, rpc } = invocation(true, true, { data: { step: 1 } });
    expect(await mocks.handlers[1]!(input)).toMatchObject({
      ok: false,
      reason: "already_approved",
    });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses to approve an already approved step twice", async () => {
    const { input, rpc } = invocation(true, true, {
      data: { step: 1, action: "approve", note: "", expiresAt: null },
    });
    expect(await mocks.handlers[2]!(input)).toMatchObject({
      ok: false,
      reason: "already_approved",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("never lets the owner mark a technical step failed by hand", async () => {
    const { input, rpc } = invocation(true, true, {
      data: { step: 2, action: "fail", note: "", expiresAt: null },
    });
    expect(await mocks.handlers[2]!(input)).toMatchObject({ ok: false, reason: "rule" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explains when the database needs a fresher passing check", async () => {
    const { input, rpc } = invocation(true, true, {
      data: { step: 2, action: "approve", note: "", expiresAt: null },
    });
    rpc.mockResolvedValueOnce({
      error: { code: "22023", message: "Fresh server-side check required" },
    } as never);
    expect(await mocks.handlers[2]!(input)).toMatchObject({
      ok: false,
      reason: "rule",
      message: expect.stringMatching(/last 15 minutes/),
    });
  });
});

describe("missing check store", () => {
  it("says the database update is missing and records no approval", async () => {
    mocks.record.mockResolvedValueOnce({
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    const { input, rpc } = invocation();
    expect(await mocks.handlers[1]!(input)).toMatchObject({
      ok: false,
      reason: "store_missing",
      message: expect.stringMatching(/0051/),
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Step 9/10 approval triggers the real activation", () => {
  const allApproved = (through: number) =>
    Array.from({ length: 10 }, (_, i) => ({
      step: i + 1,
      status: i + 1 <= through ? "approved" : "pending",
      decided_at: "2026-11-14T00:00:00Z",
      approval_expires_at: i + 1 === 7 ? new Date(Date.now() + 6 * 3600_000).toISOString() : null,
      revision: 1,
    }));
  function step9(approvedThrough: number, activate: boolean) {
    const inv = invocation(true, true, {
      data: {
        step: 9,
        action: "approve",
        note: "",
        expiresAt: null,
        activate: activate ? { attemptId: "aaaaaaaa-0000-4000-8000-000000000009" } : null,
      },
    });
    const rows = { data: allApproved(approvedThrough), error: null };
    const from = inv.input.context.supabase.from;
    inv.input.context.supabase.from = (t: string) =>
      t === "activation_approvals" ? chain(() => rows) : from(t);
    return { inv, rows };
  }
  it("records the approval only when the owner unticks activation", async () => {
    const { inv } = step9(8, false);
    expect(await mocks.handlers[2]!(inv.input)).toEqual({ ok: true, activation: null });
    expect(inv.rpc).toHaveBeenCalledTimes(1);
  });
  it("records the approval, then runs the activation workflow and reports it fails closed when the link is unusable", async () => {
    const { inv, rows } = step9(8, true);
    (inv.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (fn: string) => {
      if (fn === "activation_approval_decide") rows.data = allApproved(9);
      return { error: null };
    });
    const result = (await mocks.handlers[2]!(inv.input)) as {
      ok: boolean;
      activation: { kind: string; ok: boolean };
    };
    expect(result.ok).toBe(true);
    expect(result.activation).toMatchObject({ kind: "live_link", ok: false });
    expect(inv.rpc).toHaveBeenCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _step: 9 }),
    );
    expect(inv.rpc).not.toHaveBeenCalledWith(
      "activation_activation_finish",
      expect.objectContaining({ _ok: true }),
    );
  });
  it("does not activate when the approval itself is refused", async () => {
    const { inv } = step9(8, true);
    inv.rpc.mockResolvedValueOnce({
      error: { code: "22023", message: "Fresh two-factor needed" },
    } as never);
    const result = await mocks.handlers[2]!(inv.input);
    expect(result).toMatchObject({ ok: false, reason: "mfa" });
    expect(inv.rpc).toHaveBeenCalledTimes(1);
  });
});
