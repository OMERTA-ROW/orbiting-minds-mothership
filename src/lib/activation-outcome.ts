/**
 * Display-only helpers for the combined activation panel's last result. Pure and client-safe:
 * they decide how an earlier attempt is labelled, never whether anything may run.
 */
import type { StageId, StageResult } from "@/lib/activation-orchestration";

export type ShownOutcome = {
  summary: string;
  stages: StageResult[];
  ownerAction: string | null;
  ok: boolean;
  /** Client time (ms) the Activate click started this attempt. */
  attemptedAt: number;
};

/** Current, read-only view of whether each scope is in effect (from a readiness check). */
export type InEffect = Record<StageId, boolean> & { readAt: number };

/** Reason the shown result is out of date, or null while it is still the latest word. */
export function outcomeStaleReason(
  outcome: ShownOutcome,
  signals: { executorVerifiedAt: number | null; inEffect: InEffect | null },
): string | null {
  if (signals.executorVerifiedAt !== null && signals.executorVerifiedAt > outcome.attemptedAt)
    return `Verify executor succeeded at ${attemptTime(signals.executorVerifiedAt)}, after this attempt.`;
  const now = signals.inEffect;
  if (now && now.readAt >= outcome.attemptedAt) {
    const changed = outcome.stages.filter(
      (s) => (s.status === "failed" || s.status === "skipped") && now[s.id],
    );
    if (changed.length)
      return `The readiness check at ${attemptTime(now.readAt)} shows ${changed.length === 1 ? "a step" : "steps"} from this attempt now in effect.`;
  }
  return null;
}

/** Stage messages that just repeat the owner action are shortened so the action shows once. */
export function stageLine(stage: StageResult, ownerAction: string | null): string {
  if (ownerAction && stage.message.includes(ownerAction)) return "see “Your action” below.";
  return stage.message;
}

/** Owner-local clock time with its zone, e.g. "6:31 PM EST". */
export function attemptTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
