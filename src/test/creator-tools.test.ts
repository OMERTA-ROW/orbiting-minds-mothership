import { describe, expect, it } from "vitest";
import { agents, demoProposals, modules, universe } from "@/data/evolution";
import { searchCommands, shouldOpenPalette } from "@/lib/command-search";
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

describe("Global Mothership search", () => {
  it("can find every module by its name", () => {
    for (const module of modules)
      expect(
        searchCommands(module.name).some((e) => e.kind === "Module" && e.id === module.id),
      ).toBe(true);
  });
  it("can find every demo project, agent and proposal", () => {
    for (const project of universe.filter((n) => n.category !== "AI Agents"))
      expect(
        searchCommands(project.name).some((e) => e.kind === "Project" && e.id === project.id),
      ).toBe(true);
    for (const agent of agents)
      expect(
        searchCommands(agent.name).some((e) => e.kind === "Agent" && e.id === agent.name),
      ).toBe(true);
    for (const proposal of demoProposals)
      expect(
        searchCommands(proposal.id).some((e) => e.kind === "Proposal" && e.id === proposal.id),
      ).toBe(true);
  });
  it("searches metadata case-insensitively and handles empty results", () => {
    expect(searchCommands("  MQTT  ").some((e) => e.id === "helios")).toBe(true);
    expect(searchCommands("Forge")[0]?.key).toBe("agent:Forge");
    expect(searchCommands("not-an-existing-world-xx")).toHaveLength(0);
  });
  it("opens with Ctrl K or Command K without intercepting plain typing", () => {
    const key = { key: "k", metaKey: false, ctrlKey: false, altKey: false, repeat: false };
    expect(shouldOpenPalette(key)).toBe(false);
    expect(shouldOpenPalette({ ...key, ctrlKey: true })).toBe(true);
    expect(shouldOpenPalette({ ...key, metaKey: true })).toBe(true);
    expect(shouldOpenPalette({ ...key, metaKey: true, repeat: true })).toBe(false);
  });
});
