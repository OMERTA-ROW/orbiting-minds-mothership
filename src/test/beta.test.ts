import { describe, expect, it } from "vitest";
import { assertBetaAiAccess, betaAgentInput, betaProjectInput, liveOmniInput } from "@/lib/beta";
import { canLaunch, launchEvidence } from "@/data/launch-evidence";
const projectId = "cc276f60-142b-4d5d-83cf-b83fb53d5562";
describe("limited beta rules", () => {
  it("requires founder approval for AI", () =>
    expect(() => assertBetaAiAccess({ ai_approved: false, paused: false })).toThrow(
      "founder approval",
    ));
  it("fails closed without access records", () => expect(() => assertBetaAiAccess(null)).toThrow());
  it("rejects paused account AI", () =>
    expect(() => assertBetaAiAccess({ ai_approved: true, paused: true })).toThrow("paused"));
  it("permits approved unpaused AI", () =>
    expect(() => assertBetaAiAccess({ ai_approved: true, paused: false })).not.toThrow());
  it("requires explicit message consent", () =>
    expect(
      liveOmniInput.safeParse({ projectId, message: "Plan a safe code review", consent: false })
        .success,
    ).toBe(false));
  it("rejects possible credentials", () =>
    expect(
      liveOmniInput.safeParse({
        projectId,
        message: "api_key=fictionalCredentialExample",
        consent: true,
      }).success,
    ).toBe(false));
  it("rejects personal email in model text", () =>
    expect(
      liveOmniInput.safeParse({
        projectId,
        message: "Contact fictional@example.test",
        consent: true,
      }).success,
    ).toBe(false));
  it("excludes CyberLink Social", () =>
    expect(
      betaProjectInput.safeParse({ name: "CyberLink Social", brief: "Excluded" }).success,
    ).toBe(false));
  it("permits Cyberace as an owned declaration", () =>
    expect(
      betaProjectInput.parse({ name: "Cyberace", brief: "Unconfirmed compatibility" }).name,
    ).toBe("Cyberace"));
  it("cannot supply owner or approval in project input", () =>
    expect(
      betaProjectInput.safeParse({ name: "Project", brief: "", owner_id: projectId }).success,
    ).toBe(false));
  it("requires operator consent for agent declaration", () =>
    expect(
      betaAgentInput.safeParse({
        projectId,
        name: "Test Agent",
        provider: "Declared",
        model: "Not connected",
        scope: "Drafts",
        consent: false,
      }).success,
    ).toBe(false));
  it("does not accept verified agent status from client", () =>
    expect(
      betaAgentInput.safeParse({
        projectId,
        name: "Agent",
        provider: "Declared",
        model: "Unconnected",
        scope: "Drafts",
        consent: true,
        status: "Verified",
      }).success,
    ).toBe(false));
  it("blocks release with incomplete gates", () => expect(canLaunch(launchEvidence)).toBe(false));
  it("any failed gate invalidates launch", () =>
    expect(
      canLaunch([
        {
          ...launchEvidence[0],
          id: "failure",
          capability: "Security",
          owner: "QA",
          status: "FAIL",
          gating: true,
          demoOnly: false,
          evidence: "Failed",
          next: "Fix",
        },
      ]),
    ).toBe(false));
});
