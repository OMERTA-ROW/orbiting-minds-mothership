import { createFileRoute } from "@tanstack/react-router";
import { modules } from "@/data/evolution";
import { OrbitExplorer, PageHeader, Section, StatusPill } from "@/components/evo";
import { seo } from "@/lib/seo";
import { moduleIcons, DemoBadge } from "@/components/evo";
import { Orbit } from "lucide-react";

export const Route = createFileRoute("/mothership")({
  validateSearch: (search: Record<string, unknown>): { module?: string } => ({ module: typeof search.module === "string" && modules.some((m) => m.id === search.module) ? search.module : undefined }),
  head: () => seo("Mothership Architecture", "Explore the 15 modules of the EVOLUTION Mothership, from Guardian to the Global Brain."),
  component: Page,
});

function Page() {
  const { module } = Route.useSearch();
  return (
    <>
      <PageHeader eyebrow="Architecture Explorer" title="The Mothership">
        Fifteen modules orbit a single owner-scoped core. Hover, click or tab through nodes to inspect each module's purpose.
        <div className="mt-5"><DemoBadge /></div>
      </PageHeader>
      <Section><div id="module-explorer" className="scroll-mt-28"><OrbitExplorer key={module} initialId={module} items={modules} size={600} /></div></Section>
      <Section>
        <div className="mb-12 flex items-center gap-6"><p className="eyebrow">The complete constellation</p><span className="h-px flex-1 bg-border" /></div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const Icon = moduleIcons[m.id] ?? Orbit;
            return (
            <article key={m.id} className="glass p-5">
              <Icon size={28} strokeWidth={1} className="mb-6 text-gold" />
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base text-gold-light">{m.name}</h3>
                <StatusPill status={m.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{m.purpose}</p>
            </article>
          ); })}
        </div>
      </Section>
    </>
  );
}
