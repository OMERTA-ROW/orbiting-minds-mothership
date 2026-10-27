import { describe, expect, it } from "vitest";
import { omniReadiness, type OmniReadinessInput } from "@/lib/omni-activation";

const baseline: OmniReadinessInput = {
  emailVerified: true, aiApproved: true, paused: false, ownedProjects: 1,
  providerConfigured: true, providerStateReadable: true, providerBlocked: false,
  membership: "owner",
};
describe("OMNI activation boundaries", () => {
  it("allows only a reviewed request, not automatic model or command execution", () => {
    const result = omniReadiness(baseline);
    expect(result.state).toBe("Ready for reviewed request");
    expect(result.inferenceVerified).toBe(false);
    expect(result.executionAllowed).toBe(false);
    expect(result.nativeConnected).toBe(false);
  });
  it.each([
    ["emailVerified", false], ["aiApproved", false], ["paused", true],
    ["ownedProjects", 0], ["providerConfigured", false],
    ["providerStateReadable", false], ["providerBlocked", true],
  ] as const)("blocks reviewed inference when %s is %s", (field, value) => {
    expect(omniReadiness({ ...baseline, [field]: value }).state).toBe("Blocked");
  });
  it("does not infer owner membership from existing AI approval", () => {
    const result = omniReadiness({ ...baseline, membership: "unavailable" });
    expect(result.membership).toBe("unavailable");
    expect(result.ownerAccounts).toBe("Blocked · owner/invitation setup not activated");
    // Existing explicitly approved beta access stays distinct from new owner roles.
    expect(result.state).toBe("Ready for reviewed request");
  });
});