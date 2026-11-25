/**
 * POST /api/omni/chat with an owner delegation ("chat:write"). Server-to-server only.
 * One database call admits the request (scope, owner, AI approval, Stop, daily limit and the
 * durable one-at-a-time AI guard) before any model call; a request-bound poll re-checks the
 * delegation, Stop and AI approval every second and stops the reply when any changes; one
 * database call records the outcome and releases (or keeps as a pause) the guard. Message and
 * reply text are not stored, except that Dread and Draco save a completed exchange into their own
 * owner-reviewable memory when the owner's "Save chats" switch is on; with the owner's "Use in
 * chat" switch on they read their own saved memory once, inside the same checks, before the model
 * call. If anything can't be recorded, no reply is returned.
 */
import {
  CLAUDE_MAX_OUTPUT_TOKENS,
  attributionLine,
  claudeEngineFor,
  type ClaudeEngineId,
} from "./omni-engines";
import { sha256Hex } from "./omni-api-keys";
import { assertNonSensitive } from "./beta";
import { DELEGATION_AUDIENCE, classifyBearer, isBrowserRequest } from "./omni-delegation";
import { browserRefused, needsDelegation, type Rpc } from "./omni-delegation.server";
import { requiresPersistentPause } from "./ai/gateway-errors";
import {
  CHAT_MODEL_REF,
  CHAT_REFUSALS,
  DELEGATED_CHAT_LIMITS,
  delegatedChatBody,
  resolveChatModel,
  selectChatContext,
  type DelegatedChatMessage,
} from "./omni-delegated-chat";
import { chatAgentById, type ChatAgent } from "./omni-chat-agents";
import {
  chatMemoryEntry,
  isChatMemoryAgent,
  memoryPromptBlock,
  readChatMemory,
  type ChatMemoryReport,
} from "./omni-memory";

/** Whether a completed exchange was saved to the agent's memory (owner "Save chats" switch). */
export type ChatSaveReport = "saved" | "off" | "not_saved" | "not_available";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const refuse = (reason: string) => {
  const r = CHAT_REFUSALS[reason];
  if (r) return json({ ok: false, error: r.error, message: r.message }, r.status);
  if (["invalid", "revoked", "expired", "wrong_audience", "owner_unverified"].includes(reason))
    return json(
      {
        ok: false,
        error: "invalid_token",
        reason,
        message: "The owner delegation is not valid. The owner must approve a new connection.",
      },
      401,
    );
  return json({ ok: false, error: "refused" }, 403);
};

export type InferenceResult = {
  text: string;
  finishReason: string | undefined;
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
  gatewayRunId: string | null;
  failure: { status: number; message: string } | undefined;
  threw: boolean;
};
export type ChatInference = (args: {
  request: Request;
  apiKey: string;
  messages: DelegatedChatMessage[];
  signal: AbortSignal;
  agent: ChatAgent;
  /** Owner-saved memory paragraph for this agent, or "" (none, off or unavailable). */
  memory: string;
}) => Promise<InferenceResult>;

/** The existing OMNI text agent call (same model, prompt and gateway handling), collected. */
const serviceInference: ChatInference = async ({
  request,
  apiKey,
  messages,
  signal,
  agent,
  memory,
}) => {
  const { createOmniCall } = await import("./ai/omni-responses.server");
  const last = messages[messages.length - 1]!;
  const call = createOmniCall(
    request,
    apiKey,
    JSON.stringify({ project: null, source: "OMNI web through an owner delegation" }),
    last.content,
    signal,
    messages.slice(0, -1),
    memory ? `${agent.persona}\n\n${memory}` : agent.persona,
  );
  let text = "";
  try {
    for await (const part of call.result.fullStream) {
      if (signal.aborted) break;
      if (part.type === "text-delta") text += part.text;
      if (part.type === "error") throw part.error;
    }
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const finishReason = await call.result.finishReason;
    const usage = await Promise.resolve(call.result.totalUsage).catch(() => undefined);
    return {
      text,
      finishReason,
      usage,
      gatewayRunId: call.gateway.getRunId() ?? null,
      failure: call.getFailure(),
      threw: false,
    };
  } catch {
    return {
      text,
      finishReason: undefined,
      usage: undefined,
      gatewayRunId: call.gateway.getRunId() ?? null,
      failure: call.getFailure(),
      threw: true,
    };
  }
};

/** Claude engine call (Anthropic Messages, text only, fixed reply length). */
function claudeInference(model: ClaudeEngineId, fetchImpl?: typeof fetch): ChatInference {
  return async ({ apiKey, messages, signal, agent, memory }) => {
    const { callClaude } = await import("./ai/anthropic.server");
    const r = await callClaude({
      apiKey,
      model,
      system: memory ? `${agent.persona}\n\n${memory}` : agent.persona,
      messages,
      maxTokens: CLAUDE_MAX_OUTPUT_TOKENS,
      signal,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    const usage =
      r.inputTokens !== null && r.outputTokens !== null
        ? {
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.inputTokens + r.outputTokens,
          }
        : undefined;
    return {
      text: r.text,
      finishReason:
        r.stopReason === "max_tokens"
          ? "length"
          : r.stopReason === "refusal"
            ? "content-filter"
            : "stop",
      usage,
      gatewayRunId: null,
      failure: r.failureStatus
        ? { status: r.failureStatus, message: `Anthropic HTTP ${r.failureStatus}` }
        : undefined,
      threw: r.threw,
    } as InferenceResult;
  };
}

const serviceRpc: Rpc = async (fn, args) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.rpc as unknown as Rpc)(fn, args);
};

export type ChatDeps = {
  rpc?: Rpc;
  infer?: ChatInference;
  apiKey?: () => string | undefined;
  /** Anthropic key reader (server secret); Claude engines only. */
  anthropicKey?: () => string | undefined;
  claudeFetch?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
};

async function callRpc(rpc: Rpc, fn: string, args: Record<string, unknown>) {
  try {
    const r = await rpc(fn, args);
    if (r.error || !r.data || typeof r.data !== "object") return null;
    return r.data as { ok?: boolean; reason?: string; run_id?: string } & Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readLimitedText(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}

const DENIED = new Set([
  "invalid",
  "revoked",
  "expired",
  "wrong_audience",
  "owner_unverified",
  "scope_missing",
  "ai_not_approved",
  "emergency_stop_engaged",
  "check_unavailable",
]);
const CLAUDE_RESERVATION_REFUSALS = new Set([
  "invalid_request",
  "emergency_stop_engaged",
  "engine_not_enabled",
  "price_not_confirmed",
  "call_cap",
  "daily_cap",
]);

export async function omniDelegatedChat(request: Request, deps: ChatDeps = {}) {
  const rpc = deps.rpc ?? serviceRpc;
  const infer = deps.infer ?? serviceInference;
  if (isBrowserRequest(request.headers)) return browserRefused();
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  if (!request.headers.get("content-type")?.includes("application/json"))
    return refuse("invalid_request");
  const raw = await readLimitedText(request, DELEGATED_CHAT_LIMITS.maxBodyBytes);
  if (raw === null)
    return json({ ok: false, error: "invalid_request", message: "Request is too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refuse("invalid_request");
  }
  const parsed = delegatedChatBody.safeParse(body);
  if (!parsed.success) return refuse("invalid_request");
  const agent = chatAgentById(parsed.data.agentId);
  if (!agent) return refuse("agent_not_enrolled");
  const model = resolveChatModel(parsed.data.model);
  if (!model) return refuse("model_not_available");
  const context = selectChatContext(parsed.data.messages);
  if (!context.ok) return refuse(context.reason);
  for (const m of context.messages) {
    try {
      assertNonSensitive(m.content);
    } catch {
      return refuse("secret_like");
    }
  }
  const claude = claudeEngineFor(model);
  const apiKey = claude
    ? (deps.anthropicKey ?? (() => process.env["ANTHROPIC_API_KEY"]))()
    : (deps.apiKey ?? (() => process.env["LOVABLE_API_KEY"]))();
  if (!apiKey) return refuse("provider_not_configured");

  const tokenHash = await sha256Hex(bearer.token);
  const begin = await callRpc(rpc, "omni_delegation_begin_chat", {
    _token_hash: tokenHash,
    _audience: DELEGATION_AUDIENCE,
    _model: model,
    _message_count: context.messages.length,
    _input_chars: context.inputChars,
  });
  if (!begin) return refuse("chat_not_installed");
  if (begin.ok !== true || typeof begin.run_id !== "string") return refuse(begin.reason ?? "");
  const runId = begin.run_id;
  let stopReason: string | null = null;

  // Dread/Draco: read the agent's own owner-saved memory once, under the same checks as the reply.
  let memory: ChatMemoryReport = { status: "not_available" };
  let memoryText = "";
  if (isChatMemoryAgent(agent.id)) {
    const m = await callRpc(rpc, "omni_delegation_chat_memory", {
      _token_hash: tokenHash,
      _audience: DELEGATION_AUDIENCE,
      _run_id: runId,
      _agent: agent.id,
    });
    if (!m) memory = { status: "unavailable" };
    else if (m.ok !== true) {
      if (m.reason === "memory_already_read" || m.reason === "agent_without_memory")
        memory = { status: "unavailable" };
      else stopReason = m.reason || "check_unavailable";
    } else {
      const read = readChatMemory(m);
      memory = read.report;
      memoryText = memoryPromptBlock(agent.name, read.entries);
    }
  }

  // Claude: reserve the estimated cost against the per-call and daily caps before any call.
  let claudeEstimate: number | null = null;
  let reservationUncertain = false;
  if (claude && !stopReason) {
    const r = await callRpc(rpc, "claude_reserve", {
      _run_id: runId,
      _agent: agent.id,
      _model: claude,
      _input_chars: context.inputChars,
      _max_output_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
    });
    if (!r) {
      stopReason = "claude_not_installed";
      reservationUncertain = true;
    } else if (r.ok !== true) {
      stopReason = r.reason || "check_unavailable";
      reservationUncertain = r.ok !== false || !CLAUDE_RESERVATION_REFUSALS.has(stopReason);
    } else if (
      typeof r["estimate_cents"] === "number" &&
      Number.isInteger(r["estimate_cents"]) &&
      r["estimate_cents"] >= 1 &&
      r["estimate_cents"] <= 50
    ) {
      claudeEstimate = r["estimate_cents"];
    } else {
      stopReason = "check_unavailable";
      reservationUncertain = true;
    }
  }
  const runInfer: ChatInference = claude ? claudeInference(claude, deps.claudeFetch) : infer;

  const controller = new AbortController();
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? DELEGATED_CHAT_LIMITS.timeoutMs);
  const signal = AbortSignal.any([controller.signal, deadline, request.signal]);
  const check = async () => {
    if (stopReason) return;
    const r = await callRpc(rpc, "omni_delegation_check_chat", {
      _token_hash: tokenHash,
      _audience: DELEGATION_AUDIENCE,
      _run_id: runId,
    });
    if (!r) stopReason = "check_unavailable";
    else if (r.ok !== true) stopReason = r.reason ?? "check_unavailable";
    if (stopReason) controller.abort();
  };
  let polling: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (polling || signal.aborted) return;
    polling = check().finally(() => {
      polling = null;
    });
  }, deps.pollMs ?? DELEGATED_CHAT_LIMITS.pollMs);
  let result: InferenceResult;
  try {
    // A refused memory check (revoked, expired, Stop, AI approval) means no model call at all.
    result = stopReason
      ? {
          text: "",
          finishReason: undefined,
          usage: undefined,
          gatewayRunId: null,
          failure: undefined,
          threw: false,
        }
      : await runInfer({
          request,
          apiKey,
          messages: context.messages,
          signal,
          agent,
          memory: memoryText,
        });
  } catch {
    result = {
      text: "",
      finishReason: undefined,
      usage: undefined,
      gatewayRunId: null,
      failure: undefined,
      threw: true,
    };
  } finally {
    clearInterval(timer);
  }
  if (polling) await polling;
  // The reply is returned only if the delegation, Stop and AI approval still allow it now.
  await check();

  let status: "completed" | "failed" | "cancelled" | "denied";
  let httpStatus = 200;
  let reason: string | null = null;
  let pause: { status: number; message: string } | null = null;
  if (result.failure) {
    httpStatus = result.failure.status;
    reason = "provider_error";
    if (requiresPersistentPause(result.failure.status)) {
      status = "denied";
      pause = { status: result.failure.status, message: result.failure.message.slice(0, 500) };
    } else status = "failed";
  } else if (stopReason) {
    status = DENIED.has(stopReason) ? "denied" : "cancelled";
    httpStatus =
      CHAT_REFUSALS[stopReason]?.status ??
      (["invalid", "revoked", "expired", "wrong_audience", "owner_unverified"].includes(stopReason)
        ? 401
        : 409);
    reason = stopReason;
  } else if (request.signal.aborted) {
    status = "cancelled";
    httpStatus = 499;
    reason = "client_cancelled";
  } else if (deadline.aborted) {
    status = "failed";
    httpStatus = 504;
    reason = "timeout";
  } else if (result.threw) {
    status = "failed";
    httpStatus = 502;
    reason = "provider_error";
  } else if (result.finishReason === "content-filter") {
    status = "failed";
    httpStatus = 422;
    reason = "model_declined";
  } else if (result.finishReason === "length") {
    status = "failed";
    httpStatus = 422;
    reason = "output_limit";
  } else if (!result.text.trim()) {
    status = "failed";
    httpStatus = 502;
    reason = "empty_reply";
  } else status = "completed";

  let claudeActual: number | null = null;
  if (claude && claudeEstimate !== null) {
    const settled = await callRpc(rpc, "claude_settle", {
      _run_id: runId,
      _status:
        status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
      _input_tokens: result.usage?.inputTokens ?? null,
      _output_tokens: result.usage?.outputTokens ?? null,
    });
    claudeActual =
      settled?.ok === true &&
      typeof settled["actual_cents"] === "number" &&
      Number.isInteger(settled["actual_cents"]) &&
      settled["actual_cents"] >= 0
        ? settled["actual_cents"]
        : null;
  }

  if (reservationUncertain || (claudeEstimate !== null && claudeActual === null))
    return json(
      {
        ok: false,
        error: "outcome_not_recorded",
        runId,
        aiPaused: true,
        message:
          "Claude accounting could not be confirmed. No reply is returned; OMNI chat stays paused for owner review. Do not retry automatically.",
      },
      503,
    );

  const finish = await callRpc(rpc, "omni_delegation_finish_chat", {
    _run_id: runId,
    _status: status,
    _reply_chars: Math.min(result.text.length, 40_000),
    _input_tokens: result.usage?.inputTokens ?? null,
    _output_tokens: result.usage?.outputTokens ?? null,
    _total_tokens: result.usage?.totalTokens ?? null,
    _error_status: status === "completed" ? null : httpStatus,
    _error_reason: reason,
    _gateway_run_id: result.gatewayRunId,
    _pause_status: pause?.status ?? null,
    _pause_message: pause?.message ?? null,
  });
  if (!finish || finish.ok !== true)
    return json(
      {
        ok: false,
        error: "outcome_not_recorded",
        runId,
        message:
          "The outcome could not be recorded, so no reply is returned and OMNI chat stays paused for owner review. Do not resend automatically.",
      },
      503,
    );
  if (status !== "completed") {
    const known = stopReason ? CHAT_REFUSALS[stopReason] : undefined;
    return json(
      {
        ok: false,
        error: reason,
        runId,
        stopped: status,
        message:
          known?.message ??
          (stopReason
            ? `The owner delegation changed while ${agent.name} was answering, so the reply was stopped.`
            : pause
              ? `${pause.message} AI is paused until the owner reviews it.`
              : `${agent.name} did not finish a reply. No tools ran; nothing is retried automatically.`),
        ...(finish["guard_released"] === false && !pause ? { aiPaused: true } : {}),
      },
      httpStatus,
    );
  }
  // "Save chats": keep this completed exchange in the agent's own memory (owner reviews/deletes it).
  let chatSaved: ChatSaveReport = "not_available";
  if (isChatMemoryAgent(agent.id)) {
    const last = context.messages[context.messages.length - 1]!;
    const entry = chatMemoryEntry(agent.name, last.content, result.text);
    const saved = entry
      ? await callRpc(rpc, "omni_delegation_chat_save", {
          _run_id: runId,
          _agent: agent.id,
          _title: entry.title,
          _body: entry.body,
        })
      : null;
    chatSaved =
      saved?.ok === true ? "saved" : saved?.reason === "save_chats_off" ? "off" : "not_saved";
  }
  return json({
    ok: true,
    reply: result.text,
    agentId: agent.id,
    agentName: agent.name,
    model: claude ?? CHAT_MODEL_REF,
    engine: claude ?? model,
    attribution: attributionLine(claude ?? model, agent.name),
    ...(claude ? { cost: { estimateCents: claudeEstimate, actualCents: claudeActual } } : {}),
    runId,
    contextMessages: context.messages.length,
    omittedMessages: context.omitted,
    memory: { ...memory, chatSaved },
    usage: {
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      totalTokens: result.usage?.totalTokens ?? null,
    },
    ...(finish["guard_released"] === false ? { aiPaused: true } : {}),
  });
}

/** Whether migration 0066 is installed (marker function present). Errors mean "not installed". */
export async function delegatedChatInstalled(rpc: Rpc = serviceRpc): Promise<boolean> {
  try {
    const r = await rpc("omni_delegated_chat_ready", {});
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}
