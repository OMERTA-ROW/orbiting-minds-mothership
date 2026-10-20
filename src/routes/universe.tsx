import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { categories, universe, type Category, type UniverseNode } from "@/data/evolution";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/universe")({
  head: () => seo("Evolution Universe", "Navigate a constellation of opt-in technology projects, consenting agents and research domains."),
  component: Page,
});

function Page() {
  const [active, setActive] = useState<Set<Category>>(new Set(categories));
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<UniverseNode | null>(universe[0]!);

  const visible = useMemo(
    () => new Set(universe.filter((n) => active.has(n.category) && (n.name + n.summary + n.owner).toLowerCase().includes(q.toLowerCase())).map((n) => n.id)),
    [active, q],
  );
  const toggle = (c: Category) => {
    const s = new Set(active);
    s.has(c) ? s.delete(c) : s.add(c);
    setActive(s);
  };
  const byId = Object.fromEntries(universe.map((n) => [n.id, n]));

  return (
    <>
      <PageHeader eyebrow="Interactive Map" title="Evolution Universe">
        Every world is a voluntarily registered project, agent or research domain. <DemoBadge className="ml-1 align-middle" />
      </PageHeader>
      <Section>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter categories">
            {categories.map((c) => (
              <button key={c} onClick={() => toggle(c)} aria-pressed={active.has(c)}
                className={cn("rounded-full border px-3.5 py-1.5 text-sm transition", active.has(c) ? "border-gold bg-accent/60 text-gold-light" : "border-border text-muted-foreground")}>
                {c}
              </button>
            ))}
          </div>
          <label className="relative block md:w-72">
            <span className="sr-only">Search the universe</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search worlds, owners…"
              className="w-full rounded-full border border-input bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-gold focus:outline-none" />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="glass relative overflow-hidden p-2">
            <svg viewBox="0 0 900 480" className="h-auto w-full" role="group" aria-label="Universe network">
              {universe.flatMap((n) => n.links.filter((l) => l > n.id).map((l) => {
                const t = byId[l]!; const on = visible.has(n.id) && visible.has(l);
                const hl = sel && (sel.id === n.id || sel.id === l);
                return <line key={n.id + l} x1={n.x} y1={n.y} x2={t.x} y2={t.y} stroke="var(--gold)" strokeOpacity={on ? (hl ? 0.85 : 0.25) : 0.04} className={hl ? "animate-dash" : ""} />;
              }))}
              {universe.map((n) => {
                const on = visible.has(n.id); const s = sel?.id === n.id;
                return (
                  <g key={n.id} role="button" tabIndex={on ? 0 : -1} aria-label={`${n.name}, ${n.category}`} aria-pressed={s}
                    opacity={on ? 1 : 0.15} className="cursor-pointer focus:outline-none"
                    onClick={() => on && setSel(n)} onKeyDown={(e) => { if (on && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSel(n); } }}>
                    <circle cx={n.x} cy={n.y} r={n.r + 10} fill="var(--gold)" opacity={s ? 0.18 : 0.05} />
                    <circle cx={n.x} cy={n.y} r={n.r} fill={s ? "var(--gold-light)" : "var(--card)"} stroke="var(--gold)" strokeWidth={1.5} />
                    <text x={n.x} y={n.y + n.r + 18} textAnchor="middle" fontSize="12" fill={s ? "var(--gold-light)" : "var(--ivory)"} fontFamily="var(--font-sans)">{n.name}</text>
                    <text x={n.x} y={n.y + n.r + 32} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">{n.category.toUpperCase()}</text>
                  </g>
                );
              })}
            </svg>
            {visible.size === 0 && <p className="absolute inset-0 grid place-items-center text-muted-foreground">No worlds match your filters.</p>}
          </div>

          <aside className="glass p-6" aria-live="polite">
            {sel ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="eyebrow">{sel.category}</p>
                  <button onClick={() => setSel(null)} aria-label="Close panel" className="text-muted-foreground hover:text-gold-light"><X size={16} /></button>
                </div>
                <h3 className="mt-3 text-2xl text-gold-light">{sel.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{sel.summary}</p>
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd className="text-right">{sel.source}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Owner</dt><dd>{sel.owner}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Participation</dt><dd className="text-gold-light">{sel.mode}</dd></div>
                </dl>
                <p className="eyebrow mt-6">Capabilities</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{sel.capabilities.map((c) => <span key={c} className="rounded-full border border-border px-2.5 py-1 text-xs">{c}</span>)}</div>
                <p className="eyebrow mt-6">Connected worlds</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sel.links.map((l) => <button key={l} onClick={() => setSel(byId[l]!)} className="rounded-full bg-accent/50 px-2.5 py-1 text-xs text-gold-light hover:bg-accent">{byId[l]!.name} →</button>)}
                </div>
                <DemoBadge className="mt-6" />
              </>
            ) : <p className="text-sm text-muted-foreground">Select a world to view its source-aware profile.</p>}
          </aside>
        </div>
      </Section>
    </>
  );
}
