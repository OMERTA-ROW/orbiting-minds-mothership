/**
 * Server-only Anthropic Messages call. Text only, no tools. The key is passed in from a handler
 * (never read at module scope) and never logged, echoed or returned; errors return status only.
 */
import type { ClaudeEngineId } from "../omni-engines";

export type ClaudeMessage = { role: "user" | "assistant"; content: string };
export type ClaudeResult = {
  text: string;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  failureStatus: number | null;
  threw: boolean;
};

export async function callClaude(args: {
  apiKey: string;
  model: ClaudeEngineId;
  system: string;
  messages: ClaudeMessage[];
  maxTokens: number;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ClaudeResult> {
  const f = args.fetchImpl ?? fetch;
  try {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      redirect: "manual",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: args.messages,
      }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { text: "", stopReason: null, inputTokens: null, outputTokens: null, failureStatus: res.status, threw: false };
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("");
    return {
      text,
      stopReason: data.stop_reason ?? null,
      inputTokens: Number.isInteger(data.usage?.input_tokens) ? data.usage!.input_tokens! : null,
      outputTokens: Number.isInteger(data.usage?.output_tokens) ? data.usage!.output_tokens! : null,
      failureStatus: null,
      threw: false,
    };
  } catch {
    return { text: "", stopReason: null, inputTokens: null, outputTokens: null, failureStatus: null, threw: true };
  }
}
