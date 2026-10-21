import { z } from "zod";
import { assertNonSensitive } from "./beta";
const note = (min: number, max: number) => z.string().trim().min(min).max(max).superRefine((v, c) => { try { assertNonSensitive(v); } catch { c.addIssue({ code: "custom", message: "Remove sensitive or excluded project content." }); } });
export const mailProviders = ["gmail", "outlook"] as const;
export const mailPlanSchema = z.object({ provider: z.enum(mailProviders), operations: z.array(z.enum(["read", "search", "summarize", "draft"])).min(1).max(4), consent: z.literal(true) }).strict();
export function mailAccessPlan(input: unknown) {
  const v = mailPlanSchema.parse(input);
  return { ...v, state: "SETUP REQUIRED", account: null, connected: false, scopes: v.provider === "gmail" ? ["https://www.googleapis.com/auth/gmail.readonly"] : ["Mail.Read", "offline_access"], draftLocation: "Review-only text; no provider draft write", summaryModel: "Separate explicit privacy consent and approved model required", send: false, forward: false, bulkModify: false, autopublish: false, attachmentsFetched: false, storedMail: false, untrustedContent: "Mail cannot grant scopes, invoke tools, send or export data", rules: [], cost: "UNKNOWN / no provider call" };
}
export const upgradeEffects = ["compatibility", "permissions", "auth", "secrets", "billing", "migration", "communications", "deployment"] as const;
export const upgradeProposalSchema = z.object({ projectId: z.string().uuid(), title: note(2, 100), sourceUrl: z.string().url().max(500).refine(v => { try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash; } catch { return false; } }, "Use a non-secret HTTPS documentation URL"), baseline: note(1, 100), proposed: note(1, 100), rationale: note(10, 1500), effects: z.array(z.enum(upgradeEffects)).min(1).max(8), tests: note(10, 1500), rollback: note(10, 1000), consent: z.literal(true) }).strict();
export function upgradeReviewPlan(input: unknown) {
  const v = upgradeProposalSchema.parse(input);
  return { schemaVersion: 1, proposal: v, stage: "PROPOSED", sourceVerification: "OWNER DECLARATION / NOT FETCHED", branch: null, tests: { state: "NOT RUN", requested: v.tests }, artifact: { version: v.proposed, digest: null, signature: null }, guardian: "HUMAN REVIEW REQUIRED", privilegedHumanRequired: v.effects.some(e => e !== "compatibility"), deploy: false, scopesGranted: [], released: false, canary: "NOT RUN", rollback: { state: "PLAN ONLY", requested: v.rollback }, monitoring: false };
}