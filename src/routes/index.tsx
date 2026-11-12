import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Orbit,
  ShieldCheck,
  Fingerprint,
  Layers,
  Sparkles,
  Bot,
  Dna,
} from "lucide-react";
import { modules } from "@/data/evolution";
import { DemoBadge, OrbitExplorer, Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { isIndexable } from "@/lib/search-policy";
import MothershipBackground from "@/components/MothershipBackground";
import { StatusBadge } from "@/components/StatusBadge";
import { NAV_STATUS, advancedItems, navGroups, type NavStatus } from "@/components/nav-groups";
import { useAccount } from "@/hooks/use-account";

export const Route = createFileRoute("/")({
  head: () =>
    seo(
      "EVOLUTION — Cosmic Mothership",
      "All technology is converging here. Explore EVOLUTION's consent-first constellation of software, creators, AI agents and research. Bridge technology into its next evolution.",
      {
        indexable: isIndexable("/"),
        path: "/",
        image: "/og-home.jpg",
        imageAlt: "A celestial intelligence core surrounded by metallic-gold orbital rings",
      },
    ),
  component: Index,
});

const pillars = [
  {
    t: "Opt-in by design",
    d: "Nothing joins the network without its owner's explicit consent. Revoke anytime.",
    icon: Fingerprint,
  },
  {
    t: "Sandbox first · planned",
    d: "Current sandbox checks are simulations or proposed tests, not executed code validation.",
    icon: Layers,
  },
  {
    t: "Signed & reversible · planned",
    d: "Signed releases and verified rollback are not available. Current previews remain unsigned demonstrations.",
    icon: ShieldCheck,
  },
];

function Index() {
  return (
    <div className="ms-page">
      <MothershipBackground />
      <div className="ms-content">
        <section className="cosmic-hero relative isolate overflow-hidden">
          <div className="hero-vignette pointer-events-none absolute inset-0" aria-hidden />
          <div
            className="hero-coordinates pointer-events-none absolute left-8 top-12 hidden font-mono text-[9px] leading-loose text-muted-foreground lg:block"
            aria-hidden
          >
            EVOLUTION NETWORK
            <br />
            MOTHERSHIP / 001
          </div>
          <DemoBadge
            label="Private beta · demos labeled"
            className="absolute right-8 top-12 hidden md:inline-flex"
          />
          <div className="hero-copy relative z-10 mx-auto max-w-4xl px-6 text-center">
            <p className="eyebrow flex items-center justify-center gap-4">
              <span className="h-px w-8 bg-gold/50" />
              The future is connected
              <span className="h-px w-8 bg-gold/50" />
            </p>
            <h1 className="hero-title mt-5 font-display font-medium text-gold-gradient">
              EVOLUTION
            </h1>
            <p className="mt-4 text-lg font-light text-foreground md:text-2xl">
              Bridge technology into its next evolution.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">All technology is converging here.</p>
            <HeroActions />
          </div>
          <nav className="hero-worlds absolute inset-0" aria-label="Connected Mothership worlds">
            <Link to="/guardian" className="hero-world hero-world-guardian">
              <span className="world-beacon">
                <ShieldCheck size={15} />
              </span>
              <span>
                Guardian<small>Protection layer</small>
              </span>
              <ArrowUpRight size={12} />
            </Link>
            <Link to="/embassy" className="hero-world hero-world-agents">
              <span className="world-beacon">
                <Bot size={15} />
              </span>
              <span>
                Agent Embassy<small>Consenting intelligence</small>
              </span>
              <ArrowUpRight size={12} />
            </Link>
            <Link to="/knowledge-fusion" className="hero-world hero-world-fusion">
              <span className="world-beacon">
                <Sparkles size={15} />
              </span>
              <span>
                Knowledge Fusion<small>Cross-domain insight</small>
              </span>
              <ArrowUpRight size={12} />
            </Link>
            <Link to="/sandbox" className="hero-world hero-world-dna">
              <span className="world-beacon">
                <Dna size={15} />
              </span>
              <span>
                Evolution DNA<small>Compatibility profiles</small>
              </span>
              <ArrowUpRight size={12} />
            </Link>
          </nav>
          <div className="hero-bottom absolute bottom-8 left-0 z-10 w-full px-6 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-gold-light">
              One Mothership. Infinite possibilities.
            </p>
            <a
              href="#start-here"
              aria-label="Start here"
              className="mx-auto mt-4 inline-flex h-8 w-8 items-center justify-center text-gold"
            >
              <ChevronDown size={18} />
            </a>
          </div>
        </section>

        <StartHere />
        <AdvancedView />
      </div>
    </div>
  );
}

function HeroActions() {
  const { user, ready } = useAccount();
  const signedIn = ready && !!user;
  return (
    <div className="mt-7 flex flex-wrap justify-center gap-3">
      <Button asChild variant="cosmic" className="h-12 rounded-sm px-6 text-xs">
        {signedIn ? (
          <Link to="/beta">
            Open my projects
            <ArrowRight />
          </Link>
        ) : (
          <Link to="/auth">
            Sign in
            <ArrowRight />
          </Link>
        )}
      </Button>
      <Button asChild variant="signal" className="h-12 rounded-sm px-6 text-xs">
        <Link to="/sign-in-help">
          How sign-in works
          <ArrowUpRight />
        </Link>
      </Button>
    </div>
  );
}

const LEGEND: NavStatus[] = ["account", "owner", "browser", "ai", "demo", "off"];

function StartHere() {
  return (
    <Section className="pt-16 md:pt-24">
      <div id="start-here" className="scroll-mt-28 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end">
        <div>
          <p className="eyebrow">Start here</p>
          <h2 className="mt-4 text-3xl leading-tight text-foreground md:text-4xl">
            What Evolution is
          </h2>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">
          A private workspace where the owner keeps projects, AI agents and devices in one place —
          and stays in control. Many areas are still early demos, so every link shows a badge that
          tells you what is real.
        </p>
      </div>

      <div className="mt-8 rounded-lg border border-gold/30 p-5 text-sm leading-7 text-muted-foreground">
        <p className="text-foreground">Safety stays on</p>
        <p>
          Autonomous and background work is off. Owner approvals, spending limits and the
          Emergency Stop in OMNI Terminal stay in place, and nothing connects to outside services
          without the owner's approval.
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {navGroups.map((g) => (
          <section
            key={g.id}
            aria-labelledby={`grp-${g.id}`}
            className="rounded-lg border border-border bg-background/60 p-5"
          >
            <h3 id={`grp-${g.id}`} className="text-lg text-gold-light">
              {g.label}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
            <ul className="mt-4 space-y-3">
              {g.items.map((n) => (
                <li key={n.to} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <Link
                      to={n.to}
                      className="text-sm text-foreground underline-offset-4 hover:text-gold-light hover:underline"
                    >
                      {n.label}
                    </Link>
                    <span className="block text-xs leading-5 text-muted-foreground">{n.note}</span>
                  </span>
                  <StatusBadge status={n.status} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="legend-h" className="mt-10">
        <h3 id="legend-h" className="eyebrow">
          What the badges mean
        </h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LEGEND.map((k) => (
            <div key={k} className="flex items-start gap-3">
              <dt>
                <StatusBadge status={k} tooltip={false} />
              </dt>
              <dd className="text-xs leading-5 text-muted-foreground">{NAV_STATUS[k].help}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Section>
  );
}

function AdvancedView() {
  const [open, setOpen] = useState(false);
  return (
    <Section className="pt-4">
      <div className="border-t border-border pt-8">
        <Button
          variant="outline"
          aria-expanded={open}
          aria-controls="advanced-view"
          onClick={() => setOpen(!open)}
          className="gap-2"
        >
          {open ? "Hide advanced view" : "Show advanced view"}
          <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} aria-hidden />
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Every other module, demo and reference from earlier versions. Nothing was removed.
        </p>
      </div>
      {open && (
        <div id="advanced-view" className="mt-10 space-y-20">
          <section aria-labelledby="all-areas-h">
            <h3 id="all-areas-h" className="eyebrow">
              All other areas
            </h3>
            <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {advancedItems.map((n) => (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className="flex min-h-11 items-center justify-between border-b border-border py-2 text-xs text-muted-foreground hover:text-gold-light"
                  >
                    {n.label}
                    <ArrowUpRight size={12} className="text-gold" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div id="command-core">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="eyebrow">Command Core · demo</p>
                <h2 className="mt-5 text-3xl leading-tight text-foreground md:text-5xl">
                  A constellation.
                  <br />
                  <span className="text-gold-light">Not a collection of tools.</span>
                </h2>
              </div>
              <p className="max-w-md text-sm leading-loose text-muted-foreground">
                A consent-first collaboration network uniting developers, consenting AI agents,
                software, research and inventions under one modular Mothership. Select a module.
              </p>
            </div>
            <OrbitExplorer items={modules.filter((m) => m.ring === 0)} />
          </div>

          <div>
            <p className="eyebrow">Trust at the center</p>
            <div className="mt-8 grid gap-10 md:grid-cols-3 md:gap-14">
              {pillars.map((p) => (
                <article key={p.t} className="border-t border-gold/30 pt-7">
                  <p.icon size={28} strokeWidth={1} className="text-gold" />
                  <h3 className="mt-6 text-xl text-foreground">{p.t}</h3>
                  <p className="mt-4 text-sm leading-loose text-muted-foreground">{p.d}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 text-center">
            <p className="eyebrow">Simulated journey</p>
            <p className="max-w-lg text-sm leading-loose text-muted-foreground">
              Walk from a DNA profile to a Guardian-approved rollout — fully simulated.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild variant="cosmic" className="h-12 rounded-sm px-6">
                <Link to="/sandbox">
                  Start the demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="signal" className="h-12 rounded-sm px-6">
                <Link to="/universe">
                  Enter the Universe
                  <ArrowUpRight />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-sm px-6">
                <Link to="/mothership">
                  Explore the Mothership
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
            <DemoBadge />
          </div>
        </div>
      )}
    </Section>
  );
}
