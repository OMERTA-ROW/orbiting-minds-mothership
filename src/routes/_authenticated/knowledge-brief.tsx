import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { readKnowledge } from "@/lib/knowledge.functions";
import { knowledgeSources } from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { ArrowUpRight } from "lucide-react";

const knowledgeQuery = queryOptions({ queryKey: ["knowledge-brief"], queryFn: () => readKnowledge(), staleTime: 60_000 });
export const Route = createFileRoute("/_authenticated/knowledge-brief")({
  head: () => seo("Daily Technology Knowledge Brief · Beta", "Approved beta members review stored AlphaSignal and platform updates collected daily on the server, with cited adopt, test, watch or pivot suggestions."),
  loader: ({ context }) => context.queryClient.ensureQueryData(knowledgeQuery),
  component: KnowledgePage,
});

const evidenceLabel = { verified_release: "Shipped (per source)", announcement: "Announcement", inference: "Inference" } as const;

function KnowledgePage() {
  const { data } = useSuspenseQuery(knowledgeQuery);
  const latest = data.briefs[0];
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <header className="border-b border-border pb-7">
        <p className="eyebrow">Daily schedule · stored collection attempts</p>
        <h1 className="mt-4 text-3xl">Daily Knowledge Brief</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Collected from public feeds: {knowledgeSources.map((s) => s.name).join(", ")}. Stored for review and retrieval only. Nothing here retrains a model or changes any project.
        </p>
      </header>
      {!data.allowed ? (
        <p role="status" className="mt-8 border-l border-warning px-4 py-3 text-sm text-warning">
          This brief is visible to beta accounts with AI approval only. Your account is not approved or is paused.{" "}
          <Link to="/beta" className="underline">Open private beta</Link>
        </p>
      ) : (
        <>
          {data.state?.paused_reason && <p role="status" className="mt-6 border-l border-warning px-4 py-3 text-xs text-warning">AI brief paused: {data.state.paused_reason}. Feed collection continues.</p>}
          <section className="mt-8" aria-label="Latest brief">
            <p className="eyebrow">Latest brief</p>
            {latest ? (
              <article className="mt-4 border-t border-gold/30 pt-5">
                <h2 className="text-2xl">{latest.brief_date}</h2>
                <p className="mt-3 text-sm leading-7">{latest.overview}</p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">Model: {latest.model} · {latest.item_count} items reviewed · AI-written; check sources</p>
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {(latest.entries as { url: string; capability: string; availability: string; evolution_value: string; decision: string; evidence: keyof typeof evidenceLabel }[]).map((e) => (
                    <li key={e.url} className="grid gap-2 py-4 md:grid-cols-[120px_1fr]">
                      <span className="font-mono text-xs uppercase text-gold-light">{e.decision}</span>
                      <div className="min-w-0">
                        <p className="text-sm">{e.capability}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{e.availability} · {evidenceLabel[e.evidence] ?? e.evidence}</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">{e.evolution_value}</p>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs text-gold underline">Source<ArrowUpRight size={12} /></a>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ) : <p className="mt-4 text-sm text-muted-foreground">No brief has been written yet.</p>}
          </section>
          <section className="mt-10" aria-label="Run history">
            <p className="eyebrow">Run history</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground"><tr><th className="py-2 pr-4">Started (UTC)</th><th className="pr-4">Status</th><th className="pr-4">Fetched</th><th className="pr-4">New</th><th className="pr-4">Duplicates</th><th className="pr-4">Brief</th><th>Source errors</th></tr></thead>
                <tbody>{data.runs.map((r) => (
                  <tr key={r.id} className="border-t border-border"><td className="py-2 pr-4 font-mono">{r.started_at.slice(0, 16).replace("T", " ")}</td><td className="pr-4">{r.status}</td><td className="pr-4">{r.fetched}</td><td className="pr-4">{r.inserted}</td><td className="pr-4">{r.duplicates}</td><td className="pr-4" title={r.brief_message ?? ""}>{r.brief_status}</td><td>{(r.source_errors as { source: string }[]).map((s) => s.source).join(", ") || "none"}</td></tr>
                ))}</tbody>
              </table>
              {!data.runs.length && <p className="mt-3 text-sm text-muted-foreground">No runs recorded yet.</p>}
            </div>
          </section>
          <section className="mt-10" aria-label="Stored items">
            <p className="eyebrow">Stored items</p>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {data.items.map((i) => (
                <li key={i.id} className="py-3">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gold-light underline">{i.title}</a>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{i.source_name} · published {i.published_at?.slice(0, 10) ?? "unknown"} · collected {i.collected_at.slice(0, 10)}</p>
                </li>
              ))}
            </ul>
          </section>
          <Button asChild variant="ghost" className="mt-8"><Link to="/beta">Back to private beta</Link></Button>
        </>
      )}
    </section>
  );
}
