import { describe, expect, it } from "vitest";
import {
  REVIEWED_EXECUTOR_RELEASE,
  executorReleaseStatus,
  verifiedExecutorRelease,
} from "./unified-activation.server";

describe("bounded executor release and verification", () => {
  it("accepts only the reviewed release omni-bounded-plan-1", () => {
    expect(REVIEWED_EXECUTOR_RELEASE).toBe("omni-bounded-plan-1");
    expect(executorReleaseStatus("omni-bounded-plan-1", "omni-bounded-plan-1")).toMatchObject({
      jackboyMatches: true,
      mothershipPinned: true,
    });
    expect(executorReleaseStatus("omni-bounded-plan-2", undefined)).toMatchObject({
      jackboyMatches: false,
      mothershipPinned: false,
    });
    expect(executorReleaseStatus(null, "omni-bounded-plan-0").mothershipPinned).toBe(false);
  });
  it("counts a verify call only when Jackboy reports a connected, unarmed, recorded release", () => {
    expect(
      verifiedExecutorRelease({
        connected: true,
        armed: false,
        executorRelease: "omni-bounded-plan-1",
      }),
    ).toBe("omni-bounded-plan-1");
    for (const state of [
      { connected: true, armed: false, executorRelease: null },
      { connected: false, armed: false, executorRelease: "omni-bounded-plan-1" },
      { connected: true, armed: true, executorRelease: "omni-bounded-plan-1" },
    ])
      expect(() => verifiedExecutorRelease(state)).toThrow(/did not report a verified executor/);
  });
});
