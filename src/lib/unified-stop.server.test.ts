import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), state: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));
vi.mock("./unified-activation.server", () => ({ readExecutionState: mocks.state }));
import { reconcileTerminalStop } from "./unified-stop.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "omni_stop_pending" ? 7 : null,
    error: null,
  }));
  mocks.state.mockResolvedValue({ armed: false, running: false, cancellationPending: false });
});
it("acknowledges the durable generation only after authenticated cancellation is verified", async () => {
  await reconcileTerminalStop();
  expect(mocks.state).toHaveBeenCalledWith("disarm");
  expect(mocks.rpc).toHaveBeenLastCalledWith("omni_stop_delivered", { _revision: 7 });
});
it("does not claim delivery on stale safety, unknown termination or a failed audit write", async () => {
  mocks.state.mockRejectedValueOnce(new Error("Stale safety"));
  await expect(reconcileTerminalStop()).rejects.toThrow("Stale");
  mocks.state.mockResolvedValueOnce({ armed: false, running: false, cancellationPending: true });
  await expect(reconcileTerminalStop()).rejects.toThrow("unverified");
  expect(mocks.rpc.mock.calls.every(([name]) => name === "omni_stop_pending")).toBe(true);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "omni_stop_pending" ? 7 : null,
    error: name === "omni_stop_delivered" ? { message: "Synthetic audit failure" } : null,
  }));
  await expect(reconcileTerminalStop()).rejects.toThrow("could not be recorded");
});
it("does not contact Jackboy when no durable Stop reduction is pending", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  await reconcileTerminalStop();
  expect(mocks.state).not.toHaveBeenCalled();
});
