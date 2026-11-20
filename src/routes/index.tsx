import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Section } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { isIndexable } from "@/lib/search-policy";
import MothershipBackground from "@/components/MothershipBackground";
import { StatusBadge } from "@/components/StatusBadge";
import { NAV_STATUS, navGroups, type NavStatus } from "@/components/nav-groups";
import { retiredAreas } from "@/lib/retired-areas";
import { useAccount } from "@/hooks/use-account";
import { NextSteps } from "@/components/NextSteps";

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
          <span className="absolute right-8 top-12 hidden border border-gold/25 bg-background/60 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-gold-light md:inline-flex">
            Private beta
          </span>
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
        <NotConnectedYet />
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

function NotConnectedYet() {
  return (
    <Section className="pt-4">
      <details className="border-t border-border pt-8">
        <summary className="eyebrow cursor-pointer">
          Not connected yet ({retiredAreas.length})
        </summary>
        <p className="mt-3 max-w-xl text-xs leading-6 text-muted-foreground">
          Earlier ideas that only had sample content. They were removed from the site; each says
          what a real version would need.
        </p>
        <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {retiredAreas.map((a) => (
            <li key={a.path} className="border-b border-border py-2 text-xs">
              <span className="text-foreground">{a.name}</span>
              <span className="block leading-5 text-muted-foreground">{a.needs}</span>
              {"instead" in a && (
                <Link
                  to={a.instead.to}
                  className="text-gold-light underline-offset-4 hover:underline"
                >
                  {a.instead.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}
