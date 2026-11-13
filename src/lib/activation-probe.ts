/**
 * Plain-language Step 2/4 probe failures. Pure and client-safe: it reads only the
 * safe stage, HTTP status and allowlisted refusal code a link error carries,
 * never reply bodies or setting values.
 */
import type { ActivationCheckDetail } from "./activation-approvals";

export interface ProbeFailure {
  stage: string;
  status?: number | undefined;
  code?: string | undefined;
  /** Timeout only: deadline that expired, and whether any part of a reply had begun. */
  limitMs?: number | undefined;
  phase?: "reply" | "body" | undefined;
}

/** Jackboy gives up on the Railway runner after this long (mirrors its omni-remote-runner). */
export const JACKBOY_RUNNER_WAIT_SECONDS = 5;

/** Duck-typed so tests and callers need not import the server-only link client. */
export function probeFailure(error: unknown): ProbeFailure {
  if (!error || typeof error !== "object") return { stage: "unknown" };
  const e = error as {
    stage?: unknown;
    status?: unknown;
    code?: unknown;
    limitMs?: unknown;
    phase?: unknown;
  };
  return {
    stage: typeof e.stage === "string" ? e.stage : "unknown",
    status: typeof e.status === "number" ? e.status : undefined,
    code: typeof e.code === "string" ? e.code : undefined,
    limitMs:
      typeof e.limitMs === "number" && Number.isFinite(e.limitMs) && e.limitMs > 0
        ? e.limitMs
        : undefined,
    phase: e.phase === "reply" || e.phase === "body" ? e.phase : undefined,
  };
}

const BY_CODE: Record<string, string> = {
  link_disabled:
    "Jackboy's published site treated this as an ordinary link request, so it lacks the configuration probe. Publish Jackboy's probe update from the Jackboy project (its update 0063 is a separate approval there). Railway settings were not shown to be wrong.",
  configuration_check_unavailable:
    "Jackboy's probe is published but could not run: its link identity settings (including OMNI_LINK_OWNER_ID) are incomplete there, or its authorization update 0063 is not applied.",
  authentication_failed:
    "Jackboy rejected the signature: the client ID, bootstrap key or signing secret on Mothership and Jackboy do not match.",
  project_or_action_denied:
    "Jackboy refused the project: OMNI_LINK_PROJECT_ID differs between Mothership and Jackboy.",
  configuration_scope_denied:
    "Jackboy refused the check: its project/owner record does not match, its global pause is on, or the probe limit (60 per 10 minutes) was reached.",
  https_post_required:
    "Jackboy did not see an HTTPS request on its link address. Confirm JACKBOY_LINK_ORIGIN is Jackboy's final public HTTPS address.",
  invalid_request:
    "Jackboy could not read the request. Confirm both sides run the same link version.",
};

const BY_STAGE: Record<string, string> = {
  audit: "The probe could not be written to the audit log, so nothing was sent to Jackboy.",
  connection:
    "Mothership could not open a trusted HTTPS connection to Jackboy (address or certificate).",
  redirect:
    "Jackboy answered with a redirect. JACKBOY_LINK_ORIGIN must be the final HTTPS address, not one that forwards.",
  too_large: "Jackboy's reply was larger than allowed and was discarded.",
  proof:
    "Jackboy's reply signature did not verify: the signing secret differs, or something altered the reply.",
  contract:
    "Jackboy's reply was not the expected probe format (omni.link/v2, no execution, same project).",
  runner_mismatch:
    "Jackboy reports a different Railway runner address than Mothership's JACKBOY_LINK_RUNNER_ORIGIN.",
};

const seconds = (ms: number) => `${Math.round(ms / 100) / 10} s`;

/** Why a timeout happened, judged against Jackboy's own wait for the runner. */
export function timeoutExplanation(f: ProbeFailure): string {
  if (f.phase === "body")
    return "Jackboy started replying but the reply stalled before it finished. Retrying is safe: it sends one new read-only check.";
  if (f.limitMs === undefined)
    return "Jackboy did not answer in time. Retrying is safe; if it repeats, check that Jackboy's published site is online.";
  if (f.limitMs > JACKBOY_RUNNER_WAIT_SECONDS * 1000)
    return `Jackboy sent no answer within ${seconds(f.limitMs)}, though it stops waiting for the Railway runner after ${JACKBOY_RUNNER_WAIT_SECONDS} s. The delay is in Jackboy's site itself (starting, mid-publish or its database). Retrying is safe.`;
  return `Jackboy sent no answer within ${seconds(f.limitMs)}. Retrying is safe; if it repeats, check that Jackboy's published site is online.`;
}

/** Evidence lines for a failed probe: what answered, and the one thing to look at. */
export function probeFailureDetails(error: unknown): ActivationCheckDetail[] {
  const f = probeFailure(error);
  const reply =
    f.stage === "http"
      ? `HTTP ${f.status ?? "?"}${f.code ? ` · ${f.code}` : " · unrecognized reason"}`
      : f.stage === "unknown"
        ? "No classified reply"
        : f.stage === "timeout" && f.limitMs !== undefined
          ? `No usable reply (timeout after ${seconds(f.limitMs)}${f.phase === "body" ? ", reply incomplete" : ""})`
          : `No usable reply (${f.stage.replace("_", " ")})`;
  const detail =
    (f.code && BY_CODE[f.code]) ||
    (f.stage === "timeout" ? timeoutExplanation(f) : undefined) ||
    BY_STAGE[f.stage] ||
    (f.stage === "http"
      ? `Jackboy refused the probe with HTTP ${f.status ?? "?"}. Check its link settings and version.`
      : "The signed probe could not be completed. Check Mothership's link settings and retry.");
  return [
    { label: "Jackboy reply", status: "needs_attention", detail: reply },
    { label: "Likely cause", status: "needs_attention", detail },
  ];
}
