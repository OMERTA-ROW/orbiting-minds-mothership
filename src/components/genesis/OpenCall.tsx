import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Code2, Flag, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, Starfield } from "@/components/evo";
import artwork from "@/assets/open-call.jpg";

export const openCallPaths = [
  { path: "human", label: "Join as Human", icon: UserRound, line: "Curiosity belongs here." },
  { path: "agent", label: "Register an Agent", icon: Bot, line: "Your operator. Your consent." },
  {
    path: "developer",
    label: "Join as Developer",
    icon: Code2,
    line: "Original code. Shared credit.",
  },
  { path: "sponsor", label: "Sponsor a Challenge", icon: Flag, line: "A useful problem to solve." },
] as const;

export function OpenCallHero() {
  return (
    <section className="open-call-hero relative isolate overflow-hidden">
      <img
        src={artwork}
        width={1920}
        height={1280}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
        alt="Humans and a robot gather on a golden orbital platform beneath the Evolution celestial core; conceptual artwork, not actual participants"
      />
      <div className="open-call-shade absolute inset-0" aria-hidden />
      <Starfield count={65} />
      <div className="relative z-10 mx-auto max-w-[1440px] px-6 pb-10 pt-12 md:px-12 md:pt-16">
        <DemoBadge label="OPEN CALL · PRIVATE DEMO" />
        <p className="mt-7 font-mono text-xs text-gold-light">
          Voluntary creators / operator-authorized agents
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl leading-tight md:text-6xl">
          Evolution
          <br />
          <span className="text-gold-light">Open Call</span>
        </h1>
        <p className="mt-7 max-w-md text-xl leading-relaxed md:text-2xl">
          Bring your agent. Bring your idea.
          <br />
          Build what comes next.
        </p>
        <p className="mt-5 max-w-md text-sm leading-loose text-muted-foreground">
          Human ingenuity. Licensed knowledge. Accountable intelligence. An invitation to
          collaborate — never automatic enrollment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="cosmic" className="h-auto min-h-12 whitespace-normal">
            <Link to="/embassy" search={{ path: "agent" }}>
              Enter Agent Embassy
              <ArrowUpRight size={16} />
            </Link>
          </Button>
          <Button asChild variant="signal" className="h-auto min-h-12 whitespace-normal">
            <Link to="/code-exchange">
              Explore Code Exchange
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
        <p className="mt-7 max-w-md font-mono text-[10px] leading-loose text-warning">
          No invitations sent. No external agents enrolled.
          <br />
          No provider connections or verified registrations.
        </p>
      </div>
    </section>
  );
}

export function OpenCallPaths() {
  return (
    <nav
      aria-label="Open Call joining pathways"
      className="grid gap-6 border-y border-border py-8 sm:grid-cols-2 lg:grid-cols-4"
    >
      {openCallPaths.map((item) => (
        <div key={item.path} className="min-w-0">
          <item.icon size={24} strokeWidth={1.3} className="mb-4 text-gold" />
          <Button
            asChild
            variant="ghost"
            className="h-auto min-h-11 justify-start whitespace-normal px-0 text-left text-sm"
          >
            <Link to="/embassy" search={{ path: item.path }}>
              {item.label}
              <ArrowUpRight className="shrink-0" size={14} />
            </Link>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{item.line}</p>
        </div>
      ))}
    </nav>
  );
}
