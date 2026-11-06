import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Cpu,
  FlaskConical,
  Layers,
  Orbit,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { categories, universe, type Category, type UniverseNode } from "@/data/evolution";
import { CoreGeometry, DemoBadge, PageHeader, Section, Starfield } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/universe")({
  validateSearch: (search: Record<string, unknown>): { world?: string } => {
    const value = search["world"];
    return typeof value === "string" && universe.some((n) => n.id === value)
      ? { world: value }
      : {};
  },
  head: () =>
    seo(
      "Evolution Universe",
      "Navigate a constellation of opt-in technology projects, consenting agents and research domains.",
    ),
  component: Page,
});

function Page() {
  const { world } = Route.useSearch();
  const [active, setActive] = useState<Set<Category>>(new Set(categories));
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<UniverseNode | null>(
    universe.find((n) => n.id === world) ?? universe[0] ?? null,
  );
  useEffect(() => {
    if (!world) return;
    const node = universe.find((n) => n.id === world);
    if (node) {
      setSel(node);
      setQ("");
      setActive(new Set(categories));
    }
  }, [world]);

  const visible = useMemo(
    () =>
      new Set(
        universe
          .filter(
            (n) =>
              active.has(n.category) &&
              (n.name + n.summary + n.owner).toLowerCase().includes(q.toLowerCase()),
          )
          .map((n) => n.id),
      ),
    [active, q],
  );
  const toggle = (c: Category) => {
    const s = new Set(active);
    if (s.has(c)) s.delete(c);
    else s.add(c);
    setActive(s);
  };
  const byId = Object.fromEntries(universe.map((n) => [n.id, n]));
  const icons: Record<Category, LucideIcon> = {
    Software: Layers,
    "AI Agents": Bot,
    Science: FlaskConical,
    Devices: Cpu,
    Space: Orbit,
  };

  return (
    <>
      <PageHeader eyebrow="Interactive Map" title="Evolution Universe">
        Every world is a voluntarily registered project, agent or research domain.{" "}
        <DemoBadge className="ml-1 align-middle" />
      </PageHeader>
      <Section>
        <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter categories">
            {categories.map((c) => (
              <Button
                variant="ghost"
                key={c}
                onClick={() => toggle(c)}
                aria-pressed={active.has(c)}
                className={cn(
                  "h-10 rounded-sm border px-3 text-xs transition",
                  active.has(c)
                    ? "border-gold/50 bg-accent/30 text-gold-light"
                    : "border-border text-muted-foreground",
                )}
              >
                {(() => {
                  const Icon = icons[c];
                  return <Icon size={14} />;
                })()}
                {c}
              </Button>
            ))}
          </div>
          <label className="relative block shrink-0 xl:w-64">
            <span className="sr-only">Search the universe</span>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search worlds, owners…"
              className="w-full rounded-sm border border-input bg-background/60 py-3 pl-9 pr-3 text-xs placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
          </label>
        </div>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="universe-stage relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <Starfield count={65} />
              <CoreGeometry className="absolute left-1/4 top-0 w-1/2 opacity-10" />
            </div>
            <svg
              viewBox="0 0 900 480"
              className="relative h-auto w-full"
              role="group"
              aria-label="Universe network"
            >
              <defs>
                <radialGradient id="world-planet" cx="30%" cy="25%">
                  <stop stopColor="var(--gold-light)" stopOpacity="0.65" />
                  <stop offset="0.3" stopColor="var(--gold)" stopOpacity="0.3" />
                  <stop offset="1" stopColor="var(--background)" />
                </radialGradient>
              </defs>
              {universe.flatMap((n) =>
                n.links
                  .filter((l) => l > n.id)
                  .map((l) => {
                    const t = byId[l];
                    if (!t) return [];
                    const on = visible.has(n.id) && visible.has(l);
                    const hl = sel && (sel.id === n.id || sel.id === l);
                    return (
                      <path
                        key={n.id + l}
                        d={`M${n.x} ${n.y} Q${(n.x + t.x) / 2} ${(n.y + t.y) / 2 - 30} ${t.x} ${t.y}`}
                        fill="none"
                        stroke="var(--gold)"
                        strokeWidth={hl ? 1.2 : 0.6}
                        strokeOpacity={on ? (hl ? 0.8 : 0.25) : 0.04}
                        className={hl ? "signal-path" : ""}
                      />
                    );
                  }),
              )}
              {universe.map((n) => {
                const on = visible.has(n.id);
                const s = sel?.id === n.id;
                return (
                  <g
                    key={n.id}
                    role="button"
                    tabIndex={on ? 0 : -1}
                    aria-label={`${n.name}, ${n.category}`}
                    aria-pressed={s}
                    opacity={on ? 1 : 0.15}
                    className="universe-node cursor-pointer focus:outline-none"
                    onClick={() => on && setSel(n)}
                    onKeyDown={(e) => {
                      if (on && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setSel(n);
                      }
                    }}
                  >
                    <rect
                      x={n.x - 75}
                      y={n.y - n.r - 14}
                      width="150"
                      height={n.r * 2 + 55}
                      fill="transparent"
                      pointerEvents="all"
                    />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 9}
                      fill="none"
                      stroke="var(--gold)"
                      strokeOpacity={s ? 0.6 : 0.13}
                      strokeWidth="0.7"
                    />
                    <ellipse
                      cx={n.x}
                      cy={n.y}
                      rx={n.r + 13}
                      ry={n.r * 0.45}
                      fill="none"
                      stroke="var(--gold)"
                      strokeOpacity={s ? 0.55 : 0.2}
                      transform={`rotate(-25 ${n.x} ${n.y})`}
                    />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r}
                      fill="url(#world-planet)"
                      stroke={s ? "var(--gold-light)" : "var(--gold)"}
                      strokeWidth={s ? 1.5 : 0.8}
                    />
                    <circle
                      cx={n.x - n.r * 0.25}
                      cy={n.y - n.r * 0.3}
                      r="2"
                      fill="var(--gold-light)"
                    />
                    <text
                      x={n.x}
                      y={n.y + n.r + 23}
                      textAnchor="middle"
                      fontSize="11"
                      fill={s ? "var(--gold-light)" : "var(--ivory)"}
                      fontFamily="var(--font-sans)"
                    >
                      {n.name}
                    </text>
                    <text
                      x={n.x}
                      y={n.y + n.r + 38}
                      textAnchor="middle"
                      fontSize="8"
                      fill="var(--muted-foreground)"
                      fontFamily="var(--font-mono)"
                    >
                      {n.category.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div
              className="universe-mobile-worlds relative"
              role="group"
              aria-label="Universe worlds"
            >
              {universe
                .filter((n) => visible.has(n.id))
                .map((n) => {
                  const Icon = icons[n.category];
                  return (
                    <Button
                      key={n.id}
                      variant="ghost"
                      onClick={() => setSel(n)}
                      aria-pressed={sel?.id === n.id}
                      aria-label={`${n.name}, ${n.category}`}
                      className={cn(
                        "h-auto min-h-24 flex-col items-start gap-3 whitespace-normal rounded-none border-b border-border px-2 py-4 text-left",
                        sel?.id === n.id ? "bg-accent/30 text-gold-light" : "text-muted-foreground",
                      )}
                    >
                      <Icon size={20} className="text-gold" />
                      <span className="text-xs">
                        {n.name}
                        <small className="mt-2 block font-mono text-[8px] uppercase text-muted-foreground">
                          {n.category}
                        </small>
                      </span>
                    </Button>
                  );
                })}
            </div>
            {visible.size === 0 && (
              <p
                role="status"
                className="relative py-16 text-center text-sm text-muted-foreground md:absolute md:inset-0 md:grid md:place-items-center"
              >
                No worlds match your filters.
              </p>
            )}
          </div>

          <aside
            id="world-profile"
            className="world-detail min-w-0 scroll-mt-28"
            aria-live="polite"
          >
            {sel ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="eyebrow">{sel.category}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSel(null)}
                    aria-label="Close panel"
                    className="text-muted-foreground hover:text-gold-light"
                  >
                    <X size={16} />
                  </Button>
                </div>
                <h3 className="mt-5 text-3xl leading-tight text-foreground">{sel.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{sel.summary}</p>
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="text-right">{sel.source}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-muted-foreground">Owner</dt>
                    <dd className="break-all">{sel.owner}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Participation</dt>
                    <dd className="text-gold-light">{sel.mode}</dd>
                  </div>
                </dl>
                <p className="eyebrow mt-6">Capabilities</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sel.capabilities.map((c) => (
                    <span key={c} className="rounded-full border border-border px-2.5 py-1 text-xs">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="eyebrow mt-6">Connected worlds</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sel.links.map((l) => {
                    const world = byId[l];
                    if (!world) return null;
                    return (
                      <Button
                        variant="ghost"
                        key={l}
                        onClick={() => setSel(world)}
                        className="h-auto whitespace-normal rounded-sm bg-accent/20 px-3 py-2 text-left text-xs text-gold-light hover:bg-accent"
                      >
                        {world.name}
                        <ArrowUpRight size={12} />
                      </Button>
                    );
                  })}
                </div>
                <DemoBadge className="mt-6" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a world to view its source-aware profile.
              </p>
            )}
          </aside>
        </div>
      </Section>
    </>
  );
}
