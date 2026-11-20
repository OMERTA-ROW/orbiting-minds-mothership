import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { jobError: false, autonomyError: false, sessionError: false };
  const admin = {
    from: () => {
      const query = Object.assign(Promise.resolve({ error: state.jobError ? "failed" : null }), {
        in: () => query,
        eq: () => query,
      });
      return { update: () => query };
    },
  };
  const db = {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: state.sessionError ? "failed" : null }),
      };
      return query;
    },
  };
  return {
    state,
    admin,
    db,
    requireOwner: vi.fn(),
    endAutonomy: vi.fn(),
    linkState: vi.fn(),
    relay: vi.fn(),
    audit: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocks.admin }));
vi.mock("@/lib/razul-owner.server", () => ({ requireRazulOwner: mocks.requireOwner }));
vi.mock("@/lib/omni-passkey.server", () => ({}));
vi.mock("@/lib/omni-workspace.server", () => ({
  endAutonomy: mocks.endAutonomy,
  linkState: mocks.linkState,
  relay: mocks.relay,
  audit: mocks.audit,
}));

import { stopWork } from "@/lib/omni-workspace.functions";

describe("workspace Stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.jobError = false;
    mocks.state.autonomyError = false;
    mocks.state.sessionError = false;
    mocks.endAutonomy.mockImplementation(async () => ({
      error: mocks.state.autonomyError ? "failed" : null,
    }));
    mocks.linkState.mockResolvedValue({ configured: true });
    mocks.relay.mockResolvedValue({});
    mocks.audit.mockResolvedValue(undefined);
  });

  const stop = (data: Record<string, string> = {}) =>
    Reflect.apply(stopWork, undefined, [
      { context: { supabase: mocks.db, userId: "owner", claims: {} }, data },
    ]);

  it("reports a failed local job update while still sending remote Stop", async () => {
    mocks.state.jobError = true;
    const result = await stop();
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/local jobs.*Remote Stop:.*unverified/),
    });
    expect(mocks.relay).toHaveBeenCalledWith(
      { configured: true },
      "agent.stop",
      expect.any(Object),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      mocks.admin,
      expect.objectContaining({
        detail: expect.objectContaining({ failures: ["Could not mark local jobs stopped."] }),
      }),
    );
  });

  it("reports a failed autonomy update while still sending remote Stop", async () => {
    mocks.state.autonomyError = true;
    const result = await stop();
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/local autonomy windows.*Remote Stop:.*unverified/),
    });
    expect(mocks.relay).toHaveBeenCalledOnce();
  });

  it("still sends remote Stop when the local autonomy update throws", async () => {
    mocks.endAutonomy.mockRejectedValue(new Error("storage unavailable"));
    expect(await stop()).toMatchObject({
      ok: false,
      message: expect.stringMatching(/local autonomy windows.*Remote Stop:.*unverified/),
    });
    expect(mocks.relay).toHaveBeenCalledOnce();
  });

  it("reports a failed agent lookup and still stops remotely", async () => {
    mocks.state.sessionError = true;
    const sessionId = "00000000-0000-4000-8000-000000000001";
    expect(await stop({ sessionId })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/session's agent.*Remote Stop:.*unverified/),
    });
    expect(mocks.endAutonomy).toHaveBeenCalledWith(mocks.admin, null, "stop");
    expect(mocks.relay).toHaveBeenCalledWith(
      { configured: true },
      "job.stop",
      expect.objectContaining({ sessionId }),
    );
  });

  it("reports a remote Stop failure without claiming confirmation", async () => {
    mocks.relay.mockRejectedValue(new Error("connection failed"));
    expect(await stop()).toMatchObject({
      ok: false,
      message: expect.stringContaining("Remote Stop: not confirmed: connection failed"),
    });
  });

  it("reports when remote Stop cannot be sent because the link is missing", async () => {
    mocks.linkState.mockResolvedValue({ configured: false });
    expect(await stop()).toMatchObject({
      ok: false,
      message: expect.stringContaining("Remote Stop: not sent (link not configured)"),
    });
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it("does not claim the remote acknowledgement verifies cancellation", async () => {
    expect(await stop()).toMatchObject({
      ok: true,
      remote: expect.stringContaining("remote cancellation is unverified"),
    });
  });
});
