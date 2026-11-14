import { z } from "zod";
import { sendExecutionControl } from "./jackboy-link.server";

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
