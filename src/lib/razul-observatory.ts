/**
 * RAZUL Internet Observatory — pure scoring, routing, and source-filtering logic.
 * Shared by the scheduled job (server) and tests; no server-only imports here.
 * Public permitted sources only; no private communications ever enter this pipeline.
 */

export type ObservatoryCategory = "ai-model" | "vulnerability" | "development" | "research";

export interface ObservatorySource {
  id: string;
  name: string;
  url: string;
  kind: string;
  category: string;
  active: boolean;
}

export interface ObservatoryControls {
  alertThreshold: number;
  coverage: readonly string[];
  blockedSources: readonly string[];
}

const CATEGORY_KEYWORDS: Record<ObservatoryCategory, readonly string[]> = {
  "ai-model": [
    "model", "gpt", "claude", "gemini", "llm", "release", "launch", "benchmark",
    "reasoning", "multimodal", "frontier", "open-weight", "fine-tun",
  ],
  vulnerability: [
    "cve", "vulnerab", "exploit", "advisory", "patch", "rce", "zero-day",
    "remote code execution", "privilege escalation", "mitigat", "severity",
  ],
  development: [
    "api", "sdk", "release", "deprecat", "breaking", "changelog", "version",
    "runtime", "framework", "tooling",
  ],
  research: [
    "paper", "benchmark", "study", "arxiv", "preprint", "evaluation",
    "dataset", "alignment", "survey",
  ],
};

/** Keyword-based relevance 0–100: title hits weigh double, capped. */
export function scoreRelevance(
  entry: { title: string; summary: string },
  category: string,
): number {
  const keywords = CATEGORY_KEYWORDS[category as ObservatoryCategory] ?? [];
  if (!keywords.length) return 0;
  const title = entry.title.toLowerCase();
  const summary = entry.summary.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) score += 18;
    else if (summary.includes(kw)) score += 8;
  }
  return Math.min(100, score);
}

const CATEGORY_ROUTES: Record<ObservatoryCategory, readonly string[]> = {
  vulnerability: ["guardian", "omni", "jackboy"],
  "ai-model": ["omni", "sabrina", "jackboy"],
  development: ["jackboy", "omni"],
  research: ["sabrina", "omni"],
};

/**
 * Actionable routing: a finding is routed to consumers only when its relevance
 * meets the owner's alert threshold. Below threshold it stays in searchable
 * history without alerting anyone.
 */
export function routeFinding(
  category: string,
  relevance: number,
  threshold: number,
): string[] {
  if (relevance < threshold) return [];
  return [...(CATEGORY_ROUTES[category as ObservatoryCategory] ?? ["omni"])];
}

/**
 * Owner controls applied to the registry: active sources, not blocked,
 * whose category is inside the configured coverage. Bounded to maxSources.
 */
export function filterSources<T extends ObservatorySource>(
  sources: readonly T[],
  controls: ObservatoryControls,
  maxSources = 5,
): T[] {
  const blocked = new Set(controls.blockedSources);
  const coverage = new Set(controls.coverage);
  return sources
    .filter((s) => s.active && !blocked.has(s.id) && coverage.has(s.category))
    .slice(0, maxSources);
}
