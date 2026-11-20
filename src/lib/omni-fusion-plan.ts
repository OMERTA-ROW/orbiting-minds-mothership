/**
 * Fusion phase 1 — `omni.fusion-plan/v1` contract and the rules-only plan coordinator.
 * Pure and browser-safe: no network, no database, no clock (callers pass times in).
 *
 * The coordinator turns ONE held OMNI task (metadata only, read by migration 0069 in the same
 * transaction that checks the delegation and Emergency Stop) into a fixed, ordered proposal: who
 * is responsible for each step, what it depends on, and which owner/Jackboy checkpoint guards it.
 * It never reassigns the task's agent, never consults another agent or model, never reads the
 * task text, and never starts, approves, hands over, retries or pays for anything. Every step it
 * lists is something an existing Mothership/Jackboy control does — or is marked not available.
 * Documented for OMNI web in docs/OMNI-FUSION-PLAN-CONTRACT.md.
 */
import { z } from "zod";
import { DELEGATION_SCOPES, HELD_TASK_AGENTS, HELD_TASK_AGENT_NAMES } from "./omni-delegation";
import { INTENDED_SPEND_LIMITS } from "./omni-spend-evidence";

export const FUSION_PLAN_SCHEMA = "omni.fusion-plan/v1" as const;
/** Bump when any rule below changes: the same input then gets a new planId. */
export const FUSION_RULES_VERSION = 1 as const;
/** Per-owner proposals per rolling 24 hours, enforced in the database (0069). Owner-approved 2026-11-20. */
export const FUSION_PLANS_PER_DAY = 10;

export const TASK_KINDS = [
  "code.generate",
  "code.edit",
  "code.test",
  "code.debug",
  "agent.handoff",
] as const;

const ISO = z.string().refine((s) => Number.isFinite(Date.parse(s)), "timestamp");

/** Strict shape of the 0069 database answer. Anything else is treated as "unavailable". */
export const planContextSchema = z
  .object({
    ok: z.literal(true),
    delegation_id: z.string().uuid(),
    scopes: z.array(z.enum(DELEGATION_SCOPES)).min(1).max(5),
    task: z
      .object({
        id: z.string().uuid(),
        agentId: z.enum(HELD_TASK_AGENTS),
        kind: z.enum(TASK_KINDS),
        state: z.literal("held"),
        hasRepository: z.boolean(),
        createdAt: ISO,
        inputDigest: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    stopCheckedAt: ISO,
    plansUsed: z.number().int().min(1).max(FUSION_PLANS_PER_DAY),
    dailyLimit: z.literal(FUSION_PLANS_PER_DAY),
  })
  .strict()
  .refine((c) => c.scopes.includes("fusion:plan"), "fusion:plan");
export type PlanContext = z.infer<typeof planContextSchema>;

/* ---------------------------------- contract types ---------------------------------- */

/** Request body for POST /api/omni/fusion/plans. Nothing else is accepted. */
export type FusionPlanRequest = { taskId: string };

export type FusionResponsible =
  | { kind: "owner"; name: "Owner" }
  | { kind: "agent"; agentId: (typeof HELD_TASK_AGENTS)[number]; name: string };

export type FusionCheckpoint = {
  kind: "owner_review" | "owner_fresh_code" | "owner_passkey" | "spend_caps" | "emergency_stop";
  /** Who must act or which control decides. Fusion is never one of them. */
  decidedBy: "owner" | "jackboy" | "mothership";
  where: string;
  detail: string;
};

export type FusionPlanStep = {
  id:
    "owner_review" | "owner_handover" | "jackboy_admission" | "agent_work" | "owner_result_review";
  order: number;
  responsible: FusionResponsible;
  action: string;
  dependsOn: FusionPlanStep["id"][];
  checkpoints: FusionCheckpoint[];
  /** Always "waiting_on_owner" for the first step and "not_started" after it: Fusion runs nothing. */
  state: "waiting_on_owner" | "not_started";
  fusionCanRun: false;
};

export type FusionUnavailable = {
  capability:
    | "compare_responses"
    | "shared_knowledge"
    | "maintenance_coordination"
    | "plan_records"
    | "owner_plan_acceptance";
  state: "planned";
  reason: string;
};

export type FusionPlan = {
  schema: typeof FUSION_PLAN_SCHEMA;
  rulesVersion: typeof FUSION_RULES_VERSION;
  /** Deterministic: same task facts + rules version + scopes => same id. */
  planId: string;
  /** SHA-256 (hex) of the canonical planner input (`canonicalPlanInput`). */
  digest: string;
  mode: "rules_only";
  status: "proposed";
  /** Phase 1 does not store plans; the database keeps one audit row per proposal. */
  persisted: false;
  generatedAt: string;
  task: {
    id: string;
    agentId: (typeof HELD_TASK_AGENTS)[number];
    agentName: string;
    kind: (typeof TASK_KINDS)[number];
    state: "held";
    hasRepository: boolean;
    createdAt: string;
    /** SHA-256 of the task title + instructions. The text itself is never read by the planner. */
    inputDigest: string;
  };
  emergencyStop: { state: "released"; checkedAt: string };
  steps: FusionPlanStep[];
  /** Phase 1 consults nobody. These arrays are always empty; a non-empty one would be a lie. */
  consulted: { agents: []; models: []; knowledgeSources: [] };
  cost: {
    fusionUsd: 0;
    modelCalls: 0;
    /**
     * Required policy limits the owner set for any job (from `INTENDED_SPEND_LIMITS`). The planner
     * reads no permit, so this is NOT evidence that Jackboy currently enforces them.
     */
    requiredJobLimits: {
      perAiCallUsd: number;
      reservedPerJobUsd: number;
      perDayUsd: number;
      maxActiveJobs: number;
      basis: "owner_policy";
      enforcementVerified: false;
      note: string;
    };
  };
  statusVisibility: {
    omniWebCanReadStatus: boolean;
    path: "/api/omni/held-tasks" | null;
    reason: string;
  };
  limits: {
    plansPerDay: number;
    plansUsedToday: number;
    canStartWork: false;
    canSpend: false;
    canApprove: false;
    canChangeEmergencyStop: false;
    callsModels: false;
    consultsAgents: false;
  };
  unavailable: FusionUnavailable[];
};

/** 200 body. Every refusal is `{ ok: false, error, message? }` (see FUSION_REFUSALS). */
export type FusionPlanResponse = { ok: true; plan: FusionPlan };

/* ------------------------------------- the rules ------------------------------------- */

export const FUSION_UNAVAILABLE: readonly FusionUnavailable[] = [
  {
    capability: "compare_responses",
    state: "planned",
    reason:
      "Comparing answers from several agents or models is phase 2; every model call would be paid and is not built.",
  },
  {
    capability: "shared_knowledge",
    state: "planned",
    reason:
      "Permission-aware shared knowledge is phase 3; no knowledge source is approved or read.",
  },
  {
    capability: "maintenance_coordination",
    state: "planned",
    reason:
      "Diagnostics, repair, backup, recovery and update coordination is phase 4 and not built.",
  },
  {
    capability: "plan_records",
    state: "planned",
    reason:
      "Plans are not saved yet: this proposal exists only in this reply (one audit entry is kept).",
  },
  {
    capability: "owner_plan_acceptance",
    state: "planned",
    reason:
      "There is no accept/discard screen yet. The owner acts through the existing OMNI Terminal controls.",
  },
];

/** The exact, ordered facts the plan depends on. Hash this for planId/digest. */
export function canonicalPlanInput(ctx: PlanContext): string {
  return JSON.stringify([
    FUSION_PLAN_SCHEMA,
    FUSION_RULES_VERSION,
    ctx.task.id,
    ctx.task.agentId,
    ctx.task.kind,
    ctx.task.hasRepository,
    ctx.task.inputDigest,
    ctx.scopes.includes("tasks:read"),
  ]);
}

const OWNER: FusionResponsible = { kind: "owner", name: "Owner" };

/**
 * Deterministic proposal. `digest` is SHA-256 of `canonicalPlanInput(ctx)` (computed by the
 * caller); `now` is the response time. Same inputs always give the same steps and planId.
 */
export function buildFusionPlan(ctx: PlanContext, digest: string, now: number): FusionPlan {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("digest must be 64 hex characters");
  const agentId = ctx.task.agentId;
  const agentName = HELD_TASK_AGENT_NAMES[agentId];
  const isCode = ctx.task.kind !== "agent.handoff";
  const canRead = ctx.scopes.includes("tasks:read");
  const caps = INTENDED_SPEND_LIMITS;
  const capText = `$${caps.perCallUsd.toFixed(2)} per AI call, $${caps.perTaskUsd.toFixed(2)} reserved per job, $${caps.dailyUsd.toFixed(2)} per day, ${caps.maxActiveJobs} active job`;

  const steps: FusionPlanStep[] = [
    {
      id: "owner_review",
      order: 1,
      responsible: OWNER,
      action:
        "Review this held task and proposal on the Mothership and decide whether it should go to Jackboy, be changed, or be cancelled.",
      dependsOn: [],
      checkpoints: [
        {
          kind: "owner_review",
          decidedBy: "owner",
          where: "/omni-terminal",
          detail: "Signed-in owner with two-step sign-in. Fusion does not decide.",
        },
      ],
      state: "waiting_on_owner",
      fusionCanRun: false,
    },
    {
      id: "owner_handover",
      order: 2,
      responsible: OWNER,
      action:
        "If approved, the owner sends the held task to Jackboy from OMNI Terminal. Jackboy creates a queued job; nothing runs yet.",
      dependsOn: ["owner_review"],
      checkpoints: [
        {
          kind: "owner_fresh_code",
          decidedBy: "owner",
          where: "/omni-terminal",
          detail: "Needs a fresh two-step sign-in code and the owner-entered Jackboy project.",
        },
        {
          kind: "emergency_stop",
          decidedBy: "mothership",
          where: "/omni-terminal",
          detail:
            "Refused while the Emergency Stop is engaged or unreadable. Fusion never changes it.",
        },
      ],
      state: "not_started",
      fusionCanRun: false,
    },
    {
      id: "jackboy_admission",
      order: 3,
      responsible: { kind: "agent", agentId: "jackboy", name: HELD_TASK_AGENT_NAMES.jackboy },
      action:
        "Jackboy decides whether to admit the job: per-job owner passkey approval, its Kill Switch, project authorization and spending limits.",
      dependsOn: ["owner_handover"],
      checkpoints: [
        {
          kind: "owner_passkey",
          decidedBy: "owner",
          where: "Jackboy",
          detail: "The owner approves this job with their passkey in Jackboy.",
        },
        {
          kind: "spend_caps",
          decidedBy: "jackboy",
          where: "Jackboy",
          detail: `Required policy: paid work needs a signed Jackboy permit within ${capText}. Fusion neither requests nor reads permits, so it cannot confirm enforcement.`,
        },
      ],
      state: "not_started",
      fusionCanRun: false,
    },
    {
      id: "agent_work",
      order: 4,
      responsible: { kind: "agent", agentId, name: agentName },
      action: isCode
        ? `${agentName} does the ${ctx.task.kind.replace("code.", "")} work only after Jackboy admits the job${
            ctx.task.hasRepository
              ? "; repository access is whatever Jackboy authorizes for that project"
              : ""
          }. Fusion has no evidence it will run and never starts it.`
        : `${agentName} works on it only after Jackboy admits the job and routes it. Fusion has no evidence it will run and never starts it.`,
      dependsOn: ["jackboy_admission"],
      checkpoints: [],
      state: "not_started",
      fusionCanRun: false,
    },
    {
      id: "owner_result_review",
      order: 5,
      responsible: OWNER,
      action: "The owner reviews the outcome Jackboy reports before anything else is done with it.",
      dependsOn: ["agent_work"],
      checkpoints: [
        {
          kind: "owner_review",
          decidedBy: "owner",
          where: "/omni-terminal",
          detail: "Results are only what Jackboy's signed status replies report.",
        },
      ],
      state: "not_started",
      fusionCanRun: false,
    },
  ];

  return {
    schema: FUSION_PLAN_SCHEMA,
    rulesVersion: FUSION_RULES_VERSION,
    planId: `fp_${digest.slice(0, 32)}`,
    digest,
    mode: "rules_only",
    status: "proposed",
    persisted: false,
    generatedAt: new Date(now).toISOString(),
    task: { ...ctx.task, agentName },
    emergencyStop: { state: "released", checkedAt: new Date(ctx.stopCheckedAt).toISOString() },
    steps,
    consulted: { agents: [], models: [], knowledgeSources: [] },
    cost: {
      fusionUsd: 0,
      modelCalls: 0,
      requiredJobLimits: {
        perAiCallUsd: caps.perCallUsd,
        reservedPerJobUsd: caps.perTaskUsd,
        perDayUsd: caps.dailyUsd,
        maxActiveJobs: caps.maxActiveJobs,
        basis: "owner_policy",
        enforcementVerified: false,
        note: "Required policy limits for any job. Fusion reads no permit; whether Jackboy applies them is shown only by a fresh signed permit (manifest spendingCap).",
      },
    },
    statusVisibility: canRead
      ? {
          omniWebCanReadStatus: true,
          path: "/api/omni/held-tasks",
          reason: "This delegation includes tasks:read.",
        }
      : {
          omniWebCanReadStatus: false,
          path: null,
          reason: "This delegation lacks tasks:read, so status is visible only on the Mothership.",
        },
    limits: {
      plansPerDay: ctx.dailyLimit,
      plansUsedToday: ctx.plansUsed,
      canStartWork: false,
      canSpend: false,
      canApprove: false,
      canChangeEmergencyStop: false,
      callsModels: false,
      consultsAgents: false,
    },
    unavailable: FUSION_UNAVAILABLE.map((u) => ({ ...u })),
  };
}
