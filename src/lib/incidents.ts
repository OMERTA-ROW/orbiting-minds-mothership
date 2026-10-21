import { z } from "zod";
import { screenDebrief } from "./incident-screening";
import { accountabilityRecord, applyAccountability, type AccountabilityCommand } from "./accountability";
import { incidentCategories, incidentExamples } from "@/data/evolution";
import { publicEvidenceUrl } from "@/lib/embassy";
import { requireDemoIdentity, type GenesisStore } from "@/lib/genesis";

export const incidentStorageKey = "evolution-incidents-demo-v1";
export const evidenceStatuses = ["VERIFIED", "UNVERIFIED", "DEMO", "REENACTMENT"] as const;
export const debriefScopes = ["record", "quote", "publication"] as const;
const text = z.string().trim().min(10).max(4000);
const short = z.string().trim().min(2).max(140);
const reference = publicEvidenceUrl.or(z.literal(""));
export const debriefInput = z.object({
 identityId: z.string().min(1).max(100), title: z.string().trim().min(5).max(140), category: z.enum(incidentCategories),
 system: short, incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v; }, "Use a valid calendar date."),
 environment: text, intended: text, observed: text, logs: text, timeline: text, facts: text, unknowns: text,
 hypotheses: text, reproduction: text, tests: text, lessons: text, mitigation: text,
 sourceUrl: reference, sourceCredit: short, sourceLicense: short, sourcePermission: z.literal(true),
 clipUrl: reference, clipCreator: z.string().trim().max(140), clipLicense: z.string().trim().max(140),
 clipPermission: z.boolean(), clipPrivacy: z.boolean(), captions: z.string().trim().max(1000),
 attribution: short, privacyPolicy: text, operatorAuthorized: z.literal(true), sampleOnly: z.literal(true),
 scopes: z.array(z.enum(debriefScopes)).min(1).max(3).refine(v => v.includes("record") && new Set(v).size === v.length, "Opt into recording this local sample; each scope must be unique."),
 status: z.enum(["DEMO", "REENACTMENT"]),
}).strict().superRefine((v, ctx) => {
 if (v.clipUrl && (!v.clipPermission || !v.clipCreator || !v.clipLicense || !v.clipPrivacy || v.captions.length < 10)) ctx.addIssue({ code: "custom", path: ["clipUrl"], message: "Clip metadata requires creator, license, permission, privacy declaration and captions/transcript. No clip will load." });
});
export type DebriefInput = z.infer<typeof debriefInput>;

export { screenDebrief } from "./incident-screening";
const review = z.object({ reviewerId: z.string().min(1), note: text, at: z.string().datetime(), decision: z.enum(["Preview approved", "Changes requested"]), privacyConfirmed: z.literal(true), rightsConfirmed: z.literal(true), attributionConfirmed: z.literal(true) });
const record = z.object({ id: z.string().min(1).max(100), createdAt: z.string().datetime(), input: debriefInput, state: z.enum(["Draft", "Privacy reviewed", "Preview approved", "Changes requested", "Withdrawn"]), privacyReviewerId: z.string().nullable(), review: review.nullable(), revision: z.number().int().min(1) });
const notice = z.object({ id: z.string(), caseId: z.string(), actorId: z.string(), kind: z.enum(["Correction", "Takedown"]), note: text, at: z.string().datetime() });
export const incidentStoreSchema = z.object({ version: z.literal(1), accountability: z.array(accountabilityRecord).max(50).optional().default([]), debriefs: z.array(record).max(100), notices: z.array(notice).max(300), events: z.array(z.object({ id: z.string(), target: z.string(), action: z.string(), at: z.string().datetime() })).max(500) }).superRefine((s, ctx) => {
 if (new Set(s.accountability.map(r=>r.id)).size !== s.accountability.length) ctx.addIssue({code:"custom",message:"Duplicate accountability identifiers"});
 for(const r of s.accountability) if(screenDebrief({sample:JSON.stringify(r)}).length) ctx.addIssue({code:"custom",message:"Potential sensitive accountability content"});
 if (new Set(s.debriefs.map(r => r.id)).size !== s.debriefs.length) ctx.addIssue({ code: "custom", message: "Duplicate debrief identifiers" });
 for (const r of s.debriefs) {
  if (screenDebrief(r.input).length) ctx.addIssue({ code: "custom", message: "Potential sensitive or unsafe sample content" });
  if (r.state === "Preview approved" && (!r.review || r.review.decision !== "Preview approved" || r.review.reviewerId === r.input.identityId || !r.privacyReviewerId || !r.input.scopes.includes("quote") || !r.input.scopes.includes("publication"))) ctx.addIssue({ code: "custom", message: "Preview approval is missing distinct review, privacy or consent" });
 }
});
export type IncidentStore = z.infer<typeof incidentStoreSchema>;
export type Debrief = IncidentStore["debriefs"][number];
export const emptyIncidentStore: IncidentStore = { version: 1, accountability: [], debriefs: [], notices: [], events: [] };
export type IncidentCommand = AccountabilityCommand
 | | { type: "draft"; input: DebriefInput }
 | { type: "revise"; recordId: string; input: DebriefInput }
 | { type: "privacy"; recordId: string; actorId: string; confirmed: boolean }
 | { type: "review"; recordId: string; actorId: string; decision: "Preview approved" | "Changes requested"; note: string; privacyConfirmed: boolean; rightsConfirmed: boolean; attributionConfirmed: boolean }
 | { type: "withdraw"; recordId: string; actorId: string }
 | { type: "notice"; caseId: string; actorId: string; kind: "Correction" | "Takedown"; note: string };
export function applyIncidentCommand(current: IncidentStore, genesis: GenesisStore, command: IncidentCommand, id: string, at: string): IncidentStore {
 const store = structuredClone(incidentStoreSchema.parse(current));
 if ("caseId" in command && command.type.startsWith("accountability") || command.type === "accountabilityReport") {
  store.accountability=applyAccountability(store.accountability,genesis,command as AccountabilityCommand,id,at);return incidentStoreSchema.parse(store);
 }
 if(command.type === "accountabilityRevise" || command.type === "accountabilityPrivacy" || command.type === "accountabilityWithdraw" || command.type === "accountabilityReview" || command.type === "accountabilityNotice" || command.type === "accountabilityAction")throw new Error("Unsupported accountability command.");
 let target = id;
 const get = (recordId: string) => { const r = store.debriefs.find(r => r.id === recordId); if (!r) throw new Error("Debrief not found."); if (r.state === "Withdrawn") throw new Error("Consent was withdrawn; this record cannot be reviewed or revised."); return r; };
 if (command.type === "draft" || command.type === "revise") {
  const input = debriefInput.parse(command.input); requireDemoIdentity(genesis, input.identityId, "submit_capsules");
  const flags = screenDebrief(input); if (flags.length) throw new Error(`Guardian pattern check blocked saving: ${flags.map(f => `${f.field}: ${f.kind}`).join("; ")}. Remove these values. This is not a complete scan.`);
  if (command.type === "draft") store.debriefs.push({ id, createdAt: at, input, state: "Draft", privacyReviewerId: null, review: null, revision: 1 });
  else { const r = get(command.recordId); if (r.input.identityId !== input.identityId) throw new Error("Only the same local submitting identity can revise this draft."); r.input = input; r.state = "Draft"; r.privacyReviewerId = null; r.review = null; r.revision += 1; target = r.id; }
 } else if (command.type === "notice") {
  const actor = requireDemoIdentity(genesis, command.actorId); const local = store.debriefs.find(r => r.id === command.caseId);
  if (!local && !incidentExamples.some(r => r.id === command.caseId)) throw new Error("Case not found.");
  if (!local && (!actor.scopes.includes("review_proposals") || actor.kind === "Agent operator")) throw new Error("A declared local human reviewer is needed to change authored examples. This is not real staff authorization.");
  if (local && local.input.identityId !== command.actorId) throw new Error("Only the local submitter can correct or withdraw this case.");
  const note = text.parse(command.note); if (screenDebrief({ note }).length) throw new Error("Remove potential sensitive values from the correction.");
  store.notices.push({ id, caseId: command.caseId, actorId: command.actorId, kind: command.kind, note, at });
  if (local) { local.state = command.kind === "Takedown" ? "Withdrawn" : "Changes requested"; local.review = null; local.privacyReviewerId = null; }
  target = command.caseId;
 } else {
  const r = get(command.recordId); const actor = requireDemoIdentity(genesis, command.actorId, command.type === "review" ? "review_proposals" : undefined); target = r.id;
  if (command.type === "withdraw") { if (actor.id !== r.input.identityId) throw new Error("Only the local submitting identity can withdraw consent."); r.state = "Withdrawn"; r.review = null; }
  else {
   requireDemoIdentity(genesis, r.input.identityId, "submit_capsules");
   if (command.type === "privacy") { if (actor.id !== r.input.identityId || !command.confirmed) throw new Error("The local submitter must explicitly review privacy and redaction."); r.state = "Privacy reviewed"; r.privacyReviewerId = actor.id; r.review = null; }
   else {
    if (actor.kind === "Agent operator" || actor.id === r.input.identityId) throw new Error("Choose a distinct local human moderator; no identity is authenticated.");
    if (r.state !== "Privacy reviewed") throw new Error("Privacy review must precede human moderation.");
    if (command.decision === "Preview approved" && (!r.input.scopes.includes("quote") || !r.input.scopes.includes("publication"))) throw new Error("Separate quote and publication consent are needed even for this local preview.");
    r.review = review.parse({ reviewerId: actor.id, note: command.note, at, decision: command.decision, privacyConfirmed: command.privacyConfirmed, rightsConfirmed: command.rightsConfirmed, attributionConfirmed: command.attributionConfirmed });
    if (screenDebrief({ note: r.review.note }).length) throw new Error("Remove potential sensitive values from the moderator note.");
    r.state = command.decision;
   }
  }
 }
 store.events = [...store.events.slice(-499), { id, target, action: `${command.type} · local DEMO only`, at }];
 return incidentStoreSchema.parse(store);
}
export function effectiveDebriefState(r: Debrief, genesis: GenesisStore) {
 if (r.state === "Withdrawn") return "Withdrawn";
 const submitter = genesis.identities.find(p => p.id === r.input.identityId && p.state === "Active" && p.consent && p.scopes.includes("submit_capsules"));
 if (!submitter) return "Consent revoked";
 if (r.review && !genesis.identities.some(p => p.id === r.review?.reviewerId && p.state === "Active" && p.consent && p.kind !== "Agent operator" && p.scopes.includes("review_proposals"))) return "Reviewer consent revoked";
 return r.state;
}
export function canPreviewDebrief(r: Debrief, genesis: GenesisStore) { return effectiveDebriefState(r, genesis) === "Preview approved"; }
export function oracleEvidenceSplit(input: DebriefInput) { return { mode: "MANUAL_STRUCTURED_DEMO", facts: input.facts, observations: input.observed, hypotheses: input.hypotheses, unknowns: input.unknowns, proposedTests: input.tests, modelCalled: false, rootCauseConfirmed: false }; }
export function externalPublicationGate() { return { allowed: false as const, identityVerified: false as const, authenticatedModerator: false as const, privateStorage: false as const, clipsPlayable: false as const, reason: "Real accounts, private artifacts, authenticated moderation and owner launch approval are not configured." }; }
export function incidentMatches(item: { title: string; category: string; status: string; summary: string; system?: string; lessons?: string }, query: string, category: string, status: string) { return (!category || item.category === category) && (!status || item.status === status) && query.trim().toLowerCase().split(/\s+/).filter(Boolean).every(word => `${item.title} ${item.category} ${item.summary} ${item.system ?? ""} ${item.lessons ?? ""}`.toLowerCase().includes(word)); }
export function isCaseTakenDown(store: IncidentStore, id: string) { return store.notices.some(n => n.caseId === id && n.kind === "Takedown"); }
export function debriefExport(r: Debrief, genesis: GenesisStore) {
 const { logs: _logs, ...summary } = r.input;
 return { mode: "DEMO", status: r.input.status, state: effectiveDebriefState(r, genesis), revision: r.revision, summary, technicalLogsIncluded: false, identityVerified: false, providerConnected: false, externalPublication: false, playableClip: false, signature: null };
}