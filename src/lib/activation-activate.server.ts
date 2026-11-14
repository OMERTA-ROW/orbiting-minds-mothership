import type { JackboySafetySnapshot } from "./jackboy-link.server";
import { classifyLiveLinkError } from "./live-link";
import type { ActivationCheckDetail } from "./activation-approvals";

export type ActivationKind = "live_link" | "autonomy";
export type BeginReply = {
  ok: boolean;
  duplicate?: boolean;
  resumed?: boolean;
  reason?: string;
  activatedAt?: string | null;
};
export type FinishReply = "active" | "failed" | "superseded" | "expired";
export type ActivationDeps = {
  begin(kind: ActivationKind, attempt: string): Promise<BeginReply>;
  finish(
    kind: ActivationKind,
    attempt: string,
    ok: boolean,
    reason: string,
    evidence: Record<string, unknown>,
  ): Promise<FinishReply>;
  outcome(kind: ActivationKind, attempt: string): Promise<string>;
  preflight?: (() => Promise<string | null>) | undefined;
  connect(): Promise<void>;
  actuate(kind: ActivationKind, attempt: string): Promise<{ executorRelease: string | null }>;
  rollback(kind: ActivationKind): Promise<void>;
  verifyCurrent(kind: ActivationKind): Promise<void>;
  safety(): Promise<JackboySafetySnapshot>;
  recordSafety(s: JackboySafetySnapshot): Promise<unknown>;
  recordSafetyFailure(reason: string): Promise<unknown>;
  safetyFailureReason(error: unknown): string;
  now?: () => number;
};
export type ActivationFailureReason =
  | "mfa"
  | "rule"
  | "busy"
  | "safety_denial"
  | "timeout"
  | "refused"
  | "link_failure"
  | "invalid_reply"
  | "jackboy_safety"
  | "jackboy_authorization"
  | "not_recorded";
export type ActivationOutcome =
  | { ok: true; already: boolean; message: string; blockers: string[] }
  | {
      ok: false;
      reason: ActivationFailureReason;
      message: string;
      details: ActivationCheckDetail[];
    };

const BEGIN_TEXT: Record<string, string> = {
  busy: "Another activation attempt is in progress. Wait, then refresh.",
  step7_window_closed:
    "Step 7's approval window has ended or is invalid. Approve Step 7 again with a new expiry.",
  step8_proof_not_fresh: "Step 8 needs a current passing signed self-test. Run Step 8 again.",
  mothership_stop_engaged:
    "Mothership's Emergency Stop is engaged, so nothing was sent. It was not released.",
  live_link_not_active: "Activate the live link (Step 9) first.",
  caps_not_confirmed: "Step 10 must be approved with the $10 cap and $5 daily limit confirmed.",
  steps_missing: "Approval records are incomplete; refresh the page.",
  mfa: "Re-verify with your authenticator first. Nothing was sent or activated.",
  denied: "Owner access could not be confirmed, so nothing was activated.",
  begin_error:
    "The database did not start the activation, so nothing was sent or activated. Refresh and reconcile before another attempt.",
};
export function beginReasonText(reason: string | undefined) {
  if (!reason) return "Activation prerequisites are not met.";
  const step = /^step(\d+)_not_approved$/.exec(reason);
  return step
    ? `Step ${step[1]} must be approved first.`
    : (BEGIN_TEXT[reason] ?? `Activation prerequisites are not met (${reason}).`);
}
export function executionBlockers(
  s: JackboySafetySnapshot | null,
  executorRelease: string | null = null,
) {
  const blockers: string[] = [];
  if (!s) blockers.push("Jackboy safety could not be read, so it counts as stopped.");
  else {
    if (s.killSwitch) blockers.push("Jackboy System Kill Switch is on.");
    if (s.emergencyStop) blockers.push("Jackboy CODE Emergency Stop is engaged.");
    if (!s.codeEnabled) blockers.push("Jackboy's saved CODE setting is off.");
    if (!s.authorization) blockers.push("OMNI autonomous work is not authorized in Jackboy.");
    if (s.blockedBy && blockers.length === 0)
      blockers.push(`Jackboy blocks autonomy (${s.blockedBy}).`);
  }
  if (!executorRelease)
    blockers.push("No OMNI executor is independently verified, so no autonomous job can run.");
  return blockers;
}

export async function runActivation(
  kind: ActivationKind,
  attempt: string,
  deps: ActivationDeps,
): Promise<ActivationOutcome> {
  const now = deps.now ?? Date.now;
  const fail = (
    reason: ActivationFailureReason,
    message: string,
    details: ActivationCheckDetail[] = [],
  ): ActivationOutcome => ({ ok: false, reason, message, details });
  if (kind === "autonomy" && deps.preflight) {
    const blocked = await deps.preflight();
    if (blocked) return fail("rule", `Nothing was activated: ${blocked}`);
  }
  const begun = await deps.begin(kind, attempt);
  if (!begun.ok)
    return fail(
      begun.reason === "busy" ? "busy" : begun.reason === "mfa" ? "mfa" : "rule",
      beginReasonText(begun.reason),
    );
  if (begun.duplicate) {
    try {
      await deps.verifyCurrent(kind);
    } catch {
      return fail(
        "jackboy_safety",
        "Recorded activation is not verified at the backend. Reconcile it before retrying.",
      );
    }
    return {
      ok: true,
      already: true,
      message:
        "Activation is already recorded and its backend state verified. Nothing was started or recorded twice.",
      blockers: [],
    };
  }
  async function rollback(reason: string) {
    await deps.rollback(kind);
    const recorded = await deps.finish(kind, attempt, false, reason, { rollbackVerified: true });
    if (recorded !== "failed" && recorded !== "superseded")
      throw new Error("Rollback could not be recorded");
  }
  try {
    await deps.connect();
  } catch (error) {
    const classified = classifyLiveLinkError(error);
    try {
      await rollback(`handshake_${classified.kind}`);
    } catch {
      return fail(
        "not_recorded",
        "Handshake failed and rollback is unverified. Keep Stop engaged; reconcile the pending activation.",
      );
    }
    return fail(classified.kind, `Not activated: ${classified.message}`, classified.details);
  }
  let executorRelease: string | null;
  try {
    executorRelease = (await deps.actuate(kind, attempt)).executorRelease;
  } catch {
    try {
      await rollback("backend_actuation_failed");
    } catch {
      return fail(
        "not_recorded",
        "Backend activation outcome is unverified. Keep Stop engaged; reconcile before another attempt.",
      );
    }
    return fail(
      "link_failure",
      "Backend actuation failed and was rolled back. No job started or Stop released.",
    );
  }
  const handshakeAt = new Date(now()).toISOString();
  let snapshot: JackboySafetySnapshot;
  try {
    snapshot = await deps.safety();
    await deps.recordSafety(snapshot);
  } catch (error) {
    const reason = deps.safetyFailureReason(error);
    let stored = true;
    try {
      await deps.recordSafetyFailure(reason);
    } catch {
      stored = false;
    }
    try {
      await rollback("jackboy_safety_unavailable");
    } catch {
      return fail(
        "not_recorded",
        "Safety read and rollback are unverified. Keep Stop engaged and reconcile the activation.",
      );
    }
    return fail(
      "jackboy_safety",
      `Not activated: fresh signed safety was unavailable (${reason})${stored ? "" : "; local failure auditing also failed"}. Backend configuration was rolled back.`,
    );
  }
  if (
    kind === "autonomy" &&
    (!snapshot.authorization || Date.parse(snapshot.authorization.expiresAt) <= now())
  ) {
    try {
      await rollback("jackboy_authorization_missing");
    } catch {
      return fail(
        "not_recorded",
        "Authorization and rollback are unverified; reconcile before another attempt.",
      );
    }
    return fail(
      "jackboy_authorization",
      "Not activated: Jackboy has no current autonomous authorization.",
    );
  }
  const evidence = {
    handshakeAt,
    safety: {
      checkedAt: snapshot.checkedAt,
      killSwitch: snapshot.killSwitch,
      emergencyStop: snapshot.emergencyStop,
      codeEnabled: snapshot.codeEnabled,
      autonomousAllowed: snapshot.autonomousAllowed,
      blockedBy: snapshot.blockedBy,
      authorizationExpiresAt: snapshot.authorization?.expiresAt ?? null,
      proofDigest: snapshot.proofDigest,
    },
    ...(kind === "autonomy"
      ? {
          caps: { perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5, openaiCapUsd: 10 },
          executor: executorRelease ?? "none",
        }
      : {}),
  };
  let finished: string;
  try {
    finished = await deps.finish(kind, attempt, true, "verified", evidence);
  } catch {
    finished = "unknown";
  }
  if (finished !== "active") {
    let outcome = "unknown";
    try {
      outcome = await deps.outcome(kind, attempt);
    } catch {
      /* Unknown remains unresolved, never a successful activation. */
    }
    if (outcome === "active") {
      try {
        await deps.verifyCurrent(kind);
        finished = "active";
      } catch {
        finished = "unknown";
      }
    }
    if (finished !== "active") {
      try {
        await rollback("finalization_not_verified");
      } catch {
        return fail(
          "not_recorded",
          "A decision may have been recorded, but activation or rollback is unverified. Refresh and reconcile; do not blindly retry.",
        );
      }
      return fail(
        "rule",
        "Backend activation did not finalize under the current approvals and was rolled back. Nothing started.",
      );
    }
  }
  return {
    ok: true,
    already: false,
    message:
      kind === "live_link"
        ? "Live link activated and its signed backend state verified. No job started or Stop released."
        : "Autonomy configuration activated — not running. No job started or Stop released.",
    blockers: kind === "autonomy" ? executionBlockers(snapshot, executorRelease) : [],
  };
}
