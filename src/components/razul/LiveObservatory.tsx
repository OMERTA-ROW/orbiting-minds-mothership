import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getRazulAgentFeed, submitRazulFeedback } from "@/lib/razul-feeds.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";

const AGENTS = ["jackboy", "jax", "omni", "sabrina", "guardian", "hercules"] as const;
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
  const { user, ready } = useAccount();
  const getFeed = useServerFn(getRazulAgentFeed);
  const feedback = useServerFn(submitRazulFeedback);
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
  const feedbackRevision = useRef(0);
  useEffect(() => { feedbackRevision.current++; setState({ kind: "gated" }); setAgent(null); setAgentFeed(null); setFeedbackSent({}); }, [user?.id]);
  useEffect(() => { feedbackRevision.current++; setAgentFeed(null); setFeedbackSent({}); }, [agent]);

  useEffect(() => {
    if (!agent || state.kind !== "ready") {
      setAgentFeed(null);
      return;
    }
    let cancelled = false;
    getFeed({ data: { agent, limit: 20 } })
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
  }, [agent, state.kind, getFeed]);

  async function sendFeedback(findingId: string, verdict: "useful" | "not-useful") {
    if (!agent || feedbackSent[findingId] === "saving") return;
    const current = feedbackRevision.current;
    setFeedbackSent((prev) => ({ ...prev, [findingId]: "saving" }));
    try {
      await feedback({ data: { findingId, agent, verdict, note: "" } });
      if (feedbackRevision.current === current) setFeedbackSent((prev) => ({ ...prev, [findingId]: verdict }));
    } catch {
      if (feedbackRevision.current === current) setFeedbackSent((prev) => ({ ...prev, [findingId]: "failed" }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ready || !user) {
        if (!cancelled) setState({ kind: "gated" });
        return;
      }
      const access = await supabase.rpc("is_razul_owner");
      if (access.error || access.data !== true) {
        if (!cancelled) setState({ kind: "gated" });
        return;
      }
      const [findings, run, sourceCount] = await Promise.all([
        supabase
          .from("razul_findings")
          .select(
            "id, title, url, source_name, category, topic, evidence_class, relevance, routed_to, collected_at",
          )
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
      if (findings.error || run.error || sourceCount.error) {
        setState({ kind: "gated" });
        return;
      }
      setState({
        kind: "ready",
        findings: findings.data as FindingRow[],
        run: (run.data as RunRow | null) ?? null,
        sources: sourceCount.count ?? 0,
      });
    })().catch(() => { if (!cancelled) setState({ kind: "gated" }); });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-6">
      <h2 className="font-display text-lg font-semibold text-foreground">
        Public-feed observatory{" "}
        <span className="text-xs font-normal text-primary">RECORDED · OWNER ACCESS</span>
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
          Verified owner and strong MFA required to read Razul's observatory workspace.{" "}
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
              ? ` · last run ${state.run.status} at ${state.run.finished_at ?? "unknown"} — ${state.run.inserted} new of ${state.run.fetched} fetched, ${state.run.alerts} alerts recorded`
              : " · no runs recorded yet"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Agent feed:</span>
            {AGENTS.map((a) => (
              <Button
                key={a}
                type="button"
                onClick={() => setAgent(agent === a ? null : a)}
                className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                  agent === a
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {a}
              </Button>
            ))}
          </div>
          {agent && agentFeed && "error" in agentFeed && (
            <p className="text-sm text-muted-foreground">{agentFeed.error}</p>
          )}
          {agent && agentFeed && !("error" in agentFeed) && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Scoped feed for <span className="capitalize text-foreground">{agent}</span> — only
                configured categories at relevance ≥ {agentFeed.minRelevance}.
              </p>
              {agentFeed.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No findings match this agent's scope yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {agentFeed.findings.map((f) => (
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
                        {f.source_name} · {f.category}/{f.topic} · {f.evidence_class} · relevance{" "}
                        {f.relevance}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {feedbackSent[f.id] && feedbackSent[f.id] !== "failed" ? (
                          <span role="status" className="text-muted-foreground">
                            Feedback {feedbackSent[f.id] === "saving" ? "saving…" : "recorded"}
                          </span>
                        ) : (
                          <>
                            {feedbackSent[f.id] === "failed" && <span role="status">Feedback failed. Retry; no confirmation was received.</span>}
                            <Button
                              type="button"
                              onClick={() => sendFeedback(f.id, "useful")}
                              className="rounded border border-border/60 px-2 py-0.5 text-muted-foreground hover:text-foreground"
                            >
                              Useful
                            </Button>
                            <Button
                              type="button"
                              onClick={() => sendFeedback(f.id, "not-useful")}
                              className="rounded border border-border/60 px-2 py-0.5 text-muted-foreground hover:text-foreground"
                            >
                              Not useful
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                    {f.source_name} · {f.category}/{f.topic} · {f.evidence_class} · relevance{" "}
                    {f.relevance}
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
