import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Network, Shield, GitBranch, Braces, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CoreGeometry, DemoBadge } from "@/components/evo";
import { nexusProjects } from "@/data/evolution";
import { useOmniBridge } from "@/hooks/use-omnibridge";
import { CapabilityGraph } from "./CapabilityGraph";
import { IntentPlanner } from "./IntentPlanner";
import { AdapterReference } from "./AdapterReference";
import { CompatibilityValue } from "@/components/cli/CompatibilityValue";
export function OmniBridge() {
  const [worldId, setWorldId] = useState("nexus-nebula");
  const { store, ready, issue, paused, dispatch } = useOmniBridge();
  const world = nexusProjects.find((v) => v.id === worldId);
  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-8 md:px-8">
      <header className="relative overflow-hidden border-b border-gold/30 pb-8">
        <CoreGeometry className="pointer-events-none absolute -right-16 -top-36 w-96 opacity-20" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-4">
            <span className="eyebrow">Evolution / capability & intent terminal</span>
            <DemoBadge label="PHASE 01 · LOCAL DEMO" />
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-4xl leading-tight md:text-5xl">OmniBridge</h1>
              <p className="mt-4 text-sm text-muted-foreground">
                Many worlds. Explicit intent. Permission before power.
              </p>
            </div>
            <Button asChild variant="signal">
              <Link to="/command-nexus">
                Command Nexus
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-6 text-warning">
            No live connections, wallet, transactions or device access. Plans are explainable DEMO
            proposals; human review never enables execution. Secure accounts and official adapters
            remain blocked.
          </p>
        </div>
      </header>
      <section className="mt-7 flex flex-wrap items-center justify-between gap-5 border-b border-gold/30 pb-6">
        <div>
          <p className="eyebrow">Default conversation / permissioned intelligence</p>
          <h2 className="mt-3 text-3xl">Razul Central Intelligence</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            RA'SUL is OMNI Mothership's central cross-project intelligence. OMNI remains the scoped
            job coordinator; Oracle and specialists retain their roles. Guardian protects. Resident
            watcher and research-worker coordination remains proposed, not live execution.
          </p>
        </div>
        <Button asChild variant="cosmic">
          <Link to="/omni" search={{ world: worldId }}>
            Talk to Razul
            <ArrowUpRight size={14} />
          </Link>
        </Button>
      </section>
      <div className="my-6 flex flex-wrap items-center justify-between gap-4">
        <label className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Layers size={16} className="text-gold" />
          Selected world
          <select
            aria-label="OmniBridge world"
            className="exchange-select max-w-full"
            value={worldId}
            onChange={(e) => setWorldId(e.target.value)}
          >
            {nexusProjects.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · DEMO
              </option>
            ))}
          </select>
        </label>
        <Button asChild variant="ghost" size="sm">
          <Link to="/guardian">
            <Shield size={14} />
            Guardian / policy gates
            <ArrowUpRight size={12} />
          </Link>
        </Button>
      </div>
      <p className="mb-6 max-w-4xl text-xs leading-6 text-muted-foreground">
        {world?.context} OmniBridge records are separate from Nexus drafts; no existing code is
        merged or changed.
      </p>
      {(paused || issue) && (
        <p
          role="status"
          className="mb-6 border-l border-warning px-4 py-3 text-xs leading-6 text-warning"
        >
          {paused
            ? "Guardian or Nexus local planning paused. New proposals and reviews blocked; withdrawal/export remain available. No remote acknowledgments. "
            : ""}
          {issue}
        </p>
      )}
      <p className="mb-6 max-w-3xl text-xs leading-6 text-gold-light">
        Compatibility-first enhancement, not a replacement IDE or mandatory subscription. Existing
        tools stay independent; approved API use may have separate costs.
      </p>
      <Tabs defaultValue="graph">
        <TabsList
          aria-label="OmniBridge views"
          className="mb-7 h-auto w-full flex-wrap justify-start gap-1 rounded-sm border border-border bg-background p-1 sm:w-auto"
        >
          <TabsTrigger value="graph" className="text-xs">
            <Network size={14} className="mr-2" />
            Capability graph
          </TabsTrigger>
          <TabsTrigger value="intent" className="text-xs">
            <GitBranch size={14} className="mr-2" />
            Intent plans
          </TabsTrigger>
          <TabsTrigger value="sdk" className="text-xs">
            <Braces size={14} className="mr-2" />
            Adapter SDK & gates
          </TabsTrigger>
          <TabsTrigger value="value" className="text-xs">
            Access & measured value
          </TabsTrigger>
        </TabsList>
        <TabsContent value="graph">
          <CapabilityGraph />
        </TabsContent>
        <TabsContent value="intent">
          {ready ? (
            <IntentPlanner
              key={worldId}
              store={store}
              worldId={worldId}
              ready={ready}
              paused={paused}
              dispatch={dispatch}
            />
          ) : (
            <p role="status">Loading local plans…</p>
          )}
        </TabsContent>
        <TabsContent value="sdk">
          <AdapterReference />
        </TabsContent>
        <TabsContent value="value">
          <CompatibilityValue />
        </TabsContent>
      </Tabs>
      <section className="mt-10 flex flex-wrap items-center justify-between gap-5 border-y border-gold/30 py-6">
        <div>
          <p className="eyebrow">Creative worlds / local DEMO</p>
          <h2 className="mt-3 text-2xl">Entertainment Galaxy</h2>
          <p className="mt-3 text-xs text-muted-foreground">
            Film · sound · AI video · camera metadata · virtual production · Media Code Crucible
          </p>
        </div>
        <Button asChild variant="signal">
          <Link to="/entertainment">
            Enter creative workspace
            <ArrowUpRight size={14} />
          </Link>
        </Button>
      </section>
      <nav
        aria-label="OmniBridge review destinations"
        className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6"
      >
        {(
          [
            { to: "/code-vault", label: "Version & signature gates" },
            { to: "/omni-legal", label: "Omni Legal · preparation" },
            { to: "/approval-ledger", label: "Approval Ledger" },
            { to: "/experiment-replay", label: "Oracle Replay" },
            { to: "/embassy", label: "Operator onboarding" },
          ] as const
        ).map((v) => (
          <Button key={v.to} asChild variant="ghost" size="sm">
            <Link to={v.to}>
              {v.label}
              <ArrowUpRight size={12} />
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}
