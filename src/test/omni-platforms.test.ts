import { describe, expect, it } from "vitest";
import {
  calendarPlans,
  developerPlan,
  developerPlanSchema,
  requireHumanDeveloperApproval,
  socialAction,
  socialContent,
  socialExport,
  socialSave,
  sameSocialContent,
} from "@/lib/omni-platforms";
const projectId = "11111111-1111-4111-8111-111111111111";
const content = {
  platform: "linkedin",
  accountLabel: "My declared test member",
  title: "Original project update",
  body: "A non-sensitive creator-owned test post proposal.",
  altText: "",
  hashtags: "#original",
  license: "Original creator-owned text",
  targetDate: "2026-11-01T12:00:00.000Z",
  timezone: "UTC",
  rights: true,
  privacy: true,
};
describe("Social draft boundaries", () => {
  it("normalized whitespace permits exact review without stale comparison", () =>
    expect(sameSocialContent({ ...content, title: `  ${content.title}  ` }, content)).toBe(true));
  it("changed captions never match reviewed content", () =>
    expect(sameSocialContent({ ...content, body: "Different caption" }, content)).toBe(false));
  it("a saved reviewed draft confers no posting or schedule", () =>
    expect(socialExport(content, "REVIEWED")).toMatchObject({
      account: null,
      scheduled: false,
      autopilot: false,
      receipt: null,
      postUrl: null,
      mediaIncluded: false,
      rules: [],
    }));
  it.each(["rights", "privacy"])("%s consent required for storage", (key) =>
    expect(socialContent.safeParse({ ...content, [key]: false }).success).toBe(false),
  );
  it("explicit save consent is required", () =>
    expect(socialSave.safeParse({ projectId, content, consent: false }).success).toBe(false));
  it("review requires exact ID and revision and human approval", () => {
    expect(
      socialAction.safeParse({ action: "review", id: projectId, revision: 1, approve: false })
        .success,
    ).toBe(false);
    expect(socialAction.safeParse({ action: "review", approve: true }).success).toBe(false);
  });
  it("stop all withdraws plans without fresh posting consent", () =>
    expect(socialAction.safeParse({ action: "stop_all" }).success).toBe(true));
  it.each(["publish", "schedule", "grant_scope", "autopilot"])(
    "%s cannot be an active action",
    (action) =>
      expect(
        socialAction.safeParse({ action, id: projectId, revision: 1, approve: true }).success,
      ).toBe(false),
  );
  it("cannot submit provider credentials or receipts", () =>
    expect(
      socialContent.safeParse({ ...content, receipt: "fake", connectionKey: "fake" }).success,
    ).toBe(false));
  it("saved ID must include current optimistic revision", () =>
    expect(socialSave.safeParse({ projectId, id: projectId, content, consent: true }).success).toBe(
      false,
    ));
  it("calendar orders exact UTC intentions and omits undated plans", () =>
    expect(
      calendarPlans([
        { id: "later", content },
        { id: "none", content: { ...content, targetDate: "" } },
        { id: "first", content: { ...content, targetDate: "2026-10-31T12:00:00.000Z" } },
      ]).map((v) => v.id),
    ).toEqual(["first", "later"]));
  it("unconfirmed non-UTC inputs cannot imply timezone conversion", () =>
    expect(socialContent.safeParse({ ...content, timezone: "America/New_York" }).success).toBe(
      false,
    ));
  it("CyberLink Social is excluded from draft content", () =>
    expect(socialContent.safeParse({ ...content, title: "CyberLink Social" }).success).toBe(false));
  it("oversized captions cannot save", () =>
    expect(socialContent.safeParse({ ...content, body: "x".repeat(3001) }).success).toBe(false));
});
describe("Developer proposal authority", () => {
  it.each(["production deploy", "billing", "secrets", "permissions", "deletion"])(
    "%s always requires human approval",
    (action) => expect(requireHumanDeveloperApproval(action)).toBe(true),
  );
  it("proposal does not invent context, branch, PR, tests or deploy", () =>
    expect(
      developerPlan({
        projectId,
        provider: "github",
        target: "owner/selected-test-repo",
        intent: "Read approved issues only after account consent.",
        consent: true,
      }),
    ).toMatchObject({
      connectedAccount: null,
      branch: null,
      pullRequest: null,
      testRun: null,
      deploy: false,
      credentialsIncluded: false,
    }));
  it("unsupported automatic targets are rejected", () =>
    expect(
      developerPlanSchema.safeParse({
        projectId,
        provider: "all-sites",
        target: "any",
        intent: "Access all projects automatically",
        consent: true,
      }).success,
    ).toBe(false));
  it("excluded project cannot be a declared developer target", () =>
    expect(
      developerPlanSchema.safeParse({
        projectId,
        provider: "github",
        target: "CyberLink Social",
        intent: "Read approved issues only",
        consent: true,
      }).success,
    ).toBe(false));
});
