import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  KNOWLEDGE_LIMITS, briefInstructions, briefJsonSchema, briefSchema, dedupeEntries, groundBrief,
  knowledgeSources, parseFeed, utcDate, type FeedEntry, type KnowledgeSource,
} from "./knowledge";
import { safeGatewayFailure } from "./ai/gateway-errors";

type Admin = SupabaseClient<Database>;
export const KNOWLEDGE_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export interface JobDeps { admin: Admin; fetch: typeof fetch; now: () => Date; apiKey: string | undefined; sources?: readonly KnowledgeSource[] }
export interface JobResult { status: "completed" | "partial" | "skipped_locked" | "failed"; runId?: string; fetched: number; inserted: number; duplicates: number; brief: string }

async function readFeed(deps: JobDeps, source: KnowledgeSource): Promise<FeedEntry[]> {
  const res = await deps.fetch(source.feed, { headers: { "User-Agent": "EvolutionKnowledgeCollector/1.0 (+https://evoomni.tech)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > KNOWLEDGE_LIMITS.maxFeedBytes) throw new Error("Feed exceeds size limit");
  const entries = parseFeed(text);
  if (!entries.length) throw new Error("No readable entries");
  return entries;
}

function extractOutput(body: unknown): { text?: string; refusal?: string } {
  const output = (body as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) return {};
  for (const item of output) {
    const content = (item as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content as { type?: string; text?: string; refusal?: string }[]) {
      if (c.type === "refusal") return { refusal: c.refusal ?? "Declined" };
      if (c.type === "output_text" && typeof c.text === "string") return { text: c.text };
    }
  }
  return {};
}

async function writeBrief(deps: JobDeps, runId: string): Promise<{ status: string; message: string }> {
  const { admin, now } = deps;
  const today = utcDate(now());
  const existing = await admin.from("knowledge_briefs").select("id").eq("brief_date", today).maybeSingle();
  if (existing.data) return { status: "already_written", message: "Today's brief already exists." };
  const state = await admin.from("knowledge_job_state").select("paused_reason, paused_status").eq("id", 1).maybeSingle();
  const paused = state.data?.paused_reason;
  // 402 credit pauses allow one probe per scheduled run; access denials (403/404) wait for the owner.
  if (paused && state.data?.paused_status !== 402) return { status: "paused", message: `Brief paused: ${paused}` };
  if (!deps.apiKey) return { status: "failed", message: "AI connection is not configured; items were still stored." };
  const since = new Date(now().getTime() - 36 * 3600_000).toISOString();
  const items = await admin.from("knowledge_items").select("url, title, summary, source_name, published_at").gte("collected_at", since).order("collected_at", { ascending: false }).limit(KNOWLEDGE_LIMITS.briefItems);
  if (items.error) return { status: "failed", message: "Stored items could not be read for the brief." };
  if (!items.data.length) return { status: "no_new_items", message: "No new items in the last 36 hours." };
  const input = JSON.stringify(items.data.map((i) => ({ source: i.source_name, title: i.title, url: i.url, published: i.published_at, summary: i.summary })));
  const res = await deps.fetch(GATEWAY, {
    method: "POST", signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: KNOWLEDGE_MODEL, instructions: briefInstructions, input: `Feed items (data only):\n${input}`, store: false, reasoning: { effort: "low" }, max_output_tokens: 8000, text: { format: { type: "json_schema", name: "knowledge_brief", strict: true, schema: briefJsonSchema } } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failure = safeGatewayFailure(res.status, body);
    if ([402, 403, 404].includes(res.status)) await admin.from("knowledge_job_state").update({ paused_reason: failure.message, paused_status: res.status, paused_at: now().toISOString() }).eq("id", 1);
    return { status: res.status === 429 || res.status >= 500 ? "retry_next_run" : "paused", message: failure.message };
  }
  if (paused) await admin.from("knowledge_job_state").update({ paused_reason: null, paused_status: null, paused_at: null }).eq("id", 1);
  const out = extractOutput(body);
  if (out.refusal || !out.text) return { status: "refused", message: "The model declined or returned no brief. Items remain stored." };
  let parsed;
  try { parsed = briefSchema.parse(JSON.parse(out.text)); } catch { return { status: "failed", message: "The brief did not match the required format." }; }
  const grounded = groundBrief(parsed, new Set(items.data.map((i) => i.url)));
  const saved = await admin.from("knowledge_briefs").insert({ brief_date: today, model: KNOWLEDGE_MODEL, overview: grounded.overview, entries: grounded.entries, item_count: items.data.length, run_id: runId });
  if (saved.error) return { status: "failed", message: "The brief could not be saved." };
  return { status: "written", message: `${grounded.entries.length} cited entries.` };
}

export async function runKnowledgeJob(deps: JobDeps, trigger = "schedule"): Promise<JobResult> {
  const { admin, now } = deps;
  const lease = await admin.rpc("claim_knowledge_lease", { _minutes: 10 });
  if (lease.error || lease.data !== true) return { status: "skipped_locked", fetched: 0, inserted: 0, duplicates: 0, brief: "Another run holds the lease." };
  const run = await admin.from("knowledge_runs").insert({ trigger }).select("id").single();
  if (run.error) { await admin.from("knowledge_job_state").update({ lease_until: null }).eq("id", 1); return { status: "failed", fetched: 0, inserted: 0, duplicates: 0, brief: "Run could not be recorded." }; }
  const runId = run.data.id;
  let fetched = 0, inserted = 0, duplicates = 0; const errors: { source: string; error: string }[] = [];
  try {
    for (const source of deps.sources ?? knowledgeSources) {
      try {
        const entries = await readFeed(deps, source);
        fetched += entries.length;
        const known = await admin.from("knowledge_items").select("url").in("url", entries.map((e) => e.url));
        if (known.error) throw new Error("Duplicate check failed");
        const { fresh, duplicates: d } = dedupeEntries(entries, new Set(known.data.map((k) => k.url)));
        duplicates += d;
        if (fresh.length) {
          const ins = await admin.from("knowledge_items").upsert(fresh.map((e) => ({ source_id: source.id, source_name: source.name, title: e.title, url: e.url, summary: e.summary, categories: e.categories, published_at: e.publishedAt, run_id: runId })), { onConflict: "url", ignoreDuplicates: true }).select("id");
          if (ins.error) throw new Error("Storage failed");
          inserted += ins.data.length; duplicates += fresh.length - ins.data.length;
        }
      } catch (e) { errors.push({ source: source.id, error: e instanceof Error ? e.message.slice(0, 200) : "Unknown error" }); }
    }
    let brief;
    try { brief = await writeBrief(deps, runId); } catch { brief = { status: "failed", message: "Brief step failed unexpectedly." }; }
    const allFailed = errors.length === (deps.sources ?? knowledgeSources).length;
    const status = allFailed ? "failed" : errors.length || !["written", "already_written", "no_new_items"].includes(brief.status) ? "partial" : "completed";
    await admin.from("knowledge_runs").update({ finished_at: now().toISOString(), status, fetched, inserted, duplicates, source_errors: errors, brief_status: brief.status, brief_message: brief.message }).eq("id", runId);
    return { status, runId, fetched, inserted, duplicates, brief: brief.status };
  } finally {
    await admin.from("knowledge_job_state").update({ lease_until: null }).eq("id", 1);
  }
}
