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
