/**
 * Per-step view model for Activation Approvals. Pure: derived only from the
 * server's records (authoritative status), never from optimistic client state.
 * A passing check never implies approval here; only the recorded row does.
 */
import {
  ACTIVATION_STEPS,
  allowedActions,
  blockingStep,
  isTechnicalStep,
  type ApprovalAction,
  type ApprovalRow,
  type CheckStatus,
} from "./activation-approvals";
import {
  approvedBeforeReset,
  checkIsFresh,
  effectiveRows,
  nextAction,
  stepState,
  type StepState,
} from "./activation-status";

export interface FlowAudit {
  id: string;
  action: string;
  record_id: string;
  occurred_at: string;
}

export interface StepView {
  step: number;
  title: string;
  technical: boolean;
  state: StepState;
  /** Recorded as approved and counting toward unlocking. */
  complete: boolean;
  blocker: number | null;
  stale: boolean;
  isNext: boolean;
  lastCheck: CheckStatus | null;
  canRunCheck: boolean;
  /** Label for the check button: a failed or unresolved check offers a retry. */
  checkLabel: "Run check" | "Retry check";
  canApprove: boolean;
  /** A passed technical check recent enough for the database to accept an approval. */
  freshPass: boolean;
  canRevoke: boolean;
  /** Why the main action is unavailable, for a visible hint; null when available. */
  blockedReason: string | null;
  collapsedByDefault: boolean;
  audit: FlowAudit[];
}

export interface FlowInput {
  rows: ApprovalRow[];
  checks: Array<{ step: number; status: CheckStatus; checkedAt?: string }>;
  audit: FlowAudit[];
  now: number;
  resetAt: string | null;
  mfaFresh: boolean;
  checksStore: "ready" | "missing" | "unreadable";
}

export function stepViews(input: FlowInput): StepView[] {
  const effective = effectiveRows(input.rows, input.resetAt);
  const next = nextAction(input);
  return ACTIVATION_STEPS.map((meta) => {
    const row = input.rows.find((r) => r.step === meta.step)!;
    const technical = isTechnicalStep(meta.step);
    const stale = approvedBeforeReset(row, input.resetAt);
    const blocker = blockingStep(effective, meta.step, input.now);
    const audit = input.audit.filter((a) => a.record_id === String(meta.step));
    const state = stepState(row, {
      rows: input.rows,
      now: input.now,
      resetAt: input.resetAt,
      lastAuditAction: audit[0]?.action,
    });
    const complete = state === "approved";
    const actions: ApprovalAction[] = stale
      ? technical
        ? ["approve", "revoke"]
        : ["revoke"]
      : allowedActions(effective, meta.step, input.now);
    const check = input.checks.find((c) => c.step === meta.step);
    const lastCheck = check?.status ?? null;
    const freshPass = check?.status === "passed" && checkIsFresh(check.checkedAt, input.now);
    const unlocked = blocker === null;
    const checkPossible = technical && unlocked && !complete && state !== "expired";
    const blockedReason = complete
      ? "Already approved"
      : !unlocked
        ? `Locked — waiting on step ${blocker}`
        : technical && input.checksStore !== "ready"
          ? "Check store unavailable"
          : !input.mfaFresh
            ? "Enter a fresh two-step code first"
            : null;
    return {
      step: meta.step,
      title: meta.title,
      technical,
      state,
      complete,
      blocker,
      stale,
      isNext: next.kind !== "done" && next.step === meta.step,
      lastCheck,
      canRunCheck: checkPossible && input.mfaFresh && input.checksStore === "ready",
      checkLabel:
        lastCheck === "failed" || lastCheck === "needs_attention" || state === "failed"
          ? "Retry check"
          : "Run check",
      // Technical steps: only after a fresh passed check, and still the owner's own decision.
      canApprove:
        actions.includes("approve") &&
        input.mfaFresh &&
        (!technical || (freshPass && input.checksStore === "ready")),
      freshPass,
      canRevoke: actions.includes("revoke") && input.mfaFresh,
      blockedReason,
      collapsedByDefault: complete,
      audit,
    };
  });
}

/** First step the owner can act on now, or null when all are approved. */
export function nextEligibleStep(views: StepView[]): number | null {
  return views.find((v) => v.isNext)?.step ?? null;
}

/** `selfTest` outlasts the server's own ~28 s self-test budget. */
export const FLOW_TIMEOUTS = {
  list: 20_000,
  check: 30_000,
  decide: 20_000,
  selfTest: 40_000,
} as const;
export type FlowTimeouts = { list: number; check: number; decide: number; selfTest: number };

export class FlowTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`No reply after ${Math.round(ms / 1000)} seconds.`);
    this.name = "FlowTimeoutError";
  }
}

/** Stops waiting after `ms`; the server call itself may still finish and record a result. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FlowTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
