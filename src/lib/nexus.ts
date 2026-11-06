import { z } from "zod";
import { nexusProjects, nexusAgents } from "@/data/evolution";
import { requireDemoIdentity, type GenesisStore } from "./genesis";
import { screenDebrief } from "./incident-screening";
import { diffLines } from "diff";
const id = z.string().min(1).max(100),
  text = z.string().trim().min(5).max(4000);
export const nexusAgentId = z.enum(["openai", "anthropic", "adapter"]);
export type NexusAgentId = z.infer<typeof nexusAgentId>;
const source = z
  .string()
  .max(20000)
  .refine((v) => v.split("\n").length <= 400, "At most 400 lines of sample code.");
export const nexusPolicy = z
  .object({
    agentId: nexusAgentId,
    enabled: z.boolean(),
    includeContext: z.boolean(),
    maxInputTokens: z.number().int().min(1).max(100000),
    maxOutputTokens: z.number().int().min(1).max(100000),
    inputUsdPerMillion: z.number().finite().min(0).max(10000).nullable(),
    outputUsdPerMillion: z.number().finite().min(0).max(10000).nullable(),
    budgetUsd: z.number().finite().min(0).max(10000),
    consent: z.boolean(),
  })
  .strict();
const message = z
  .object({
    id,
    at: z.string().datetime(),
    actorId: id,
    projectId: id,
    channel: z.enum(["shared", "openai", "anthropic", "adapter"]),
    body: text,
    context: z.string().max(4000),
    mode: z.literal("LOCAL_NOTE"),
  })
  .strict();
const review = z
  .object({
    actorId: id,
    note: text,
    candidate: source,
    baseVersion: z.number().int().min(1),
    at: z.string().datetime(),
  })
  .strict();
const task = z
  .object({
    id,
    projectId: id,
    agentId: nexusAgentId,
    ownerId: id,
    prompt: text,
    context: z.string().max(4000),
    base: source,
    baseVersion: z.number().int().min(1),
    candidate: source,
    testPlan: z.string().max(4000),
    state: z.enum([
      "Draft",
      "Review requested",
      "Approved DEMO",
      "Changes requested",
      "Merged locally",
      "Cancelled",
    ]),
    review: review.nullable(),
    at: z.string().datetime(),
  })
  .strict();
const project = z
  .object({
    id,
    name: z.string().max(80),
    context: z.string().max(4000),
    file: z.string().max(80),
    source,
    version: z.number().int().min(1),
    history: z
      .array(
        z.object({
          source,
          version: z.number().int().min(1),
          taskId: id,
          at: z.string().datetime(),
        }),
      )
      .max(100),
    policies: z.array(nexusPolicy).length(3),
  })
  .strict();
export const nexusStoreSchema = z
  .object({
    version: z.literal(1),
    projects: z.array(project).length(3),
    messages: z.array(message).max(600),
    tasks: z.array(task).max(300),
    paused: z.boolean(),
    events: z
      .array(
        z.object({ id, projectId: id, at: z.string().datetime(), action: z.string().max(160) }),
      )
      .max(1000),
  })
  .strict()
  .superRefine((s, c) => {
    if (
      new Set(s.projects.map((p) => p.id)).size !== 3 ||
      s.projects.some(
        (p) =>
          !nexusProjects.some((f) => f.id === p.id) ||
          new Set(p.policies.map((v) => v.agentId)).size !== 3,
      )
    )
      c.addIssue({ code: "custom", message: "Unknown or duplicate project/policy" });
    if (
      new Set(s.tasks.map((t) => t.id)).size !== s.tasks.length ||
      s.tasks.some((t) => !s.projects.some((p) => p.id === t.projectId)) ||
      s.messages.some((m) => !s.projects.some((p) => p.id === m.projectId))
    )
      c.addIssue({ code: "custom", message: "Invalid project-bound records" });
  });
export type NexusStore = z.infer<typeof nexusStoreSchema>;
export type NexusTask = NexusStore["tasks"][number];
export const initialNexusStore: NexusStore = {
  version: 1,
  projects: nexusProjects.map((p) => ({
    id: p.id,
    name: p.name,
    context: p.context,
    file: p.file,
    source: p.source,
    version: 1,
    history: [],
    policies: nexusAgents.map((a) => ({
      agentId: a.id,
      enabled: false,
      includeContext: false,
      maxInputTokens: 2000,
      maxOutputTokens: 1000,
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      budgetUsd: 0,
      consent: false,
    })),
  })),
  messages: [],
  tasks: [],
  paused: false,
  events: [],
};
export const readNexusStore = (raw: string | null) =>
  raw === null ? structuredClone(initialNexusStore) : nexusStoreSchema.parse(JSON.parse(raw));
export function estimateNexusCost(p: z.infer<typeof nexusPolicy>) {
  const v = nexusPolicy.parse(p);
  if (v.inputUsdPerMillion === null || v.outputUsdPerMillion === null) return null;
  return (
    (v.maxInputTokens * v.inputUsdPerMillion + v.maxOutputTokens * v.outputUsdPerMillion) / 1000000
  );
}
export function inspectNexusDraft(t: NexusTask) {
  const diff = diffLines(t.base, t.candidate);
  const added = diff
    .filter((v) => v.added)
    .map((v) => v.value)
    .join("\n");
  const flags: string[] = screenDebrief({ candidate: t.candidate }).map((f) => f.kind);
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(t.candidate)) flags.push("Unresolved conflict markers");
  if (
    /\b(eval|exec|fetch|spawn|system|subprocess|child_process|os\.system)\b|\bcurl\b|\bsudo\b|\brm\s+-/.test(
      added,
    )
  )
    flags.push("Extra command / network pattern");
  return { diff, flags, executed: false as const, securityVerified: false as const };
}
export type NexusCommand =
  | { type: "policy"; projectId: string; policy: z.infer<typeof nexusPolicy> }
  | {
      type: "message";
      projectId: string;
      actorId: string;
      body: string;
      targets: NexusAgentId[];
      shared: boolean;
      consent: boolean;
    }
  | { type: "edit"; projectId: string; taskId: string; candidate: string; testPlan: string }
  | { type: "requestReview"; projectId: string; taskId: string }
  | {
      type: "review";
      projectId: string;
      taskId: string;
      reviewerId: string;
      note: string;
      approve: boolean;
      consent: boolean;
    }
  | { type: "merge"; projectId: string; taskId: string; actorId: string; consent: boolean }
  | { type: "rebase" | "cancel"; projectId: string; taskId: string }
  | { type: "pause"; paused: boolean };
export function applyNexusCommand(
  current: NexusStore,
  g: GenesisStore,
  command: NexusCommand,
  recordId: string,
  at: string,
): NexusStore {
  const s = structuredClone(nexusStoreSchema.parse(current));
  z.string().datetime().parse(at);
  id.parse(recordId);
  if (command.type === "pause") {
    s.paused = command.paused;
    return nexusStoreSchema.parse(s);
  }
  const p = s.projects.find((v) => v.id === command.projectId);
  if (!p) throw new Error("Unknown demo project");
  if (command.type === "policy") {
    const v = nexusPolicy.parse(command.policy);
    if (v.agentId === "adapter" && v.enabled)
      throw new Error("Third-party / Atlas adapter is unidentified and disabled.");
    if (v.enabled && !v.consent) throw new Error("Explicit opt-in planning consent required.");
    p.policies = p.policies.map((x) => (x.agentId === v.agentId ? v : x));
    if (!v.enabled || !v.consent)
      s.tasks
        .filter(
          (t) =>
            t.projectId === p.id &&
            t.agentId === v.agentId &&
            t.state !== "Merged locally" &&
            t.state !== "Cancelled",
        )
        .forEach((t) => {
          t.review = null;
          t.state = "Draft";
        });
  } else if (command.type === "message") {
    if (s.paused) throw new Error("Nexus is paused locally.");
    requireDemoIdentity(g, command.actorId, "submit_capsules");
    if (!command.consent) throw new Error("Consent to local sample storage required.");
    const body = text.parse(command.body);
    if (screenDebrief({ body }).length)
      throw new Error(
        "Possible sensitive or unsafe text. Use scrubbed fictional samples; screening is incomplete.",
      );
    const targets = z.array(nexusAgentId).max(3).parse(command.targets);
    if (new Set(targets).size !== targets.length) throw new Error("Duplicate targets");
    if (!targets.length && !command.shared)
      throw new Error("Select an explicit target or shared project note.");
    for (const target of targets) {
      const policy = p.policies.find((v) => v.agentId === target);
      if (!policy?.enabled || !policy.consent || target === "adapter")
        throw new Error("Target planning permission is off; no providers are connected.");
    }
    if (command.shared)
      s.messages.push({
        id: recordId + "-shared",
        at,
        actorId: command.actorId,
        projectId: p.id,
        channel: "shared",
        body,
        context: "",
        mode: "LOCAL_NOTE",
      });
    targets.forEach((target) => {
      const policy = p.policies.find((v) => v.agentId === target);
      const context = policy?.includeContext ? p.context : "";
      s.messages.push({
        id: recordId + "-" + target,
        at,
        actorId: command.actorId,
        projectId: p.id,
        channel: target,
        body,
        context,
        mode: "LOCAL_NOTE",
      });
      s.tasks.push({
        id: recordId + "-" + target,
        at,
        projectId: p.id,
        agentId: target,
        ownerId: command.actorId,
        prompt: body,
        context,
        base: p.source,
        baseVersion: p.version,
        candidate: p.source,
        testPlan: "",
        state: "Draft",
        review: null,
      });
    });
  } else {
    const t = s.tasks.find((v) => v.id === command.taskId && v.projectId === p.id);
    if (!t) throw new Error("Task not found in this project.");
    if (t.state === "Cancelled" || t.state === "Merged locally")
      throw new Error("Finalized task is read-only.");
    requireDemoIdentity(g, t.ownerId, "submit_capsules");
    if (command.type === "cancel") {
      t.state = "Cancelled";
      t.review = null;
    } else {
      if (s.paused) throw new Error("Nexus is paused locally.");
      const policy = p.policies.find((v) => v.agentId === t.agentId);
      if (!policy?.enabled || !policy.consent) throw new Error("Task planning scope revoked.");
      if (command.type === "edit") {
        t.candidate = source.parse(command.candidate);
        t.testPlan = z.string().max(4000).parse(command.testPlan);
        if (
          screenDebrief({ candidate: t.candidate, testPlan: t.testPlan }).some(
            (v) => v.kind.includes("credential") || v.kind.includes("PII"),
          )
        )
          throw new Error("Do not save possible credentials or personal data.");
        t.state = "Draft";
        t.review = null;
      }
      if (command.type === "rebase") {
        t.base = p.source;
        t.baseVersion = p.version;
        t.state = "Draft";
        t.review = null;
      }
      if (command.type === "requestReview") {
        if (t.baseVersion !== p.version || t.base !== p.source)
          throw new Error("Stale base: inspect concurrent changes and rebase before review.");
        if (t.candidate === t.base) throw new Error("No change to review.");
        text.parse(t.testPlan);
        if (inspectNexusDraft(t).flags.length)
          throw new Error("Resolve Guardian reference warnings before review.");
        t.state = "Review requested";
        t.review = null;
      }
      if (command.type === "review") {
        if (t.state !== "Review requested") throw new Error("Request review first.");
        if (!command.consent) throw new Error("Explicit review consent required.");
        const reviewer = requireDemoIdentity(g, command.reviewerId, "review_proposals");
        if (reviewer.kind === "Agent operator" || reviewer.id === t.ownerId)
          throw new Error("Use a distinct opted-in human reviewer.");
        if (t.baseVersion !== p.version || t.base !== p.source)
          throw new Error("Stale base needs fresh review.");
        if (inspectNexusDraft(t).flags.length) throw new Error("Resolve reference warnings first.");
        const note = text.parse(command.note);
        if (screenDebrief({ note }).length)
          throw new Error("Use a scrubbed non-sensitive review note.");
        t.review = {
          actorId: reviewer.id,
          note,
          candidate: t.candidate,
          baseVersion: t.baseVersion,
          at,
        };
        t.state = command.approve ? "Approved DEMO" : "Changes requested";
      }
      if (command.type === "merge") {
        if (!command.consent || command.actorId !== t.ownerId)
          throw new Error("Owner confirmation required for local merge.");
        requireDemoIdentity(g, command.actorId, "submit_capsules");
        const r = t.review;
        if (
          t.state !== "Approved DEMO" ||
          !r ||
          r.candidate !== t.candidate ||
          r.baseVersion !== t.baseVersion
        )
          throw new Error("Fresh human review required.");
        const reviewer = requireDemoIdentity(g, r.actorId, "review_proposals");
        if (reviewer.kind === "Agent operator" || reviewer.id === t.ownerId)
          throw new Error("Distinct human review required.");
        if (t.baseVersion !== p.version || t.base !== p.source)
          throw new Error("Concurrent change conflict: rebase and review; nothing overwritten.");
        if (inspectNexusDraft(t).flags.length) throw new Error("Resolve warnings first.");
        p.history.push({ source: p.source, version: p.version, taskId: t.id, at });
        p.source = t.candidate;
        p.version += 1;
        t.state = "Merged locally";
      }
    }
  }
  s.events.push({ id: recordId, projectId: p.id, at, action: command.type + " · local DEMO" });
  return nexusStoreSchema.parse(s);
}
