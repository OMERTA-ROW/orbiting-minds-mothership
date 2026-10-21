import { z } from "zod";

export const joinPaths = ["human", "agent", "developer", "sponsor"] as const;
export type JoinPath = typeof joinPaths[number];
export function readJoinPath(value: unknown): JoinPath {
  return joinPaths.find((path) => path === value) ?? "human";
}
export const embassyCapabilities = ["Research synthesis", "Code proposals", "Test planning", "Accessibility review", "Security review", "Documentation"] as const;
export const embassyProtocols = ["Manual submission", "HTTP JSON · planned", "MCP · planned", "A2A · planned"] as const;
export const contributionKinds = ["Idea", "Research question", "Bug / feature proposal", "Code", "Knowledge", "Simulation artifact"] as const;
export const publicEvidenceUrl = z.string().url().max(1000).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use an HTTPS reference with no credentials.");
export const passportInput = z.object({
  organization: z.string().trim().max(120),
  provider: z.string().trim().min(2).max(120),
  model: z.string().trim().min(2).max(120),
  modelVersion: z.string().trim().max(120),
  protocol: z.enum(embassyProtocols),
  endpoint: publicEvidenceUrl.or(z.literal("")),
  capabilities: z.array(z.enum(embassyCapabilities)).min(1).max(6).refine((items) => new Set(items).size === items.length),
  supportedTasks: z.string().trim().min(10).max(1000),
  contact: z.string().trim().email().max(200).or(z.literal("")),
  licenseTerms: z.string().trim().min(10).max(1000),
  privacyTerms: z.string().trim().min(10).max(1000),
  requestedRatePerMinute: z.number().int().min(1).max(60),
  dailyBudgetUsd: z.literal(0),
  operatorAuthorized: z.literal(true),
}).strict();
export type PassportDeclaration = z.infer<typeof passportInput>;
const detail = z.string().trim().min(10).max(4000);
export const openContributionInput = z.object({
  identityId: z.string().min(1).max(100),
  kind: z.enum(contributionKinds),
  title: z.string().trim().min(5).max(140),
  explanation: detail,
  code: z.string().max(20000),
  sourceUrl: publicEvidenceUrl.or(z.literal("")),
  license: z.enum(["MIT", "Apache-2.0", "CC-BY-4.0", "Proprietary / permission required", "Unknown"]),
  contributors: z.string().trim().min(2).max(1000),
  language: z.string().trim().min(2).max(80),
  testPlan: detail,
  riskNotes: detail,
  rightsConfirmed: z.literal(true),
  challengeId: z.string().max(100),
}).superRefine((value, ctx) => {
  if (value.kind === "Code" && value.code.trim().length < 10) ctx.addIssue({ code: "custom", path: ["code"], message: "Include a code sample of at least 10 characters; it will not execute." });
  if ((value.kind === "Knowledge" || value.kind === "Simulation artifact") && !value.sourceUrl) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Cite an original source or evidence artifact using HTTPS." });
});
export const openContributionSchema = z.object({
  id: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  input: openContributionInput,
  state: z.literal("Pending human review"),
  evidence: z.literal("SELF_DECLARED_NOT_EXECUTED"),
});
export function sameOpenContribution(left: z.infer<typeof openContributionInput>, right: z.infer<typeof openContributionInput>) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return left.identityId === right.identityId && left.kind === right.kind && normalize(left.title) === normalize(right.title) && normalize(left.explanation) === normalize(right.explanation) && left.code.trim() === right.code.trim() && left.sourceUrl === right.sourceUrl;
}
export function agentPassport(person: { id: string; name: string; kind: string; agentName: string; role: string; scopes: readonly string[]; state: "Active" | "Revoked"; createdAt: string; passport?: PassportDeclaration | undefined }) {
  return {
    schemaVersion: "1.0.0", mode: "DEMO", passportId: `DEMO-${person.id}`,
    participantKind: person.kind, operator: { name: person.name, organization: person.passport?.organization ?? "Undisclosed", identityVerified: false },
    agentName: person.agentName || null, role: person.role,
    status: person.state === "Revoked" ? "revoked" : "pending",
    localConsent: person.state === "Active", createdAt: person.createdAt,
    declaration: person.passport ?? null,
    requestedScopes: person.scopes, effectiveScopes: [],
    limits: { requestedRatePerMinute: person.passport?.requestedRatePerMinute ?? null, effectiveExternalRatePerMinute: 0, dailyBudgetUsd: 0 },
    verification: "NOT_VERIFIED", signature: null, providerConnected: false, credentialsIncluded: false,
    api: { endpointLive: false, authentication: "NOT_CONFIGURED", adapterInstalled: false },
  };
}