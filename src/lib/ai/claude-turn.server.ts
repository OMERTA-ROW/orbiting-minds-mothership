/**
 * One Claude reply for the private OMNI text agent or a Dread/Draco Fusion turn (migration 0075).
 * Order: the caller's existing checks → `reserve` (service-only: Stop row, run/turn row, per-owner ledger lock;
 * switch, 30-day price, ≤50¢ per call, ≤500¢ per rolling 24 h shared with chat) → `infer` (Anthropic Messages,
 * text only, fixed output length; the caller polls Stop/revocation and aborts) → `settle` exactly once.
 * Any missing function, key or malformed answer refuses. The key is passed in and never logged or returned.
 */
import { CLAUDE_CAPS, CLAUDE_MAX_OUTPUT_TOKENS, type ClaudeEngineId } from "../omni-engines";
import type { ClaudeMessage } from "./anthropic.server";

export type ClaudeRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
export type ClaudeSource = "agent" | "fusion";
export type Reservation = { ok: true; estimateCents: number } | { ok: false; reason: string };

const REASON = /^[a-z_]{1,60}$/;

export async function reserveClaude(
  rpc: ClaudeRpc,
  source: ClaudeSource,
  args: { runId: string; model: ClaudeEngineId; inputChars: number },
): Promise<Reservation> {
  const params =
    source === "agent"
      ? {
          _run_id: args.runId,
          _model: args.model,
          _input_chars: args.inputChars,
          _max_output_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
        }
      : {
          _turn_id: args.runId,
          _input_chars: args.inputChars,
          _max_output_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
        };
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc(
      source === "agent" ? "claude_reserve_agent_run" : "claude_reserve_fusion_turn",
      params,
    );
  } catch {
    return { ok: false, reason: "claude_not_installed" };
  }
  if (r.error || !r.data || typeof r.data !== "object")
    return { ok: false, reason: "claude_not_installed" };
  const d = r.data as Record<string, unknown>;
  if (d["ok"] !== true) {
    const reason = d["reason"];
    return {
      ok: false,
      reason: typeof reason === "string" && REASON.test(reason) ? reason : "check_unavailable",
    };
  }
  const est = d["estimate_cents"];
  if (
    typeof est !== "number" ||
    !Number.isInteger(est) ||
    est < 1 ||
    est > CLAUDE_CAPS.perCallCents
  )
    return { ok: false, reason: "check_unavailable" };
  return { ok: true, estimateCents: est };
}

export type ClaudeOutcome = "completed" | "failed" | "cancelled";

/** Returns the recorded cost in cents, or null when the settlement couldn't be recorded. */
export async function settleClaude(
  rpc: ClaudeRpc,
  source: ClaudeSource,
  runId: string,
  outcome: ClaudeOutcome,
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
): Promise<number | null> {
  try {
    const r = await rpc("claude_settle_source", {
      _source: source,
      _run_id: runId,
      _status: outcome,
      _input_tokens: usage?.inputTokens ?? null,
      _output_tokens: usage?.outputTokens ?? null,
    });
    if (r.error || !r.data || typeof r.data !== "object") return null;
    const d = r.data as Record<string, unknown>;
    return d["ok"] === true && typeof d["actual_cents"] === "number" ? d["actual_cents"] : null;
  } catch {
    return null;
  }
}

export type ClaudeInference = {
  text: string;
  finishReason: "stop" | "length" | "content-filter" | undefined;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
  failure: { status: number; message: string } | undefined;
  threw: boolean;
};

export async function inferClaude(args: {
  apiKey: string;
  model: ClaudeEngineId;
  system: string;
  messages: ClaudeMessage[];
  signal: AbortSignal;
  fetchImpl?: typeof fetch | undefined;
}): Promise<ClaudeInference> {
  const { callClaude } = await import("./anthropic.server");
  const r = await callClaude({
    apiKey: args.apiKey,
    model: args.model,
    system: args.system,
    messages: args.messages,
    maxTokens: CLAUDE_MAX_OUTPUT_TOKENS,
    signal: args.signal,
    ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
  });
  return {
    text: r.text,
    finishReason:
      r.threw || r.failureStatus
        ? undefined
        : r.stopReason === "max_tokens"
          ? "length"
          : r.stopReason === "refusal"
            ? "content-filter"
            : "stop",
    usage:
      r.inputTokens !== null && r.outputTokens !== null
        ? {
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.inputTokens + r.outputTokens,
          }
        : undefined,
    failure: r.failureStatus
      ? { status: r.failureStatus, message: `Anthropic HTTP ${r.failureStatus}` }
      : undefined,
    threw: r.threw,
  };
}

/** Settlement outcome for a reply's final state. */
export function claudeOutcomeFor(status: string): ClaudeOutcome {
  return status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed";
}
