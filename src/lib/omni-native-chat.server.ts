import { z } from "zod";
import { assertNonSensitive } from "./beta";
import { chatAgentById } from "./omni-chat-agents";
import { claudeEngineFor, attributionLine } from "./omni-engines";
import {
  NATIVE_CHAT_MAX_OUTPUT_CHARS,
  NATIVE_CHAT_MAX_OUTPUT_TOKENS,
  NATIVE_CHAT_POLL_MS,
  NATIVE_CHAT_TIMEOUT_MS,
  conservativeNativeChatInputUnits,
  selectNativeChatContext,
  type NativeChatInput,
} from "./omni-native-chat";
import { requiresPersistentPause } from "./ai/gateway-errors";
import { inferClaude } from "./ai/claude-turn.server";
import type { NativeDeviceIdentity } from "./omni-dock.server";

type NativeRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

type RpcReply = { ok?: boolean; reason?: string } & Record<string, unknown>;

export type NativeChatDeps = {
  rpc?: NativeRpc;
  anthropicKey?: () => string | undefined;
  claudeFetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
};

const nativeProjectsSchema = z.array(
  z.object({ id: z.string().uuid(), name: z.string().min(2).max(100) }).strict(),
);

const serviceRpc: NativeRpc = async (fn, args) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.rpc as unknown as NativeRpc)(fn, args);
};

async function rpcReply(rpc: NativeRpc, fn: string, args: Record<string, unknown>) {
  try {
    const result = await rpc(fn, args);
    if (result.error || !result.data || typeof result.data !== "object") return null;
    return result.data as RpcReply;
  } catch {
    return null;
  }
}

function failure(reason: string, status = 403, message = "Native OMNI chat was refused.") {
  return { ok: false, reason, status, message };
}

const DENIED = new Set([
  "device_revoked",
  "device_rotated",
  "owner_unverified",
  "ai_not_approved",
  "emergency_stop_engaged",
  "project_not_found",
  "session_stopped",
  "session_mismatch",
  "run_not_found",
]);

const RESERVATION_REFUSALS = new Set([
  "invalid_request",
  "owner_unverified",
  "ai_not_approved",
  "engine_not_enabled",
  "price_not_confirmed",
  "call_cap",
  "daily_cap",
  "emergency_stop_engaged",
  "device_revoked",
  "session_stopped",
]);

function refusalStatus(reason: string) {
  if (reason === "daily_limit" || reason === "daily_cap") return 429;
  if (reason === "emergency_stop_engaged") return 423;
  if (reason === "ai_busy_or_paused") return 503;
  if (reason === "provider_not_configured" || reason === "chat_not_installed") return 503;
  if (reason === "duplicate_request" || reason === "session_mismatch") return 409;
  if (reason === "project_not_found") return 404;
  if (reason === "price_not_confirmed" || reason === "engine_not_enabled") return 403;
  return 403;
}

export async function nativeProjects(
  device: string,
  identity: NativeDeviceIdentity,
  rpc: NativeRpc = serviceRpc,
): Promise<Record<string, unknown>[] | null> {
  const result = await rpcReply(rpc, "omni_native_bound_chat_projects", {
    _device: device,
    _fingerprint: identity.fingerprint,
    _revision: identity.revision,
  });
  if (result?.ok !== true || !Array.isArray(result["projects"])) return null;
  const projects = nativeProjectsSchema.safeParse(result["projects"]);
  return projects.success ? projects.data : null;
}

export async function nativeChatBackendInstalled(rpc: NativeRpc = serviceRpc) {
  try {
    const result = await rpc("omni_native_chat_ready", {});
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}

export async function runNativeChat(
  device: string,
  identity: NativeDeviceIdentity,
  input: NativeChatInput,
  signal: AbortSignal,
  deps: NativeChatDeps = {},
) {
  const rpc = deps.rpc ?? serviceRpc;
  const agent = chatAgentById(input.agentId);
  const model = claudeEngineFor(input.model);
  const context = selectNativeChatContext(input.messages);
  if (!agent || !model || !context)
    return failure("invalid_request", 400, "The agent, Claude model or conversation is invalid.");
  if (signal.aborted)
    return failure(
      "client_cancelled",
      499,
      "The client cancelled before the request was admitted.",
    );
  if (context.messages.length > 20)
    return failure("invalid_request", 400, "Keep at most 20 recent messages in one request.");
  for (const message of context.messages) {
    try {
      assertNonSensitive(message.content);
    } catch {
      return failure(
        "secret_like",
        400,
        "Remove secrets or personal credentials from the message.",
      );
    }
  }
  const apiKey = (deps.anthropicKey ?? (() => process.env["ANTHROPIC_API_KEY"]))();
  if (!apiKey)
    return failure(
      "provider_not_configured",
      503,
      "The Anthropic provider is not configured on the Mothership.",
    );

  const inputChars = context.inputChars;
  const begin = await rpcReply(rpc, "omni_native_bound_chat_begin", {
    _device: device,
    _fingerprint: identity.fingerprint,
    _revision: identity.revision,
    _request_id: input.requestId,
    _session_id: input.sessionId,
    _project_id: input.projectId,
    _agent_id: input.agentId,
    _model: input.model,
    _message_count: context.messages.length,
    _input_chars: inputChars,
  });
  if (!begin)
    return failure(
      "chat_not_installed",
      503,
      "Native chat could not be admitted. No automatic retry was made.",
    );
  if (
    begin.ok !== true ||
    typeof begin["run_id"] !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(begin["run_id"]) ||
    typeof begin["project_name"] !== "string" ||
    typeof begin["project_brief"] !== "string"
  ) {
    const reason = typeof begin.reason === "string" ? begin.reason : "check_unavailable";
    return failure(reason, refusalStatus(reason));
  }
  const runId = begin["run_id"];
  const projectName = typeof begin["project_name"] === "string" ? begin["project_name"] : "";
  const projectBrief = typeof begin["project_brief"] === "string" ? begin["project_brief"] : "";
  try {
    assertNonSensitive(projectName);
    assertNonSensitive(projectBrief);
  } catch {
    return finishWithoutInference(rpc, runId, "denied", 400, "secret_like");
  }

  const projectContext = [
    `Owner-selected project: ${projectName}`,
    projectBrief ? `Project brief: ${projectBrief}` : "",
    "This context is descriptive only. Do not claim to execute tasks, access tools, or change project data.",
  ]
    .filter(Boolean)
    .join("\n");
  const system = `${agent.persona}\n\n${projectContext}`;
  const inputUnits = conservativeNativeChatInputUnits(system, context.messages);
  if (inputUnits > 200_000)
    return finishWithoutInference(rpc, runId, "failed", 413, "input_too_large");
  const reserve = await rpcReply(rpc, "claude_reserve_native_chat", {
    _run_id: runId,
    _input_chars: inputUnits,
    _max_output_tokens: NATIVE_CHAT_MAX_OUTPUT_TOKENS,
  });
  if (!reserve || reserve.ok !== true) {
    const reason = typeof reserve?.reason === "string" ? reserve.reason : "check_unavailable";
    let releaseGuard = RESERVATION_REFUSALS.has(reason);
    if (!releaseGuard) {
      const settled = await settle(rpc, runId, "failed");
      releaseGuard = settled !== null;
    }
    const finished = await finishRun(rpc, {
      runId,
      status: DENIED.has(reason) || RESERVATION_REFUSALS.has(reason) ? "denied" : "failed",
      reason,
      errorStatus: refusalStatus(reason),
      releaseGuard,
      replyChars: 0,
    });
    return finished?.ok === true
      ? failure(reason, refusalStatus(reason))
      : failure(
          "outcome_not_recorded",
          503,
          "The outcome could not be recorded; chat remains paused.",
        );
  }
  const estimateCents = reserve["estimate_cents"];
  if (
    typeof estimateCents !== "number" ||
    !Number.isInteger(estimateCents) ||
    estimateCents < 1 ||
    estimateCents > 50
  ) {
    const settled = await settle(rpc, runId, "failed");
    const finished = await finishRun(rpc, {
      runId,
      status: "failed",
      reason: "reservation_invalid",
      errorStatus: 503,
      releaseGuard: settled !== null,
      replyChars: 0,
    });
    return finished?.ok === true
      ? failure(
          "reservation_invalid",
          503,
          "Claude reservation was invalid; no model call was made.",
        )
      : failure(
          "outcome_not_recorded",
          503,
          "The outcome could not be recorded; chat remains paused.",
        );
  }

  const controller = new AbortController();
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? NATIVE_CHAT_TIMEOUT_MS);
  const requestSignal = AbortSignal.any([controller.signal, deadline, signal]);
  let stopReason: string | null = null;
  const check = async () => {
    if (stopReason) return;
    const result = await rpcReply(rpc, "omni_native_chat_check", {
      _device: device,
      _run_id: runId,
    });
    if (!result) stopReason = "check_unavailable";
    else if (result.ok !== true)
      stopReason = typeof result.reason === "string" ? result.reason : "check_unavailable";
    if (stopReason) controller.abort();
  };
  await check();

  let polling: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (polling || requestSignal.aborted) return;
    polling = check().finally(() => {
      polling = null;
    });
  }, deps.pollMs ?? NATIVE_CHAT_POLL_MS);
  let result: Awaited<ReturnType<typeof inferClaude>>;
  try {
    result = stopReason
      ? {
          text: "",
          finishReason: undefined,
          usage: undefined,
          failure: undefined,
          threw: false,
        }
      : await inferClaude({
          apiKey,
          model,
          system,
          messages: context.messages,
          signal: requestSignal,
          ...(deps.claudeFetch ? { fetchImpl: deps.claudeFetch } : {}),
        });
  } catch {
    result = {
      text: "",
      finishReason: undefined,
      usage: undefined,
      failure: undefined,
      threw: true,
    };
  } finally {
    clearInterval(timer);
  }
  if (polling) await polling;
  await check();

  let status: "completed" | "failed" | "cancelled" | "denied";
  let errorStatus = 200;
  let reason: string | null = null;
  let pause: { status: number; message: string } | null = null;
  if (result.failure) {
    status = requiresPersistentPause(result.failure.status) ? "denied" : "failed";
    errorStatus = result.failure.status;
    reason = "provider_error";
    if (requiresPersistentPause(result.failure.status))
      pause = { status: result.failure.status, message: result.failure.message.slice(0, 500) };
  } else if (stopReason) {
    status = DENIED.has(stopReason) ? "denied" : "cancelled";
    errorStatus = stopReason === "emergency_stop_engaged" ? 423 : 409;
    reason = stopReason;
  } else if (signal.aborted) {
    status = "cancelled";
    errorStatus = 499;
    reason = "client_cancelled";
  } else if (deadline.aborted) {
    status = "failed";
    errorStatus = 504;
    reason = "timeout";
  } else if (result.threw) {
    status = "failed";
    errorStatus = 502;
    reason = "provider_error";
  } else if (result.finishReason === "content-filter") {
    status = "failed";
    errorStatus = 422;
    reason = "model_declined";
  } else if (
    result.finishReason === "length" ||
    result.text.length > NATIVE_CHAT_MAX_OUTPUT_CHARS
  ) {
    status = "failed";
    errorStatus = 422;
    reason = "output_limit";
  } else if (!result.text.trim()) {
    status = "failed";
    errorStatus = 502;
    reason = "empty_reply";
  } else status = "completed";

  const actualCents = await settle(
    rpc,
    runId,
    status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
    result.usage?.inputTokens,
    result.usage?.outputTokens,
  );
  const finish = await finishRun(rpc, {
    runId,
    status,
    reason,
    errorStatus: status === "completed" ? null : errorStatus,
    releaseGuard: actualCents !== null,
    pause,
    replyChars: Math.min(result.text.length, NATIVE_CHAT_MAX_OUTPUT_CHARS),
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  });
  if (!finish || finish.ok !== true)
    return failure(
      "outcome_not_recorded",
      503,
      "The outcome could not be recorded. No reply is returned; OMNI chat stays paused for owner review.",
    );
  if (status !== "completed" || finish["guard_released"] !== true)
    return failure(
      status === "completed" ? "outcome_not_recorded" : (reason ?? "provider_error"),
      status === "completed" ? 503 : errorStatus,
      pause
        ? `${pause.message} AI is paused until the owner reviews it.`
        : "The turn did not finish safely. No reply was returned and nothing will be retried automatically.",
    );

  return {
    ok: true,
    protocol: "omni.native-chat/v1",
    requestId: input.requestId,
    sessionId: input.sessionId,
    runId,
    agentId: agent.id,
    agentName: agent.name,
    model,
    attribution: attributionLine(model, agent.name),
    reply: result.text,
    contextMessages: context.messages.length,
    omittedMessages: context.omitted,
    usage: {
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      actualCostCents: actualCents,
      reservedCostCents: estimateCents,
    },
    transcriptStored: false,
    toolsAvailable: false,
    taskExecutionAvailable: false,
    streaming: "settlement-gated",
  };
}

async function settle(
  rpc: NativeRpc,
  runId: string,
  status: "completed" | "failed" | "cancelled",
  inputTokens?: number,
  outputTokens?: number,
) {
  const result = await rpcReply(rpc, "claude_settle_source", {
    _source: "native",
    _run_id: runId,
    _status: status,
    _input_tokens: inputTokens ?? null,
    _output_tokens: outputTokens ?? null,
  });
  return result?.ok === true && typeof result["actual_cents"] === "number"
    ? result["actual_cents"]
    : null;
}

async function finishWithoutInference(
  rpc: NativeRpc,
  runId: string,
  status: "denied" | "failed",
  errorStatus: number,
  reason: string,
) {
  const result = await finishRun(rpc, {
    runId,
    status,
    errorStatus,
    reason,
    releaseGuard: true,
    replyChars: 0,
  });
  return result?.ok === true
    ? failure(reason, errorStatus, "The selected project context is not safe to send.")
    : failure(
        "outcome_not_recorded",
        503,
        "The outcome could not be recorded; chat remains paused.",
      );
}

async function finishRun(
  rpc: NativeRpc,
  args: {
    runId: string;
    status: "completed" | "failed" | "cancelled" | "denied";
    reason?: string | null;
    errorStatus?: number | null;
    releaseGuard: boolean;
    pause?: { status: number; message: string } | null;
    replyChars: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
) {
  return rpcReply(rpc, "omni_native_chat_finish", {
    _run_id: args.runId,
    _status: args.status,
    _reply_chars: args.replyChars,
    _input_tokens: args.inputTokens ?? null,
    _output_tokens: args.outputTokens ?? null,
    _error_status: args.errorStatus ?? null,
    _error_reason: args.reason ?? null,
    _release_guard: args.releaseGuard,
    _pause_status: args.pause?.status ?? null,
    _pause_message: args.pause?.message ?? null,
  });
}
