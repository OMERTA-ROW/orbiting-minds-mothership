import { describe, expect, it } from "vitest";
import {
  REVIEWED_EXECUTOR_RELEASE,
  executorReleaseStatus,
  verifiedExecutorRelease,
} from "./unified-activation.server";

describe("bounded executor release and verification", () => {
  it("accepts only the reviewed release omni-bounded-plan-2", () => {
    expect(REVIEWED_EXECUTOR_RELEASE).toBe("omni-bounded-plan-2");
    expect(executorReleaseStatus("omni-bounded-plan-2", "omni-bounded-plan-2")).toMatchObject({
      jackboyMatches: true,
      mothershipPinned: true,
    });
    expect(executorReleaseStatus("omni-bounded-plan-1", undefined)).toMatchObject({
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
        executorRelease: "omni-bounded-plan-2",
      }),
    ).toBe("omni-bounded-plan-2");
    for (const state of [
      { connected: true, armed: false, executorRelease: null },
      { connected: false, armed: false, executorRelease: "omni-bounded-plan-2" },
      { connected: true, armed: true, executorRelease: "omni-bounded-plan-2" },
    ])
      expect(() => verifiedExecutorRelease(state)).toThrow(/did not report a verified executor/);
  });
});
