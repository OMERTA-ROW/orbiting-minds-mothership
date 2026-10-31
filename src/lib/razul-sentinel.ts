/**
 * RAZUL Sentinel report validation — shared by the report route and tests.
 * Sentinels are lightweight connectors on owner-enrolled projects; reports are
 * strictly shaped, size-capped, and scope-checked (enforced by the database).
 */

export const SENTINEL_KINDS = [
  "health",
  "diagnostic",
  "release",
  "feedback",
  "project-event",
] as const;
export type SentinelKind = (typeof SENTINEL_KINDS)[number];

export const SENTINEL_LIMITS = {
  maxPayloadBytes: 8_000,
  maxEventsPerHour: 60,
} as const;

export interface SentinelReport {
  sentinelId: string;
  token: string;
  kind: SentinelKind;
  payload: Record<string, unknown>;
}

/** Validate the report shape; returns an error message or null. */
export function validateSentinelReport(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Report must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.sentinelId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.sentinelId))
    return "sentinelId must be a UUID";
  if (typeof b.token !== "string" || !/^[0-9a-f]{64}$/i.test(b.token))
    return "token must be a 64-char hex string";
  if (typeof b.kind !== "string" || !SENTINEL_KINDS.includes(b.kind as SentinelKind))
    return `kind must be one of ${SENTINEL_KINDS.join(", ")}`;
  if (!b.payload || typeof b.payload !== "object" || Array.isArray(b.payload))
    return "payload must be an object";
  if (JSON.stringify(b.payload).length > SENTINEL_LIMITS.maxPayloadBytes)
    return "payload exceeds the size limit";
  return null;
}

/**
 * Which agents receive an alert for a sentinel report. Feedback and releases
 * are actionable for Jackboy and OMNI; health/diagnostics stay in history.
 */
export function sentinelAlertTargets(kind: SentinelKind): string[] {
  if (kind === "feedback" || kind === "release") return ["jackboy", "omni"];
  if (kind === "diagnostic") return ["omni"];
  return [];
}
