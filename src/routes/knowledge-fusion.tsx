import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { feed } from "@/data/evolution";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/knowledge-fusion")({
  validateSearch: (search: Record<string, unknown>): { idea?: string } => {
    const value = search["idea"];
    return typeof value === "string" && feed.some((f) => String(f.id) === value) ? { idea: value } : {};
  },
  head: () => seo("Knowledge Fusion", "A discovery feed of voluntarily shared, attributed idea proposals across public, invite-only and private modes."),
  component: Page,
});

const modes = ["All", "Public", "Invite-only", "Private"] as const;
const modeInfo = {
  Public: "Visible to the whole network with attribution.",
  "Invite-only": "Shared with invited collaborators only.",
  Private: "Visible to project members only. Never fused without consent.",
};

function Page() {
  const { idea } = Route.useSearch();
  const [mode, setMode] = useState<(typeof modes)[number]>("All");
  const [sparked, setSparked] = useState<Set<number>>(new Set());
  useEffect(() => { if (idea) setMode("All"); }, [idea]);
  const items = feed.filter((f) => mode === "All" || f.mode === mode);

  return (
    <>
      <PageHeader eyebrow="Knowledge Fusion Engine" title="Discovery Feed">
        Ideas shared voluntarily, always attributed. The engine only fuses what owners choose to share.
      </PageHeader>
      <Section>
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {(Object.keys(modeInfo) as (keyof typeof modeInfo)[]).map((m) => (
            <div key={m} className="glass p-4"><p className="eyebrow">{m}</p><p className="mt-1.5 text-sm text-muted-foreground">{modeInfo[m]}</p></div>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Participation mode">
          {modes.map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn("rounded-full border px-3.5 py-1.5 text-sm", mode === m ? "border-gold bg-accent/60 text-gold-light" : "border-border text-muted-foreground")}>{m}</button>
          ))}
          <DemoBadge className="ml-auto" />
        </div>
        <div className="space-y-4">
          {items.map((f) => {
            const on = sparked.has(f.id);
            return (
              <article id={`idea-${f.id}`} key={f.id} className={cn("glass scroll-mt-28 p-6", idea === String(f.id) && "border-l-2 border-gold bg-accent/10")}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-gold-light">{f.author}</span>·<span>{f.mode}</span>
                  {f.tags.map((t) => <span key={t} className="rounded-full border border-border px-2 py-0.5">{t}</span>)}
                </div>
                <h3 className="mt-3 font-sans text-lg font-semibold text-ivory">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                <button onClick={() => { const s = new Set(sparked); on ? s.delete(f.id) : s.add(f.id); setSparked(s); }} aria-pressed={on}
                  className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", on ? "border-gold bg-accent text-gold-light" : "border-border text-muted-foreground hover:text-gold-light")}>
                  <Sparkles size={14} /> {f.sparks + (on ? 1 : 0)} sparks
                </button>
              </article>
            );
          })}
        </div>
      </Section>
    </>
  );
}
