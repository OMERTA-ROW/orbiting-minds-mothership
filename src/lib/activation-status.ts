/**
 * Plain-language status for Activation Approvals. Pure: no I/O.
 *
 * - Approvals persist across ordinary sign-ins; nothing here is tied to a session.
 * - A security reset of the owner account (two-step turned off, recovery-code
 *   recovery, admin authenticator removal) makes every approval decided before
 *   it count as "needs fresh approval". Server functions use the same rule, so
 *   this fails closed in the UI and on the server even before the database
 *   enforces it.
 * - Missing or unreadable records never read as approved.
 */
import {
  ACTIVATION_STEPS,
  blockingStep,
  isEffectivelyApproved,
  isTechnicalStep,
  type ApprovalRow,
  type CheckStatus,
} from "./activation-approvals";

/** Owner-account events that invalidate earlier approvals. */
export const SECURITY_RESET_EVENTS = [
  "mfa_disabled",
  "recovery_completed",
  "admin_factor_removed",
] as const;

export interface SecurityEvent {
  event: string;
  created_at: string;
}

/** Newest security-reset time (ISO), or null when the account never had one. */
export function latestSecurityReset(events: SecurityEvent[]): string | null {
  let latest: number | null = null;
  let iso: string | null = null;
  for (const e of events) {
    if (!(SECURITY_RESET_EVENTS as readonly string[]).includes(e.event)) continue;
    const at = Date.parse(e.created_at);
    if (!Number.isFinite(at)) continue;
    if (latest === null || at > latest) {
      latest = at;
      iso = e.created_at;
    }
  }
  return iso;
}

/** True when an approved row was decided before (or without a time relative to) the last reset. */
export function approvedBeforeReset(row: ApprovalRow, resetAt: string | null): boolean {
  if (row.status !== "approved" || !resetAt) return false;
  const decided = row.decided_at ? Date.parse(row.decided_at) : NaN;
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset)) return false;
  return !Number.isFinite(decided) || decided <= reset;
}

/** Rows as they count for unlocking: approvals from before the last reset count as pending. */
export function effectiveRows(rows: ApprovalRow[], resetAt: string | null): ApprovalRow[] {
  return rows.map((row) =>
    approvedBeforeReset(row, resetAt) ? { ...row, status: "pending" as const } : row,
  );
}

export type StepState =
  "approved" | "needs_fresh_approval" | "expired" | "revoked" | "failed" | "locked" | "pending";

const REVOKE_ACTIONS = ["revoke", "revoke_cascade", "fresh_evidence_required"];

export const STEP_STATE_LABEL: Record<StepState, string> = {
  approved: "Approved",
  needs_fresh_approval: "Needs fresh approval",
  expired: "Approved · expired",
  revoked: "Revoked",
  failed: "Failed",
  locked: "Locked",
  pending: "Pending",
};

export function stepState(
  row: ApprovalRow,
  ctx: {
    rows: ApprovalRow[];
    now: number;
    resetAt: string | null;
    lastAuditAction?: string | undefined;
  },
): StepState {
  if (approvedBeforeReset(row, ctx.resetAt)) return "needs_fresh_approval";
  if (row.status === "approved")
    return isEffectivelyApproved(row, ctx.now) ? "approved" : "expired";
  if (row.status === "failed") return "failed";
  if (blockingStep(effectiveRows(ctx.rows, ctx.resetAt), row.step, ctx.now) !== null)
    return "locked";
  if (ctx.lastAuditAction && REVOKE_ACTIONS.includes(ctx.lastAuditAction)) return "revoked";
  return "pending";
}

export type NextActionKind =
  | "reverify"
  | "database_update"
  | "run_check"
  | "approve_checked"
  | "approve"
  | "fresh_approval"
  | "done";

/** The database accepts a technical approval only within 15 minutes of a passed check. */
export const CHECK_FRESH_MS = 15 * 60 * 1000;

export function checkIsFresh(checkedAt: string | undefined, now: number): boolean {
  const at = checkedAt ? Date.parse(checkedAt) : NaN;
  return Number.isFinite(at) && at <= now + 60_000 && now - at < CHECK_FRESH_MS;
}

export interface NextAction {
  kind: NextActionKind;
  step: number | null;
  title: string;
  detail: string;
}

export function nextAction(input: {
  rows: ApprovalRow[];
  checks: Array<{ step: number; status: CheckStatus; checkedAt?: string }>;
  now: number;
  resetAt: string | null;
  mfaFresh: boolean;
  checksStore: "ready" | "missing" | "unreadable";
}): NextAction {
  const rows = effectiveRows(input.rows, input.resetAt);
  const first = rows.find((r) => !isEffectivelyApproved(r, input.now));
  if (!first)
    return {
      kind: "done",
      step: null,
      title: "All 10 steps are approved",
      detail:
        "Approvals are records only. Nothing was switched on; CODE and autonomous mode stay off until switched separately.",
    };
  const meta = ACTIVATION_STEPS.find((s) => s.step === first.step)!;
  const original = input.rows.find((r) => r.step === first.step)!;
  const stale = approvedBeforeReset(original, input.resetAt);
  const technical = isTechnicalStep(first.step);
  if (technical && input.checksStore !== "ready")
    return {
      kind: "database_update",
      step: first.step,
      title: `Step ${first.step} is waiting on a database update`,
      detail:
        input.checksStore === "missing"
          ? "Check results can't be saved yet: database update 0051 (approval check store) has not been applied. It needs your approval in chat. Applying it resets every approval to Pending so each is re-checked with fresh evidence."
          : "Saved check results could not be read. Refresh; if it persists, nothing can be approved until the check store is readable.",
    };
  if (!input.mfaFresh)
    return {
      kind: "reverify",
      step: first.step,
      title: "Enter your authenticator code",
      detail: `Decisions need a code from the last 15 minutes. Then: step ${first.step}, ${meta.title}.`,
    };
  if (stale && !technical)
    return {
      kind: "fresh_approval",
      step: first.step,
      title: `Re-approve step ${first.step}: ${meta.title}`,
      detail:
        "This was approved before your last security reset. Revoke it, then approve it again.",
    };
  if (technical) {
    const check = input.checks.find((c) => c.step === first.step);
    if (check?.status === "passed" && checkIsFresh(check.checkedAt, input.now))
      return {
        kind: "approve_checked",
        step: first.step,
        title: `Approve step ${first.step}: ${meta.title}`,
        detail:
          "The server-side check passed. Review it, then approve within 15 minutes of the check; a pass is never approved for you.",
      };
    return {
      kind: "run_check",
      step: first.step,
      title: `Run check for step ${first.step}: ${meta.title}`,
      detail: stale
        ? "Approved before your last security reset. Run a fresh check, then approve it again yourself."
        : "Run the server-side check. If it passes, you approve it yourself; a failing check marks it failed with the reason.",
    };
  }
  return {
    kind: "approve",
    step: first.step,
    title: `Approve step ${first.step}: ${meta.title}`,
    detail: meta.detail,
  };
}

export type AccessReason = "signed_out" | "identity" | "not_owner" | "needs_code" | "unreadable";

/** Map a server owner-check error to a specific, actionable reason. */
export function accessReason(message: string | undefined | null): AccessReason {
  const m = message ?? "";
  if (m.includes("Verified owner identity")) return "identity";
  if (m.includes("only to the configured owner")) return "not_owner";
  if (m.includes("multi-factor") || m.includes("aal2")) return "needs_code";
  if (/unauthori[sz]ed|no authorization|401|jwt|session/i.test(m)) return "signed_out";
  return "unreadable";
}

export const ACCESS_TEXT: Record<AccessReason, { title: string; detail: string }> = {
  signed_out: {
    title: "Sign in as the owner",
    detail: "Use the same sign-in option you always use (for example Continue with Google).",
  },
  identity: {
    title: "Your sign-in could not be confirmed",
    detail:
      "Sign out and sign in again with the option you always use. The account's email must be verified.",
  },
  not_owner: {
    title: "This account is not the owner",
    detail:
      "You are signed in, but not with the owner account. Sign out and use the owner's usual sign-in. No account is promoted to owner here.",
  },
  needs_code: {
    title: "Enter your two-step code",
    detail:
      "You are the owner, but this sign-in has not passed two-step sign-in yet. Enter the 6-digit code from your authenticator app.",
  },
  unreadable: {
    title: "Approval records could not be read",
    detail: "Nothing was changed. Try again in a moment.",
  },
};

/** Recognise PostgREST/Postgres "relation or function does not exist" errors. */
export function isMissingObject(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    ["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "") ||
    /does not exist|could not find the (table|function)/i.test(error.message ?? "")
  );
}
