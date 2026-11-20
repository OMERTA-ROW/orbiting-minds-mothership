/**
 * Owner dashboard connection summary: a pure, read-only mapping of the signed Jackboy safety state
 * (`getUnifiedExecutionState`) into plain rows. Unknown always reads as unknown, never as connected
 * or released; nothing here changes a switch, approval or job.
 */
import type { getUnifiedExecutionState } from "./unified-activation.functions";
import { omniKeyStatus, type OmniApiKeyRow } from "./omni-api-keys";

export type UnifiedStatus = Awaited<ReturnType<typeof getUnifiedExecutionState>>;
export type Tone = "good" | "warn" | "neutral" | "unknown";
export interface ConnectionRow {
  label: string;
  value: string;
  tone: Tone;
}

export function connectionRows(status: UnifiedStatus | null): {
  rows: ConnectionRow[];
  checkedAt: string | null;
  note: string;
} {
  const state = status?.state ?? null;
  if (!state) {
    const unknown = (label: string): ConnectionRow => ({
      label,
      value: "Unknown",
      tone: "unknown",
    });
    return {
      rows: [
        unknown("Jackboy live link"),
        unknown("Autonomy authorization"),
        unknown("CODE Emergency Stop"),
        unknown("System Kill Switch"),
        unknown("Work running"),
      ],
      checkedAt: null,
      note:
        status && "reason" in status && status.reason
          ? `${status.reason}. Treat everything as off.`
          : "A fresh signed reading from Jackboy is not available. Treat everything as off.",
    };
  }
  return {
    rows: [
      {
        label: "Jackboy live link",
        value: state.connected ? "Connected" : "Not connected",
        tone: state.connected ? "good" : "warn",
      },
      {
        label: "Autonomy authorization",
        value: state.configured
          ? state.armed
            ? "Configured · armed"
            : "Configured"
          : "Not configured",
        tone: state.configured ? "good" : "neutral",
      },
      {
        label: "CODE Emergency Stop",
        value: state.emergencyStop ? "Engaged" : "Released",
        tone: state.emergencyStop ? "neutral" : "warn",
      },
      {
        label: "System Kill Switch",
        value: state.killSwitch ? "On" : "Off",
        tone: state.killSwitch ? "neutral" : "warn",
      },
      {
        label: "Work running",
        value: state.running ? "Running" : "Nothing running",
        tone: state.running ? "warn" : "neutral",
      },
    ],
    checkedAt: state.checkedAt,
    note: "Signed reading from Jackboy. Status only — this page never changes a switch.",
  };
}

/** Counts for the API key summary strip, using the same fail-closed status as the key list. */
export function keyCounts(keys: OmniApiKeyRow[], now: number = Date.now()) {
  const counts = { active: 0, neverExpires: 0, expired: 0, revoked: 0 };
  for (const key of keys) {
    const state = omniKeyStatus(key, now);
    counts[state] += 1;
    if (state === "active" && key.never_expires === true) counts.neverExpires += 1;
  }
  return counts;
}
