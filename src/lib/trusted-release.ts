import { z } from "zod";
import { codeContributions, incidentExamples, roboticsScenarios } from "@/data/evolution";
import { publicEvidenceUrl } from "@/lib/embassy";
import { requireDemoIdentity, type GenesisStore } from "@/lib/genesis";
import { screenDebrief } from "@/lib/incidents";

export const trustStorageKey = "evolution-trusted-release-demo-v1";
const text = z.string().trim().min(10).max(2000);
const id = z.string().min(1).max(100);
const name = z.string().trim().min(2).max(140);
const date = z.string().datetime();
const scenario = id.refine(v => roboticsScenarios.some(s => s.id === v), "Choose a known demo scenario.");
export const safetyChecks = [
 { id: "stability", title: "Stability & balance", requirement: "Record a virtual fall/stability test plan. Independent mechanical validation is missing." },
 { id: "collision", title: "Collision, safe speed & force", requirement: "Define bounded synthetic cases and unknown braking/force limits. Not safe operating values." },
 { id: "estop", title: "Physical emergency stop", requirement: "Describe independent physical E-stop validation required. A web control cannot replace tested safety hardware." },
 { id: "area", title: "Constrained test area", requirement: "Plan a restricted area and qualified supervision; no physical test is performed here." },
 { id: "payload", title: "Forbidden payloads & harmful actions", requirement: "No weapons, hazardous payloads, unsafe tools, coercion or unsupervised manipulation. Escalate unknown hazards." },
] as const;
const check = z.object({ planned: z.boolean(), evidence: z.string().trim().max(1200) }).strict();
export const safetyInput = z.object({ scenarioId: scenario, operatorId: id, checks: z.object({ stability: check, collision: check, estop: check, area: check, payload: check }).strict(), hazard: z.enum(["Unknown / escalate", "Conflict / unsafe", "No hazard in fictional fixture"]), operatorApproval: z.boolean(), consent: z.literal(true) }).strict();
export type SafetyInput = z.infer<typeof safetyInput>;
const safetyRecord = safetyInput.extend({ id, at: date });
export type SafetyRecord = z.infer<typeof safetyRecord>;
export function safetyAssessment(record?: SafetyRecord) {
 const missing = safetyChecks.filter(c => !record?.checks[c.id].planned || (record.checks[c.id].evidence.trim().length ?? 0) < 10).map(c => c.title);
 const complete = Boolean(record && !missing.length && record.operatorApproval && record.hazard === "No hazard in fictional fixture");
 return { status: complete ? "Checklist planned · expert review required" : "Blocked · evidence or hazard review required", missing, checklistComplete: complete, hardwareAllowed: false as const, releaseAllowed: false as const, physicalEstop: "NOT_TESTED" as const, independentTests: "NOT_RUN" as const };
}
const step = z.object({ offsetMs: z.number().int().min(0).max(3600000), expected: text, actual: text, command: z.string().trim().max(1000), sensor: z.string().trim().max(1000) }).strict();
const clip = z.object({ url: publicEvidenceUrl.or(z.literal("")), creator: z.string().trim().max(140), license: z.string().trim().max(140), captions: z.string().trim().max(1000), authorized: z.boolean() }).strict();
export const replayInput = z.object({ title: name, operatorId: id, caseId: id.refine(v => incidentExamples.some(c => c.id === v), "Choose an authored teaching case."), codeId: id.refine(v => codeContributions.some(c => c.id === v)), version: z.string().regex(/^\d+\.\d+\.\d+$/), buildId: name, inputVersion: name, steps: z.array(step).min(2).max(20), logs: text, rootCause: z.enum(["Unknown", "Hypothesis only"]), hypothesis: text, clip, privacyReviewed: z.literal(true), consent: z.literal(true) }).strict().superRefine((r,ctx) => {
 if (r.steps.some((s,i) => i > 0 && s.offsetMs <= (r.steps[i-1]?.offsetMs ?? 0))) ctx.addIssue({ code: "custom", message: "Timeline offsets must increase." });
 if (r.clip.url && (!r.clip.authorized || !r.clip.creator || !r.clip.license || r.clip.captions.length < 10)) ctx.addIssue({ code: "custom", message: "Clip metadata needs creator permission, license and captions. Playback stays disabled." });
});
export type ReplayInput = z.infer<typeof replayInput>;
const replayRecord = replayInput.innerType().extend({ id, at: date }).superRefine(({ id: _id, at: _at, ...input },ctx) => { const p=replayInput.safeParse(input); if (!p.success) p.error.issues.forEach(issue=>ctx.addIssue(issue)); });
const metric = z.number().finite().min(0).max(1000000000);
export const impactInput = z.object({ title: name, operatorId: id, problem: text, unit: name, direction: z.enum(["Lower is better", "Higher is better"]), baseline: z.array(metric).min(3).max(30), candidate: z.array(metric).min(3).max(30), method: text, fixtureVersion: name, limitations: text, consent: z.literal(true) }).strict().refine(v => v.baseline.length === v.candidate.length, "Use paired samples from the same fixture.").refine(v => v.baseline.some(n => n > 0), "A positive baseline is needed for percent comparison.");
export type ImpactInput = z.infer<typeof impactInput>;
const impactRecord = impactInput.innerType().innerType().extend({ id, at: date }).superRefine(({ id: _id, at: _at, ...input },ctx) => { const p=impactInput.safeParse(input); if (!p.success) p.error.issues.forEach(issue=>ctx.addIssue(issue)); });
const median = (xs: number[]) => { const a = [...xs].sort((a,b) => a-b); const mid = Math.floor(a.length/2); return a.length % 2 ? a[mid] ?? 0 : ((a[mid-1] ?? 0)+(a[mid] ?? 0))/2; };
export function impactComparison(input: ImpactInput) {
 const v = impactInput.parse(input), baseline = median(v.baseline), candidate = median(v.candidate);
 const delta = (v.direction === "Lower is better" ? baseline-candidate : candidate-baseline);
 return { baseline, candidate, delta, improvementPercent: baseline > 0 ? Math.round(delta/baseline*10000)/100 : null, pairs: v.baseline.length, verifiedBenefit: false as const, confidence: "SYNTHETIC / NOT INDEPENDENTLY REPRODUCED" as const };
}
export const releaseInput = z.object({ codeId: id.refine(v => codeContributions.some(c => c.id === v)), version: z.string().regex(/^\d+\.\d+\.\d+$/), ownerId: id, agentOperatorId: z.string().max(100), artifact: z.string().min(10).max(20000), license: z.enum(["MIT", "Apache-2.0", "Unknown / permission required"]), dependencies: text, testEvidence: text, rollback: text, previousVersion: z.string().regex(/^\d+\.\d+\.\d+$/).or(z.literal("")), scenarioId: scenario.or(z.literal("")).default(""), safetyId: z.string().max(100), replayId: z.string().max(100), impactId: z.string().max(100), consent: z.literal(true) }).strict();
export type ReleaseInput = z.infer<typeof releaseInput>;
const signoff = z.object({ reviewerId: id, at: date, digest: z.string().regex(/^[a-f0-9]{64}$/), reviewSnapshot: z.string().min(10).max(100000), note: text }).strict();
const releaseRecord = releaseInput.extend({ id, at: date, digest: z.string().regex(/^[a-f0-9]{64}$/), signoff: signoff.nullable(), state: z.enum(["Draft", "Demo signed off", "Revoked", "Rollback rehearsed"]) }).strict().superRefine((r,ctx) => {
 if (r.signoff && (r.signoff.digest !== r.digest || r.signoff.reviewerId === r.ownerId || r.signoff.reviewerId === r.agentOperatorId)) ctx.addIssue({ code: "custom", message: "Distinct signoff must match the exact artifact digest." });
 if (r.state === "Demo signed off" && !r.signoff) ctx.addIssue({ code: "custom", message: "Signoff is missing." });
});
export type ReleaseRecord = z.infer<typeof releaseRecord>;
export const trustStoreSchema = z.object({ version: z.literal(1), safety: z.array(safetyRecord).max(100), replays: z.array(replayRecord).max(100), impacts: z.array(impactRecord).max(100), releases: z.array(releaseRecord).max(100), events: z.array(z.object({ id, at: date, target: id, actorId: id, action: name })).max(500) }).strict().superRefine((s,ctx) => {
 for (const rows of [s.safety,s.replays,s.impacts,s.releases]) if (new Set(rows.map(r => r.id)).size !== rows.length) ctx.addIssue({ code: "custom", message: "Duplicate local record." });
 if (new Set(s.releases.map(r => `${r.codeId}@${r.version}`)).size !== s.releases.length) ctx.addIssue({ code: "custom", message: "A version cannot overwrite a preserved draft." });
 for (const r of s.releases) if ((r.safetyId && !s.safety.some(x => x.id === r.safetyId)) || (r.replayId && !s.replays.some(x => x.id === r.replayId)) || (r.impactId && !s.impacts.some(x => x.id === r.impactId))) ctx.addIssue({ code: "custom", message: "Linked local evidence missing." });
});
export type TrustStore = z.infer<typeof trustStoreSchema>;
export const emptyTrustStore: TrustStore = { version: 1, safety: [], replays: [], impacts: [], releases: [], events: [] };
export async function artifactDigest(artifact: string) { const bytes = new TextEncoder().encode(artifact); const hash = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join(""); }
const safeSample = (value: unknown) => { const flags = screenDebrief({ sample: JSON.stringify(value) }); if (flags.length) throw new Error(`Remove flagged sample content: ${flags.map(f => f.kind).join(", ")}. Pattern checks are incomplete; never submit private data.`); };
export type TrustCommand = { type: "safety"; input: unknown } | { type: "replay"; input: unknown } | { type: "impact"; input: unknown } | { type: "release"; input: unknown } | { type: "signoff"; releaseId: string; reviewerId: string; note: string; consent: boolean } | { type: "revoke" | "rollback"; releaseId: string; actorId: string; consent: boolean };
function releaseSnapshot(r: ReleaseRecord, s: TrustStore) { const { signoff: _signoff, state: _state, ...draft }=r; return JSON.stringify({ draft, safety:s.safety.find(x=>x.id===r.safetyId) ?? null, replay:s.replays.find(x=>x.id===r.replayId) ?? null, impact:s.impacts.find(x=>x.id===r.impactId) ?? null }); }
export async function applyTrustCommand(current: TrustStore, g: GenesisStore, command: TrustCommand, recordId: string, at: string) {
 const store = structuredClone(trustStoreSchema.parse(current)); date.parse(at); safeSample(command); let actorId = "", target = recordId;
 if (command.type === "safety" || command.type === "replay" || command.type === "impact") {
  const input = command.type === "safety" ? safetyInput.parse(command.input) : command.type === "replay" ? replayInput.parse(command.input) : impactInput.parse(command.input);
  const person = requireDemoIdentity(g,input.operatorId,"simulate_twins"); actorId = person.id;
  if (command.type === "safety") { if (person.kind === "Agent operator") throw new Error("Choose a declared human test operator, not an agent identity."); store.safety.push({ ...safetyInput.parse(input), id: recordId, at }); }
  if (command.type === "replay") store.replays.push({ ...replayInput.parse(input), id: recordId, at });
  if (command.type === "impact") store.impacts.push({ ...impactInput.parse(input), id: recordId, at });
 } else if (command.type === "release") {
  const input = releaseInput.parse(command.input); const owner = requireDemoIdentity(g,input.ownerId,"submit_capsules"); if (owner.kind === "Agent operator") throw new Error("A separately declared human owner is required.");
  if (input.agentOperatorId && requireDemoIdentity(g,input.agentOperatorId,"submit_capsules").kind !== "Agent operator") throw new Error("Select an operator-authorized agent declaration or leave it empty.");
  if (store.releases.some(r => r.codeId === input.codeId && r.version === input.version)) throw new Error("This version is preserved. Record a new version; never overwrite an approval.");
  actorId = owner.id; store.releases.push({ ...input, digest: await artifactDigest(input.artifact), id: recordId, at, signoff: null, state: "Draft" });
 } else {
  if (!command.consent) throw new Error("Explicit consent to this local rehearsal is required.");
  const r = store.releases.find(r => r.id === command.releaseId); if (!r) throw new Error("Release draft not found."); target = r.id;
  if (command.type === "signoff") {
   if (r.state !== "Draft") throw new Error("Only an unsigned local draft can receive a signoff.");
   requireDemoIdentity(g,r.ownerId,"submit_capsules"); if (r.agentOperatorId) requireDemoIdentity(g,r.agentOperatorId,"submit_capsules");
   const reviewer = requireDemoIdentity(g,command.reviewerId,"review_proposals"); if (reviewer.kind === "Agent operator" || reviewer.id === r.ownerId || reviewer.id === r.agentOperatorId) throw new Error("A distinct declared human reviewer is required.");
   if (r.license === "Unknown / permission required") throw new Error("Unknown license needs rights review before local signoff.");
   if (r.scenarioId && !r.safetyId) throw new Error("A robotics scenario requires its corresponding safety plan; hardware remains blocked.");
   if (r.safetyId) { const s = store.safety.find(s => s.id === r.safetyId); if (!s || !safetyAssessment(s).checklistComplete) throw new Error("Physical-safety plan is incomplete or escalated. No local signoff."); if (r.scenarioId !== s.scenarioId || roboticsScenarios.find(x=>x.id===s.scenarioId)?.contributionId !== r.codeId) throw new Error("Safety plan must match the declared scenario and its referenced code."); requireDemoIdentity(g,s.operatorId,"simulate_twins"); }
   if (r.replayId) { const replay = store.replays.find(x => x.id === r.replayId); if (!replay || replay.codeId !== r.codeId || replay.version !== r.version) throw new Error("Replay must reference the same code and version."); requireDemoIdentity(g,replay.operatorId,"simulate_twins"); }
   if (r.impactId) { const impact = store.impacts.find(x => x.id === r.impactId); if (!impact) throw new Error("Impact evidence missing."); requireDemoIdentity(g,impact.operatorId,"simulate_twins"); }
   if (await artifactDigest(r.artifact) !== r.digest) throw new Error("Artifact mismatch; local signoff blocked.");
   actorId = reviewer.id; r.signoff = { reviewerId: reviewer.id, digest:r.digest, reviewSnapshot:releaseSnapshot(r,store), at, note:text.parse(command.note) }; r.state = "Demo signed off";
  } else {
   const owner = requireDemoIdentity(g,command.actorId,"submit_capsules"); if (owner.id !== r.ownerId) throw new Error("Only the declared local owner can revoke or rehearse rollback.");
   if (r.state === "Rollback rehearsed" || (command.type === "revoke" && r.state === "Revoked")) throw new Error("This local action is already recorded.");
   if (command.type === "rollback" && (!r.previousVersion || !r.signoff || r.previousVersion === r.version)) throw new Error("Record a distinct prior version and preserved local signoff before rollback rehearsal.");
   actorId = owner.id; r.state = command.type === "revoke" ? "Revoked" : "Rollback rehearsed";
  }
 }
 store.events = [...store.events.slice(-499),{ id:recordId,at,target,actorId,action:`${command.type} · LOCAL DEMO` }];
 return trustStoreSchema.parse(store);
}
export function releaseState(r: ReleaseRecord, store: TrustStore, g: GenesisStore) {
 if (r.state === "Revoked" || r.state === "Rollback rehearsed") return r.state;
 const active = (id:string,scope:"submit_capsules"|"simulate_twins"|"review_proposals") => g.identities.some(p => p.id===id && p.state==="Active" && p.consent && p.scopes.includes(scope));
 if (!active(r.ownerId,"submit_capsules") || (r.agentOperatorId && !active(r.agentOperatorId,"submit_capsules")) || (r.signoff && !active(r.signoff.reviewerId,"review_proposals"))) return "Consent invalidated";
 const evidence=[r.safetyId ? store.safety.find(x=>x.id===r.safetyId) : null,r.replayId ? store.replays.find(x=>x.id===r.replayId) : null,r.impactId ? store.impacts.find(x=>x.id===r.impactId) : null];
 if (evidence.some(x=>x && !active(x.operatorId,"simulate_twins"))) return "Evidence consent invalidated";
 if (r.signoff && r.signoff.reviewSnapshot !== releaseSnapshot(r,store)) return "Artifact or evidence changed · signoff invalidated";
 return r.state;
}
export async function releasePassport(r: ReleaseRecord, store: TrustStore, g: GenesisStore) {
 return { mode:"LOCAL_DEMO", recordId:r.id, codeId:r.codeId, version:r.version, digest:r.digest, digestAlgorithm:"SHA-256", digestMatches:await artifactDigest(r.artifact)===r.digest, digestScope:"Exact sample text only; not a trusted build artifact", owner:g.identities.find(p=>p.id===r.ownerId)?.name ?? "Missing declaration", agentOperator:r.agentOperatorId ? g.identities.find(p=>p.id===r.agentOperatorId)?.name ?? "Missing declaration" : "No agent declared", license:r.license, dependencies:r.dependencies, tests:{ status:"DECLARED / NOT EXECUTED", description:r.testEvidence }, signoff:r.signoff, state:releaseState(r,store,g), rollback:{ plan:r.rollback, previousVersion:r.previousVersion || null, localState:r.state, actuallyExecuted:false, verified:false }, safety:r.safetyId ? safetyAssessment(store.safety.find(s=>s.id===r.safetyId)) : null, linkedReplay:r.replayId || null, linkedImpact:r.impactId || null, audit:store.events.filter(e=>e.target===r.id), storage:"BROWSER_LOCAL_EDITABLE", authenticated:false, signature:null, tamperEvident:false, independentTests:"NOT_RUN", guardianSignoff:"NOT_VERIFIED", supportedDevices:[], deploymentAllowed:false, hardwareAllowed:false };
}