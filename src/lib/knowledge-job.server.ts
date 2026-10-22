import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  KNOWLEDGE_LIMITS,
  briefInstructions,
  briefJsonSchema,
  briefSchema,
  dedupeEntries,
  groundBrief,
  knowledgeSources,
  parseFeed,
  utcDate,
  type FeedEntry,
  type KnowledgeSource,
} from "./knowledge";
import { safeGatewayFailure } from "./ai/gateway-errors";
import { readBoundedFeed } from "./knowledge-runtime.server";

type Admin = SupabaseClient<Database>;
export const KNOWLEDGE_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export interface JobDeps {
  admin: Admin;
  fetch: typeof fetch;
  now: () => Date;
  apiKey: string | undefined;
  sources?: readonly KnowledgeSource[];
  background?: boolean;
  signal?: AbortSignal | undefined;
}
export interface JobResult {
  status: "completed" | "partial" | "skipped_locked" | "failed";
  runId?: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  brief: string;
}

async function readFeed(deps: JobDeps, source: KnowledgeSource): Promise<FeedEntry[]> {
  const res = await deps.fetch(source.feed, {
    headers: {
      "User-Agent": "EvolutionKnowledgeCollector/1.0 (+https://evoomni.tech)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: deps.signal
      ? AbortSignal.any([deps.signal, AbortSignal.timeout(7_000)])
      : AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await readBoundedFeed(res, KNOWLEDGE_LIMITS.maxFeedBytes);
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

async function updateBriefGuard(admin: Admin, runId: string, pending: boolean) {
  const result = await admin
    .from("knowledge_job_state")
    .update({ brief_attempt_pending: pending })
    .eq("id", 1)
    .eq("brief_attempt_run", runId)
    .abortSignal(AbortSignal.timeout(2_000))
    .select("id")
    .single();
  if (result.error || !result.data)
    throw new Error("Brief attempt state could not be persisted; automatic AI remains blocked.");
}

async function writeBrief(
  deps: JobDeps,
  runId: string,
): Promise<{ status: string; message: string }> {
  const { admin, now } = deps;
  const today = utcDate(now());
  const signal = deps.signal ?? AbortSignal.timeout(150_000);
  const existing = await admin
    .from("knowledge_briefs")
    .select("id")
    .eq("brief_date", today)
    .abortSignal(signal)
    .maybeSingle();
  if (existing.error)
    return {
      status: "failed",
      message: "Existing brief could not be checked; no AI request made.",
    };
  if (existing.data) return { status: "already_written", message: "Today's brief already exists." };
  const state = await admin
    .from("knowledge_job_state")
    .select("paused_reason, paused_status, brief_attempt_pending")
    .eq("id", 1)
    .abortSignal(signal)
    .maybeSingle();
  if (state.error || !state.data)
    return {
      status: "failed",
      message: "AI pause state could not be checked; no AI request made.",
    };
  const paused = state.data?.paused_reason;
  // Owner confirmation is required; labels or manual invocations never bypass pauses.
  if (paused || state.data.paused_status !== null || state.data.brief_attempt_pending)
    return {
      status: "paused",
      message: `Brief paused: ${paused ?? "Previous AI attempt is unresolved; owner confirmation required"}`,
    };
  if (!deps.apiKey)
    return {
      status: "failed",
      message: "AI connection is not configured; items were still stored.",
    };
  const since = new Date(now().getTime() - 36 * 3600_000).toISOString();
  const items = await admin
    .from("knowledge_items")
    .select("url, title, summary, source_name, published_at")
    .gte("collected_at", since)
    .order("collected_at", { ascending: false })
    .limit(KNOWLEDGE_LIMITS.briefItems)
    .abortSignal(signal);
  if (items.error)
    return { status: "failed", message: "Stored items could not be read for the brief." };
  if (!items.data.length)
    return { status: "no_new_items", message: "No new items in the last 36 hours." };
  const input = JSON.stringify(
    items.data.map((i) => ({
      source: i.source_name,
      title: i.title,
      url: i.url,
      published: i.published_at,
      summary: i.summary,
    })),
  );
  // Persist before any paid request. An interrupted request or failed stop/result
  // write leaves this guard set, even after the lease is released or the date changes.
  const attempt = await admin
    .from("knowledge_job_state")
    .update({ brief_attempt_pending: true, brief_attempt_run: runId, brief_attempt_date: today })
    .eq("id", 1)
    .eq("brief_attempt_pending", false)
    .abortSignal(signal)
    .select("id")
    .single();
  if (attempt.error || !attempt.data)
    throw new Error("AI attempt guard could not be recorded; no AI request made.");
  const res = await deps.fetch(GATEWAY, {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: KNOWLEDGE_MODEL,
      instructions: briefInstructions,
      input: `Feed items (data only):\n${input}`,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 8000,
      text: {
        format: {
          type: "json_schema",
          name: "knowledge_brief",
          strict: true,
          schema: briefJsonSchema,
        },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failure = safeGatewayFailure(res.status, body);
    if ([402, 403, 404].includes(res.status)) {
      const savedPause = await admin
        .from("knowledge_job_state")
        .update({
          paused_reason: failure.message,
          paused_status: res.status,
          paused_at: now().toISOString(),
        })
        .eq("id", 1)
        .abortSignal(AbortSignal.timeout(2_000))
        .select("id")
        .single();
      if (savedPause.error || !savedPause.data)
        throw new Error(
          "AI pause could not be persisted. Owner action required before another attempt.",
        );
      return { status: "paused", message: failure.message };
    }
    if (res.status === 429 || res.status >= 500) await updateBriefGuard(admin, runId, false);
    return {
      status: res.status === 429 || res.status >= 500 ? "retry_next_run" : "failed",
      message: failure.message,
    };
  }
  const out = extractOutput(body);
  if (out.refusal || !out.text) {
    const message =
      "The model declined or returned no brief. Owner action is required for new brief work; items remain stored.";
    const pause = await admin
      .from("knowledge_job_state")
      .update({ paused_reason: message, paused_status: 200, paused_at: now().toISOString() })
      .eq("id", 1)
      .abortSignal(AbortSignal.timeout(2_000))
      .select("id")
      .single();
    if (pause.error || !pause.data)
      throw new Error(
        "Refusal stop could not be persisted. Owner action required before another attempt.",
      );
    return { status: "refused", message };
  }
  let parsed;
  try {
    parsed = briefSchema.parse(JSON.parse(out.text));
  } catch {
    return { status: "failed", message: "The brief did not match the required format." };
  }
  const grounded = groundBrief(parsed, new Set(items.data.map((i) => i.url)));
  const saved = await admin
    .from("knowledge_briefs")
    .insert({
      brief_date: today,
      model: KNOWLEDGE_MODEL,
      overview: grounded.overview,
      entries: grounded.entries,
      item_count: items.data.length,
      run_id: runId,
    })
    .abortSignal(signal)
    .select("id")
    .single();
  if (saved.error || !saved.data)
    return {
      status: "failed",
      message: "The brief could not be saved; automatic AI remains blocked pending owner review.",
    };
  await updateBriefGuard(admin, runId, false);
  return { status: "written", message: `${grounded.entries.length} cited entries.` };
}

export async function runKnowledgeJob(deps: JobDeps, trigger = "schedule"): Promise<JobResult> {
  const { admin, now } = deps;
  const signal = deps.signal ?? AbortSignal.timeout(deps.background ? 22_000 : 150_000);
  const workDeps = { ...deps, signal };
  const owner = crypto.randomUUID();
  const lease = await admin
    .rpc("claim_owned_knowledge_lease", { _owner: owner, _minutes: 10 })
    .abortSignal(signal);
  if (lease.error) throw new Error("Knowledge lease could not be checked.");
  if (lease.data !== true)
    return {
      status: "skipped_locked",
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      brief: "Another run holds the lease.",
    };
  let fetched = 0,
    inserted = 0,
    duplicates = 0;
  const errors: { source: string; error: string }[] = [];
  let result: JobResult | undefined;
  let runId: string | undefined;
  let failure: unknown;
  try {
    // Reconcile abandoned history before this attempt; the DB lease proves no
    // currently valid collector overlaps. This is failure evidence, not a receipt.
    const abandoned = await admin
      .from("knowledge_runs")
      .update({
        status: "failed",
        finished_at: now().toISOString(),
        brief_status: "interrupted",
        brief_message:
          "Previous attempt has no confirmed final outcome; no valid collector lease remains.",
      })
      .eq("status", "running")
      .abortSignal(signal);
    if (abandoned.error) throw new Error("Interrupted run history could not be reconciled.");
    const run = await admin
      .from("knowledge_runs")
      .insert({ trigger })
      .select("id")
      .abortSignal(signal)
      .single();
    if (run.error) throw new Error("Run could not be recorded.");
    runId = run.data.id;
    const currentRunId = run.data.id;
    const sources = (deps.sources ?? knowledgeSources).slice(0, 5);
    // Five fixed outbound fetches maximum; writes stay sequential.
    const reads = await Promise.all(
      sources.map(async (source) => {
        try {
          return { source, entries: await readFeed(workDeps, source) };
        } catch (e) {
          return { source, error: e instanceof Error ? e.message.slice(0, 200) : "Unknown error" };
        }
      }),
    );
    for (const read of reads) {
      const { source } = read;
      try {
        if (!read.entries) throw new Error(read.error);
        const entries = read.entries;
        fetched += entries.length;
        const known = await admin
          .from("knowledge_items")
          .select("url")
          .in(
            "url",
            entries.map((e) => e.url),
          )
          .abortSignal(signal);
        if (known.error) throw new Error("Duplicate check failed");
        const { fresh, duplicates: d } = dedupeEntries(
          entries,
          new Set(known.data.map((k) => k.url)),
        );
        duplicates += d;
        if (fresh.length) {
          const ins = await admin
            .from("knowledge_items")
            .upsert(
              fresh.map((e) => ({
                source_id: source.id,
                source_name: source.name,
                title: e.title,
                url: e.url,
                summary: e.summary,
                categories: e.categories,
                published_at: e.publishedAt,
                run_id: runId,
              })),
              { onConflict: "url", ignoreDuplicates: true },
            )
            .select("id")
            .abortSignal(signal);
          if (ins.error) throw new Error("Storage failed");
          inserted += ins.data.length;
          duplicates += fresh.length - ins.data.length;
        }
      } catch (e) {
        errors.push({
          source: source.id,
          error: e instanceof Error ? e.message.slice(0, 200) : "Unknown error",
        });
      }
    }
    let brief;
    try {
      brief = await writeBrief(workDeps, currentRunId);
    } catch (e) {
      brief = {
        status: "failed",
        message: e instanceof Error ? e.message.slice(0, 200) : "Brief step failed unexpectedly.",
      };
    }
    const allFailed = errors.length === sources.length;
    const status = allFailed
      ? "failed"
      : errors.length || !["written", "already_written", "no_new_items"].includes(brief.status)
        ? "partial"
        : "completed";
    const finalized = await admin
      .from("knowledge_runs")
      .update({
        finished_at: now().toISOString(),
        status,
        fetched,
        inserted,
        duplicates,
        source_errors: errors,
        brief_status: brief.status,
        brief_message: brief.message,
      })
      .eq("id", currentRunId)
      .abortSignal(AbortSignal.timeout(2_000))
      .select("id")
      .single();
    if (finalized.error || !finalized.data)
      throw new Error("Run outcome could not be persisted; completion is unconfirmed.");
    result = { status, runId, fetched, inserted, duplicates, brief: brief.status };
  } catch (error) {
    failure = error;
    if (runId) {
      try {
        const recorded = await admin
          .from("knowledge_runs")
          .update({
            status: "failed",
            finished_at: now().toISOString(),
            fetched,
            inserted,
            duplicates,
            source_errors: errors,
            brief_status: "unconfirmed",
            brief_message:
              "Attempt failed; no completion claimed. Inspect pending AI guard before owner recovery.",
          })
          .eq("id", runId)
          .abortSignal(AbortSignal.timeout(2_000))
          .select("id")
          .single();
        if (recorded.error || !recorded.data)
          console.error("Knowledge failure outcome could not be persisted.");
      } catch {
        console.error("Knowledge failure outcome could not be persisted.");
      }
    }
  }
  try {
    const released = await admin
      .rpc("release_owned_knowledge_lease", { _owner: owner })
      .abortSignal(AbortSignal.timeout(2_000));
    if (released.error || released.data !== true)
      throw new Error("Knowledge lease release failed; wait for expiry before another attempt.");
  } catch (error) {
    if (failure) console.error("Knowledge attempt and lease cleanup both failed.");
    failure = error;
  }
  if (failure) throw failure;
  if (!result) throw new Error("Knowledge outcome is unavailable.");
  return result;
}
