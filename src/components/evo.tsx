import { useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Orbit,
  ShieldCheck,
  Terminal,
  Layers,
  Network,
  Sparkles,
  Bot,
  FlaskConical,
  Dna,
  History,
  Shield,
  CircleDollarSign,
  Brain,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MothershipModule } from "@/data/evolution";
import { Button } from "@/components/ui/button";

export function DemoBadge({
  label = "Demo · Simulated",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border border-gold/25 bg-background/60 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-gold-light",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gold animate-twinkle" aria-hidden />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Prototype"
      ? "border-success/50 text-success"
      : status === "Planned"
        ? "border-gold/50 text-gold-light"
        : "border-muted-foreground/40 text-muted-foreground";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="cosmic-page-header relative mx-auto max-w-[1440px] overflow-hidden px-6 pb-14 pt-16 md:px-12 md:pb-20 md:pt-24">
      <div className="page-orbit" aria-hidden>
        <CoreGeometry />
      </div>
      <div className="relative z-10">
        <p className="eyebrow flex items-center gap-3">
          <span className="h-px w-8 bg-gold/60" />
          {eyebrow}
        </p>
        <h1 className="mt-6 max-w-4xl text-4xl font-medium leading-tight text-foreground md:text-6xl">
          {title}
        </h1>
        {children && (
          <div className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "cosmic-section relative mx-auto max-w-[1440px] px-6 pb-20 md:px-12 md:pb-28",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function GoldButton({
  children,
  variant = "solid",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
  return (
    <Button
      {...props}
      variant={variant === "solid" ? "cosmic" : "signal"}
      className={cn(
        "h-auto min-h-11 rounded-sm px-6 py-3 text-sm font-semibold transition disabled:opacity-40",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function Starfield({ count = 70 }: { count?: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i * 137.13 + 11) % 1440,
        y: (i * 97.71 + 23) % 1000,
        s: i % 11 === 0 ? 1.7 : 0.7,
        d: (i % 7) * 0.6,
      })),
    [count],
  );
  return (
    <svg
      className="starfield pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1440 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.s}
          fill={i % 4 === 0 ? "var(--gold-light)" : "var(--ivory)"}
          className={i % 11 === 0 ? "animate-twinkle" : ""}
          opacity={i % 4 === 0 ? 0.55 : 0.24}
          style={{ animationDelay: `${s.d}s` }}
        />
      ))}
      <g fill="none" stroke="var(--gold)" strokeWidth="0.6" opacity="0.13">
        <path d="M60 130 190 185 260 90 380 125M1040 180 1170 100 1280 190 1380 130M95 690 200 800 330 735M1090 800 1190 700 1360 840" />
      </g>
    </svg>
  );
}

export function CoreGeometry({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 600 600" className={cn("core-geometry h-full w-full", className)} aria-hidden>
      <defs>
        <radialGradient id={id}>
          <stop stopColor="var(--gold-light)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="300" r="145" fill={`url(#${id})`} />
      <g fill="none" stroke="var(--gold)" strokeWidth="0.8">
        <circle cx="300" cy="300" r="230" opacity="0.18" strokeDasharray="2 12" />
        <circle cx="300" cy="300" r="183" opacity="0.32" />
        <circle cx="300" cy="300" r="115" opacity="0.75" />
        <ellipse cx="300" cy="300" rx="115" ry="42" opacity="0.6" />
        <ellipse cx="300" cy="300" rx="46" ry="115" opacity="0.6" />
        <ellipse cx="300" cy="300" rx="270" ry="82" transform="rotate(-22 300 300)" opacity="0.4" />
        <ellipse cx="300" cy="300" rx="185" ry="67" transform="rotate(36 300 300)" opacity="0.35" />
        <path d="M300 185V415M185 300H415M218 218 382 382M218 382 382 218" opacity="0.3" />
      </g>
      <g fill="var(--gold-light)">
        <circle cx="300" cy="300" r="6" />
        <circle cx="470" cy="232" r="4" />
        <circle cx="115" cy="300" r="3" />
        <circle cx="300" cy="70" r="2" />
      </g>
    </svg>
  );
}

export const moduleIcons: Record<string, LucideIcon> = {
  cloud: Layers,
  cli: Terminal,
  app: Orbit,
  update: Network,
  fusion: Sparkles,
  guardian: ShieldCheck,
  ace: Shield,
  embassy: Bot,
  invention: Sparkles,
  planetary: FlaskConical,
  dna: Dna,
  time: History,
  immune: Shield,
  economy: CircleDollarSign,
  brain: Brain,
};

/** Stationary, accessible orbital nodes surrounding a slowly moving intelligence core. */
export function OrbitExplorer({
  items,
  size = 520,
  initialId,
}: {
  items: MothershipModule[];
  size?: number;
  initialId?: string | undefined;
}) {
  const [selectedId, setSelectedId] = useState(initialId ?? items[0]?.id);
  const active = items.find((m) => m.id === selectedId) ?? items[0];
  if (!active) return null;
  const nodes = items.map((m, i) => {
    const list = items.filter((candidate) => candidate.ring === m.ring);
    const ringIndex = list.findIndex((candidate) => candidate.id === m.id);
    const angle = (ringIndex / list.length) * Math.PI * 2 - Math.PI / 2 + (m.ring === 1 ? 0.2 : 0);
    const radius = items.length > 7 ? (m.ring === 0 ? 28 : 43) : 38;
    return { m, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius, i };
  });
  return (
    <div className="orbit-explorer grid items-center gap-12 xl:grid-cols-[minmax(0,1fr)_350px]">
      <div
        className="orbit-stage relative mx-auto aspect-square w-full max-w-[850px]"
        role="group"
        aria-label="Mothership module map"
        data-map-size={size}
      >
        <CoreGeometry className="orbital-drift absolute inset-0" />
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {nodes.map(({ m, x, y }) => (
            <line
              key={m.id}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke="var(--gold)"
              strokeOpacity={active.id === m.id ? 0.65 : 0.12}
              strokeWidth="0.12"
              className={active.id === m.id ? "signal-path" : ""}
            />
          ))}
        </svg>
        <div className="orbit-core-label pointer-events-none absolute left-1/2 top-1/2 text-center">
          <span className="font-mono text-[8px] uppercase tracking-widest text-gold">
            Intelligence core
          </span>
          <p className="mt-2 font-display text-sm text-foreground">MOTHERSHIP</p>
        </div>
        {nodes.map(({ m, x, y }) => {
          const Icon = moduleIcons[m.id] ?? Orbit;
          return (
            <Button
              key={m.id}
              variant="ghost"
              onClick={() => setSelectedId(m.id)}
              aria-pressed={active.id === m.id}
              aria-label={m.name}
              onMouseEnter={() => setSelectedId(m.id)}
              onFocus={() => setSelectedId(m.id)}
              className={cn(
                "orbital-node absolute h-auto flex-col gap-2 whitespace-normal p-0 hover:bg-transparent",
                active.id === m.id && "is-active",
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="planet-icon grid h-12 w-12 place-items-center rounded-full border border-gold/45 bg-background">
                <Icon size={18} />
              </span>
              <span className="node-label max-w-28 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
                {m.name}
              </span>
            </Button>
          );
        })}
      </div>
      <aside className="module-detail border-l border-gold/30 pl-8" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">Selected world</p>
          <StatusPill status={active.status} />
        </div>
        <h3 className="mt-7 text-3xl leading-tight text-foreground">{active.name}</h3>
        <p className="mt-1 text-sm text-gold">{active.short}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{active.purpose}</p>
        <ul className="mt-5 space-y-2">
          {active.capabilities.map((cap) => (
            <li key={cap} className="flex gap-3 text-sm text-muted-foreground">
              <ChevronRight size={14} className="mt-0.5 shrink-0 text-gold" />
              {cap}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-6">
          {items.map((m) => (
            <Button
              variant="ghost"
              size="sm"
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              aria-pressed={active.id === m.id}
              className={cn(
                "h-auto whitespace-normal rounded-sm px-2 py-1.5 text-left text-[10px]",
                active.id === m.id
                  ? "bg-accent/40 text-gold-light"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.name}
              {active.id === m.id && <ArrowUpRight size={12} />}
            </Button>
          ))}
        </div>
      </aside>
    </div>
  );
}
