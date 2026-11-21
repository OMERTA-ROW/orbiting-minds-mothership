/**
 * OMNI web chat through an owner delegation ("chat:write") — shared, browser-safe rules.
 * The database (migration `drizzle/migrations/0066_omni_delegated_chat.sql`, installed 2026-11-20) enforces the
 * scope, owner AI approval, Emergency Stop, daily limit and the one-at-a-time AI guard, shared by
 * every chat agent (OMNI, Dread, Draco: one daily limit, one request at a time); this
 * file only shapes the request. No network, no secrets.
 */
import { z } from "zod";
import { OMNI_MODEL } from "./ai/omni-model";

/** The provider the Mothership's OMNI text agent actually uses. */
export const CHAT_PROVIDER = { id: "lovable-ai", label: "Lovable AI" } as const;
/** OMNI web selects models as `<provider id>:<model id>` (its isVerifiedModel). */
export const CHAT_MODEL_REF = `${CHAT_PROVIDER.id}:${OMNI_MODEL}`;
/** OMNI, the Mothership's OMNI text agent (default chat agent). */
export const CHAT_AGENT = { id: "omni", name: "OMNI" } as const;
/** Every agent OMNI web can chat with (OMNI, Dread, Draco); see omni-chat-agents.ts. */
export { CHAT_AGENTS, CHAT_AGENT_IDS, chatAgentById } from "./omni-chat-agents";

export const DELEGATED_CHAT_LIMITS = {
  /** Started requests per owner per 24 hours (database-enforced). */
  daily: 30,
  /** Most recent messages sent to the model, and their total characters. */
  maxMessages: 20,
  maxInputChars: 24_000,
  /** Request body OMNI may send (it may include a longer history than is used). */
  maxBodyBytes: 512 * 1024,
  /** Below OMNI web's own 20-second call timeout, so OMNI always gets a classified answer. */
  timeoutMs: 17_000,
  /** Revocation / Stop / AI-approval re-check while the reply is generated. */
  pollMs: 1_000,
} as const;

const chatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
});
export type DelegatedChatMessage = z.infer<typeof chatMessage>;

/** Body OMNI sends to POST /api/omni/chat (OMNI docs/MOTHERSHIP_BACKEND.md). */
export const delegatedChatBody = z.object({
  agentId: z.string().min(1).max(100),
  model: z.string().max(200).optional(),
  messages: z.array(chatMessage).min(1).max(100),
  autonomous: z.literal(false),
  source: z.literal("omni-web"),
});

/** Accepts no model, the bare model ID or OMNI's `<provider>:<model>` form; nothing else. */
export function resolveChatModel(model: string | undefined): string | null {
  if (model === undefined || model === OMNI_MODEL || model === CHAT_MODEL_REF) return OMNI_MODEL;
  return null;
}

export type ChatContext =
  | { ok: true; messages: DelegatedChatMessage[]; inputChars: number; omitted: number }
  | { ok: false; reason: "invalid_request" };

/**
 * The most recent messages that fit the limits, oldest first. The last message must be a
 * non-empty user message; empty messages are refused, never silently dropped.
 */
export function selectChatContext(messages: readonly DelegatedChatMessage[]): ChatContext {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return { ok: false, reason: "invalid_request" };
  if (messages.some((m) => !m.content.trim())) return { ok: false, reason: "invalid_request" };
  const picked: DelegatedChatMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (picked.length >= DELEGATED_CHAT_LIMITS.maxMessages) break;
    if (chars + m.content.length > DELEGATED_CHAT_LIMITS.maxInputChars) break;
    picked.unshift(m);
    chars += m.content.length;
  }
  if (picked.length === 0) return { ok: false, reason: "invalid_request" };
  return {
    ok: true,
    messages: picked,
    inputChars: chars,
    omitted: messages.length - picked.length,
  };
}

/** Plain refusals for OMNI. Status codes are stable so OMNI can classify them. */
export const CHAT_REFUSALS: Record<string, { status: number; error: string; message: string }> = {
  scope_missing: {
    status: 403,
    error: "scope_missing",
    message: "This owner delegation does not include chat:write. The owner must approve it.",
  },
  agent_not_enrolled: {
    status: 403,
    error: "agent_not_enrolled",
    message: "Only OMNI, Dread and Draco can chat through OMNI web. Other agents take held tasks.",
  },
  model_not_available: {
    status: 422,
    error: "model_not_available",
    message: `Only ${CHAT_MODEL_REF} is configured on the Mothership.`,
  },
  invalid_request: {
    status: 422,
    error: "invalid_request",
    message: "Send non-empty messages ending with the owner's message.",
  },
  secret_like: {
    status: 422,
    error: "secret_like",
    message:
      "A message looks like a key, password, token or email address. Remove it; nothing was sent to the AI.",
  },
  ai_not_approved: {
    status: 403,
    error: "ai_not_approved",
    message: "AI use is not approved (or is paused) for the owner account on the Mothership.",
  },
  emergency_stop_engaged: {
    status: 423,
    error: "emergency_stop_engaged",
    message: "The Emergency Stop is engaged. Chat waits until the owner releases it.",
  },
  daily_limit: {
    status: 429,
    error: "daily_limit",
    message: `OMNI web can start at most ${DELEGATED_CHAT_LIMITS.daily} chat replies per day.`,
  },
  ai_busy_or_paused: {
    status: 503,
    error: "ai_busy_or_paused",
    message:
      "OMNI is answering another request, or AI is paused pending owner review. Nothing was sent; try again later.",
  },
  provider_not_configured: {
    status: 503,
    error: "provider_not_configured",
    message: "Lovable AI is not configured on the Mothership. Nothing was sent.",
  },
  chat_not_installed: {
    status: 503,
    error: "chat_not_installed",
    message:
      "The Mothership couldn't confirm chat through OMNI web is installed (database change 0066). Nothing was sent.",
  },
};
