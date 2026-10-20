import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Undo2 } from "lucide-react";
import { guardianAlerts, permissions } from "@/data/evolution";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/guardian")({
  head: () => seo("Guardian", "Reversible protection, owner permissions and safety checks — the Guardian dashboard prototype."),
  component: Page,
});

const labels = { approve: "Approve update", deny: "Deny request", acknowledge: "Acknowledge", rollback: "Run rollback" } as const;

function Page() {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [perms, setPerms] = useState(permissions);

  return (
    <>
      <PageHeader eyebrow="Protection Layer" title="Guardian">
        Nothing changes without the owner. Every action is signed, sandboxed, approved and reversible. <DemoBadge className="ml-1 align-middle" />
      </PageHeader>
      <Section>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <h2 className="text-xl text-ivory">Alerts</h2>
            {guardianAlerts.map((a) => {
              const Icon = a.level === "critical" ? ShieldX : a.level === "warn" ? ShieldAlert : ShieldCheck;
              const done = resolved[a.id];
              return (
                <div key={a.id} className={cn("glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center", done && "opacity-60")}>
                  <Icon className={cn("shrink-0", a.level === "critical" ? "text-destructive" : a.level === "warn" ? "text-warning" : "text-success")} />
                  <div className="flex-1">
                    <p className="font-mono text-[11px] text-muted-foreground">{a.id}</p>
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-sm text-muted-foreground">{a.detail}</p>
                  </div>
                  {done ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gold-light">{done}</span>
                      <button onClick={() => setResolved((r) => { const n = { ...r }; delete n[a.id]; return n; })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Undo2 size={12} />Undo</button>
                    </div>
                  ) : (
                    <button onClick={() => setResolved((r) => ({ ...r, [a.id]: `✔ ${labels[a.action]} (simulated)` }))}
                      className="rounded-full border border-gold/50 px-4 py-1.5 text-sm text-gold-light hover:bg-accent/50">{labels[a.action]}</button>
                  )}
                </div>
              );
            })}
          </div>
          <aside className="glass h-fit p-6">
            <h2 className="text-xl text-ivory">Owner permissions</h2>
            <p className="mt-1 text-xs text-muted-foreground">Toggle grants. Changes are logged to the audit trail (simulated).</p>
            <ul className="mt-5 space-y-3">
              {perms.map((p, i) => (
                <li key={p.scope} className="flex items-center justify-between gap-3 text-sm">
                  <span>{p.scope}</span>
                  <button role="switch" aria-checked={p.granted} aria-label={p.scope}
                    onClick={() => setPerms((ps) => ps.map((x, j) => (j === i ? { ...x, granted: !x.granted } : x)))}
                    className={cn("relative h-6 w-11 shrink-0 rounded-full border transition", p.granted ? "border-gold bg-gold/40" : "border-border bg-muted")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full transition-all", p.granted ? "left-6 bg-gold-light" : "left-0.5 bg-muted-foreground")} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg border border-border p-4 text-xs text-muted-foreground">
              Guardian is defensive only: it never accesses unauthorized systems, never controls external AI, and never "hacks back".
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
