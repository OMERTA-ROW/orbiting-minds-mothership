import { z } from "zod";
import type { CampaignDraft, Prospect, SabrinaInsight } from "./omni-angel-tech";

/**
 * Sabrina expansion: Opportunity Radar, agent matchmaking, strategic memory,
 * weekly ecosystem brief and structured Jackboy feedback.
 * Everything here is pure local computation over owner-entered records.
 * No trend service, crawler, model inference, outreach channel or credential
 * is connected; matches and briefs are planning aids, not verified research.
 */
export const SABRINA_STORE_KEY = "evolution.sabrina.v1";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "their",
  "them",
  "they",
  "are",
  "was",
  "were",
  "will",
  "would",
  "have",
  "has",
  "been",
  "about",
  "over",
  "under",
  "between",
  "through",
  "based",
  "only",
]);

export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return new Set(words);
}

export type MatchResult = { score: number; sharedTerms: string[]; reasons: string[] };

/** Keyword-overlap match between an intelligence note and a prospect. 0–100, explainable. */
export function matchScore(insight: SabrinaInsight, prospect: Prospect): MatchResult {
  if (prospect.status === "revoked")
    return { score: 0, sharedTerms: [], reasons: ["Revoked records are excluded."] };
  const need = new Set([
    ...tokenize(insight.invention),
    ...tokenize(insight.trend),
    ...tokenize(insight.audience),
  ]);
  const offer = new Set([
    ...tokenize(prospect.focus),
    ...tokenize(prospect.name),
    ...tokenize(prospect.organization),
  ]);
  const sharedTerms = [...need].filter((word) => offer.has(word)).sort();
  const reasons: string[] = [];
  let score = 0;
  if (sharedTerms.length) {
    score += Math.min(60, sharedTerms.length * 12);
    reasons.push(
      `${sharedTerms.length} shared focus term(s): ${sharedTerms.slice(0, 5).join(", ")}`,
    );
  } else {
    reasons.push("No shared focus terms between the note and this prospect.");
  }
  if (
    prospect.compatibility.includes("api-documented") ||
    prospect.compatibility.includes("mcp-documented")
  ) {
    score += 15;
    reasons.push("Documented API/MCP compatibility evidence recorded.");
  }
  if (prospect.permissions.includes("public-research")) {
    score += 10;
    reasons.push("Public-research permission aligns with intelligence work.");
  }
  if (prospect.ownerAuthorization && prospect.humanApproval === "approved") {
    score += 15;
    reasons.push("Owner authorization and human approval are in place.");
  }
  return { score: Math.min(100, score), sharedTerms, reasons };
}

export type Opportunity = {
  insightId: string;
  prospectId: string;
  invention: string;
  prospectName: string;
  score: number;
  reasons: string[];
  gate: "ready-for-review" | "gated";
  gateReasons: string[];
};

/** Opportunity Radar: ranks insight×prospect pairs. Gated pairs are shown, never auto-advanced. */
export function opportunityRadar(insights: SabrinaInsight[], prospects: Prospect[]): Opportunity[] {
  const opportunities: Opportunity[] = [];
  for (const insight of insights) {
    for (const prospect of prospects) {
      if (prospect.status === "revoked") continue;
      const match = matchScore(insight, prospect);
      if (match.score === 0) continue;
      const gateReasons: string[] = [];
      if (!prospect.ownerAuthorization) gateReasons.push("Owner authorization missing.");
      if (prospect.humanApproval !== "approved") gateReasons.push("Human approval missing.");
      if (prospect.status === "blocked") gateReasons.push("Prospect record is blocked.");
      opportunities.push({
        insightId: insight.id,
        prospectId: prospect.id,
        invention: insight.invention,
        prospectName: prospect.name,
        score: match.score,
        reasons: match.reasons,
        gate: gateReasons.length ? "gated" : "ready-for-review",
        gateReasons,
      });
    }
  }
  return opportunities.sort((a, b) => b.score - a.score).slice(0, 20);
}

/* ---------------- Strategic memory ---------------- */

export const memoryInputSchema = z.object({
  lesson: z.string().trim().min(10).max(1000),
  source: z.string().trim().min(2).max(500),
  confidence: z.number().min(0).max(100),
  expiresInDays: z.number().int().min(1).max(365),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export type StrategicMemory = MemoryInput & {
  id: string;
  createdAt: string;
  expiresAt: string;
};

export function createMemory(input: unknown, id: string, now: Date): StrategicMemory {
  const parsed = memoryInputSchema.parse(input);
  const expiresAt = new Date(now.getTime() + parsed.expiresInDays * 86_400_000).toISOString();
  return { ...parsed, id, createdAt: now.toISOString(), expiresAt };
}

export function memoryActive(memory: StrategicMemory, now: Date): boolean {
  return memory.expiresAt > now.toISOString();
}

/** Retrieval returns only active memories; deleted or expired entries never come back. */
export function recallMemories(memories: StrategicMemory[], now: Date): StrategicMemory[] {
  return memories.filter((memory) => memoryActive(memory, now));
}

/* ---------------- Weekly ecosystem brief ---------------- */

export type WeeklyBrief = {
  generatedAt: string;
  weekOf: string;
  body: string;
};

export function weeklyBrief(
  insights: SabrinaInsight[],
  prospects: Prospect[],
  drafts: CampaignDraft[],
  memories: StrategicMemory[],
  now: Date,
): WeeklyBrief {
  const active = recallMemories(memories, now);
  const radar = opportunityRadar(insights, prospects);
  const ready = radar.filter((o) => o.gate === "ready-for-review");
  const revoked = prospects.filter((p) => p.status === "revoked").length;
  const weekOf = now.toISOString().slice(0, 10);
  const body = [
    `Sabrina weekly ecosystem brief · week of ${weekOf}`,
    "",
    `Intelligence notes: ${insights.length} · Prospects: ${prospects.length} (${revoked} revoked) · Campaign drafts: ${drafts.length} · Active strategic memories: ${active.length}`,
    "",
    "Top opportunities (local match scores, not verified research):",
    ...(radar.length
      ? radar
          .slice(0, 5)
          .map(
            (o) =>
              `- ${o.invention} × ${o.prospectName}: ${o.score}/100 (${o.gate === "gated" ? `gated — ${o.gateReasons.join(" ")}` : "ready for owner review"})`,
          )
      : ["- None yet; record intelligence notes and prospects first."]),
    "",
    `Ready for owner review: ${ready.length}. Nothing has been sent, published, scheduled or connected.`,
    "All inputs are owner-entered; this brief is a planning aid, not independent market research.",
  ].join("\n");
  return { generatedAt: now.toISOString(), weekOf, body };
}

/* ---------------- Structured feedback to Jackboy ---------------- */

export const feedbackKinds = [
  "capability-gap",
  "quality",
  "defensive-security",
  "partnership",
] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

export const feedbackInputSchema = z.object({
  kind: z.enum(feedbackKinds),
  summary: z.string().trim().min(10).max(1500),
  relatedName: z.string().trim().max(240).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export type JackboyFeedback = FeedbackInput & {
  id: string;
  createdAt: string;
  delivery: "local-handoff";
};

export function createFeedback(input: unknown, id: string, now: string): JackboyFeedback {
  return { ...feedbackInputSchema.parse(input), id, createdAt: now, delivery: "local-handoff" };
}

/* ---------------- Store ---------------- */

const storeSchema = z.object({
  version: z.literal(1),
  memories: z.array(z.any()),
  briefs: z.array(z.any()),
  feedback: z.array(z.any()),
});
export type SabrinaStore = {
  memories: StrategicMemory[];
  briefs: WeeklyBrief[];
  feedback: JackboyFeedback[];
};

export function loadSabrinaStore(raw: string | null): SabrinaStore {
  if (!raw) return { memories: [], briefs: [], feedback: [] };
  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { memories: [], briefs: [], feedback: [] };
    return {
      memories: parsed.data.memories as StrategicMemory[],
      briefs: parsed.data.briefs as WeeklyBrief[],
      feedback: parsed.data.feedback as JackboyFeedback[],
    };
  } catch {
    return { memories: [], briefs: [], feedback: [] };
  }
}

export function saveSabrinaStore(store: SabrinaStore) {
  return JSON.stringify({ version: 1, ...store });
}
