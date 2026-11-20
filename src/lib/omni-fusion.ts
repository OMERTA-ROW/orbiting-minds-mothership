/**
 * Fusion plan permission ("fusion:plan") — shared, browser-safe rules (no network, no secrets).
 *
 * Fusion is the Mothership's orchestration architecture, not an agent (docs/OMNI-FUSION-REQUIREMENTS.md).
 * The only thing "fusion:plan" lets OMNI web do is ASK for a plan proposal for one held task.
 * It can never start, hand off, approve or retry work, call a model or provider, touch permits
 * or spending limits, or engage/release the Emergency Stop. Until the rules-only planner's
 * database change (0069) is installed, an admitted request is answered `planner_not_available`
 * (0067); after it, the answer is a rules-only `omni.fusion-plan/v1` proposal
 * (src/lib/omni-fusion-plan.ts) that consults no agent or model and runs nothing.
 */
import { z } from "zod";

export const FUSION_PLAN_SCOPE = "fusion:plan" as const;
export const FUSION_PLAN_PATH = "/api/omni/fusion/plans";
/** The only database function the Fusion request handler may call (plus the install marker). */
export const FUSION_PLAN_GATE_RPC = "omni_delegation_fusion_plan_gate";
export const FUSION_PLAN_READY_RPC = "omni_fusion_plan_ready";
/** Phase 1 (migration 0069): planner install marker and the one-transaction plan context check. */
export const FUSION_PLANNER_READY_RPC = "omni_fusion_planner_ready";
export const FUSION_PLAN_CONTEXT_RPC = "omni_delegation_fusion_plan_context";
export const FUSION_PLAN_MAX_BODY = 2_048;

/** What the permission can do, as reported to OMNI web. Always false, planner or not. */
export const FUSION_PLAN_LIMITS = {
  canStartWork: false,
  canSpend: false,
  canChangeEmergencyStop: false,
  canApprove: false,
  callsModels: false,
  consultsAgents: false,
} as const;

export const fusionPlanBody = z.object({ taskId: z.string().uuid() }).strict();

export const FUSION_REFUSALS: Record<string, { status: number; error: string; message: string }> = {
  scope_missing: {
    status: 403,
    error: "scope_missing",
    message: "This owner delegation does not include fusion:plan. The owner must approve it.",
  },
  emergency_stop_engaged: {
    status: 423,
    error: "emergency_stop_engaged",
    message: "The Emergency Stop is engaged (or unreadable). Fusion takes no requests.",
  },
  planner_not_available: {
    status: 503,
    error: "planner_not_available",
    message:
      "Fusion's planner isn't built yet. Your request was checked and logged; nothing was planned, started or charged.",
  },
  task_not_found: {
    status: 404,
    error: "task_not_found",
    message: "No held task with this id was created by OMNI for this owner.",
  },
  task_not_held: {
    status: 409,
    error: "task_not_held",
    message: "This task is no longer held (it was cancelled). Fusion plans only held tasks.",
  },
  task_already_handed_off: {
    status: 409,
    error: "task_already_handed_off",
    message:
      "The owner already sent this task on from OMNI Terminal. Fusion does not re-plan work that has left the Mothership.",
  },
  daily_limit: {
    status: 429,
    error: "daily_limit",
    message: "This owner reached today's Fusion plan limit. Try again later.",
  },
  invalid_request: {
    status: 400,
    error: "invalid_request",
    message: 'Send {"taskId": "<held task id>"}.',
  },
  not_installed: {
    status: 503,
    error: "not_available",
    message:
      "The Mothership couldn't confirm its Fusion plan permission (database change 0067) is installed. Nothing was checked or logged.",
  },
};

export const INVALID_DELEGATION_REASONS = [
  "invalid",
  "revoked",
  "expired",
  "wrong_audience",
  "owner_unverified",
] as const;
