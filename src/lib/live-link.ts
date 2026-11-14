/**
 * Activation Steps 9–10: live signed link vs CODE, as two separate statuses.
 * Pure and client-safe. Step 9 permits only a connection-only signed handshake
 * (no job, no self-test, no CODE). CODE is never turned on from Mothership:
 * there is no CODE request path here, and CODE runs only inside Jackboy behind
 * its own Kill Switch, CODE Emergency Stop, saved CODE switch, passkey and caps.
 */
import { isEffectivelyApproved, type ActivationCheckDetail, type ApprovalRow } from "./activation-approvals";
import type { ReadinessItem } from "./activation-self-test";
import { probeFailure } from "./activation-probe";

/** Readiness keys (from Step 8's readiness list) that also gate a connection-only handshake. */
export const LIVE_LINK_READINESS_KEYS = ["stop", "owner", "link", "window", "identity"] as const;
/** A verified handshake older than this is shown as "last verified", not "verified now". */
export const LIVE_LINK_FRESH_MS = 15 * 60_000;

export type LiveLinkState =
  /** Steps 1–8 are not all effectively approved (or Step 7's window ended). */
  | "earlier_steps"
  /** Steps 1–8 done; the owner has not approved Step 9. */
  | "awaiting_step9"
  /** Step 9 approved, but a Mothership setting or the Emergency Stop blocks a connection check. */
  | "blocked"
  /** Step 9 approved and every Mothership gate passes; no recent verified handshake. */
  | "ready_to_check"
  /** A signed handshake verified within LIVE_LINK_FRESH_MS and nothing blocks it now. */
  | "verified";

export interface LiveLinkInput {
  rows: ApprovalRow[];
  readiness: ReadinessItem[];
  now: number;
  lastConnectedAt: string | null;
  lastAttemptAt: string | null;
}

export interface LiveLinkStatus {
  state: LiveLinkState;
  canCheck: boolean;
  /** First blocker in plain language, null when the check may be sent. */
  blocker: string | null;
  items: ReadinessItem[];
  step7EndsAt: string | null;
  step8ApprovedAt: string | null;
  lastConnectedAt: string | null;
  lastAttemptFailed: boolean;
}

export function liveLinkStatus(input: LiveLinkInput): LiveLinkStatus {
  const row = (step: number) => input.rows.find((r) => r.step === step);
  const earlier = input.rows.filter((r) => r.step <= 8).every((r) => isEffectivelyApproved(r, input.now));
  const step9 = row(9);
  const step9Approved = step9 ? isEffectivelyApproved(step9, input.now) : false;
  const items = input.readiness.filter((i) =>
    (LIVE_LINK_READINESS_KEYS as readonly string[]).includes(i.key),
  );
  const missingKeys = LIVE_LINK_READINESS_KEYS.filter((k) => !items.some((i) => i.key === k));
  const failing = items.find((i) => !i.ok);
  const lastAttemptFailed =
    input.lastAttemptAt !== null &&
    (input.lastConnectedAt === null || input.lastConnectedAt < input.lastAttemptAt);
  const connectedAge = input.lastConnectedAt ? input.now - Date.parse(input.lastConnectedAt) : NaN;
  const recentlyVerified =
    Number.isFinite(connectedAge) && connectedAge >= -60_000 && connectedAge <= LIVE_LINK_FRESH_MS && !lastAttemptFailed;

  let state: LiveLinkState;
  let blocker: string | null = null;
  if (!earlier) {
    state = "earlier_steps";
    blocker = "Steps 1–8 must be approved and Step 7's window still open.";
  } else if (!step9Approved) {
    state = "awaiting_step9";
    blocker = "Approve Step 9 to allow connection-only checks of the live link.";
  } else if (missingKeys.length > 0) {
    state = "blocked";
    blocker = "Mothership's link readiness could not be read, so nothing will be sent.";
  } else if (failing) {
    state = "blocked";
    blocker = `${failing.label}: ${failing.detail}`;
  } else {
    state = recentlyVerified ? "verified" : "ready_to_check";
  }
  return {
    state,
    canCheck: state === "ready_to_check" || state === "verified",
    blocker,
    items,
    step7EndsAt: row(7)?.approval_expires_at ?? null,
    step8ApprovedAt: row(8)?.status === "approved" ? (row(8)?.decided_at ?? null) : null,
    lastConnectedAt: input.lastConnectedAt,
    lastAttemptFailed,
  };
}

export interface CodeStatus {
  /** Always "off": Mothership has no CODE request path and never turns CODE on. */
  state: "off";
  step10Recorded: boolean;
  reasons: string[];
}

export function codeStatus(rows: ApprovalRow[], now: number): CodeStatus {
  const step10 = rows.find((r) => r.step === 10);
  const step10Recorded = step10 ? isEffectivelyApproved(step10, now) : false;
  return {
    state: "off",
    step10Recorded,
    reasons: [
      step10Recorded
        ? "Step 10 is recorded (cap confirmations only). It did not turn CODE on."
        : "Step 10 is not recorded. Approving it records your cap confirmations only; it does not turn CODE on.",
      "Mothership has no CODE request path: nothing here can start CODE or spend on OpenAI.",
      "CODE runs only inside Jackboy, behind its own Kill Switch, CODE Emergency Stop, saved CODE switch, passkey and $5 daily / $10 total limits.",
    ],
  };
}

export type LiveLinkFailureKind = "safety_denial" | "timeout" | "refused" | "link_failure" | "invalid_reply";

const BY_CODE: Record<string, { kind: LiveLinkFailureKind; message: string }> = {
  grant_unavailable: {
    kind: "safety_denial",
    message:
      "Safety denial from Jackboy: its global Kill Switch is on, or its saved link approval / owner-project record is not valid. Jackboy refuses even a connection check while paused. Nothing ran and nothing was changed.",
  },
  kill_switch_on: {
    kind: "safety_denial",
    message:
      "Safety denial: Jackboy's global Kill Switch is on, so it refused the connection check. Nothing ran.",
  },
  link_disabled: {
    kind: "refused",
    message:
      "Jackboy's link is off or outside its approval window there (OMNI_LINK_ENABLED, or its approval expiry is missing, past or more than 24 hours ahead).",
  },
  authentication_failed: {
    kind: "refused",
    message:
      "Jackboy rejected the signature: client ID, bootstrap key or signing secret differ between Mothership and Jackboy.",
  },
  project_denied: {
    kind: "refused",
    message: "Jackboy refused the project: OMNI_LINK_PROJECT_ID differs between Mothership and Jackboy.",
  },
  project_or_action_denied: {
    kind: "refused",
    message: "Jackboy refused this project or action: OMNI_LINK_PROJECT_ID differs.",
  },
  session_limit: {
    kind: "refused",
    message: "Jackboy already holds its maximum of open link sessions. Wait about 5 minutes and retry.",
  },
  session_expired_or_invalid: {
    kind: "refused",
    message: "Jackboy reported the link session expired or invalid. Retrying opens a new one.",
  },
};

/** Plain-language failure from a link error's safe stage/status/code only. Retrying is always safe. */
export function classifyLiveLinkError(error: unknown): {
  kind: LiveLinkFailureKind;
  message: string;
  details: ActivationCheckDetail[];
} {
  const f = probeFailure(error);
  const msg = error instanceof Error ? error.message : "";
  let kind: LiveLinkFailureKind;
  let message: string;
  if (f.stage === "http" && f.code && BY_CODE[f.code]) {
    ({ kind, message } = BY_CODE[f.code]!);
  } else if (f.stage === "http" && f.status === 403) {
    kind = "safety_denial";
    message = "Safety denial: Jackboy refused the connection check (HTTP 403). Nothing ran.";
  } else if (f.stage === "http") {
    kind = "refused";
    message = `Jackboy refused the connection check (HTTP ${f.status ?? "?"}).`;
  } else if (f.stage === "timeout") {
    kind = "timeout";
    const limit = f.limitMs ? ` within ${Math.round(f.limitMs / 100) / 10} s` : "";
    message = `Timeout: Jackboy sent no usable reply${limit}. Retrying is safe; it sends one new handshake only.`;
  } else if (f.stage === "unknown" && /not ready|invalid/i.test(msg)) {
    kind = "invalid_reply";
    message =
      "Jackboy answered but did not report a ready session with the expected scopes, so the link is not verified.";
  } else {
    kind = "link_failure";
    message =
      f.stage === "proof"
        ? "Jackboy's reply signature did not verify, so it is not evidence."
        : f.stage === "audit"
          ? "The check could not be written to the audit log, so it was stopped before sending."
          : `The signed link did not complete (${f.stage.replace("_", " ")}). Retrying is safe.`;
  }
  const reply =
    f.stage === "http"
      ? `HTTP ${f.status ?? "?"}${f.code ? ` · ${f.code}` : ""}`
      : f.stage === "unknown"
        ? "No classified reply"
        : `No usable reply (${f.stage.replace("_", " ")})`;
  return {
    kind,
    message,
    details: [
      { label: "Jackboy reply", status: "needs_attention", detail: reply },
      { label: "What this means", status: "needs_attention", detail: message.slice(0, 280) },
    ],
  };
}
