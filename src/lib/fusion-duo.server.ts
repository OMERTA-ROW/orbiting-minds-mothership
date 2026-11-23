/**
 * Runs one owner-clicked reply in a Dread & Draco Fusion session (see fusion-duo.ts).
 * Owner database calls (begin, re-check) run as the signed-in owner; only the outcome (and, for a
 * Claude-bound speaker, the cost reservation and settlement) is recorded with the service role.
 * One model call at most, no tools, no retries.
 */
import { requiresPersistentPause } from "./ai/gateway-errors";
import { chatAgentById } from "./omni-chat-agents";
import {
  DEFAULT_ENGINE_ID,
  ENGINE_IDS,
  attributionLine,
  claudeEngineFor,
  type ClaudeEngineId,
} from "./omni-engines";
import {
  FUSION_DUO_LIMITS,
  boundReply,
  fusionTurnInstructions,
  fusionTurnMessage,
  type FusionDuoAgent,
  type TranscriptEntry,
} from "./fusion-duo";

export type DuoRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export type DuoInferenceResult = {
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
export type DuoInference = (args: {
  apiKey: string;
  persona: string;
  message: string;
  signal: AbortSignal;
}) => Promise<DuoInferenceResult>;

const FUSION_CONTEXT = JSON.stringify({
  project: null,
  source: "Owner-approved OMNI Fusion session",
});

/** Claude for a speaker bound to Claude at approval (text only, fixed output length). */
function claudeDuoInference(model: ClaudeEngineId, fetchImpl?: typeof fetch): DuoInference {
  return async ({ apiKey, persona, message, signal }) => {
    const [{ inferClaude }, { omniSystemPrompt }] = await Promise.all([
      import("./ai/claude-turn.server"),
      import("./ai/omni-responses.server"),
    ]);
    const r = await inferClaude({
      apiKey,
      model,
      system: omniSystemPrompt(persona, FUSION_CONTEXT),
      messages: [{ role: "user", content: message }],
      signal,
      fetchImpl,
    });
    return { ...r, gatewayRunId: null };
  };
}

const serviceInference: DuoInference = async ({ apiKey, persona, message, signal }) => {
  const { createOmniCall } = await import("./ai/omni-responses.server");
  const call = createOmniCall(
    new Request("https://evoomni.tech/internal/fusion-session"),
    apiKey,
    FUSION_CONTEXT,
    message,
    signal,
    [],
    persona,
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

async function call(rpc: DuoRpc, fn: string, args: Record<string, unknown>) {
  try {
    const r = await rpc(fn, args);
    if (r.error || !r.data || typeof r.data !== "object") return null;
    return r.data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type DuoTurnDeps = {
  /** As the signed-in owner (RLS / auth.uid()). */
  ownerRpc: DuoRpc;
  /** Service role, used only to record the outcome. */
  serviceRpc: DuoRpc;
  infer?: DuoInference;
  /** Lovable AI key (current engine). */
  apiKey?: string | undefined;
  /** Anthropic key (server secret), used only for a speaker bound to Claude at approval. */
  anthropicKey?: string | undefined;
  claudeFetch?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
};

export type DuoTurnResult =
  | {
      ok: true;
      turnNo: number;
      maxReplies: number;
      agentId: FusionDuoAgent;
      reply: string;
      sessionFinished: boolean;
      engine: string;
      attribution: string;
      cost?: { estimateCents: number; actualCents: number };
    }
  | { ok: false; reason: string; turnNo?: number; agentId?: FusionDuoAgent };

const isAgent = (a: unknown): a is FusionDuoAgent => a === "dread" || a === "draco";

export async function runDuoTurn(sessionId: string, deps: DuoTurnDeps): Promise<DuoTurnResult> {
  if (!deps.apiKey && !deps.anthropicKey) return { ok: false, reason: "provider_not_configured" };
  const begin = await call(deps.ownerRpc, "omni_fusion_turn_begin", { _session_id: sessionId });
  if (!begin) return { ok: false, reason: "check_unavailable" };
  if (begin["ok"] !== true)
    return { ok: false, reason: String(begin["reason"] ?? "check_unavailable") };
  const turnId = begin["turn_id"];
  const turnNo = begin["turn_no"];
  const maxReplies = begin["max_replies"];
  const agentId = begin["agent_id"];
  const topic = begin["topic"];
  const transcript = begin["transcript"];
  // Installed 0075 names the engine bound at approval; before it every turn uses the current engine.
  const model = begin["model"] === undefined ? DEFAULT_ENGINE_ID : begin["model"];
  const agent = isAgent(agentId) ? chatAgentById(agentId) : null;
  const wellFormed =
    typeof turnId === "string" &&
    typeof turnNo === "number" &&
    typeof maxReplies === "number" &&
    typeof topic === "string" &&
    Array.isArray(transcript) &&
    transcript.every((t) => t && isAgent(t.agent_id) && typeof t.reply === "string") &&
    typeof model === "string" &&
    (ENGINE_IDS as readonly string[]).includes(model);
  if (!agent || !wellFormed || !isAgent(agentId) || typeof model !== "string") {
    // Release the guard if we got one; nothing was sent to the model.
    if (typeof turnId === "string")
      await call(
        deps.serviceRpc,
        "omni_fusion_turn_finish",
        finishArgs(turnId, "failed", null, undefined, 500, "invalid_state", null),
      );
    return { ok: false, reason: "check_unavailable" };
  }
  const claude = claudeEngineFor(model);
  const key = claude ? deps.anthropicKey : deps.apiKey;
  const refuseTurn = async (reason: string, httpStatus: number) => {
    const done = await call(
      deps.serviceRpc,
      "omni_fusion_turn_finish",
      finishArgs(
        turnId,
        reason === "session_stopped"
          ? "cancelled"
          : DENIED_BEFORE_CALL.has(reason)
            ? "denied"
            : "failed",
        null,
        undefined,
        httpStatus,
        reason,
        null,
      ),
    );
    return done && done["ok"] === true
      ? ({ ok: false, reason, turnNo, agentId } as const)
      : ({ ok: false, reason: "outcome_not_recorded", turnNo, agentId } as const);
  };
  if (!key) return refuseTurn("provider_not_configured", 503);
  const persona = `${agent.persona}\n\n${fusionTurnInstructions(agentId, turnNo, maxReplies)}`;
  const message = fusionTurnMessage(topic, transcript as TranscriptEntry[]);
  // Claude: reserve the estimated cost against the shared caps before any call (Stop, turn, session, ledger).
  let estimate: number | null = null;
  if (claude) {
    const { reserveClaude } = await import("./ai/claude-turn.server");
    const r = await reserveClaude(deps.serviceRpc, "fusion", {
      runId: turnId,
      model: claude,
      inputChars: persona.length + message.length + FUSION_CONTEXT.length,
    });
    if (!r.ok)
      return refuseTurn(r.reason, r.reason === "call_cap" || r.reason === "daily_cap" ? 402 : 409);
    estimate = r.estimateCents;
  }
  const infer = claude
    ? claudeDuoInference(claude, deps.claudeFetch)
    : (deps.infer ?? serviceInference);

  const controller = new AbortController();
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? FUSION_DUO_LIMITS.timeoutMs);
  const signal = AbortSignal.any([controller.signal, deadline]);
  let stopReason: string | null = null;
  const check = async () => {
    if (stopReason) return;
    const r = await call(deps.ownerRpc, "omni_fusion_turn_check", { _turn_id: turnId });
    if (!r) stopReason = "check_unavailable";
    else if (r["ok"] !== true) stopReason = String(r["reason"] ?? "check_unavailable");
    if (stopReason) controller.abort();
  };
  let polling: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (polling || signal.aborted) return;
    polling = check().finally(() => {
      polling = null;
    });
  }, deps.pollMs ?? FUSION_DUO_LIMITS.pollMs);
  let result: DuoInferenceResult;
  try {
    result = await infer({ apiKey: key, persona, message, signal });
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
  await check(); // the reply is kept only if the session, Stop and AI approval still allow it now

  let status: "completed" | "failed" | "cancelled" | "denied";
  let reason: string | null = null;
  let httpStatus: number | null = null;
  let pause: { status: number; message: string } | null = null;
  if (result.failure) {
    reason = "provider_error";
    httpStatus = result.failure.status;
    if (requiresPersistentPause(result.failure.status)) {
      status = "denied";
      pause = {
        status: result.failure.status,
        message: result.failure.message.slice(0, 500) || "AI paused.",
      };
    } else status = "failed";
  } else if (stopReason) {
    status = stopReason === "session_stopped" ? "cancelled" : "denied";
    reason = stopReason;
    httpStatus = 409;
  } else if (deadline.aborted) {
    status = "failed";
    reason = "timeout";
    httpStatus = 504;
  } else if (result.threw) {
    status = "failed";
    reason = "provider_error";
    httpStatus = 502;
  } else if (result.finishReason === "content-filter") {
    status = "failed";
    reason = "model_declined";
    httpStatus = 422;
  } else if (!result.text.trim()) {
    status = "failed";
    reason = "empty_reply";
    httpStatus = 502;
  } else status = "completed";

  // Claude: settle once. If the cost can't be recorded the estimate stays counted and the reply is withheld.
  let actual: number | null = null;
  if (claude && estimate !== null) {
    const { settleClaude, claudeOutcomeFor } = await import("./ai/claude-turn.server");
    actual = await settleClaude(
      deps.serviceRpc,
      "fusion",
      turnId,
      claudeOutcomeFor(status),
      result.usage,
    );
    if (actual === null) {
      if (status === "completed") status = "failed";
      reason = "outcome_not_recorded";
      httpStatus = 503;
    }
  }

  const reply = status === "completed" ? boundReply(result.text) : null;
  const finish = await call(
    deps.serviceRpc,
    "omni_fusion_turn_finish",
    finishArgs(turnId, status, reply, result, httpStatus, reason, result.gatewayRunId, pause),
  );
  if (!finish || finish["ok"] !== true)
    return { ok: false, reason: "outcome_not_recorded", turnNo, agentId };
  if (status !== "completed" || !reply)
    return { ok: false, reason: reason ?? "provider_error", turnNo, agentId };
  return {
    ok: true,
    turnNo,
    maxReplies,
    agentId,
    reply,
    sessionFinished: finish["session_finished"] === true,
    engine: model,
    attribution: attributionLine(model, agent.name),
    ...(claude && estimate !== null && actual !== null
      ? { cost: { estimateCents: estimate, actualCents: actual } }
      : {}),
  };
}

/** Reservation refusals recorded as "denied" (a control said no) rather than "failed". */
const DENIED_BEFORE_CALL = new Set([
  "emergency_stop_engaged",
  "ai_not_approved",
  "engine_not_enabled",
  "price_not_confirmed",
  "call_cap",
  "daily_cap",
  "owner_unverified",
]);

function finishArgs(
  turnId: string,
  status: string,
  reply: string | null,
  result: Pick<DuoInferenceResult, "usage"> | undefined,
  errorStatus: number | null,
  reason: string | null,
  gatewayRunId: string | null,
  pause: { status: number; message: string } | null = null,
) {
  return {
    _turn_id: turnId,
    _status: status,
    _reply: reply,
    _input_tokens: result?.usage?.inputTokens ?? null,
    _output_tokens: result?.usage?.outputTokens ?? null,
    _total_tokens: result?.usage?.totalTokens ?? null,
    _error_status: status === "completed" ? null : errorStatus,
    _error_reason: status === "completed" ? null : reason,
    _gateway_run_id: gatewayRunId,
    _pause_status: pause?.status ?? null,
    _pause_message: pause?.message ?? null,
  };
}
