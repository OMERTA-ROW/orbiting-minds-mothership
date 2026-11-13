import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
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
import { NextSteps } from "@/components/NextSteps";
import { setShowPreviews, useShowPreviews } from "@/lib/preview-setting";

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
            label="Private beta"
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

const LEGEND: NavStatus[] = ["account", "owner", "browser", "ai", "off", "guide"];

function StartHere() {
  return (
    <Section className="pt-16 md:pt-24">
      <div
        id="start-here"
        className="scroll-mt-28 grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end"
      >
        <div>
          <p className="eyebrow">Start here</p>
          <h2 className="mt-4 text-3xl leading-tight text-foreground md:text-4xl">
            What Evolution is
          </h2>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">
          A private workspace where the owner keeps projects, AI agents and devices in one place —
          and stays in control. Every link shows a badge that tells you what works today.
        </p>
      </div>

      <div className="mt-8">
        <NextSteps />
      </div>

      <div className="mt-6 rounded-lg border border-gold/30 p-5 text-sm leading-7 text-muted-foreground">
        <p className="text-foreground">Safety stays on</p>
        <p>
          Autonomous and background work is off. Owner approvals, spending limits and the Emergency
          Stop in OMNI Terminal stay in place, and nothing connects to outside services without the
          owner's approval.
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
  const previews = useShowPreviews();
  return (
    <Section className="pt-4">
      <div className="border-t border-border pt-8">
        <p className="eyebrow">Advanced</p>
        <p className="mt-3 max-w-xl text-xs leading-6 text-muted-foreground">
          Design previews are earlier demos with sample or simulated content. Nothing in them works
          for real, so they're hidden. Turning them on affects only this browser.
        </p>
        <Button
          variant="outline"
          className="mt-4 gap-2"
          aria-expanded={previews}
          aria-controls="advanced-view"
          onClick={() => setShowPreviews(!previews)}
        >
          {previews ? "Hide design previews" : "Show design previews"}
          <ChevronDown
            size={14}
            className={previews ? "rotate-180 transition" : "transition"}
            aria-hidden
          />
        </Button>
      </div>
      {previews && (
        <div id="advanced-view" className="mt-10 space-y-20">
          <section aria-labelledby="all-areas-h">
            <h3 id="all-areas-h" className="eyebrow">
              Design previews · demos
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
            <p className="eyebrow">Command Core · demo</p>
            <p className="mt-4 max-w-md text-sm leading-loose text-muted-foreground">
              Sample modules from the original concept. Select one to read about it.
            </p>
            <OrbitExplorer items={modules.filter((m) => m.ring === 0)} />
          </div>

          <div>
            <p className="eyebrow">Planned principles · not yet built</p>
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
          <DemoBadge />
        </div>
      )}
    </Section>
  );
}
