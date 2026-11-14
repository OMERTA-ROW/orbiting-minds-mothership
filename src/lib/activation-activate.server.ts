/**
 * Step 9 / Step 10 activation orchestration (server only). One owner attempt:
 * begin (database: owner + fresh MFA, prerequisites, one attempt at a time) → signed handshake →
 * signed Jackboy safety snapshot → finish (service role; database re-checks revisions). Any failure
 * finishes the attempt as failed, so nothing is left active. Activating starts no job, releases no
 * stop and changes no Jackboy switch.
 */
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
  /** Autonomy only: Mothership-side cap and metering checks; a string blocks with that message. */
  preflight?(): Promise<string | null>;
  connect(): Promise<void>;
  safety(): Promise<JackboySafetySnapshot>;
  recordSafety(s: JackboySafetySnapshot): Promise<unknown>;
  recordSafetyFailure(reason: string): Promise<unknown>;
  safetyFailureReason(error: unknown): string;
  now?: () => number;
};

export type ActivationFailureReason =
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
  | { ok: false; reason: ActivationFailureReason; message: string; details: ActivationCheckDetail[] };

const BEGIN_TEXT: Record<string, string> = {
  busy: "Another activation attempt is in progress. Wait about 90 seconds, then refresh.",
  step7_window_closed: "Step 7's approval window has ended or is invalid. Approve Step 7 again with a new expiry.",
  step8_proof_not_fresh:
    "Step 8 needs a passing signed self-test from the current Step 7 window (within 24 hours). Run Step 8 again.",
  mothership_stop_engaged: "Mothership's Emergency Stop is engaged, so nothing was sent. It was not released.",
  live_link_not_active: "Activate the live link (Step 9) first.",
  caps_not_confirmed: "Step 10 must be approved with the $10 cap and $5 daily limit confirmed.",
  steps_missing: "Approval records are incomplete; refresh the page.",
};

export function beginReasonText(reason: string | undefined): string {
  if (!reason) return "Activation prerequisites are not met.";
  const step = /^step(\d+)_not_approved$/.exec(reason);
  if (step) return `Step ${step[1]} must be approved first.`;
  return BEGIN_TEXT[reason] ?? `Activation prerequisites are not met (${reason}).`;
}

/** What still blocks execution after a successful activation (never "running" here). */
export function executionBlockers(s: JackboySafetySnapshot | null): string[] {
  const out: string[] = [];
  if (!s) out.push("Jackboy safety could not be read, so it counts as stopped.");
  else {
    if (s.killSwitch) out.push("Jackboy System Kill Switch is on.");
    if (s.emergencyStop) out.push("Jackboy CODE Emergency Stop is engaged.");
    if (!s.codeEnabled) out.push("Jackboy's saved CODE setting is off.");
    if (!s.authorization) out.push("OMNI autonomous work is not authorized in Jackboy.");
    if (s.blockedBy && out.length === 0) out.push(`Jackboy blocks autonomy (${s.blockedBy}).`);
  }
  out.push("No OMNI executor is connected, so no autonomous job can run.");
  return out;
}

function snapshotEvidence(s: JackboySafetySnapshot | null, failure: string | null) {
  return s
    ? {
        checkedAt: s.checkedAt,
        killSwitch: s.killSwitch,
        emergencyStop: s.emergencyStop,
        codeEnabled: s.codeEnabled,
        autonomousAllowed: s.autonomousAllowed,
        blockedBy: s.blockedBy,
        authorizationExpiresAt: s.authorization?.expiresAt ?? null,
        proofDigest: s.proofDigest,
      }
    : { unavailable: failure ?? "unknown" };
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
    return fail(begun.reason === "busy" ? "busy" : "rule", beginReasonText(begun.reason));
  if (begun.duplicate)
    return {
      ok: true,
      already: true,
      message:
        kind === "live_link"
          ? "The live link is already activated for the current approvals. Nothing was recorded twice."
          : "Autonomy authorization is already activated for the current approvals. Nothing was recorded twice.",
      blockers: [],
    };

  const finishFailed = async (reason: string) => {
    await deps.finish(kind, attempt, false, reason, {}).catch(() => "failed" as const);
  };

  // 1. Signed handshake (connection only).
  try {
    await deps.connect();
  } catch (error) {
    const c = classifyLiveLinkError(error);
    await finishFailed(`handshake_${c.kind}`);
    return fail(c.kind, `Not activated: ${c.message}`, c.details);
  }
  const handshakeAt = new Date(now()).toISOString();

  // 2. Signed safety snapshot (session-signed; answers only for a live session).
  let snapshot: JackboySafetySnapshot | null = null;
  let safetyFailure: string | null = null;
  try {
    snapshot = await deps.safety();
    await deps.recordSafety(snapshot);
  } catch (error) {
    safetyFailure = deps.safetyFailureReason(error);
    snapshot = null;
    await deps.recordSafetyFailure(safetyFailure).catch(() => {});
  }

  if (kind === "autonomy") {
    if (!snapshot) {
      await finishFailed("jackboy_safety_unavailable");
      return fail(
        "jackboy_safety",
        `Not activated: Jackboy's signed safety snapshot could not be read (${safetyFailure}). Jackboy's permit service must be installed and published first.`,
      );
    }
    const auth = snapshot.authorization;
    if (!auth || Date.parse(auth.expiresAt) <= now()) {
      await finishFailed("jackboy_authorization_missing");
      return fail(
        "jackboy_authorization",
        "Not activated: Jackboy shows no current OMNI autonomous authorization. Authorize it in Jackboy (OMNI page, passkey) first.",
      );
    }
  }

  const evidence = {
    handshakeAt,
    safety: snapshotEvidence(snapshot, safetyFailure),
    ...(kind === "autonomy"
      ? { caps: { perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5, openaiCapUsd: 10 }, executor: "none" }
      : {}),
  };
  let finished: FinishReply;
  try {
    finished = await deps.finish(kind, attempt, true, "verified", evidence);
  } catch {
    return fail(
      "not_recorded",
      "The handshake passed but the activation could not be recorded, so it is not active. Retrying is safe.",
    );
  }
  if (finished !== "active")
    return fail(
      "rule",
      finished === "superseded"
        ? "Not activated: approvals changed or another attempt replaced this one. Refresh and try again."
        : "Not activated: the database refused the activation (approvals changed or the attempt expired). Nothing is active.",
    );
  const blockers = kind === "autonomy" ? executionBlockers(snapshot) : [];
  const safetyText = snapshot
    ? `Jackboy safety: Kill Switch ${snapshot.killSwitch ? "on" : "off"}, CODE Emergency Stop ${snapshot.emergencyStop ? "engaged" : "released"}.`
    : `Jackboy safety could not be read (${safetyFailure}); it counts as stopped.`;
  return {
    ok: true,
    already: false,
    message:
      kind === "live_link"
        ? `Live link activated: Jackboy answered a signed handshake. ${safetyText} No job, self-test or CODE request was sent.`
        : `Autonomy authorization activated — not running. ${safetyText} Nothing was started.`,
    blockers,
  };
}
