/**
 * Agent engines (browser-safe). Claude engines are optional, off by default per agent, and every
 * call passes the shared chat checks plus the Claude cost ledger (`claude_reserve`). No secrets.
 */
export const DEFAULT_ENGINE_ID = "openai/gpt-6-astra" as const;
export const CLAUDE_ENGINE_IDS = ["claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type ClaudeEngineId = (typeof CLAUDE_ENGINE_IDS)[number];
export type EngineId = typeof DEFAULT_ENGINE_ID | ClaudeEngineId;

export type Engine = {
  id: EngineId;
  provider: "lovable-ai" | "anthropic";
  label: string;
  attribution: string;
  isDefault: boolean;
};

export const ENGINES: readonly Engine[] = [
  {
    id: DEFAULT_ENGINE_ID,
    provider: "lovable-ai",
    label: "Current engine",
    attribution: "OMNI model (Lovable AI)",
    isDefault: true,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    attribution: "Claude Sonnet 5.5 (Anthropic)",
    isDefault: false,
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    attribution: "Claude Opus 5.5 (Anthropic)",
    isDefault: false,
  },
];

/** Exact ID or `anthropic:<id>`; no case folding, aliases or near matches. */
export function claudeEngineFor(model: string | undefined): ClaudeEngineId | null {
  if (model === undefined) return null;
  const id = model.startsWith("anthropic:") ? model.slice("anthropic:".length) : model;
  return (CLAUDE_ENGINE_IDS as readonly string[]).includes(id) ? (id as ClaudeEngineId) : null;
}

export function engineById(id: string): Engine | null {
  return ENGINES.find((e) => e.id === id) ?? null;
}

/** "Claude Sonnet 5.5 (Anthropic) via Dread". */
export function attributionLine(engineId: string, agentName: string): string {
  return `${engineById(engineId)?.attribution ?? "Unknown engine"} via ${agentName}`;
}

/** Fixed reply length for Claude calls; keeps the worst-case estimate bounded. */
export const CLAUDE_MAX_OUTPUT_TOKENS = 1024;

/** Mirror of SQL `claude_estimate_cents` (input counted as chars/3 + 200 prompt overhead). */
export function estimateClaudeCents(
  inputChars: number,
  maxOutputTokens: number,
  inCentsPerMtok: number,
  outCentsPerMtok: number,
): number | null {
  if (!(inCentsPerMtok > 0) || !(outCentsPerMtok > 0)) return null;
  const inTokens = Math.ceil(inputChars / 3) + 200;
  return Math.max(
    1,
    Math.ceil((inTokens * inCentsPerMtok + maxOutputTokens * outCentsPerMtok) / 1e6),
  );
}

export const CLAUDE_CAPS = { perCallCents: 50, perDayCents: 500 } as const;

export const CLAUDE_REFUSAL_TEXT: Record<string, string> = {
  engine_not_enabled: "Claude is not turned on for this agent.",
  price_not_confirmed: "Claude prices are missing or older than 30 days.",
  call_cap: "This reply could cost more than $0.50, so it was refused.",
  daily_cap: "Today's $5 AI limit would be passed, so it was refused.",
  claude_not_installed: "The Claude cost ledger is not available.",
  provider_not_configured: "The Anthropic key is not saved on the server.",
};

/** Every engine ID a request or record may name (exact strings). */
export const ENGINE_IDS = [DEFAULT_ENGINE_ID, ...CLAUDE_ENGINE_IDS] as const;

/** Where a Claude call ran (migration 0075 `claude_usage.source`; rows before it are chat). */
export const CLAUDE_SOURCE_LABEL: Record<string, string> = {
  chat: "Chat",
  agent: "Terminal agent",
  fusion: "Fusion",
};

const CLAUDE_REFUSALS: Record<string, { status: number; message: string }> = {
  engine_not_enabled: { status: 403, message: "Claude is not turned on for this agent." },
  price_not_confirmed: { status: 503, message: "Claude prices are missing or older than 30 days." },
  call_cap: { status: 402, message: "This reply could cost more than $0.50, so it was refused." },
  daily_cap: { status: 402, message: "Today's $5 AI limit would be passed, so it was refused." },
  claude_not_installed: {
    status: 503,
    message: "Claude for this screen isn't installed yet (it waits on your approval).",
  },
  provider_not_configured: {
    status: 503,
    message: "The Anthropic key is not saved on the server.",
  },
  owner_unverified: {
    status: 403,
    message: "Claude is for the verified owner with two-step sign-in only.",
  },
  emergency_stop_engaged: {
    status: 423,
    message: "The Emergency Stop is engaged, so Claude didn't run.",
  },
  ai_not_approved: { status: 403, message: "AI isn't approved for this account (or is paused)." },
  run_not_running: { status: 409, message: "This request was cancelled before Claude started." },
  already_reserved: {
    status: 409,
    message: "This request already has a Claude reservation; it won't run twice.",
  },
  session_stopped: { status: 409, message: "The session was stopped, so Claude didn't run." },
  turn_finished: { status: 409, message: "This reply already finished." },
  turn_not_found: { status: 404, message: "That reply was not found." },
  invalid_request: { status: 400, message: "The Claude request was not valid, so nothing ran." },
};

/** Status and plain message for a Claude reservation refusal; unknown reasons fail closed. */
export function claudeRefusal(reason: string): { status: number; message: string } {
  return (
    CLAUDE_REFUSALS[reason] ?? {
      status: 503,
      message: "Claude checks couldn't be confirmed, so nothing ran.",
    }
  );
}
