import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<Record<string, unknown>>>,
  owner: vi.fn(),
  stop: vi.fn(),
  probe: vi.fn(),
  insert: vi.fn(),
  record: vi.fn(),
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
  supabaseAdmin: { from: () => ({ insert: mocks.insert }), rpc: mocks.record },
}));
import "./activation-approvals.functions";

const OWNER = "11111111-1111-4111-8111-111111111111";
function invocation(approved = true, fresh = true) {
  const rpc = vi.fn(async () => ({ error: null }));
  return {
    rpc,
    input: {
      data: { step: 2 },
      context: {
        userId: OWNER,
        claims: {
          amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - (fresh ? 0 : 3600) }],
        },
        supabase: {
          from: () => ({
            select: () => ({
              order: async () => ({
                data: [{ step: 1, status: approved ? "approved" : "pending" }],
                error: null,
              }),
            }),
          }),
          rpc,
        },
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
