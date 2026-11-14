/**
 * Jackboy safety state as seen by Mothership. Pure and client-safe.
 * "clear" is shown only for a fresh, signed reading with no pause, no CODE stop and Jackboy allowing autonomy;
 * everything else (engaged, paused, unknown, stale) means OMNI autonomy and CODE stay halted.
 */
import { z } from "zod";

export const SAFETY_EVENT_CONTRACT = "jackboy.safety-event/v1";
export const SAFETY_EVENT_PATH = "/api/public/jackboy/safety-event";
/** Accepted clock difference for signed notices. */
export const SAFETY_EVENT_SKEW_S = 60;
export const SAFETY_EVENT_MAX_BYTES = 4096;

export const safetyEventSchema = z
  .object({
    contract: z.literal(SAFETY_EVENT_CONTRACT),
    projectId: z.string().uuid(),
    event: z.enum(["code_stop_engaged", "global_pause_engaged"]),
    paused: z.boolean().nullable(),
    codeStop: z.boolean().nullable(),
    codeEnabled: z.boolean().nullable(),
    cancellation: z
      .enum(["not_needed", "pending", "requested", "confirmed", "completed", "unverified"])
      .nullable(),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((e) => (e.event === "code_stop_engaged" ? e.codeStop === true : e.paused === true), {
    message: "The notice must report the stop it names.",
  });
export type SafetyEvent = z.infer<typeof safetyEventSchema>;

/** Exact bytes Jackboy signs (HMAC-SHA256, lowercase hex) for a safety notice. */
export function safetyEventMessage(timestamp: string, nonce: string, body: string): string {
  return `${SAFETY_EVENT_CONTRACT}\nPOST\n${SAFETY_EVENT_PATH}\n${timestamp}\n${nonce}\n${body}`;
}

export type SafetyRow = {
  state: "clear" | "engaged" | "paused" | "unknown";
  paused: boolean | null;
  code_stop: boolean | null;
  code_enabled: boolean | null;
  cancellation: string | null;
  observed_at: string | null;
  expires_at: string | null;
  source: "none" | "poll" | "event" | "failure" | "stale";
  reason: string;
  recorded_at: string;
  /** omni.safety/v1 fields (absent on rows recorded before they existed). */
  autonomous_allowed?: boolean | null;
  manual_allowed?: boolean | null;
  blocked_by?: string | null;
  authorization_expires_at?: string | null;
  active_permits?: number | null;
};

export type SafetyViewState = "clear" | "engaged" | "paused" | "unknown" | "stale";

export interface SafetyView {
  state: SafetyViewState;
  label: string;
  detail: string;
  /** True only when OMNI may admit autonomy/CODE as far as Jackboy safety is concerned. */
  clear: boolean;
  /** Jackboy's own verdict on OMNI autonomous work in the latest verified snapshot. */
  autonomousAllowed: "yes" | "no" | "unknown";
  /** True only while the last verified reading says manual diagnostics are not allowed (Kill Switch on). */
  manualBlocked: boolean;
  blockedBy: string | null;
  authorizationExpiresAt: string | null;
  killSwitch: "on" | "off" | "unknown";
  codeStop: "engaged" | "released" | "unknown";
  codeEnabled: "on" | "off" | "unknown";
  observedAt: string | null;
  recordedAt: string | null;
  source: SafetyRow["source"];
}

const yn = <T extends string>(v: boolean | null, t: T, f: T): T | "unknown" =>
  v === null ? "unknown" : v ? t : f;

export function safetyView(row: SafetyRow | null, now: number): SafetyView {
  if (!row) {
    return {
      state: "unknown",
      label: "Unknown",
      detail: "Jackboy's safety state could not be read here, so OMNI autonomy and CODE stay halted.",
      clear: false,
      killSwitch: "unknown",
      codeStop: "unknown",
      codeEnabled: "unknown",
      observedAt: null,
      recordedAt: null,
      source: "none",
    };
  }
  const expires = row.expires_at ? Date.parse(row.expires_at) : NaN;
  const observed = row.observed_at ? Date.parse(row.observed_at) : NaN;
  const fresh =
    row.state === "clear" &&
    row.source === "poll" &&
    Number.isFinite(expires) &&
    expires > now &&
    Number.isFinite(observed) &&
    observed > now - 180_000;
  const known = row.source === "poll" || row.source === "event";
  const allowed = fresh && row.autonomous_allowed === true;
  const base = {
    autonomousAllowed: (fresh ? (row.autonomous_allowed === true ? "yes" : row.autonomous_allowed === false ? "no" : "unknown") : "unknown") as SafetyView["autonomousAllowed"],
    manualBlocked: row.paused === true || row.manual_allowed === false,
    blockedBy: fresh ? (row.blocked_by ?? null) : null,
    authorizationExpiresAt: row.authorization_expires_at ?? null,
    killSwitch: known ? yn(row.paused, "on", "off") : ("unknown" as const),
    codeStop: known ? yn(row.code_stop, "engaged", "released") : ("unknown" as const),
    codeEnabled: known ? yn(row.code_enabled, "on", "off") : ("unknown" as const),
    observedAt: row.observed_at,
    recordedAt: row.recorded_at,
    source: row.source,
  };
  if (row.state === "engaged")
    return {
      ...base,
      state: "engaged",
      label: "CODE Emergency Stop engaged",
      detail:
        "Jackboy reports its CODE Emergency Stop engaged. OMNI autonomy windows and CODE jobs are halted and new ones are refused.",
      clear: false,
    };
  if (row.state === "paused")
    return {
      ...base,
      state: "paused",
      label: "Jackboy Kill Switch on",
      detail:
        "Jackboy reports its global Kill Switch on. OMNI autonomy and CODE are halted; Jackboy also refuses link requests.",
      clear: false,
    };
  if (row.state === "clear" && allowed)
    return {
      ...base,
      state: "clear",
      label: "Clear (verified)",
      detail:
        "A fresh signed reading shows no Kill Switch, no CODE stop, and Jackboy allows OMNI autonomous work. This starts nothing; every job still needs its own Jackboy permit.",
      clear: true,
    };
  if (row.state === "clear" && fresh)
    return {
      ...base,
      state: "clear",
      label: "Stops released · autonomy blocked by Jackboy",
      detail: `A fresh signed reading shows no stop, but Jackboy does not allow OMNI autonomous work${row.blocked_by ? ` (${row.blocked_by.replace(/_/g, " ")})` : ""}. OMNI autonomy and CODE stay halted.`,
      clear: false,
    };
  if (row.state === "clear" || row.source === "stale")
    return {
      ...base,
      state: "stale",
      label: "Unknown (stale)",
      detail: "The last verified reading has expired, so OMNI autonomy and CODE stay halted.",
      clear: false,
    };
  return {
    ...base,
    state: "unknown",
    label: "Unknown",
    detail:
      row.source === "none"
        ? "No verified reading yet. It is read after the Step 9 live link is activated (Jackboy's permit service must be installed)."
        : `No verified reading (${row.reason || "check failed"}), so OMNI autonomy and CODE stay halted.`,
    clear: false,
  };
}
