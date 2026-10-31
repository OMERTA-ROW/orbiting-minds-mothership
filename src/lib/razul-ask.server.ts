/**
 * Ask Razul — the shared research query path. Deps-injected so the full
 * retrieval → ranking → citation → cache → log pipeline is integration-testable
 * without a live backend. Raw question text is never stored: only its hash.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  confidenceFor,
  questionHashInput,
  rankForQuestion,
} from "./razul-observatory";

type Admin = SupabaseClient<Database>;

export interface AskDeps {
  admin: Admin;
  now: () => Date;
}

export interface RazulCitation {
  findingId: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  collectedAt: string;
  evidenceClass: string;
  confidence: number;
  relevance: number;
}

export interface RazulAnswer {
  questionHash: string;
  cached: boolean;
  citations: RazulCitation[];
  answerSummary: string;
}

const CACHE_TTL_MS = 6 * 3600_000;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function answerRazulQuery(
  deps: AskDeps,
  input: { question: string; agent: string; scopeCategories?: readonly string[] },
): Promise<RazulAnswer> {
  const { admin, now } = deps;
  const hash = await sha256(questionHashInput(input.question));
  const scopeKey = (input.scopeCategories ?? []).join(",") || "all";

  // Cache: fresh identical question + scope returns the stored answer.
  const cached = await admin
    .from("razul_query_cache")
    .select("answer, created_at")
    .eq("question_hash", hash)
    .eq("scope_key", scopeKey)
    .maybeSingle();
  if (
    cached.data &&
    now().getTime() - new Date(cached.data.created_at).getTime() < CACHE_TTL_MS
  ) {
    await admin.from("razul_query_log").insert({
      question_hash: hash,
      agent: input.agent,
      result_count: (cached.data.answer as { citations?: unknown[] }).citations?.length ?? 0,
      cached: true,
    });
    return { ...(cached.data.answer as Omit<RazulAnswer, "cached">), cached: true };
  }

  // Retrieval: recent findings, optionally narrowed to the project's scope.
  let query = admin
    .from("razul_findings")
    .select(
      "id, title, url, source_name, summary, category, topic, entities, evidence_class, relevance, corroborations, published_at, collected_at",
    )
    .order("collected_at", { ascending: false })
    .limit(200);
  if (input.scopeCategories?.length) query = query.in("category", [...input.scopeCategories]);
  const findings = await query;
  if (findings.error) throw new Error("The observatory index could not be searched.");

  const ranked = rankForQuestion(input.question, findings.data, 5);
  const citations: RazulCitation[] = ranked.map((f) => ({
    findingId: f.id,
    title: f.title,
    url: f.url,
    sourceName: f.source_name,
    publishedAt: f.published_at,
    collectedAt: f.collected_at,
    evidenceClass: f.evidence_class,
    confidence: confidenceFor({
      evidenceClass: f.evidence_class as never,
      relevance: f.relevance,
      corroborations: f.corroborations,
    }),
    relevance: f.relevance,
  }));
  const answer: RazulAnswer = {
    questionHash: hash,
    cached: false,
    citations,
    answerSummary: citations.length
      ? `${citations.length} cited finding${citations.length === 1 ? "" : "s"} from the observatory index, newest first.`
      : "No matching findings in the observatory index yet; the next scheduled run may cover this.",
  };

  await admin
    .from("razul_query_cache")
    .upsert(
      { question_hash: hash, scope_key: scopeKey, answer, created_at: now().toISOString() },
      { onConflict: "question_hash,scope_key" },
    );
  await admin.from("razul_query_log").insert({
    question_hash: hash,
    agent: input.agent,
    result_count: citations.length,
    cached: false,
  });
  return answer;
}
