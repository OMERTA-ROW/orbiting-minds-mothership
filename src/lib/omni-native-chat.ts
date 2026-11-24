import { z } from "zod";
import { CLAUDE_ENGINE_IDS } from "./omni-engines";

export const NATIVE_CHAT_PROTOCOL = "omni.native-chat/v1";
export const NATIVE_CHAT_MAX_BODY_BYTES = 128 * 1024;
export const NATIVE_CHAT_MAX_MESSAGES = 20;
export const NATIVE_CHAT_MAX_INPUT_CHARS = 12_000;
export const NATIVE_CHAT_MAX_OUTPUT_CHARS = 40_000;
export const NATIVE_CHAT_MAX_OUTPUT_TOKENS = 1024;
export const NATIVE_CHAT_POLL_MS = 1000;
export const NATIVE_CHAT_TIMEOUT_MS = 60_000;
export const NATIVE_CHAT_DAILY_LIMIT = 30;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
});

export const nativeChatBodySchema = z
  .object({
    protocol: z.literal(NATIVE_CHAT_PROTOCOL),
    requestId: z.string().uuid(),
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    agentId: z.enum(["omni", "dread", "draco"]),
    model: z.enum(CLAUDE_ENGINE_IDS),
    messages: z.array(messageSchema).min(1).max(100),
    consent: z.literal(true),
    autonomous: z.literal(false),
  })
  .strict();

export type NativeChatInput = z.infer<typeof nativeChatBodySchema>;

/** Reserve against the UTF-8 byte upper bound instead of the usual chars/3 estimate. */
export function conservativeNativeChatInputUnits(
  system: string,
  messages: readonly z.infer<typeof messageSchema>[],
) {
  const encoder = new TextEncoder();
  const bytes =
    encoder.encode(system).byteLength +
    messages.reduce((total, message) => total + encoder.encode(message.content).byteLength, 0);
  return bytes * 3;
}

/** Reuses the bounded-context rules used by the owner-delegated chat route. */
export function selectNativeChatContext(messages: readonly z.infer<typeof messageSchema>[]) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || messages.some((message) => !message.content.trim()))
    return null;

  const selected: z.infer<typeof messageSchema>[] = [];
  let inputChars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (selected.length >= NATIVE_CHAT_MAX_MESSAGES) break;
    if (inputChars + message.content.length > NATIVE_CHAT_MAX_INPUT_CHARS) break;
    selected.unshift(message);
    inputChars += message.content.length;
  }
  if (!selected.length) return null;
  return {
    messages: selected,
    inputChars,
    omitted: messages.length - selected.length,
  };
}

export function splitNativeChatText(text: string, chunkSize = 1024): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += chunkSize)
    chunks.push(chars.slice(i, i + chunkSize).join(""));
  return chunks;
}
