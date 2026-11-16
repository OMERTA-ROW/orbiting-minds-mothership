/**
 * Step 9/10 backend actuation helpers. Pure and client-safe: the connection window sent to Jackboy
 * and a nonsecret classification of an actuation failure (stage, HTTP status, allowlisted code).
 */

/** Local reasons Mothership itself refuses or rejects an actuation (never reply contents). */
export type ActuationIssue =
  | "window_unavailable"
  | "jackboy_window_ended"
  | "state_mismatch"
  | "identity_changed"
  | "executor_unverified"
  | "release_mismatch";

export class ActuationError extends Error {
  readonly issue: ActuationIssue;
  constructor(issue: ActuationIssue, message: string) {
    super(message);
    this.issue = issue;
  }
}

/**
 * The connection end Mothership asks Jackboy for: the earlier of Mothership's Step 7 window and the
 * Jackboy link approval Mothership is configured with. Jackboy refuses (`approval_expired`) any
 * connection that would outlast its own approval, so sending Step 7 alone fails once the owner
 * renews Step 7 past Jackboy's approval.
 */
export function connectionExpiresAt(
  step7EndsAt: string | null | undefined,
  jackboyApprovalEndsAt: number,
  now: number,
): string {
  const step7 = Date.parse(step7EndsAt ?? "");
  if (!Number.isFinite(step7) || step7 <= now)
    throw new ActuationError("window_unavailable", "Step 7's approval window is unavailable or ended.");
  if (!Number.isFinite(jackboyApprovalEndsAt) || jackboyApprovalEndsAt <= now + 60_000)
    throw new ActuationError(
      "jackboy_window_ended",
      "Jackboy's link approval (as configured in Mothership) has ended or ends within a minute.",
    );
  return new Date(Math.min(step7, jackboyApprovalEndsAt)).toISOString();
}

type ExecState = {
  connected: boolean;
  configured: boolean;
  armed: boolean;
  executorRelease: string | null;
  operationId: string | null;
};

/**
 * Step 10 backend actuation. Jackboy configures only after a fresh (<15 min) verification of the
 * same executor release recorded since the latest Step 9 connect, so verify immediately before
 * configuring. Verification runs the executor's harmless self-test; it never arms or starts work.
 */
export async function verifyThenConfigure<S extends ExecState>(
  read: (operation: "verify" | "configure") => Promise<S>,
  reviewedRelease: string,
): Promise<S> {
  const verified = await read("verify");
  if (!verified.connected || verified.armed || !verified.executorRelease)
    throw new ActuationError("executor_unverified", "Executor verification was not recorded");
  if (verified.executorRelease !== reviewedRelease)
    throw new ActuationError("release_mismatch", "Verified executor release is not reviewed");
  const state = await read("configure");
  if (!state.connected || !state.configured || state.armed)
    throw new ActuationError("state_mismatch", "Backend actuation did not verify");
  if (state.executorRelease !== verified.executorRelease)
    throw new ActuationError("release_mismatch", "Configured executor release changed");
  return state;
}

/** Earlier of two optional ISO times (null when neither parses). */
export function earlierOf(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = Date.parse(a ?? "");
  const y = Date.parse(b ?? "");
  if (!Number.isFinite(x) && !Number.isFinite(y)) return null;
  if (!Number.isFinite(x)) return new Date(y).toISOString();
  if (!Number.isFinite(y)) return new Date(x).toISOString();
  return new Date(Math.min(x, y)).toISOString();
}

const CODE_TEXT: Record<string, string> = {
  approval_expired:
    "Jackboy refused because the requested connection would outlast Jackboy's own link approval. Renew the link approval in Jackboy (and the matching OMNI_LINK_APPROVAL_EXPIRES_AT setting in Mothership), then retry.",
  approval_expired_or_link_disabled:
    "Jackboy refused because its link approval has ended or its OMNI link is turned off in Jackboy. Renew or enable it in Jackboy, then retry.",
  approval_unavailable:
    "Jackboy has no saved link approval. Save the link approval in Jackboy with its passkey, then retry.",
  release_unreviewed:
    "Jackboy refused because the executor release is not the reviewed release in Jackboy's settings.",
  execution_control_unavailable:
    "Jackboy's execution authority refused or was unavailable (for example its global Kill Switch / automation pause is on, or jobs from an earlier link still need reconciling). Check Jackboy's controls; nothing was changed.",
  cancellation_unverified: "Jackboy could not verify cancellation of earlier work.",
  authentication_failed:
    "Jackboy did not accept Mothership's signed request (link identity or keys do not match).",
  project_or_action_denied: "Jackboy refused this action for this project.",
  replay: "Jackboy rejected the request as a replay. Retry once.",
  executor_verification_required:
    "Jackboy needs a fresh executor verification (same release, under 15 minutes, after the latest Step 9 connect) before configuring. Mothership verifies right before configuring, so the verification did not hold; retry once, and check the executor if it repeats.",
  owner_authorization_required:
    "Jackboy needs fresh owner authorization of OMNI autonomy. Authorize it in Jackboy with its passkey, then retry.",
  connection_not_authorized:
    "Jackboy's execution connection is not open for this approval. Deactivate and re-activate Step 9, then retry Step 10.",
  spend_enforcement_unverified:
    "Jackboy could not verify its CODE spending enforcement (hard cap, spend meter, $5 daily / $10 total guard, or its Kill Switch is on). Fix this in Jackboy's CODE settings; Mothership's caps were not changed.",
  execution_blocked:
    "Jackboy blocks execution (a stop is engaged, CODE is off, or spending enforcement is not verified). Nothing was released.",
  code_configuration_not_ready:
    "Jackboy's CODE gateway, workflow identity or spending enforcement is not ready. Complete Jackboy's CODE readiness checks, then retry.",
  session_limit:
    "Jackboy already holds its maximum of open link sessions. They expire within 5 minutes; Mothership now reuses one shared session, so retry shortly.",
  handshake_id_expired_or_conflict: "Jackboy's shared link session ended. Retrying opens a new one.",
};

const STAGE_TEXT: Record<string, string> = {
  request: "request check",
  nonce: "replay protection",
  approval: "link approval",
  readiness: "CODE readiness",
  executor: "staging executor (Vultr)",
  verification: "executor verification",
  authority: "execution authority (database)",
  cancellation: "cancellation",
};

const ISSUE_TEXT: Record<ActuationIssue, string> = {
  window_unavailable: "Step 7's approval window could not be read or has ended. Renew Step 7, then retry.",
  jackboy_window_ended:
    "Jackboy's link approval (OMNI_LINK_APPROVAL_EXPIRES_AT in Mothership) has ended. Renew it in Jackboy and update the Mothership setting, then retry.",
  state_mismatch:
    "Jackboy answered, but its signed state did not show this connection (or showed it armed), so it was not trusted.",
  identity_changed: "Jackboy's connection belongs to a different activation attempt.",
  executor_unverified:
    "Jackboy did not record a passing executor verification, so Step 10 was not configured. Check the staging executor (Vultr) (its self-test must pass).",
  release_mismatch:
    "The executor release Jackboy verified is not the reviewed release Mothership accepts, so Step 10 was not configured.",
};

/** Nonsecret reason suffix and owner-facing explanation for a failed actuation. */
export function describeActuationFailure(error: unknown): { reason: string; message: string } {
  if (error instanceof ActuationError) return { reason: error.issue, message: ISSUE_TEXT[error.issue] };
  const e = error as {
    stage?: unknown;
    status?: unknown;
    code?: unknown;
    remoteStage?: unknown;
    signed?: unknown;
  } | null;
  if (e && typeof e.stage === "string") {
    const code = typeof e.code === "string" ? e.code : "";
    const status = typeof e.status === "number" ? e.status : null;
    // Jackboy's own stage counts only on a signed refusal (the client keeps it only then).
    const remote =
      e.signed === true && typeof e.remoteStage === "string" && STAGE_TEXT[e.remoteStage]
        ? e.remoteStage
        : "";
    const reason = ["jackboy", e.stage, status ? String(status) : "", code, remote]
      .filter(Boolean)
      .join("_")
      .slice(0, 80);
    const where = remote ? ` (Jackboy refused at: ${STAGE_TEXT[remote]}.)` : "";
    const base =
      (code && CODE_TEXT[code]) ||
      (e.stage === "timeout"
        ? "Jackboy did not answer in time."
        : e.stage === "proof"
          ? "Jackboy's reply signature did not verify, so it is not evidence."
          : e.stage === "http"
            ? `Jackboy refused the request (HTTP ${status ?? "?"}) without a recognised reason.`
            : `The signed request did not complete (${e.stage}).`);
    return { reason, message: base + where };
  }
  return {
    reason: "state_unverified",
    message: "Jackboy's signed state was stale, malformed or for another project, so it was not trusted.",
  };
}
