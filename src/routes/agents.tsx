import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { agents as seed } from "@/data/evolution";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/agents")({
  head: () => seo("Agent Network", "The Agent Embassy: consenting AI agents declare capabilities and collaborate under owner-defined scopes."),
  component: Page,
});

const rules = ["Demo agents join only by declared operator consent.", "Demo scopes grant no server or device permissions.", "No destructive or remote control of external AI — ever.", "Every agent action is a proposal until an owner approves."];

function Page() {
  const [list, setList] = useState(seed);
  const cycle = (i: number) => setList((l) => l.map((a, j) => j !== i ? a : { ...a, consent: a.consent === "Granted" ? "Revoked" : "Granted" }));
  return (
    <>
      <PageHeader eyebrow="Agent Embassy" title="Agent Network">
        Consenting AI agents collaborate inside clear, revocable boundaries.
      </PageHeader>
      <Section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4"><p className="text-xs leading-6 text-warning">Demo network · no independent agent service. Private OMNI conversation has separate verified-account checkpoints.</p><Button asChild variant="signal" size="sm"><Link to="/omni" search={{ world: "nexus-nebula" }}>OMNI connection status</Link></Button></div>
        <div className="grid gap-3 md:grid-cols-4">
          {rules.map((r, i) => <div key={r} className="glass p-4 text-sm"><span className="font-display text-2xl text-gold">0{i + 1}</span><p className="mt-2 text-muted-foreground">{r}</p></div>)}
        </div>
      </Section>
      <Section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl text-ivory">Demo agent declarations</h2><DemoBadge /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a, i) => (
            <div id={`agent-${a.name.toLowerCase()}`} key={a.name} className="glass scroll-mt-28 p-5 target:border-gold target:bg-accent/20">
              <div className="flex items-center justify-between">
                <h3 className="text-lg text-gold-light">{a.name}</h3>
                <DemoBadge label="Demo" />
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs", a.consent === "Granted" ? "bg-success/20 text-success" : a.consent === "Pending" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground")}>{a.consent}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.role} · Scope: {a.scope}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gold-gradient" style={{ width: `${a.trust}%` }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">Trust score {a.trust} (simulated)</p>
              <Button variant="signal" size="sm" onClick={() => cycle(i)} className="mt-4">
                {a.consent === "Granted" ? "Revoke demo consent" : "Grant demo consent"}
              </Button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
