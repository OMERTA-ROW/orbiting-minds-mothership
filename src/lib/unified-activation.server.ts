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
  expiresAt: z.string().nullable(),
  operationId: z.string().uuid().nullable(),
  executorRelease: z.string().nullable(),
  running: z.boolean(),
  cancellationPending: z.boolean(),
  executionReady: z.boolean(),
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

type ActivationStore = {
  rpc(
    name: "activation_begin" | "activation_finalize" | "activation_operation_status",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};
export const activationStore = (value: unknown) => value as ActivationStore;

export class ActivationFailure extends Error {
  constructor(
    message: string,
    readonly attemptFinal: boolean,
  ) {
    super(message);
  }
}

/** A persisted idempotency key bridges two databases; uncertainty compensates fail-closed. */
export async function actuateApproval(
  input: {
    owner: string;
    step: 9 | 10;
    operationId: string;
    cap: boolean;
    daily: boolean;
    caller: ActivationStore;
    admin: ActivationStore;
    expiresAt: string;
  },
  control = readExecutionState,
) {
  const begun = await input.caller.rpc("activation_begin", {
    _id: input.operationId,
    _step: input.step,
  });
  if (begun.error) throw new Error("Backend activation authorization could not be recorded");
  const attempt = z.object({ state: z.enum(["pending", "completed", "failed"]) }).parse(begun.data);
  if (attempt.state === "completed") return control();
  if (attempt.state === "failed")
    throw new ActivationFailure(
      "This activation failed; a new owner-approved attempt is required",
      true,
    );
  let finalizing = false;
  try {
    if (input.step === 10 && (!input.cap || !input.daily))
      throw new Error("Confirm the $10 cap and $5 daily limit");
    const state = await control(
      input.step === 9 ? "connect" : "configure",
      input.step === 9 ? { operationId: input.operationId, expiresAt: input.expiresAt } : {},
    );
    if (
      !state.connected ||
      (input.step === 9 && state.operationId !== input.operationId) ||
      (input.step === 10 && (!state.configured || state.armed))
    )
      throw new Error("Backend activation state did not verify");
    const live = await control();
    if (
      !live.connected ||
      live.expiresAt !== state.expiresAt ||
      (input.step === 10 && (!live.configured || live.armed))
    )
      throw new Error("Live connection verification failed");
    finalizing = true;
    const finalized = await input.admin.rpc("activation_finalize", {
      _actor: input.owner,
      _id: input.operationId,
      _state: "completed",
      _note: "",
      _cap: input.cap,
      _daily: input.daily,
    });
    if (finalized.error) throw new Error("Backend answered but approval finalization failed");
    return live;
  } catch {
    let knownPending = !finalizing;
    if (finalizing) {
      const result = await input.admin.rpc("activation_operation_status", {
        _actor: input.owner,
        _id: input.operationId,
      });
      const recorded = result.error
        ? null
        : z
            .object({
              state: z.enum(["pending", "completed", "failed"]),
              effective: z.boolean(),
            })
            .safeParse(result.data);
      if (recorded?.success) {
        knownPending = recorded.data.state === "pending";
        if (recorded.data.state === "completed" && recorded.data.effective) {
          try {
            const live = await control();
            if (
              live.connected &&
              !live.cancellationPending &&
              (input.step === 9
                ? live.operationId === input.operationId
                : live.configured && !live.armed)
            )
              return live;
          } catch {
            /* Reconcile instead of inferring a live connection from a stored approval. */
          }
        }
      }
    }
    let compensated = false;
    try {
      const rolledBack = await control(input.step === 9 ? "revoke" : "unconfigure");
      compensated =
        !rolledBack.armed &&
        !rolledBack.cancellationPending &&
        (input.step === 9 ? !rolledBack.connected : !rolledBack.configured);
    } catch {
      /* An unreachable peer stays unauthorized locally; require reconciliation. */
    }
    const result =
      compensated && knownPending
        ? await input.admin.rpc("activation_finalize", {
            _actor: input.owner,
            _id: input.operationId,
            _state: "failed",
            _note: "",
            _cap: false,
            _daily: false,
          })
        : { error: true };
    throw new ActivationFailure(
      compensated && !result.error
        ? "Activation failed and execution was disabled. Nothing was approved."
        : "Activation outcome requires reconciliation. A decision may have been recorded; refresh it and do not submit another activation.",
      compensated && !result.error,
    );
  }
}
