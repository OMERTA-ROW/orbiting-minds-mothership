import { createFileRoute } from "@tanstack/react-router";
import { modules } from "@/data/evolution";
import { OrbitExplorer, PageHeader, Section, StatusPill } from "@/components/evo";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/mothership")({
  head: () => seo("Mothership Architecture", "Explore the 15 modules of the EVOLUTION Mothership, from Guardian to the Global Brain."),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader eyebrow="Architecture Explorer" title="The Mothership">
        Fifteen modules orbit a single owner-scoped core. Hover, click or tab through nodes to inspect each module's purpose.
      </PageHeader>
      <Section><OrbitExplorer items={modules} size={600} /></Section>
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <article key={m.id} className="glass p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base text-gold-light">{m.name}</h3>
                <StatusPill status={m.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{m.purpose}</p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
