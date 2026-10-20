import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MothershipModule } from "@/data/evolution";

export function DemoBadge({ label = "Demo · Simulated", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-accent/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold-light", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-gold animate-twinkle" aria-hidden />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Prototype" ? "border-success/50 text-success" :
    status === "Planned" ? "border-gold/50 text-gold-light" :
    "border-muted-foreground/40 text-muted-foreground";
  return <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", tone)}>{status}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mx-auto max-w-6xl px-6 pb-10 pt-16 md:pt-24">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 text-4xl font-semibold text-gold-gradient md:text-6xl">{title}</h1>
      {children && <div className="mt-5 max-w-2xl text-lg text-muted-foreground">{children}</div>}
    </header>
  );
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("mx-auto max-w-6xl px-6 pb-20", className)}>{children}</section>;
}

export function GoldButton({ children, variant = "solid", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40",
        variant === "solid" ? "bg-gold-gradient text-primary-foreground shadow-glow hover:brightness-110" : "border border-gold/40 text-gold-light hover:bg-accent/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Starfield({ count = 70 }: { count?: number }) {
  const stars = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      x: (i * 73.13) % 100, y: (i * 37.71) % 100, s: (i % 3) + 1, d: (i % 7) * 0.6,
    })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {stars.map((s, i) => (
        <span key={i} className="absolute rounded-full bg-gold-light animate-twinkle"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
}

/** Interactive orbital graphic of Mothership modules. */
export function OrbitExplorer({ items, size = 520 }: { items: MothershipModule[]; size?: number }) {
  const [active, setActive] = useState<MothershipModule>(items[0]);
  const c = size / 2;
  const inner = items.filter((m) => m.ring === 0);
  const outer = items.filter((m) => m.ring === 1);
  const pos = (list: MothershipModule[], radius: number, offset: number) =>
    list.map((m, i) => {
      const a = (i / list.length) * Math.PI * 2 + offset;
      return { m, x: c + Math.cos(a) * radius, y: c + Math.sin(a) * radius };
    });
  const nodes = [...pos(inner, size * 0.27, -Math.PI / 2), ...(outer.length ? pos(outer, size * 0.44, -Math.PI / 2.4) : [])];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative mx-auto aspect-square w-full max-w-[560px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="group" aria-label="Mothership module map">
          <defs>
            <radialGradient id="core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--gold-light)" />
              <stop offset="55%" stopColor="var(--gold)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="origin-center animate-spin-slow" style={{ transformBox: "fill-box" }}>
            <circle cx={c} cy={c} r={size * 0.27} fill="none" stroke="var(--gold)" strokeOpacity="0.35" className="animate-dash" />
          </g>
          {outer.length > 0 && <circle cx={c} cy={c} r={size * 0.44} fill="none" stroke="var(--gold)" strokeOpacity="0.2" strokeDasharray="2 6" />}
          <circle cx={c} cy={c} r={size * 0.13} fill="none" stroke="var(--gold)" strokeOpacity="0.25" />
          {nodes.map(({ m, x, y }) => (
            <line key={`l-${m.id}`} x1={c} y1={c} x2={x} y2={y} stroke="var(--gold)" strokeOpacity={active.id === m.id ? 0.9 : 0.12} strokeWidth={active.id === m.id ? 1.5 : 1} />
          ))}
          <circle cx={c} cy={c} r={size * 0.11} fill="url(#core)" />
          <text x={c} y={c + 5} textAnchor="middle" fill="var(--obsidian)" fontFamily="var(--font-display)" fontSize="15" fontWeight="700">MOTHERSHIP</text>
          {nodes.map(({ m, x, y }) => {
            const on = active.id === m.id;
            return (
              <g key={m.id} role="button" tabIndex={0} aria-pressed={on} aria-label={m.name}
                className="cursor-pointer focus:outline-none" onClick={() => setActive(m)} onMouseEnter={() => setActive(m)} onFocus={() => setActive(m)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(m); } }}>
                <circle cx={x} cy={y} r={on ? 16 : 10} fill={on ? "var(--gold-light)" : "var(--card)"} stroke="var(--gold)" strokeWidth="1.5" />
                {on && <circle cx={x} cy={y} r={24} fill="none" stroke="var(--gold-light)" strokeOpacity="0.4" />}
                <text x={x} y={y + (y > c ? 30 : -20)} textAnchor="middle" fill={on ? "var(--gold-light)" : "var(--muted-foreground)"} fontSize="10.5" fontFamily="var(--font-mono)">
                  {m.name.length > 18 ? m.name.split(" ").slice(0, 2).join(" ") : m.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="glass p-6" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Module</p>
          <StatusPill status={active.status} />
        </div>
        <h3 className="mt-3 text-2xl text-gold-light">{active.name}</h3>
        <p className="mt-1 text-sm text-gold">{active.short}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{active.purpose}</p>
        <ul className="mt-5 space-y-2">
          {active.capabilities.map((cap) => (
            <li key={cap} className="flex gap-2 text-sm"><span className="text-gold">◆</span>{cap}</li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-1.5">
          {items.map((m) => (
            <button key={m.id} onClick={() => setActive(m)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] transition", active.id === m.id ? "border-gold bg-accent text-gold-light" : "border-border text-muted-foreground hover:text-foreground")}>
              {m.name}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
