import { createFileRoute, Link } from "@tanstack/react-router";
import { modules } from "@/data/evolution";
import { OrbitExplorer, Section, Starfield } from "@/components/evo";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("Home", "EVOLUTION is an opt-in universal technology collaboration network. Bridge technology into its next evolution."),
  component: Index,
});

const pillars = [
  { t: "Opt-in by design", d: "Nothing joins the network without its owner's explicit consent. Revoke anytime." },
  { t: "Sandbox first", d: "Every proposed evolution is simulated in isolation before an owner ever sees it." },
  { t: "Signed & reversible", d: "Updates are signed, manually approved and always paired with a rollback." },
];

function Index() {
  return (
    <>
      <section className="relative overflow-hidden">
        <Starfield count={90} />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-24 text-center md:pt-32">
          <p className="eyebrow">The future is connected</p>
          <h1 className="mt-6 text-6xl font-bold leading-none tracking-[0.12em] text-gold-gradient sm:text-8xl md:text-9xl">EVOLUTION</h1>
          <p className="mx-auto mt-6 max-w-xl text-xl text-ivory/90 md:text-2xl">Bridge technology into its next evolution.</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            A consent-first collaboration network uniting developers, consenting AI agents, software, research and inventions under one modular Mothership.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/mothership" className="rounded-full bg-gold-gradient px-7 py-3 font-semibold text-primary-foreground shadow-glow transition hover:brightness-110">Explore the Mothership</Link>
            <Link to="/join" className="rounded-full border border-gold/50 px-7 py-3 font-semibold text-gold-light transition hover:bg-accent/50">Join the Network</Link>
          </div>
        </div>
      </section>

      <Section>
        <div className="mb-8 text-center">
          <p className="eyebrow">Command Core</p>
          <h2 className="mt-3 text-3xl text-ivory md:text-4xl">Select a module</h2>
        </div>
        <OrbitExplorer items={modules.filter((m) => m.ring === 0)} />
      </Section>

      <Section>
        <div className="grid gap-5 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.t} className="glass p-6">
              <h3 className="text-lg text-gold-light">{p.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.d}</p>
            </div>
          ))}
        </div>
        <div className="glass mt-10 flex flex-col items-start justify-between gap-4 p-8 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl text-ivory">Walk a full evolution journey</h3>
            <p className="mt-1 text-sm text-muted-foreground">From DNA profile to Guardian-approved rollout — fully simulated.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/sandbox" className="rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground">Start the demo</Link>
            <Link to="/universe" className="rounded-full border border-gold/40 px-5 py-2.5 text-sm text-gold-light">Enter the Universe</Link>
          </div>
        </div>
      </Section>
    </>
  );
}
