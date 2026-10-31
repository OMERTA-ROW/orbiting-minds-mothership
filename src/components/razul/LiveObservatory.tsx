import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getRazulAgentFeed, submitRazulFeedback } from "@/lib/razul-feeds.functions";

const AGENTS = ["jackboy", "jax", "omni", "sabrina", "guardian"] as const;
type Agent = (typeof AGENTS)[number];

interface FindingRow {
  id: string;
  title: string;
  url: string;
  source_name: string;
  category: string;
  topic: string;
  evidence_class: string;
  relevance: number;
  routed_to: string[];
  collected_at: string;
}

interface RunRow {
  id: string;
  status: string;
  finished_at: string | null;
  fetched: number;
  inserted: number;
  alerts: number;
}

/**
 * Live view of the scheduled RAZUL Internet Observatory (real backend tables).
 * Requires a signed-in approved account; everyone else sees the honest gate.
 */
export function LiveObservatory() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "gated" }
    | { kind: "ready"; findings: FindingRow[]; run: RunRow | null; sources: number }
  >({ kind: "loading" });
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentFeed, setAgentFeed] = useState<
    { findings: FindingRow[]; minRelevance: number } | { error: string } | null
  >(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!agent || state.kind !== "ready") {
      setAgentFeed(null);
      return;
    }
    let cancelled = false;
    getRazulAgentFeed({ data: { agent, limit: 20 } })
      .then((res) => {
        if (!cancelled)
          setAgentFeed({
            findings: (res.findings ?? []) as FindingRow[],
            minRelevance: res.configured ? res.minRelevance : 40,
          });
      })
      .catch((e) => {
        if (!cancelled)
          setAgentFeed({ error: e instanceof Error ? e.message : "Feed unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [agent, state.kind]);

  async function sendFeedback(findingId: string, verdict: "useful" | "not-useful") {
    if (!agent) return;
    try {
      await submitRazulFeedback({ data: { findingId, agent, verdict, note: "" } });
      setFeedbackSent((prev) => ({ ...prev, [findingId]: verdict }));
    } catch {
      setFeedbackSent((prev) => ({ ...prev, [findingId]: "failed" }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        if (!cancelled) setState({ kind: "gated" });
        return;
      }
      const [findings, run, sourceCount] = await Promise.all([
        supabase
          .from("razul_findings")
          .select("id, title, url, source_name, category, topic, evidence_class, relevance, routed_to, collected_at")
          .order("collected_at", { ascending: false })
          .limit(10),
        supabase
          .from("razul_runs")
          .select("id, status, finished_at, fetched, inserted, alerts")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("razul_sources").select("id", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      if (findings.error) {
        setState({ kind: "gated" });
        return;
      }
      setState({
        kind: "ready",
        findings: findings.data as FindingRow[],
        run: (run.data as RunRow | null) ?? null,
        sources: sourceCount.count ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">
        Live Observatory <span className="text-xs font-normal text-primary">REAL</span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The scheduled pipeline ingests a small registry of permitted public feeds on a timer,
        deduplicates by URL, scores relevance, and routes actionable alerts. It does not read
        private communications and does not claim exhaustive internet coverage.
      </p>
      {state.kind === "loading" && (
        <p className="mt-4 text-sm text-muted-foreground">Checking access…</p>
      )}
      {state.kind === "gated" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Sign in with an approved owner account to read the live observatory index.{" "}
          <Link to="/auth" className="text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      )}
      {state.kind === "ready" && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            {state.sources} registered sources
            {state.run
              ? ` · last run ${state.run.status} — ${state.run.inserted} new of ${state.run.fetched} fetched, ${state.run.alerts} alerts routed`
              : " · no runs recorded yet"}
          </p>
          {state.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No findings stored yet; the next scheduled run will populate this index.
            </p>
          ) : (
            <ul className="space-y-2">
              {state.findings.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-border/40 bg-background/40 px-3 py-2"
                >
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-foreground underline-offset-2 hover:underline"
                  >
                    {f.title}
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {f.source_name} · {f.category}/{f.topic} · {f.evidence_class} · relevance {f.relevance}
                    {f.routed_to.length > 0 && (
                      <span className="text-primary"> · routed to {f.routed_to.join(", ")}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
