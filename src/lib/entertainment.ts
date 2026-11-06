import { z } from "zod";
import {
  entertainmentStudios,
  entertainmentTemplates,
  entertainmentAdapters,
  nexusProjects,
} from "@/data/evolution";

const studioId = z.enum(["film", "music", "video", "camera", "virtual", "crucible"]);
const worldId = z
  .string()
  .refine((v) => nexusProjects.some((p) => p.id === v), "Unknown or excluded world");
const sampleText = (min = 0, max = 1000) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        !/(cyber[\s_-]*link|sk-[a-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+)/i.test(
          v,
        ),
      "Excluded project or possible credentials; use non-sensitive fictional samples only",
    );
export const creativeRoles = [
  "Human creator",
  "Local template planner",
  "OpenAI reference · NOT CONNECTED",
  "Anthropic reference · NOT CONNECTED",
] as const;
const stepSchema = z.object({
  id: z.string(),
  title: sampleText(3, 160),
  shot: sampleText(3, 500),
  duration: z.number().int().min(1).max(120),
  role: z.enum(creativeRoles),
  status: z.enum(["Proposed", "Reviewed DEMO", "Skipped DEMO"]),
  capability: z.string(),
  scopes: z.array(z.string()),
  affected: z.array(z.string()),
  test: z.string(),
  executionAllowed: z.literal(false),
  evidence: z.literal("NOT RUN"),
});
const draftSchema = z.object({
  goal: sampleText(10, 2000),
  credit: sampleText(2, 120),
  rights: sampleText(10, 600),
  destination: z.enum(["No distribution", "Unselected third-party platform"]),
  steps: z.array(stepSchema).length(3),
});
const reviewSchema = z.object({
  reviewer: sampleText(2, 80),
  at: z.string().datetime(),
  revision: z.number().int().positive(),
  rights: z.literal(true),
  privacy: z.literal(true),
  publicationIntent: z.boolean(),
});
const planSchema = draftSchema
  .extend({
    id: z.string(),
    worldId,
    studioId,
    createdAt: z.string().datetime(),
    revision: z.number().int().positive(),
    state: z.enum(["Proposed", "Reviewed DEMO", "Withdrawn"]),
    review: reviewSchema.nullable(),
    checkpoints: z
      .array(
        z.object({
          revision: z.number().int().positive(),
          at: z.string().datetime(),
          draft: draftSchema,
        }),
      )
      .min(1)
      .max(20),
    executionAllowed: z.literal(false),
    publicationAllowed: z.literal(false),
    providerCalls: z.literal(0),
    signature: z.null(),
  })
  .superRefine((p, ctx) => {
    const s = entertainmentStudios.find((v) => v.id === p.studioId);
    if (!s) return;
    p.steps.forEach((v, i) => {
      if (
        v.id !== `shot-${i + 1}` ||
        v.capability !== s.steps[i] ||
        JSON.stringify(v.scopes) !== JSON.stringify(s.scopes) ||
        JSON.stringify(v.affected) !== JSON.stringify(s.files) ||
        v.test !== s.checks[i % 2]
      )
        ctx.addIssue({ code: "custom", message: "Changed capability boundary" });
    });
    if (
      p.state === "Reviewed DEMO" &&
      (!p.review ||
        p.review.revision !== p.revision ||
        (p.destination !== "No distribution" && !p.review.publicationIntent) ||
        p.steps.some((v) => v.status === "Proposed"))
    )
      ctx.addIssue({ code: "custom", message: "Review does not bind current plan" });
    if (p.state !== "Reviewed DEMO" && p.review !== null)
      ctx.addIssue({ code: "custom", message: "Invalid review state" });
    const last = p.checkpoints.at(-1);
    if (
      last?.revision !== p.revision ||
      JSON.stringify(last.draft) !== JSON.stringify(draftSchema.parse(p))
    )
      ctx.addIssue({ code: "custom", message: "Current checkpoint mismatch" });
  });
export const entertainmentStoreSchema = z
  .object({
    version: z.literal(1),
    plans: z.array(planSchema).max(40),
    events: z
      .array(
        z.object({
          planId: z.string(),
          worldId,
          at: z.string().datetime(),
          action: z.enum(["Proposed", "Edited", "Restored", "Reviewed DEMO", "Withdrawn"]),
          revision: z.number().int().positive(),
        }),
      )
      .max(200),
  })
  .superRefine((s, c) => {
    if (new Set(s.plans.map((p) => p.id)).size !== s.plans.length)
      c.addIssue({ code: "custom", message: "Duplicate plans" });
  });
export type CreativePlan = z.infer<typeof planSchema>;
export type CreativeStep = z.infer<typeof stepSchema>;
export type CreativeStore = z.infer<typeof entertainmentStoreSchema>;
export type StudioId = z.infer<typeof studioId>;
export const initialCreativeStore: CreativeStore = { version: 1, plans: [], events: [] };
export function readCreativeStore(raw: string | null): CreativeStore {
  return raw === null
    ? structuredClone(initialCreativeStore)
    : entertainmentStoreSchema.parse(JSON.parse(raw));
}
export function creativeSeed(templateId: string) {
  const t = entertainmentTemplates.find((v) => v.id === templateId);
  if (!t) throw new Error("Unknown template");
  return {
    goal: t.goal,
    studioId: t.studio as StudioId,
    credit: "Fictional Evolution creator",
    rights: t.rights,
  };
}
export type CreativeInput = {
  worldId: string;
  studioId: StudioId;
  goal: string;
  credit: string;
  rights: string;
  destination: "No distribution" | "Unselected third-party platform";
  consent: boolean;
};
export type CreativeCommand =
  | { type: "propose"; input: CreativeInput }
  | {
      type: "edit";
      planId: string;
      worldId: string;
      stepId: string;
      patch: Pick<CreativeStep, "title" | "shot" | "duration" | "role" | "status">;
    }
  | {
      type: "review";
      planId: string;
      worldId: string;
      reviewer: string;
      scopes: string[];
      rights: boolean;
      privacy: boolean;
      publicationIntent: boolean;
    }
  | { type: "restore"; planId: string; worldId: string; revision: number }
  | { type: "withdraw"; planId: string; worldId: string };
export function applyCreativeCommand(
  store: CreativeStore,
  command: CreativeCommand,
  id: string,
  at: string,
  paused: boolean,
): CreativeStore {
  const next = structuredClone(entertainmentStoreSchema.parse(store));
  z.string().datetime().parse(at);
  if (command.type !== "withdraw" && paused)
    throw new Error("Guardian or Nexus local planning is paused");
  let p: CreativePlan;
  let action: z.infer<typeof entertainmentStoreSchema>["events"][number]["action"];
  if (command.type === "propose") {
    if (command.input.consent !== true)
      throw new Error("Consent required for non-sensitive browser-local DEMO storage");
    if (next.plans.length >= 40)
      throw new Error("Local plan capacity reached; export your records");
    const sid = studioId.parse(command.input.studioId);
    const s = entertainmentStudios.find((v) => v.id === sid);
    if (!s) throw new Error("Unknown studio");
    const draft = draftSchema.parse({
      ...command.input,
      steps: s.steps.map((title, i) => ({
        id: `shot-${i + 1}`,
        title,
        shot: [
          "Establish the fictional lunar setting and source-rights boundary.",
          "Develop the creative beat with original, non-sensitive sample assets.",
          "Resolve the sequence; review QA and delivery without publication.",
        ][i],
        duration: 10,
        role: "Human creator",
        status: "Proposed",
        capability: title,
        scopes: [...s.scopes],
        affected: [...s.files],
        test: s.checks[i % 2],
        executionAllowed: false,
        evidence: "NOT RUN",
      })),
    });
    p = planSchema.parse({
      ...draft,
      id,
      worldId: worldId.parse(command.input.worldId),
      studioId: sid,
      createdAt: at,
      revision: 1,
      state: "Proposed",
      review: null,
      checkpoints: [{ revision: 1, at, draft }],
      executionAllowed: false,
      publicationAllowed: false,
      providerCalls: 0,
      signature: null,
    });
    next.plans.push(p);
    action = "Proposed";
  } else {
    const index = next.plans.findIndex(
      (p) => p.id === command.planId && p.worldId === command.worldId,
    );
    const existing = next.plans[index];
    if (!existing) throw new Error("Plan not found in this world");
    p = existing;
    if (existing.state === "Withdrawn") throw new Error("Withdrawn plans cannot change");
    if (command.type === "withdraw") {
      p = { ...p, state: "Withdrawn", review: null };
      action = "Withdrawn";
    } else if (command.type === "review") {
      if (p.state !== "Proposed") throw new Error("Only proposed plans can be reviewed");
      if (!command.rights || !command.privacy)
        throw new Error("Rights and privacy declarations are required");
      if (p.destination !== "No distribution" && !command.publicationIntent)
        throw new Error("Separate human publication-intent confirmation required");
      if (p.steps.some((s) => s.status === "Proposed"))
        throw new Error("Review or skip every process first");
      if (p.steps.flatMap((s) => s.scopes).some((scope) => !command.scopes.includes(scope)))
        throw new Error("Review all required scopes; no permissions granted");
      p = {
        ...p,
        state: "Reviewed DEMO",
        review: reviewSchema.parse({
          reviewer: command.reviewer,
          at,
          revision: p.revision,
          rights: true,
          privacy: true,
          publicationIntent: command.publicationIntent,
        }),
      };
      action = "Reviewed DEMO";
    } else if (command.type === "edit" || command.type === "restore") {
      if (p.checkpoints.length >= 20)
        throw new Error("Local checkpoint capacity reached; export before starting a new plan");
      let draft = draftSchema.parse(p);
      if (command.type === "edit") {
        const i = p.steps.findIndex((s) => s.id === command.stepId);
        const step = p.steps[i];
        if (!step) throw new Error("Unknown process");
        draft.steps[i] = stepSchema.parse({ ...step, ...command.patch });
        action = "Edited";
      } else {
        const cp = p.checkpoints.find((c) => c.revision === command.revision);
        if (!cp) throw new Error("Unknown checkpoint");
        draft = structuredClone(cp.draft);
        action = "Restored";
      }
      p = {
        ...p,
        ...draft,
        revision: p.revision + 1,
        state: "Proposed",
        review: null,
        checkpoints: [...p.checkpoints, { revision: p.revision + 1, at, draft }],
      };
    } else {
      throw new Error("Unsupported action; media execution and publishing disabled");
    }
    next.plans[index] = p;
  }
  next.events = [
    ...next.events.slice(-199),
    { planId: p.id, worldId: p.worldId, at, action, revision: p.revision },
  ];
  return entertainmentStoreSchema.parse(next);
}
export function creativeExport(store: CreativeStore, selectedWorld: string) {
  const s = entertainmentStoreSchema.parse(store);
  worldId.parse(selectedWorld);
  return {
    mode: "DEMO",
    authenticated: false,
    privateStorage: false,
    signed: false,
    executionAllowed: false,
    publicationAllowed: false,
    providerCalls: 0,
    verifiedConnectivity: null,
    rollback: "Local planning checkpoint only; no media restored",
    plans: s.plans.filter((p) => p.worldId === selectedWorld),
    events: s.events.filter((e) => e.worldId === selectedWorld),
  };
}
export function mediaAdapterManifest(id: string) {
  const a = entertainmentAdapters.find((v) => v.id === id);
  if (!a) throw new Error("Unknown adapter");
  return {
    schemaVersion: "0.1.0",
    adapterId: a.id,
    version: "0.0.0-reference",
    mode: "DISABLED_REFERENCE",
    capabilities: a.capabilities,
    requestedScope: a.scope,
    executionAllowed: false,
    publicationAllowed: false,
    verifiedAt: null,
    probePerformed: false,
    signature: null,
    tests: "NOT RUN",
    credentialCustody: "FUTURE_OWNER_SCOPED_SERVER_ONLY",
    requiredGates: [
      "Secure owner account",
      "Rights and privacy review",
      "Supported official interface",
      "Signed extension and sandbox tests",
      "Per-action consent",
      ...(id === "distribution"
        ? ["Separate destination authorization", "Final human publication confirmation"]
        : []),
    ],
  };
}
export function compareMediaMetrics(input: {
  duration: number;
  fps: number;
  candidateFrames: number;
  peakDbfs: number;
}) {
  const v = z
    .object({
      duration: z.number().min(1).max(120),
      fps: z.number().int().min(1).max(120),
      candidateFrames: z.number().int().min(0).max(14400),
      peakDbfs: z.number().min(-120).max(6),
    })
    .parse(input);
  const expectedFrames = Math.round(v.duration * v.fps);
  return {
    mode: "DEMO_NUMERIC_ONLY",
    expectedFrames,
    frameDelta: v.candidateFrames - expectedFrames,
    framesMatch: v.candidateFrames === expectedFrames,
    clippingRisk: v.peakDbfs >= 0,
    independentEvidence: false,
    mediaDecoded: false,
    codeExecuted: false,
  };
}
export function syntheticToneMetrics(gain: number) {
  z.number().min(0.01).max(0.2).parse(gain);
  return {
    peakDbfs: 20 * Math.log10(gain),
    rmsDbfs: 20 * Math.log10(gain / Math.sqrt(2)),
    lufs: null,
    sampleRate: 48000,
    duration: 2,
  };
}
