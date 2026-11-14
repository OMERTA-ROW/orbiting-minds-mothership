import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(input: unknown) => Promise<unknown>>,
  rpc: vi.fn(),
  owner: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: (input: unknown) => Promise<unknown>) => {
        mocks.handlers.push(fn);
        return fn;
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: mocks.owner }));
vi.mock("./unified-stop.server", () => ({ reconcileTerminalStop: mocks.reconcile }));
import "./omni-terminal.functions";

const invoke = (engaged: boolean) =>
  mocks.handlers[2]!({
    data: { engaged, reason: "Synthetic fixture only" },
    context: { userId: "owner", claims: {}, supabase: { rpc: mocks.rpc } },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.reconcile.mockResolvedValue(undefined);
});
it("records local Stop before awaiting authenticated remote reduction", async () => {
  mocks.reconcile.mockImplementation(async () => {
    expect(mocks.rpc).toHaveBeenCalledWith("omni_terminal_engage_stop", {
      _reason: "Synthetic fixture only",
    });
  });
  expect(await invoke(true)).toEqual({ ok: true });
  expect(mocks.reconcile).toHaveBeenCalledOnce();
});
it("never reports cancellation confirmed when remote reduction fails", async () => {
  mocks.reconcile.mockRejectedValue(new Error("Synthetic connection loss"));
  expect(await invoke(true)).toMatchObject({
    ok: false,
    message: expect.stringContaining("Local Stop is engaged"),
  });
});
it("Stop release never releases Jackboy Stop or performs a remote granting operation", async () => {
  expect(await invoke(false)).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("omni_terminal_release_stop", {
    _reason: "Synthetic fixture only",
  });
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
it("a non-owner cannot change or propagate Stop", async () => {
  mocks.owner.mockRejectedValue(new Error("Owner required"));
  await expect(invoke(true)).rejects.toThrow("Owner required");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
