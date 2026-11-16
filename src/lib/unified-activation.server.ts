import { z } from "zod";
import { sendExecutionControl } from "./jackboy-link.server";

/** The only executor release Mothership accepts (Jackboy's `omni.autonomous/v1` bounded executor). */
export const REVIEWED_EXECUTOR_RELEASE = "omni-bounded-plan-1";

/**
 * Release facts for display: what Jackboy reports for its verified executor and whether Mothership's own
 * reviewed-release setting is pinned to the accepted release. Neither means the executor is armed or running.
 */
export function executorReleaseStatus(jackboyRelease: string | null, pinned: string | undefined) {
  return {
    expected: REVIEWED_EXECUTOR_RELEASE,
    jackboyRelease,
    jackboyMatches: jackboyRelease === REVIEWED_EXECUTOR_RELEASE,
    mothershipPinned: pinned === REVIEWED_EXECUTOR_RELEASE,
  };
}

/** A verify call only counts when Jackboy's signed state shows the connection and a recorded release. */
export function verifiedExecutorRelease(state: {
  connected: boolean;
  armed: boolean;
  executorRelease: string | null;
}): string {
  if (!state.connected || state.armed || !state.executorRelease)
    throw new Error("Jackboy did not report a verified executor release; nothing was recorded as verified");
  return state.executorRelease;
}

export const executionState = z.object({
  allowed: z.boolean(),
  checkedAt: z.string(),
  projectId: z.string().uuid(),
  connected: z.boolean(),
  configured: z.boolean(),
  armed: z.boolean(),
  emergencyStop: z.boolean(),
  killSwitch: z.boolean(),
  executionReady: z.boolean(),
  expiresAt: z.string().nullable(),
  operationId: z.string().uuid().nullable(),
  executorRelease: z.string().nullable(),
  executorOrigin: z.string().url().nullable(),
  running: z.boolean(),
  cancellationPending: z.boolean(),
});

export async function readExecutionState(operation = "safety", args: Record<string, unknown> = {}) {
  const state = executionState.parse(await sendExecutionControl(operation, args));
  const now = Date.now();
  if (
    state.projectId !== process.env["OMNI_LINK_PROJECT_ID"] ||
    !Number.isFinite(Date.parse(state.checkedAt)) ||
    now - Date.parse(state.checkedAt) > 5000 ||
    Date.parse(state.checkedAt) > now + 1000
  )
    throw new Error("Safety information is stale or scope-mismatched");
  return state;
}
