/**
 * RAZUL Internet Observatory — scheduled discovery job.
 * Mirrors the knowledge-collector invariants: DB lease (single-flight), bounded
 * fetches, dedupe by URL, provenance, run history, owner pause gate, and honest
 * failure recording. No AI calls and no private data — public feeds only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  KNOWLEDGE_LIMITS,
  dedupeEntries,
  parseFeed,
  type FeedEntry,
} from "./knowledge";
import { readBoundedFeed } from "./knowledge-runtime.server";
import {
  assignTopic,
  classifyEvidence,
  extractEntities,
  filterSources,
  planAlertEvents,
  routeFinding,
  scoreRelevance,
  type ObservatorySource,
} from "./razul-observatory";

type Admin = SupabaseClient<Database>;

export interface RazulJobDeps {
  admin: Admin;
  fetch: typeof fetch;
  now: () => Date;
  signal?: AbortSignal | undefined;
}

export interface RazulJobResult {
  status: "completed" | "partial" | "skipped_locked" | "paused" | "failed";
  runId?: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  alerts: number;
}

interface SourceRow extends ObservatorySource {
  terms_note: string;
}

async function readFeed(deps: RazulJobDeps, source: SourceRow): Promise<FeedEntry[]> {
  const res = await deps.fetch(source.url, {
    headers: {
      "User-Agent": "EvolutionRazulObservatory/1.0 (+https://evoomni.tech)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: deps.signal
      ? AbortSignal.any([deps.signal, AbortSignal.timeout(7_000)])
      : AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await readBoundedFeed(res, KNOWLEDGE_LIMITS.maxFeedBytes);
  const entries = parseFeed(text);
  if (!entries.length) throw new Error("No readable entries");
  return entries;
}

export async function runRazulObservatoryJob(
  deps: RazulJobDeps,
  trigger = "schedule",
): Promise<RazulJobResult> {
  const { admin, now } = deps;
  const signal = deps.signal ?? AbortSignal.timeout(120_000);
  const workDeps = { ...deps, signal };

  // Owner pause gate: a paused observatory makes no outbound requests at all.
  const state = await admin
    .from("razul_job_state")
    .select("paused_reason, alert_threshold, retention_days, coverage, blocked_sources")
    .eq("id", 1)
    .abortSignal(signal)
    .single();
  if (state.error || !state.data) throw new Error("Observatory state could not be read.");
  if (state.data.paused_reason)
    return {
      status: "paused",
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      alerts: 0,
    };

  const owner = crypto.randomUUID();
  const lease = await admin
    .rpc("claim_owned_razul_lease", { _owner: owner, _minutes: 10 })
    .abortSignal(signal);
  if (lease.error) throw new Error("Observatory lease could not be checked.");
  if (lease.data !== true)
    return {
      status: "skipped_locked",
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      alerts: 0,
    };

  let fetched = 0,
    inserted = 0,
    duplicates = 0,
    alerts = 0;
  const errors: { source: string; error: string }[] = [];
  let result: RazulJobResult | undefined;
  let runId: string | undefined;
  let failure: unknown;
  try {
    // Reconcile abandoned history; the DB lease proves no valid run overlaps.
    const abandoned = await admin
      .from("razul_runs")
      .update({
        status: "failed",
        finished_at: now().toISOString(),
      })
      .eq("status", "running")
      .abortSignal(signal);
    if (abandoned.error) throw new Error("Interrupted run history could not be reconciled.");

    const run = await admin
      .from("razul_runs")
      .insert({ trigger })
      .select("id")
      .abortSignal(signal)
      .single();
    if (run.error) throw new Error("Run could not be recorded.");
    runId = run.data.id;
    const currentRunId = run.data.id;

    const registry = await admin
      .from("razul_sources")
      .select("id, name, url, kind, category, terms_note, active")
      .abortSignal(signal);
    if (registry.error) throw new Error("Source registry could not be read.");
    // Rotate the bounded per-run window so a large registry is covered over time.
    const runCount = await admin
      .from("razul_runs")
      .select("id", { count: "exact", head: true })
      .abortSignal(signal);
    if (runCount.error) throw new Error("Run rotation could not be verified.");
    const sources = filterSources(
      registry.data as SourceRow[],
      {
        alertThreshold: state.data.alert_threshold,
        coverage: state.data.coverage,
        blockedSources: state.data.blocked_sources,
      },
      5,
      runCount.count ?? 0,
    );

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
        const insertedBefore = inserted;
        if (!read.entries) throw new Error(read.error);
        const entries = read.entries;
        fetched += entries.length;
        const known = await admin
          .from("razul_findings")
          .select("url, source_id")
          .in(
            "url",
            entries.map((e) => e.url),
          )
          .abortSignal(signal);
        if (known.error) throw new Error("Duplicate check failed");
        // Cross-source corroboration: a URL already stored from a different
        // source strengthens the existing finding instead of duplicating it.
        for (const k of known.data) {
          if (k.source_id !== source.id) {
            const corroboration = await admin
              .rpc("razul_increment_corroboration", { _url: k.url })
              .abortSignal(AbortSignal.timeout(2_000));
            if (corroboration.error) throw new Error("Corroboration record failed");
          }
        }
        const { fresh, duplicates: d } = dedupeEntries(
          entries,
          new Set(known.data.map((k) => k.url)),
        );
        duplicates += d;
        if (fresh.length) {
          const rows = fresh.map((e) => {
            const relevance = scoreRelevance(e, source.category);
            const routedTo = routeFinding(
              source.category,
              relevance,
              state.data.alert_threshold,
            );
            if (routedTo.length) alerts += 1;
            const evidence = classifyEvidence(e, source);
            return {
              source_id: source.id,
              source_name: source.name,
              title: e.title,
              url: e.url,
              summary: e.summary,
              category: source.category,
              topic: assignTopic(e, source.category),
              entities: extractEntities(e.title),
              evidence_class: evidence.evidenceClass,
              evidence_strength: evidence.strength,
              relevance,
              routed_to: routedTo,
              published_at: e.publishedAt,
              run_id: currentRunId,
            };
          });
          const ins = await admin
            .from("razul_findings")
            .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
            .select("id")
            .abortSignal(signal);
          if (ins.error) throw new Error("Storage failed");
          inserted += ins.data.length;
          duplicates += fresh.length - ins.data.length;
        }
        const receipt = await admin.from("razul_source_checks").insert({ source_id: source.id, run_id: currentRunId, checked_at: now().toISOString(), status: "completed", fetched: entries.length, inserted: inserted - insertedBefore }).abortSignal(AbortSignal.timeout(2_000));
        if (receipt.error) throw new Error("Source check receipt failed");
      } catch (e) {
        const code = !read.entries ? "fetch-failed" : e instanceof Error && e.message === "Source check receipt failed" ? "receipt-failed" : "processing-failed";
        const failedReceipt = await admin.from("razul_source_checks").upsert({ source_id: source.id, run_id: currentRunId, checked_at: now().toISOString(), status: "failed", fetched: read.entries?.length ?? 0, inserted: 0, error_code: code }, { onConflict: "source_id,run_id" }).abortSignal(AbortSignal.timeout(2_000));
        if (failedReceipt.error) throw new Error("Source failure receipt could not be persisted.");
        errors.push({
          source: source.id,
          error: code,
        });
      }
    }

    // Proactive alerts: fan out this run's routed findings to subscribed
    // agents (alert events), honoring each agent's relevance floor. Capped.
    const runFindings = await admin
      .from("razul_findings")
      .select("id, relevance, routed_to")
      .eq("run_id", currentRunId)
      .abortSignal(signal);
    const routed = {
      error: runFindings.error,
      data: (runFindings.data ?? []).filter(
        (f) => Array.isArray(f.routed_to) && f.routed_to.length > 0,
      ),
    };
    if (routed.error) throw new Error("Alert candidates could not be verified");
    if (routed.data.length) {
      const feeds = await admin
        .from("razul_agent_feeds")
        .select("agent, min_relevance, alerts_enabled")
        .eq("alerts_enabled", true)
        .abortSignal(signal);
      if (feeds.error) throw new Error("Subscriptions could not be verified");
      if (feeds.data.length) {
        const events = planAlertEvents(
          routed.data.map((f) => ({
            id: f.id,
            relevance: f.relevance,
            routed_to: f.routed_to as string[],
          })),
          feeds.data,
        );
        if (events.length) {
          const eventWrite = await admin
            .from("razul_alert_events")
            .upsert(events, { onConflict: "finding_id,agent", ignoreDuplicates: true })
            .abortSignal(signal);
          if (eventWrite.error) throw new Error("Alert outcomes could not be stored");
        }
      }
    }

    // Retention control: drop findings older than the configured window.
    const cutoff = new Date(
      now().getTime() - state.data.retention_days * 24 * 3600_000,
    ).toISOString();
    const retention = await admin
      .from("razul_findings")
      .delete()
      .lt("collected_at", cutoff)
      .abortSignal(signal);
    if (retention.error) throw new Error("Retention outcome could not be verified");

    const allFailed = sources.length > 0 && errors.length === sources.length;
    const status = allFailed ? "failed" : errors.length ? "partial" : "completed";
    const finalized = await admin
      .from("razul_runs")
      .update({
        finished_at: now().toISOString(),
        status,
        fetched,
        inserted,
        duplicates,
        alerts,
        source_errors: errors,
      })
      .eq("id", currentRunId)
      .abortSignal(AbortSignal.timeout(2_000))
      .select("id")
      .single();
    if (finalized.error || !finalized.data)
      throw new Error("Run outcome could not be persisted; completion is unconfirmed.");
    result = { status, runId, fetched, inserted, duplicates, alerts };
  } catch (error) {
    failure = error;
    if (runId) {
      try {
        const failedOutcome = await admin
          .from("razul_runs")
          .update({
            status: "failed",
            finished_at: now().toISOString(),
            fetched,
            inserted,
            duplicates,
            alerts,
            source_errors: errors,
          })
          .eq("id", runId)
          .abortSignal(AbortSignal.timeout(2_000));
        if (failedOutcome.error) console.error("Observatory failure outcome could not be persisted.");
      } catch {
        console.error("Observatory failure outcome could not be persisted.");
      }
    }
  }
  try {
    const released = await admin
      .rpc("release_owned_razul_lease", { _owner: owner })
      .abortSignal(AbortSignal.timeout(2_000));
    if (released.error || released.data !== true)
      throw new Error("Observatory lease release failed; wait for expiry before another attempt.");
  } catch (error) {
    if (failure) console.error("Observatory attempt and lease cleanup both failed.");
    failure = error;
  }
  if (failure) throw failure;
  if (!result) throw new Error("Observatory outcome is unavailable.");
  return result;
}
