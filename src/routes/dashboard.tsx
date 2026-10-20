import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { agents, sampleProjects } from "@/data/evolution";
import { DemoBadge, PageHeader, Section } from "@/components/evo";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/dashboard")({
  head: () => seo("Demo Dashboard", "Simulated overview of projects, agents, proposals, experiments, upgrade status and readiness."),
  component: Page,
});

const stats = [["Projects", "3"], ["Consenting agents", "2"], ["Open proposals", "5"], ["Experiments", "12"]];
const proposals = [
  { id: "P-104", t: "Reduce bundle size 18%", p: "Nebula UI Kit", s: "Awaiting approval" },
  { id: "P-105", t: "Focus-visible ring tokens", p: "Nebula UI Kit", s: "In sandbox" },
  { id: "P-158", t: "Staged firmware rollout", p: "Helios Sensor Mesh", s: "Guardian review" },
  { id: "P-181", t: "Pin container digests", p: "OpenGenome Pipelines", s: "Approved" },
];
const tabs = ["Projects", "Proposals", "Agents"] as const;

function Page() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Projects");
  return (
    <>
      <PageHeader eyebrow="Command Center" title="Demo Dashboard">
        <DemoBadge label="Every number here is simulated" />
      </PageHeader>
      <Section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map(([k, v]) => <div key={k} className="glass p-5"><p className="font-display text-4xl text-gold-gradient">{v}</p><p className="mt-1 text-sm text-muted-foreground">{k}</p></div>)}
        </div>
      </Section>
      <Section>
        <div className="mb-4 flex gap-2" role="tablist">
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-full border px-4 py-1.5 text-sm", tab === t ? "border-gold bg-accent/60 text-gold-light" : "border-border text-muted-foreground")}>{t}</button>)}
        </div>
        <div className="glass overflow-x-auto p-2" role="tabpanel">
          <table className="w-full min-w-[560px] text-left text-sm">
            {tab === "Projects" && (<>
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-3">Project</th><th>Version</th><th>Upgrade</th><th>Health</th><th>Readiness</th></tr></thead>
              <tbody>{sampleProjects.map((p, i) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3 text-gold-light">{p.name}</td><td>v2.{3 + i}.0</td><td>{["Update available", "Up to date", "Dry-run ready"][i]}</td>
                  <td><Bar v={p.maturity + 10} /></td><td><Bar v={p.maturity} /></td>
                </tr>))}</tbody>
            </>)}
            {tab === "Proposals" && (<>
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-3">ID</th><th>Proposal</th><th>Project</th><th>Status</th></tr></thead>
              <tbody>{proposals.map((p) => <tr key={p.id} className="border-t border-border"><td className="p-3 font-mono text-gold">{p.id}</td><td>{p.t}</td><td className="text-muted-foreground">{p.p}</td><td className="text-gold-light">{p.s}</td></tr>)}</tbody>
            </>)}
            {tab === "Agents" && (<>
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-3">Agent</th><th>Role</th><th>Consent</th><th>Trust</th></tr></thead>
              <tbody>{agents.map((a) => <tr key={a.name} className="border-t border-border"><td className="p-3 text-gold-light">{a.name}</td><td>{a.role}</td><td>{a.consent}</td><td><Bar v={a.trust} /></td></tr>)}</tbody>
            </>)}
          </table>
        </div>
      </Section>
    </>
  );
}

function Bar({ v }: { v: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gold-gradient" style={{ width: `${Math.min(v, 100)}%` }} /></div>
      <span className="text-xs text-muted-foreground">{Math.min(v, 100)}%</span>
    </div>
  );
}
