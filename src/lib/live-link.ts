/**
 * Activation Steps 9–10 status. Pure and client-safe. Step 9 activates the signed live link
 * (connection checks and Jackboy safety reads only); Step 10 activates autonomy authorization.
 * Neither starts work: execution also needs every stop released, a fresh Jackboy reading that
 * allows autonomy and a Jackboy permit per job, and no OMNI executor is connected in this build.
 */
import { isEffectivelyApproved, type ActivationCheckDetail, type ApprovalRow } from "./activation-approvals";
import type { ReadinessItem } from "./activation-self-test";
import { probeFailure } from "./activation-probe";
import type { SafetyView } from "./jackboy-safety";

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

export type OnOff = "on" | "off" | "unknown";
export type StopState = "engaged" | "released" | "unknown";

export interface SystemStates {
  /** Step 9 activation: configured = in effect; connected = also a signed exchange in the last 15 min. */
  link: { state: "not_configured" | "configured" | "connected"; detail: string };
  /** Step 10 activation. "running" only when the database shows open autonomy windows or agent jobs. */
  autonomous: { state: "not_configured" | "configured_blocked" | "running"; blockers: string[] };
  /** CODE through OMNI. "running" only when the database shows leased/running CODE jobs. */
  code: { state: "not_configured" | "configured_blocked" | "running"; blockers: string[] };
  emergencyStop: { jackboy: StopState; mothership: StopState };
  killSwitch: OnOff;
}

export interface SystemInput {
  linkEffective: boolean;
  autonomyEffective: boolean;
  liveLink: LiveLinkStatus;
  safety: SafetyView;
  /** Mothership's own Emergency Stop: true engaged, false released, null unreadable. */
  mothershipStop: boolean | null;
  running: { windows: number; agentJobs: number; codeJobs: number };
  now: number;
}

/** Five separate, truthful states; unknown always counts as blocked. */
export function systemStates(i: SystemInput): SystemStates {
  const pollAge =
    i.safety.source === "poll" && i.safety.recordedAt ? i.now - Date.parse(i.safety.recordedAt) : NaN;
  const recentExchange =
    i.liveLink.state === "verified" || (Number.isFinite(pollAge) && pollAge >= -60_000 && pollAge <= LIVE_LINK_FRESH_MS);
  const link: SystemStates["link"] = !i.linkEffective
    ? { state: "not_configured", detail: "Step 9 live link is not activated for the current approvals." }
    : recentExchange
      ? { state: "connected", detail: "Activated; a signed exchange with Jackboy verified in the last 15 minutes." }
      : { state: "configured", detail: "Activated; no signed exchange verified in the last 15 minutes." };
  const mothership: StopState = i.mothershipStop === null ? "unknown" : i.mothershipStop ? "engaged" : "released";
  const common: string[] = [];
  if (mothership !== "released") common.push(`Mothership Emergency Stop ${mothership}.`);
  if (!i.safety.clear) common.push(`Jackboy safety: ${i.safety.label}.`);
  if (!i.linkEffective) common.push("Live link (Step 9) not activated.");
  const autonomousBlockers = [...common, "No OMNI executor is connected."];
  const codeBlockers = [...common];
  if (i.safety.codeEnabled !== "on") codeBlockers.push(`Jackboy CODE setting ${i.safety.codeEnabled}.`);
  codeBlockers.push("Each CODE job also needs its own Jackboy permit; no OMNI executor is connected.");
  return {
    link,
    autonomous: {
      state:
        i.running.windows + i.running.agentJobs > 0
          ? "running"
          : i.autonomyEffective
            ? "configured_blocked"
            : "not_configured",
      blockers: i.autonomyEffective ? autonomousBlockers : ["Step 10 autonomy authorization is not activated.", ...autonomousBlockers],
    },
    code: {
      state: i.running.codeJobs > 0 ? "running" : i.autonomyEffective ? "configured_blocked" : "not_configured",
      blockers: i.autonomyEffective ? codeBlockers : ["Step 10 autonomy authorization is not activated.", ...codeBlockers],
    },
    emergencyStop: { jackboy: i.safety.codeStop, mothership },
    killSwitch: i.safety.killSwitch,
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
