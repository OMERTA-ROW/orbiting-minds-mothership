/**
 * Fusion plan permission ("fusion:plan") — shared, browser-safe rules (no network, no secrets).
 *
 * Fusion is the Mothership's orchestration architecture, not an agent (docs/OMNI-FUSION-REQUIREMENTS.md).
 * The only thing "fusion:plan" lets OMNI web do is ASK for a plan proposal for one held task.
 * It can never start, hand off, approve or retry work, call a model or provider, touch permits
 * or spending limits, or engage/release the Emergency Stop. Its planner is not built, so an
 * admitted request is answered `planner_not_available` (migration 0067).
 */
import { z } from "zod";

export const FUSION_PLAN_SCOPE = "fusion:plan" as const;
export const FUSION_PLAN_PATH = "/api/omni/fusion/plans";
/** The only database function the Fusion request handler may call (plus the install marker). */
export const FUSION_PLAN_GATE_RPC = "omni_delegation_fusion_plan_gate";
export const FUSION_PLAN_READY_RPC = "omni_fusion_plan_ready";
export const FUSION_PLAN_MAX_BODY = 2_048;

/** What the permission can do, as reported to OMNI web. All false until a verified planner exists. */
export const FUSION_PLAN_LIMITS = {
  canStartWork: false,
  canSpend: false,
  canChangeEmergencyStop: false,
  canApprove: false,
  plannerBuilt: false,
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
