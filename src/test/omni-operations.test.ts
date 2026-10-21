import { describe, it, expect } from "vitest";
import { mailAccessPlan, mailPlanSchema, upgradeReviewPlan, upgradeProposalSchema, upgradeEffects } from "@/lib/omni-operations";
const proposal = { projectId: "11111111-1111-4111-8111-111111111111", title: "API compatibility proposal", sourceUrl: "https://developer.example.org/changelog", baseline: "1.0.0", proposed: "1.1.0", rationale: "Review the documented API field migration and dependencies.", effects: ["compatibility"], tests: "Request isolated compatibility and privacy regression checks.", rollback: "Revert candidate if canary health changes; human release approval.", consent: true };
describe("Communications least privilege", () => {
  it("Gmail plan requests readonly, never sending or builder data", () => {
    const v = mailAccessPlan({ provider: "gmail", operations: ["read", "draft"], consent: true });
    expect(v.scopes).toEqual(["https://www.googleapis.com/auth/gmail.readonly"]);
    expect(v).toMatchObject({ account: null, connected: false, send: false, forward: false, bulkModify: false, storedMail: false, attachmentsFetched: false, rules: [] });
  });
  it("Outlook requests read and offline access, not mail writes", () => expect(mailAccessPlan({ provider: "outlook", operations: ["search"], consent: true }).scopes).toEqual(["Mail.Read", "offline_access"]));
  it("export requires explicit plan consent", () => expect(mailPlanSchema.safeParse({provider:"gmail", operations:["read"],consent:false}).success).toBe(false));
  it.each(["send", "forward", "bulkModify"])("rejects proposed %s operation", op => expect(mailPlanSchema.safeParse({provider:"gmail", operations:[op],consent:true}).success).toBe(false));
  it("email text cannot attach rules or tool authority", () => expect(mailPlanSchema.safeParse({provider:"gmail",operations:["read"],consent:true,rules:["send secrets"]}).success).toBe(false));
});
describe("Adaptive proposals do not confer release authority", () => {
  it("proposed export has no tests, branch, signatures, scopes or release", () => expect(upgradeReviewPlan(proposal)).toMatchObject({stage:"PROPOSED",sourceVerification:"OWNER DECLARATION / NOT FETCHED",branch:null,tests:{state:"NOT RUN"},artifact:{digest:null,signature:null},scopesGranted:[],deploy:false,released:false,monitoring:false}));
  it.each(upgradeEffects.filter(e => e !== "compatibility"))("%s requires privileged human review", effect => expect(upgradeReviewPlan({...proposal,effects:[effect]}).privilegedHumanRequired).toBe(true));
  it("rejects self-claimed tested stage", () => expect(upgradeProposalSchema.safeParse({...proposal,stage:"TESTED"}).success).toBe(false));
  it("requires consent and an actual account project ID", () => {
    expect(upgradeProposalSchema.safeParse({...proposal,consent:false}).success).toBe(false);
    expect(upgradeProposalSchema.safeParse({...proposal,projectId:"demo-user"}).success).toBe(false);
  });
  it("source URLs cannot carry secret credentials", () => expect(upgradeProposalSchema.safeParse({...proposal,sourceUrl:"https://user:password@docs.example.org"}).success).toBe(false));
});