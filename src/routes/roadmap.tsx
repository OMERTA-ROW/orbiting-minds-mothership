import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Section, StatusPill } from "@/components/evo";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/roadmap")({
  head: () => seo("Roadmap", "From visual prototype to consented GitHub integration, signed verified updates and partner ecosystems."),
  component: Page,
});

const phases = [
  { n: "Phase 1", t: "Visual Prototype", s: "Prototype", items: ["Mothership command center", "Universe map & demo journey", "Guardian & dashboard mockups"] },
  { n: "Phase 2", t: "Developer GitHub Integration", s: "Planned", items: ["Consent-based, read-only repo grants", "CLI: init, login, scan, suggest", "Owner-scoped auth, orgs & roles"] },
  { n: "Phase 3", t: "Signed Verified Updates", s: "Future", items: ["Signed update packages", "Sandbox evaluation & manual approval", "Rollback snapshots & audit events"] },
  { n: "Phase 4", t: "Partner Ecosystems", s: "Future", items: ["Optional Cyberace / Ace integration", "Agent Embassy at scale", "Contribution economy & subscriptions"] },
];

function Page() {
  return (
    <>
      <PageHeader eyebrow="Roadmap" title="The path of evolution">Proposed capabilities carry future status labels. Only Phase 1 exists today.</PageHeader>
      <Section>
        <ol className="relative space-y-6 border-l border-gold/30 pl-8">
          {phases.map((p, i) => (
            <li key={p.n} className="relative">
              <span className={`absolute -left-[41px] top-6 h-4 w-4 rounded-full border-2 border-gold ${i === 0 ? "bg-gold animate-pulse-gold" : "bg-background"}`} aria-hidden />
              <div className="glass p-6">
                <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">{p.n}</p><StatusPill status={p.s} /></div>
                <h2 className="mt-2 text-2xl text-ivory">{p.t}</h2>
                <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">{p.items.map((x) => <li key={x}>◆ {x}</li>)}</ul>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
