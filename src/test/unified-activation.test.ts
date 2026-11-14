import { expect, it, vi } from "vitest";
import { actuateApproval } from "@/lib/unified-activation.server";

const state = {
  allowed: false, checkedAt: new Date().toISOString(), projectId: "11111111-1111-4111-8111-111111111111",
  connected: true, configured: true, armed: false, emergencyStop: true, killSwitch: false,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), operationId: "22222222-2222-4222-8222-222222222222",
  executorRelease: null, running: false, cancellationPending: false,
};
function input(step: 9 | 10) {
  return {
    owner: "owner", step, operationId: state.operationId, expiresAt: state.expiresAt,
    cap: true, daily: true,
    caller: { rpc: vi.fn(async () => ({ data: { state: "pending" }, error: null })) },
    admin: { rpc: vi.fn(async () => ({ data: null, error: null as unknown })) },
  };
}
it("Step 9 persists a connection, checks live state, and finalizes only afterward", async () => {
  const args = input(9);
  const control = vi.fn(async () => state);
  await actuateApproval(args, control);
  expect(control.mock.calls).toHaveLength(2);
  expect(args.admin.rpc).toHaveBeenCalledWith("activation_finalize", expect.objectContaining({ _state: "completed" }));
});
it("Step 10 configures while Stop is engaged without arming or starting work", async () => {
  const args = input(10);
  const control = vi.fn(async () => state);
  await actuateApproval(args, control);
  expect(control).toHaveBeenCalledWith("configure", {});
  expect(control).not.toHaveBeenCalledWith("arm", expect.anything());
});
it("failed finalization compensates and never turns failure into approval", async () => {
  const args = input(9);
  args.admin.rpc.mockResolvedValueOnce({ data: null, error: "audit unavailable" });
  const control = vi.fn(async () => state);
  await expect(actuateApproval(args, control)).rejects.toThrow("Nothing was approved");
  expect(control).toHaveBeenCalledWith("revoke");
});
it("lost peer keeps the activation pending for reconciliation, not blind retry", async () => {
  const args = input(9);
  const control = vi.fn(async () => { throw new Error("connection failed"); });
  await expect(actuateApproval(args, control)).rejects.toThrow("reconciliation");
  expect(args.admin.rpc).not.toHaveBeenCalled();
});
