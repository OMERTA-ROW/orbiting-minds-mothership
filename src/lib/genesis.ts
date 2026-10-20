import { z } from "zod";
import { genesisChallenges, genesisDomains, genesisRoles, genesisScopes, codeContributions } from "@/data/evolution";

const name = z.string().trim().min(2).max(80);
const detail = z.string().trim().min(10).max(4000);
const id = z.string().min(1).max(100);
const date = z.string().datetime();
export const identityInput = z.object({ name, kind: z.enum(["Human", "Developer", "Agent operator"]), agentName: z.string().trim().max(80), role: z.enum(genesisRoles), scopes: z.array(z.enum(genesisScopes)).min(1).max(3), consent: z.literal(true), spendCapUsd: z.literal(0) }).superRefine((value, ctx) => {
  if (value.kind === "Agent operator" && value.agentName.length < 2) ctx.addIssue({ code: "custom", path: ["agentName"], message: "Name the agent and its responsible human operator." });
});
const identitySchema = z.object({ id, name, kind: z.enum(["Human", "Developer", "Agent operator"]), agentName: z.string().max(80), role: z.enum(genesisRoles), scopes: z.array(z.enum(genesisScopes)).min(1).max(3), consent: z.literal(true), spendCapUsd: z.literal(0), state: z.enum(["Active", "Revoked"]), createdAt: date });
export const challengeInput = z.object({ title: z.string().trim().min(5).max(140), domain: z.enum(genesisDomains), problem: detail, acceptance: detail, visibility: z.enum(["Open", "Private"]), bountyUsd: z.number().finite().min(0).max(1000000).nullable(), ownerId: id });
const challengeSchema = challengeInput.extend({ id, ownerId: id.nullable(), ownerName: name, funding: z.literal("DEMO_PROPOSAL"), state: z.enum(["Open", "Closed"]), createdAt: date, demo: z.literal(true), contributionId: z.string().optional() });
const source = z.string().url().max(1000).refine((url) => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; } }, "Use a public HTTPS evidence link; no credentials.");
export const capsuleInput = z.object({ challengeId: id, identityId: id, title: z.string().trim().min(5).max(140), explanation: detail, code: z.string().max(20000), sourceUrl: source.or(z.literal("")), license: z.enum(["MIT", "Apache-2.0", "CC-BY-4.0", "Proprietary / permission required", "Unknown"]), dependencies: detail, testPlan: detail, rollback: detail, rightsConfirmed: z.literal(true), contributionId: z.string().refine((value) => value === "" || codeContributions.some((item) => item.id === value)) }).refine((value) => value.code.trim().length >= 10 || value.sourceUrl.length > 0 || value.contributionId.length > 0, "Include documented code, a cited source, or a Code Exchange reference.");
const capsuleSchema = z.object({ id, challengeId: id, identityId: id, title: z.string().max(140), explanation: detail, code: z.string().max(20000), sourceUrl: source.or(z.literal("")), license: z.enum(["MIT", "Apache-2.0", "CC-BY-4.0", "Proprietary / permission required", "Unknown"]), dependencies: detail, testPlan: detail, rollback: detail, rightsConfirmed: z.literal(true), contributionId: z.string(), createdAt: date, state: z.enum(["Submitted", "Simulated", "Changes requested", "Demo approved", "Demo listed"]) });
export const twinInput = z.object({ capsuleId: id, runnerId: id, baselineMs: z.number().finite().min(1).max(100000), targetMs: z.number().finite().min(1).max(100000), workload: z.number().int().min(1).max(1000), efficiencyPercent: z.number().finite().min(0).max(50) });
const twinSchema = twinInput.extend({ id, createdAt: date, resultMs: z.number().finite(), outcome: z.enum(["Within target", "Exceeds target"]), evidenceKind: z.literal("SIMULATION"), model: z.literal("synthetic-latency-v1"), submittedCodeExecuted: z.literal(false), hardwareEvidence: z.literal(false) });
export const decisionInput = z.object({ capsuleId: id, reviewerId: id, decision: z.enum(["Request changes", "Demo approve"]), note: detail });
const decisionSchema = decisionInput.extend({ id, createdAt: date, twinId: id.nullable(), mode: z.literal("DEMO") });
const eventSchema = z.object({ id, createdAt: date, actor: name, action: z.string().max(160), targetId: id });
const nodeSchema = z.object({ id, ownerId: id, label: name, cpu: z.number().int().min(1).max(16), memoryMb: z.number().int().min(128).max(4096), consent: z.literal(true), spendCapUsd: z.literal(0), state: z.enum(["Opted in locally", "Revoked"]), createdAt: date });
export const computeInput = nodeSchema.omit({ id: true, state: true, createdAt: true });
export const genesisStoreSchema = z.object({ version: z.literal(1), identities: z.array(identitySchema).max(100), challenges: z.array(challengeSchema).max(100), capsules: z.array(capsuleSchema).max(300), twins: z.array(twinSchema).max(500), decisions: z.array(decisionSchema).max(500), events: z.array(eventSchema).max(1000), nodes: z.array(nodeSchema).max(100) });
export type GenesisStore = z.infer<typeof genesisStoreSchema>;
export type Identity = GenesisStore["identities"][number];
export type Challenge = GenesisStore["challenges"][number];
export type Capsule = GenesisStore["capsules"][number];
export const emptyGenesisStore: GenesisStore = { version: 1, identities: [], challenges: genesisChallenges.map((item) => ({ ...item })), capsules: [], twins: [], decisions: [], events: [], nodes: [] };
export function readGenesisStore(raw: string | null): GenesisStore {
  try { const parsed = genesisStoreSchema.safeParse(JSON.parse(raw ?? "null")); return parsed.success ? parsed.data : structuredClone(emptyGenesisStore); } catch { return structuredClone(emptyGenesisStore); }
}
export type GenesisCommand =
  | { type: "identity"; input: z.input<typeof identityInput> }
  | { type: "revoke"; identityId: string }
  | { type: "challenge"; input: z.input<typeof challengeInput> }
  | { type: "close"; challengeId: string; actorId: string }
  | { type: "capsule"; input: z.input<typeof capsuleInput> }
  | { type: "twin"; input: z.input<typeof twinInput> }
  | { type: "decision"; input: z.input<typeof decisionInput> }
  | { type: "list"; capsuleId: string; actorId: string }
  | { type: "node"; input: z.input<typeof computeInput> }
  | { type: "revokeNode"; nodeId: string; actorId: string };
// Local workflow gates are validation only, NOT authentication or security boundaries.
export function requireDemoIdentity(store: GenesisStore, identityId: string, scope?: typeof genesisScopes[number]) {
  const person = store.identities.find((item) => item.id === identityId);
  if (!person || person.state !== "Active" || !person.consent) throw new Error("Select an active, opted-in local identity in Agent Embassy.");
  if (scope && !person.scopes.includes(scope)) throw new Error(`This demo identity has not opted into ${scope}.`);
  return person;
}
export function applyGenesisCommand(current: GenesisStore, command: GenesisCommand, recordId: string, createdAt: string): GenesisStore {
  const store = structuredClone(genesisStoreSchema.parse(current));
  let actor = "Local demo participant"; let action = ""; let targetId = recordId;
  const capsuleFor = (capsuleId: string) => { const capsule = store.capsules.find((item) => item.id === capsuleId); if (!capsule) throw new Error("Capsule not found."); return capsule; };
  switch (command.type) {
    case "identity": { const data = identityInput.parse(command.input); store.identities.push({ ...data, id: recordId, createdAt, state: "Active" }); actor = data.name; action = "Declared local demo identity"; break; }
    case "revoke": { const person = requireDemoIdentity(store, command.identityId); person.state = "Revoked"; store.nodes.filter((node) => node.ownerId === person.id).forEach((node) => { node.state = "Revoked"; }); store.capsules.forEach((capsule) => { const latestDecision = store.decisions.filter((decision) => decision.capsuleId === capsule.id).at(-1); if ((capsule.identityId === person.id || latestDecision?.reviewerId === person.id) && (capsule.state === "Demo approved" || capsule.state === "Demo listed")) capsule.state = "Changes requested"; }); actor = person.name; action = "Revoked local identity and node consent"; targetId = person.id; break; }
    case "challenge": { const data = challengeInput.parse(command.input); const person = requireDemoIdentity(store, data.ownerId); store.challenges.push({ ...data, id: recordId, ownerName: person.name, funding: "DEMO_PROPOSAL", state: "Open", createdAt, demo: true }); actor = person.name; action = "Proposed technical challenge · no funded bounty"; break; }
    case "close": { const person = requireDemoIdentity(store, command.actorId); const challenge = store.challenges.find((item) => item.id === command.challengeId); if (!challenge || challenge.ownerId !== person.id) throw new Error("Only the local challenge creator can close it. Real moderation is unconfigured."); challenge.state = "Closed"; actor = person.name; action = "Closed local challenge"; targetId = challenge.id; break; }
    case "capsule": { const data = capsuleInput.parse(command.input); const person = requireDemoIdentity(store, data.identityId, "submit_capsules"); const challenge = store.challenges.find((item) => item.id === data.challengeId); if (!challenge || challenge.state !== "Open") throw new Error("Challenge is not open for submissions."); store.capsules.push({ ...data, id: recordId, createdAt, state: "Submitted" }); actor = person.name; action = "Submitted documented demo capsule"; break; }
    case "twin": { const data = twinInput.parse(command.input); const person = requireDemoIdentity(store, data.runnerId, "simulate_twins"); const capsule = capsuleFor(data.capsuleId); requireDemoIdentity(store, capsule.identityId); const resultMs = Math.round(data.baselineMs * data.workload * (1 - data.efficiencyPercent / 100) * 100) / 100; store.twins.push({ ...data, id: recordId, createdAt, resultMs, outcome: resultMs <= data.targetMs ? "Within target" : "Exceeds target", evidenceKind: "SIMULATION", model: "synthetic-latency-v1", submittedCodeExecuted: false, hardwareEvidence: false }); capsule.state = "Simulated"; actor = person.name; action = "Ran synthetic twin model · not capsule code"; targetId = capsule.id; break; }
    case "decision": { const data = decisionInput.parse(command.input); const person = requireDemoIdentity(store, data.reviewerId, "review_proposals"); const capsule = capsuleFor(data.capsuleId); requireDemoIdentity(store, capsule.identityId); if (person.id === capsule.identityId) throw new Error("A distinct local reviewer identity is required. Neither identity is authenticated."); const twin = store.twins.filter((item) => item.capsuleId === capsule.id).at(-1); if (data.decision === "Demo approve" && (!twin || twin.outcome !== "Within target" || capsule.license === "Unknown" || capsule.license === "Proprietary / permission required")) throw new Error("Demo approval requires a within-target simulation and a declared reusable license; no certification is issued."); store.decisions.push({ ...data, id: recordId, createdAt, twinId: twin?.id ?? null, mode: "DEMO" }); capsule.state = data.decision === "Demo approve" ? "Demo approved" : "Changes requested"; actor = person.name; action = `${data.decision} · no real release approval`; targetId = capsule.id; break; }
    case "list": { const person = requireDemoIdentity(store, command.actorId, "submit_capsules"); const capsule = capsuleFor(command.capsuleId); if (capsule.identityId !== person.id || capsule.state !== "Demo approved") throw new Error("Only the submitting identity can list a demo-approved capsule."); const latestDecision = store.decisions.filter((item) => item.capsuleId === capsule.id).at(-1); if (!latestDecision || latestDecision.decision !== "Demo approve") throw new Error("Demo reviewer approval is missing."); requireDemoIdentity(store, latestDecision.reviewerId, "review_proposals"); capsule.state = "Demo listed"; actor = person.name; action = "Prepared demo marketplace listing · USD TBD / no payout"; targetId = capsule.id; break; }
    case "node": { const data = computeInput.parse(command.input); const person = requireDemoIdentity(store, data.ownerId, "simulate_twins"); store.nodes.push({ ...data, id: recordId, createdAt, state: "Opted in locally" }); actor = person.name; action = "Declared local compute node · no machine connected"; break; }
    case "revokeNode": { const person = requireDemoIdentity(store, command.actorId); const node = store.nodes.find((item) => item.id === command.nodeId); if (!node || node.ownerId !== person.id) throw new Error("Only the local node creator can revoke it."); node.state = "Revoked"; actor = person.name; action = "Revoked local compute node"; targetId = node.id; break; }
  }
  store.events = [...store.events.slice(-999), { id: recordId, createdAt, actor, action, targetId }];
  return genesisStoreSchema.parse(store);
}
export function filterChallenges(store: GenesisStore, query: string, domain: string, state: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return store.challenges.filter((item) => (!domain || item.domain === domain) && (!state || item.state === state) && words.every((word) => `${item.title} ${item.problem} ${item.acceptance} ${item.domain}`.toLowerCase().includes(word)));
}
export function trustAssessment(store: GenesisStore, capsule: Capsule) {
  const latest = store.twins.filter((item) => item.capsuleId === capsule.id).at(-1);
  return { certification: "NOT_CERTIFIED" as const, provenance: "SELF_DECLARED", license: capsule.license, simulation: latest?.outcome ?? "Not run", hardware: "NO_HARDWARE_EVIDENCE", decision: capsule.state, releaseAllowed: false as const, paymentsAllowed: false as const };
}
export function genesisPackage(store: GenesisStore, capsule: Capsule) {
  return { schemaVersion: "1.0.0", mode: "DEMO", capsuleId: capsule.id, version: "0.1.0", checksum: "DEMO_NOT_COMPUTED", signature: null, license: capsule.license, dependencies: capsule.dependencies, rollback: capsule.rollback, assessment: trustAssessment(store, capsule), tests: store.twins.filter((item) => item.capsuleId === capsule.id), approval: "PENDING_AUTHENTICATED_OWNER_APPROVAL", distribution: "DISABLED", reward: { currency: "USD", price: "TBD", funded: false, payout: null } };
}