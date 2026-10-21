import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, ChevronDown, Orbit, ShieldCheck, Fingerprint, Layers, Sparkles, Bot, Dna } from "lucide-react";
import { modules } from "@/data/evolution";
import { DemoBadge, OrbitExplorer, Section, Starfield } from "@/components/evo";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import cosmos from "@/assets/mothership-cosmos.jpg";

export const Route = createFileRoute("/")({
  head: () => seo("EVOLUTION — Cosmic Mothership", "All technology is converging here. Explore EVOLUTION's consent-first constellation of software, creators, AI agents and research. Bridge technology into its next evolution.", { indexable: true }),
  component: Index,
});

const pillars = [
  { t: "Opt-in by design", d: "Nothing joins the network without its owner's explicit consent. Revoke anytime.", icon: Fingerprint },
  { t: "Sandbox first · planned", d: "Current sandbox checks are simulations or proposed tests, not executed code validation.", icon: Layers },
  { t: "Signed & reversible · planned", d: "Signed releases and verified rollback are not available. Current previews remain unsigned demonstrations.", icon: ShieldCheck },
];

function Index() {
  return (
    <>
      <section className="cosmic-hero relative isolate overflow-hidden"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 767px)").matches) return;
          const bounds = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--parallax-x", `${(e.clientX - bounds.left - bounds.width / 2) * 0.007}px`);
          e.currentTarget.style.setProperty("--parallax-y", `${(e.clientY - bounds.top - bounds.height / 2) * 0.006}px`);
        }}
        onPointerLeave={(e) => { e.currentTarget.style.setProperty("--parallax-x", "0px"); e.currentTarget.style.setProperty("--parallax-y", "0px"); }}>
        <img src={cosmos} width={1920} height={1280} fetchPriority="high" className="cosmic-hero-art absolute inset-0 h-full w-full object-cover" alt="A floating celestial intelligence core surrounded by metallic-gold orbital rings and connected planetary worlds" />
        <div className="hero-vignette pointer-events-none absolute inset-0" aria-hidden />
        <Starfield count={85} />
        <div className="hero-coordinates pointer-events-none absolute left-8 top-12 hidden font-mono text-[9px] leading-loose text-muted-foreground lg:block" aria-hidden>EVOLUTION NETWORK<br />MOTHERSHIP / 001</div>
        <DemoBadge className="absolute right-8 top-12 hidden md:inline-flex" />
        <div className="hero-copy relative z-10 mx-auto max-w-4xl px-6 text-center">
          <p className="eyebrow flex items-center justify-center gap-4"><span className="h-px w-8 bg-gold/50" />The future is connected<span className="h-px w-8 bg-gold/50" /></p>
          <h1 className="hero-title mt-5 font-display font-medium text-gold-gradient">EVOLUTION</h1>
          <p className="mt-4 text-lg font-light text-foreground md:text-2xl">Bridge technology into its next evolution.</p>
          <p className="mt-3 text-sm text-muted-foreground">All technology is converging here.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="cosmic" className="h-12 rounded-sm px-6 text-xs"><Link to="/mothership">Explore the Mothership<ArrowUpRight /></Link></Button>
            <Button asChild variant="signal" className="h-12 rounded-sm px-6 text-xs"><Link to="/launch-control">Limited Beta · Launch Control<ArrowRight /></Link></Button>
          </div>
        </div>
        <nav className="hero-worlds absolute inset-0" aria-label="Connected Mothership worlds">
          <Link to="/guardian" className="hero-world hero-world-guardian"><span className="world-beacon"><ShieldCheck size={15} /></span><span>Guardian<small>Protection layer</small></span><ArrowUpRight size={12} /></Link>
          <Link to="/embassy" className="hero-world hero-world-agents"><span className="world-beacon"><Bot size={15} /></span><span>Agent Embassy<small>Consenting intelligence</small></span><ArrowUpRight size={12} /></Link>
          <Link to="/knowledge-fusion" className="hero-world hero-world-fusion"><span className="world-beacon"><Sparkles size={15} /></span><span>Knowledge Fusion<small>Cross-domain insight</small></span><ArrowUpRight size={12} /></Link>
          <Link to="/sandbox" className="hero-world hero-world-dna"><span className="world-beacon"><Dna size={15} /></span><span>Evolution DNA<small>Compatibility profiles</small></span><ArrowUpRight size={12} /></Link>
        </nav>
        <div className="hero-bottom absolute bottom-8 left-0 z-10 w-full px-6 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-gold-light">One Mothership. Infinite possibilities.</p>
          <a href="#command-core" aria-label="Discover the Command Core" className="mx-auto mt-4 inline-flex h-8 w-8 items-center justify-center text-gold"><ChevronDown size={18} /></a>
        </div>
      </section>

      <div className="network-horizon border-y border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-9 gap-y-4 px-6 py-6 font-mono text-[10px] uppercase text-muted-foreground md:gap-x-14"><Orbit size={16} className="text-gold" /><span>Software</span><span className="text-gold/50" aria-hidden>✦</span><span>Creators</span><span className="text-gold/50" aria-hidden>✦</span><span>AI agents</span><span className="text-gold/50" aria-hidden>✦</span><span>Research</span><span className="text-gold/50" aria-hidden>✦</span><span>Future technologies</span></div>
      </div>

      <Section className="pt-20 md:pt-28">
        <div id="command-core" className="scroll-mt-28 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div><p className="eyebrow">01 / Command Core</p><h2 className="mt-5 text-3xl leading-tight text-foreground md:text-5xl">A constellation.<br /><span className="text-gold-light">Not a collection of tools.</span></h2></div>
          <div className="max-w-md"><p className="text-sm leading-loose text-muted-foreground">A consent-first collaboration network uniting developers, consenting AI agents, software, research and inventions under one modular Mothership.</p><p className="mt-4 font-mono text-[10px] uppercase text-gold">Select a module</p></div>
        </div>
        <OrbitExplorer items={modules.filter((m) => m.ring === 0)} />
      </Section>

      <Section>
        <div className="mb-12 flex items-center gap-5"><p className="eyebrow">02 / Trust at the center</p><span className="h-px flex-1 bg-border" /></div>
        <div className="grid gap-10 md:grid-cols-3 md:gap-14">
          {pillars.map((p) => (
            <article key={p.t} className="border-t border-gold/30 pt-7"><p.icon size={28} strokeWidth={1} className="text-gold" /><h3 className="mt-6 text-xl text-foreground">{p.t}</h3><p className="mt-4 text-sm leading-loose text-muted-foreground">{p.d}</p></article>
          ))}
        </div>
      </Section>
      <div className="journey-band border-t border-border">
        <Section className="pt-20 text-center"><p className="eyebrow">Creator transmission</p><h2 className="mx-auto mt-5 max-w-3xl text-3xl leading-tight text-foreground md:text-4xl">A pathway for your concept</h2><p className="mx-auto mt-5 max-w-lg text-sm leading-loose text-muted-foreground">Describe a technology idea. Receive an AI-generated draft connecting relevant Mothership modules, proposed sandbox checks and an owner approval gate. No validation is run.</p><Button asChild variant="cosmic" className="mt-7 h-12 rounded-sm px-6"><Link to="/pathway"><Sparkles size={16} />Create an Evolution pathway<ArrowUpRight /></Link></Button></Section>
        <Section className="flex flex-col items-center gap-8 py-20 text-center md:py-28"><p className="eyebrow">Your next evolution begins here</p><h2 className="max-w-3xl text-3xl leading-tight text-foreground md:text-5xl">Walk a full evolution journey</h2><p className="max-w-lg text-sm leading-loose text-muted-foreground">From DNA profile to Guardian-approved rollout — fully simulated.</p><div className="flex flex-wrap justify-center gap-3"><Button asChild variant="cosmic" className="h-12 rounded-sm px-6"><Link to="/sandbox">Start the demo<ArrowRight /></Link></Button><Button asChild variant="signal" className="h-12 rounded-sm px-6"><Link to="/universe">Enter the Universe<ArrowUpRight /></Link></Button></div><DemoBadge /></Section>
      </div>
    </>
  );
}
