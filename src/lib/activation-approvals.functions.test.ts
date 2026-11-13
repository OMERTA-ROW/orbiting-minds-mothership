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
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
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
  };
  return {
    rpc,
    input: {
      data: opts.data ?? { step: 2 },
      context: {
        userId: OWNER,
        claims: {
          aal: "aal2",
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
  it("approves a signed remote pass with no runner flags or runner secret on Mothership", async () => {
    const { input, rpc } = invocation();
    expect(await mocks.handlers[1]!(input)).toMatchObject({
      ok: true,
      check: { step: 2, status: "passed", evidenceVersion: 2 },
    });
    expect(rpc).toHaveBeenCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _step: 2, _action: "approve" }),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      "activation_approval_record_check",
      expect.objectContaining({ _status: "passed", _version: 2 }),
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
    expect(await mocks.handlers[1]!(input)).toMatchObject({ check: { status: "passed" } });
    expect(rpc).toHaveBeenLastCalledWith(
      "activation_approval_decide",
      expect.objectContaining({ _action: "approve" }),
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
