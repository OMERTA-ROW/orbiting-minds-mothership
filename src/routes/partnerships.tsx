import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Section, StatusPill, DemoBadge } from "@/components/evo";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/partnerships")({
  head: () => seo("Partnerships", "Research reference areas and optional future partner integrations for EVOLUTION."),
  component: Page,
});

const refs = [
  { n: "Space exploration", d: "Public research from agencies such as NASA used as reference material." },
  { n: "Launch & satellites", d: "Public information about SpaceX / Starlink-style systems as reference areas." },
  { n: "Particle physics", d: "Open CERN publications and datasets as research references." },
];

function Page() {
  return (
    <>
      <PageHeader eyebrow="Partnerships" title="Allies & references">
        Clear lines: research reference areas are not partnerships. Partner integrations are optional and future.
      </PageHeader>
      <Section>
        <h2 className="mb-4 text-xl text-ivory">Research reference areas</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {refs.map((r) => <div key={r.n} className="glass p-5"><div className="flex justify-between"><h3 className="text-gold-light">{r.n}</h3><StatusPill status="Concept" /></div><p className="mt-2 text-sm text-muted-foreground">{r.d}</p></div>)}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No affiliation, endorsement or partnership with NASA, SpaceX, Starlink or CERN is claimed or implied.</p>
      </Section>
      <Section>
        <div className="glass grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl text-gold-light">Cyberace</h2><DemoBadge label="DEMO · NOT CONNECTED" /></div>
            <p className="mt-2 text-sm text-muted-foreground">Proposed project example only. Integration details are unconfirmed; no repository, terminal or deployment is connected. Owner authorization is required before integration.</p>
          </div>
          <Link to="/join" className="rounded-full border border-gold/50 px-5 py-2.5 text-sm text-gold-light hover:bg-accent/50">Express partner interest</Link>
        </div>
      </Section>
    </>
  );
}
