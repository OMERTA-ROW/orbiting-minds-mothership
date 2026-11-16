/**
 * Pure helpers for Step 9/10 activation records: whether an earlier attempt must be reconciled before a
 * new one, and how a refused `activation_activation_begin` call is classified. No record contents leave.
 */

/** Text raised by the database guard (`activation_unresolved_guard`, migration 0057) on a new attempt. */
export const RECONCILE_GUARD_TEXT = "Reconcile the unresolved activation before a new attempt";

/** How long an `activating` row may stay open before the database treats it as abandoned (0055). */
const ACTIVATING_WINDOW_MS = 90_000;

export type ActivationRecord = {
  status: string;
  evidence?: unknown;
  started_at?: string | null;
};

function flag(evidence: unknown, key: string): boolean | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const v = (evidence as Record<string, unknown>)[key];
  return typeof v === "boolean" ? v : null;
}

/**
 * Mirrors the database guard: a new attempt is refused while Jackboy's side of an earlier revoked
 * activation is unconfirmed, a failed attempt's rollback is unverified, or an attempt is still open.
 */
export function activationNeedsReconcile(row: ActivationRecord | null | undefined, now: number) {
  if (!row) return false;
  if (flag(row.evidence, "remoteReconciliationRequired") === true) return true;
  if (row.status === "failed") return flag(row.evidence, "rollbackVerified") !== true;
  if (row.status === "activating") {
    const started = Date.parse(row.started_at ?? "");
    // An abandoned open attempt can only be closed by reconciliation, never by a new attempt.
    return !Number.isFinite(started) || now - started >= ACTIVATING_WINDOW_MS;
  }
  return false;
}

export type BeginRefusal = "mfa" | "denied" | "reconcile_required" | "begin_error";

/** Classifies a database error from `activation_activation_begin` (message text is never shown). */
export function classifyBeginError(error: { code?: string | null; message?: string | null }) {
  const message = error.message ?? "";
  if (message.includes("Fresh two-factor")) return "mfa" satisfies BeginRefusal;
  if (error.code === "42501") return "denied" satisfies BeginRefusal;
  if (message.includes(RECONCILE_GUARD_TEXT)) return "reconcile_required" satisfies BeginRefusal;
  return "begin_error" satisfies BeginRefusal;
}

const LABEL = {
  live_link: { name: "Step 9 live link", button: "Activate live link" },
  autonomy: { name: "Step 10 autonomy authorization", button: "Activate autonomy authorization" },
} as const;

/**
 * Why an executor action was refused because the upstream activation is not in effect. Always says
 * that approval and activation are separate, and that nothing was sent.
 */
export function upstreamNotInEffect(
  kind: "live_link" | "autonomy",
  row: ActivationRecord | null,
  now: number,
) {
  const { name, button } = LABEL[kind];
  const head = `Current upstream activation is not in effect: the ${name}`;
  if (!row) return `${head} has never been activated. Approval records the decision only; click ${button} first. Nothing was sent.`;
  if (activationNeedsReconcile(row, now))
    return `${head} is ${row.status} and unresolved. Click Reconcile pending activation with a fresh two-step code, then ${button}. Nothing was sent.`;
  if (row.status === "active")
    return `${head} was activated, but approvals or the Step 7 window changed since, so it is no longer in effect. Click ${button} again. Nothing was sent.`;
  return `${head} is ${row.status === "inactive" ? "not activated" : row.status}. Approval records the decision only; click ${button} first. Nothing was sent.`;
}
