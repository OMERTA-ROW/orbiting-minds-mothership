import { describe, expect, it } from "vitest";
import { armBlockers } from "./UnifiedExecutionStatus";

const state = {
  allowed: false,
  checkedAt: new Date().toISOString(),
  projectId: "00000000-0000-4000-8000-000000000001",
  connected: true,
  configured: true,
  armed: false,
  emergencyStop: false,
  killSwitch: false,
  executionReady: false,
  expiresAt: null,
  operationId: null,
  executorRelease: "omni-bounded-plan-1",
  executorOrigin: null,
  running: false,
  cancellationPending: false,
};
const release = {
  expected: "omni-bounded-plan-1",
  jackboyRelease: "omni-bounded-plan-1",
  jackboyMatches: true,
  mothershipPinned: true,
};
type S = Parameters<typeof armBlockers>[0];

describe("Authorize autonomous capability prerequisites", () => {
  it("has no blockers only when linked, configured, verified, pinned and both stops clear", () => {
    expect(armBlockers({ state, label: "Blocked", release } as S)).toEqual([]);
  });
  it("names the missing Step 9 link and Step 10 configuration (today's grayed-out button)", () => {
    const b = armBlockers({
      state: { ...state, connected: false, configured: false, executorRelease: null },
      label: "Blocked",
      release,
    } as S);
    expect(b.join(" ")).toMatch(/Step 9 live link/);
    expect(b.join(" ")).toMatch(/Step 10/);
    expect(b.join(" ")).toMatch(/Verify executor/);
  });
  it("blocks on an engaged Stop or Kill Switch", () => {
    expect(armBlockers({ state: { ...state, emergencyStop: true }, label: "Blocked", release } as S)).toHaveLength(1);
    expect(armBlockers({ state: { ...state, killSwitch: true }, label: "Blocked", release } as S)).toHaveLength(1);
  });
  it("blocks when no fresh state is available", () => {
    expect(armBlockers(null)).toHaveLength(1);
  });
});
