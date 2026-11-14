/**
 * Step 8 "Run protocol self-test & verify": pure, client-safe rules.
 * Readiness reads only presence/booleans (never setting values); attempt stages come
 * from the attempt's own audit trail so a retry never resubmits or reruns a job that
 * may already have reached Jackboy.
 */
import type { ActivationCheckDetail } from "./activation-approvals";
import { probeFailure } from "./activation-probe";

/** Mothership's total budget for one owner click; Jackboy calls are individually bounded too. */
export const SELF_TEST_SERVER_BUDGET_MS = 28_000;
/** The page stops waiting after this; the server may still finish and record. */
export const SELF_TEST_CLIENT_TIMEOUT_MS = 40_000;
/** Pause between status reads while Jackboy reports the job queued/running. */
export const SELF_TEST_POLL_GAP_MS = 1_500;
export const SELF_TEST_MAX_POLLS = 3;
/** A status read needs this much budget left (Mothership's 5 s status deadline + headroom). */
export const SELF_TEST_STATUS_RESERVE_MS = 6_000;
/** Another attempt with a run requested this recently and no result blocks a new one. */
export const SELF_TEST_IN_FLIGHT_MS = 3 * 60_000;
export const SELF_TEST_ATTEMPT_KEY = "omni.activation.step8.attempt";

export type ReadinessItem = { key: string; label: string; ok: boolean; detail: string };

export interface ReadinessInput {
  deploymentMode: "runner_only" | "unknown" | "inconsistent";
  stopReleased: boolean;
  ownerMatches: boolean;
  linkEnabled: boolean;
  selfTestEnabled: boolean;
  /** Parsed OMNI_LINK_APPROVAL_EXPIRES_AT (ms), NaN when missing/unparseable. */
  approvalExpiresAt: number;
  identityValid: boolean;
  now: number;
}

/** What must hold before Mothership may send the self-test. Each failing item names the next step. */
export function selfTestReadiness(input: ReadinessInput): ReadinessItem[] {
  const exp = input.approvalExpiresAt;
  const windowOk = Number.isFinite(exp) && exp > input.now && exp <= input.now + 86_400_000;
  return [
    {
      key: "deployment",
      label: "Runner-only deployment",
      ok: input.deploymentMode === "runner_only",
      detail:
        input.deploymentMode === "runner_only"
          ? "Jackboy and the Railway runner are configured separately."
          : "Mothership cannot confirm runner-only mode (JACKBOY_LINK_ORIGIN / JACKBOY_LINK_RUNNER_ORIGIN).",
    },
    {
      key: "stop",
      label: "Mothership Emergency Stop",
      ok: input.stopReleased,
      detail: input.stopReleased
        ? "Released (read from the server)."
        : "Engaged or unreadable. Nothing will be sent. It is never released from this page; release it in OMNI Terminal only if you choose to.",
    },
    {
      key: "owner",
      label: "Link owner",
      ok: input.ownerMatches,
      detail: input.ownerMatches
        ? "JACKBOY_LINK_MOTHERSHIP_OWNER_ID matches you."
        : "JACKBOY_LINK_MOTHERSHIP_OWNER_ID does not match your account.",
    },
    {
      key: "link",
      label: "Link switch (JACKBOY_LINK_ENABLED)",
      ok: input.linkEnabled,
      detail: input.linkEnabled ? "On." : "Off: set it to exactly true in Mothership's settings.",
    },
    {
      key: "self_test",
      label: "Self-test switch (JACKBOY_LINK_SELF_TEST_ENABLED)",
      ok: input.selfTestEnabled,
      detail: input.selfTestEnabled
        ? "On: the fixed protocol self-test may be sent."
        : "Off or missing: set it to exactly true in Mothership's settings to allow the fixed self-test. It enables nothing else.",
    },
    {
      key: "window",
      label: "Link approval window (OMNI_LINK_APPROVAL_EXPIRES_AT)",
      ok: windowOk,
      detail: windowOk
        ? "Open (in the future, at most 24 hours ahead)."
        : !Number.isFinite(exp)
          ? "Missing or not a date: set it to a time at most 24 hours ahead, e.g. your Step 7 expiry."
          : exp <= input.now
            ? "Expired: set it to a new time at most 24 hours ahead, e.g. your Step 7 expiry."
            : "More than 24 hours ahead: set a time at most 24 hours ahead.",
    },
    {
      key: "identity",
      label: "Link identity settings",
      ok: input.identityValid,
      detail: input.identityValid
        ? "Client ID, project, bootstrap key and signing secret are present and well-formed (values not shown)."
        : "OMNI_LINK_CLIENT_ID / PROJECT_ID / BOOTSTRAP_KEY / HMAC_SECRET are missing or malformed.",
    },
  ];
}

export type AttemptStage =
  | "new"
  /** Submit was sent but no reply was recorded: Jackboy may or may not hold the job. */
  | "submit_unconfirmed"
  | "queued"
  /** Run was sent: never run again, only read status. */
  | "run_requested"
  | "finished_passed"
  | "finished_failed"
  /** Jackboy reported the job cancelled or otherwise closed without a result. */
  | "closed";

const TERMINAL = ["completed", "failed", "cancelled", "timed_out"];

/** Stage from this attempt's own audit actions, oldest first. */
export function attemptStage(actions: string[]): AttemptStage {
  if (actions.includes("self_test_passed")) return "finished_passed";
  if (actions.includes("self_test_failed")) return "finished_failed";
  if (actions.includes("request_run")) return "run_requested";
  const submitAt = actions.lastIndexOf("request_submit");
  if (submitAt === -1) return "new";
  const result = actions.slice(submitAt + 1).find((a) => a.startsWith("result_"));
  if (!result) return "submit_unconfirmed";
  const status = result.slice("result_".length);
  if (status === "queued" || status === "running") return "queued";
  return TERMINAL.includes(status) ? "closed" : "submit_unconfirmed";
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
export type SelfTestJob = {
  id: string;
  status: string;
  result: { passed: boolean; checks: number; runner: string } | null;
};

/** Only a proof-checked terminal job is self-test evidence; cancelled/unfinished are not. */
export function selfTestAuditAction(job: SelfTestJob): "self_test_passed" | "self_test_failed" | null {
  if (job.status === "completed" && job.result?.passed === true) return "self_test_passed";
  if (
    (job.status === "completed" && job.result?.passed === false) ||
    job.status === "failed" ||
    job.status === "timed_out"
  )
    return "self_test_failed";
  return null;
}

export const isUnfinished = (status: string) => status === "queued" || status === "running";

/** Any other attempt that asked Jackboy to run recently and has no result yet. */
export function otherAttemptInFlight(
  rows: Array<{ action: string; record_id: string; occurred_at: string }>,
  attemptId: string,
  now: number,
): string | null {
  const byAttempt = new Map<string, string[]>();
  for (const row of rows) {
    if (row.record_id === attemptId) continue;
    if (now - Date.parse(row.occurred_at) > SELF_TEST_IN_FLIGHT_MS) continue;
    byAttempt.set(row.record_id, [...(byAttempt.get(row.record_id) ?? []), row.action]);
  }
  for (const [id, actions] of byAttempt) {
    if (!actions.includes("request_run")) continue;
    if (actions.some((a) => a.startsWith("self_test_") || ["result_completed", "result_failed", "result_cancelled", "result_timed_out"].includes(a)))
      continue;
    return id;
  }
  return null;
}

export type FailureKind = "safety_denial" | "timeout" | "refused" | "link_failure" | "invalid_reply";

const DENIAL_BY_CODE: Record<string, string> = {
  kill_switch_on:
    "Safety denial: Jackboy's global Kill Switch is on, so it refused the self-test. Nothing ran. It stays on unless you release it in Jackboy yourself.",
  configuration_scope_denied:
    "Safety denial from Jackboy: its global pause/Kill Switch is on, its project/owner record does not match, or a rate limit was reached. Nothing ran.",
  project_or_action_denied:
    "Jackboy refused this project or action (OMNI_LINK_PROJECT_ID or the self-test scope differs). Nothing ran.",
};
const REFUSED_BY_CODE: Record<string, string> = {
  link_disabled: "Jackboy's link is disabled on its published site. Nothing ran.",
  authentication_failed:
    "Jackboy rejected the signature or session: client ID, bootstrap key or signing secret differ. Nothing ran.",
  https_post_required: "Jackboy did not receive an HTTPS POST on its link address.",
  invalid_request: "Jackboy rejected the request format; its link version may differ from Mothership's.",
};

/** Plain-language classification from a link error's safe stage/status/code only. */
export function classifySelfTestError(
  error: unknown,
  sentRun: boolean,
): { kind: FailureKind; message: string; details: ActivationCheckDetail[] } {
  const f = probeFailure(error);
  const msg = error instanceof Error ? error.message : "";
  const after = sentRun
    ? " The run request may have reached Jackboy, so retrying only reads this job's status; it never runs it again."
    : " Retrying is safe.";
  let kind: FailureKind;
  let message: string;
  if (f.stage === "timeout") {
    kind = "timeout";
    const limit = f.limitMs ? ` within ${Math.round(f.limitMs / 100) / 10} s` : "";
    message = `Timeout: Jackboy sent no usable reply${limit}${f.phase === "body" ? " (reply started but stalled)" : ""}.${after}`;
  } else if (f.stage === "http" && f.code && DENIAL_BY_CODE[f.code]) {
    kind = "safety_denial";
    message = DENIAL_BY_CODE[f.code]!;
  } else if (f.stage === "http" && f.status === 403) {
    kind = "safety_denial";
    message = "Safety denial: Jackboy refused the self-test (HTTP 403). Nothing ran.";
  } else if (f.stage === "http") {
    kind = "refused";
    message =
      (f.code && REFUSED_BY_CODE[f.code]) ||
      `Jackboy refused the request (HTTP ${f.status ?? "?"}).${after}`;
  } else if (f.stage === "unknown" && /invalid|not ready/i.test(msg)) {
    kind = "invalid_reply";
    message = `Jackboy's signed reply was not a valid self-test session, job or result, so it is not evidence.${after}`;
  } else {
    kind = "link_failure";
    message =
      f.stage === "proof"
        ? "Jackboy's reply signature did not verify, so it is not evidence."
        : f.stage === "audit"
          ? "The attempt could not be written to the audit log, so it was stopped."
          : `The signed link did not complete (${f.stage.replace("_", " ")}).${after}`;
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
