import { describe, expect, it } from "vitest";
import { modules } from "@/data/evolution";
import { shouldOpenPalette } from "@/components/CommandPalette";
import { conceptSchema, validatePathway } from "@/lib/pathway";
import { requiresPersistentPause, safeGatewayFailure } from "@/lib/ai/gateway-errors";

const draft = {
  title: "Creator sensor mesh",
  summary: "An isolated evaluation proposal",
  assumptions: ["Owner supplies telemetry"],
  modules: [
    { moduleId: "guardian", rationale: "Owner permission checks", contribution: "Approval gate" },
  ],
  steps: [
    {
      title: "Evaluate",
      moduleId: "time",
      action: "Simulate disconnected nodes",
      deliverable: "Failure report",
    },
  ],
  sandboxChecks: [
    {
      title: "Recovery",
      procedure: "Inject a dropped connection",
      passCriteria: "No telemetry loss",
    },
  ],
  risks: ["Unverified hardware constraints"],
  approval: "Owner must explicitly opt in before rollout",
  rollback: "Restore the prior signed snapshot",
};

describe("Creator pathway rules", () => {
  it("requires explicit consent before sending a concept to AI", () => {
    expect(
      conceptSchema.safeParse({
        concept: "A creator-owned solar sensor network with local fault detection.",
        goal: "",
        consent: false,
      }).success,
    ).toBe(false);
    expect(
      conceptSchema.safeParse({
        concept: "A creator-owned solar sensor network with local fault detection.",
        goal: "",
        consent: true,
      }).success,
    ).toBe(true);
  });
  it("includes actual Mothership modules and planned sandbox checks", () => {
    const output = validatePathway(draft);
    expect(output.modules[0]?.moduleId).toBe("guardian");
    expect(output.sandboxChecks[0]?.passCriteria).toBe("No telemetry loss");
    expect(() =>
      validatePathway({ ...draft, modules: [{ ...draft.modules[0], moduleId: "unknown" }] }),
    ).toThrow("unknown Mothership module");
    expect(() => validatePathway({ ...draft, sandboxChecks: [] })).toThrow("incomplete");
  });
  it("requires an owner approval and rollback proposal", () => {
    expect(() => validatePathway({ ...draft, approval: "" })).toThrow("approval or rollback");
    expect(() => validatePathway({ ...draft, rollback: "" })).toThrow("approval or rollback");
  });
  it("retains upstream denial statuses and reasons instead of retrying", () => {
    expect(safeGatewayFailure(403, { error: { message: "Vendor access is disabled" } })).toEqual({
      status: 403,
      message: "Vendor access is disabled",
    });
    expect(requiresPersistentPause(403)).toBe(true);
    expect(requiresPersistentPause(402)).toBe(true);
    expect(requiresPersistentPause(429)).toBe(false);
  });
});

describe("page search shortcut", () => {
  it("opens with Ctrl K or Command K without intercepting plain typing", () => {
    const key = { key: "k", metaKey: false, ctrlKey: false, altKey: false, repeat: false };
    expect(shouldOpenPalette(key)).toBe(false);
    expect(shouldOpenPalette({ ...key, ctrlKey: true })).toBe(true);
    expect(shouldOpenPalette({ ...key, metaKey: true })).toBe(true);
    expect(shouldOpenPalette({ ...key, metaKey: true, repeat: true })).toBe(false);
  });
});
