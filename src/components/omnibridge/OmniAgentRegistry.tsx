import { useState } from "react";
import { useOmniLocalRecords } from "@/hooks/use-omni-local-records";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  agentCapabilities,
  agentCategories,
  agentRegistryReadiness,
  approvalBoundaries,
  fileReport,
  loadAgentRegistry,
  OMNI_AGENTS_STORE_KEY,
  pauseAgent,
  registerAgent,
  reportKinds,
  resumeAgent,
  type AgentCapability,
  type AgentCategory,
  type AgentRegistryStore,
  type ReportKind,
} from "@/lib/omni-agents";

const inputCls = "mt-1 w-full rounded border border-border bg-background p-2 text-sm";

const categoryLabels: Record<AgentCategory, string> = {
  angeltech: "AngelTech · constructive research, creation & quality",
  demontech: "DemonTech · authorized defensive security & risk testing",
  guardian: "Guardian · permissions & audit",
  "omni-core": "OMNI core · coordination & drafting",
};

export function OmniAgentRegistry() {
  const {
    records: store,
    setRecords: setStore,
    storageNotice,
  } = useOmniLocalRecords<AgentRegistryStore>({
    key: OMNI_AGENTS_STORE_KEY,
    initial: loadAgentRegistry(null),
    read: loadAgentRegistry,
    collections: ["agents", "reports"],
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // registration form
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AgentCategory>("angeltech");
  const [mission, setMission] = useState("");
  const [caps, setCaps] = useState<AgentCapability[]>(["drafting"]);
  const [projectIds, setProjectIds] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // report form
  const [repAgent, setRepAgent] = useState("");
  const [repKind, setRepKind] = useState<ReportKind>("task");
  const [repSummary, setRepSummary] = useState("");
  const [repTo, setRepTo] = useState("");
  const [repBoundary, setRepBoundary] = useState<string>("");

  const readiness = agentRegistryReadiness();
  const toggleCap = (c: AgentCapability) =>
    setCaps((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  function saveRegistration(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const ids = projectIds.split(/[\s,]+/).filter(Boolean);
      const agent = registerAgent(
        { name, category, mission, capabilities: caps, projectIds: ids, ownerConfirmed: confirmed },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, agents: [...s.agents, agent] }));
      setName("");
      setMission("");
      setProjectIds("");
      setConfirmed(false);
      setStatus(`Registered ${agent.name} as a declaration (not live).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration was not accepted.");
    }
  }

  function saveReport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const report = fileReport(
        {
          agentId: repAgent,
          kind: repKind,
          summary: repSummary,
          toAgentId: repTo || undefined,
          boundary: (repBoundary || undefined) as (typeof approvalBoundaries)[number] | undefined,
        },
        store.agents,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, reports: [...s.reports, report] }));
      setRepSummary("");
      setStatus("Report recorded; nothing was executed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report was not accepted.");
    }
  }

  function togglePause(id: string, paused: boolean) {
    const at = new Date().toISOString();
    setStore((s) => ({
      ...s,
      agents: s.agents.map((a) =>
        a.id === id ? (paused ? resumeAgent(a, at) : pauseAgent(a, at)) : a,
      ),
    }));
    setStatus(
      paused
        ? "Local agent declaration resumed. No agent is running."
        : "Local agent declaration paused. No live service was changed.",
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Private · owner accounts only</p>
          <h1 className="mt-3 text-4xl">OMNI Agent Registry</h1>
        </div>
        <DemoBadge label="CONCEPT · NO AGENT IS LIVE" />
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
        A registry and collaboration conventions for independent specialist agents across opted-in
        projects: AngelTech for constructive research, creation and quality; DemonTech for
        authorized defensive security and risk testing; Guardian for permissions and audit.
        Registrations are capability declarations only — no agent runs, and irreversible,
        high-impact, private-data or production actions always need owner approval.
      </p>
      {storageNotice && (
        <p role="status" className="mt-4 text-sm text-warning">
          {storageNotice}
        </p>
      )}

      <section aria-label="Registry readiness" className="mt-8 rounded border border-gold/30 p-5">
        <h2 className="text-xl">Integration readiness</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {readiness.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section aria-label="Register agent">
          <h2 className="text-2xl">Register an agent</h2>
          <form onSubmit={saveRegistration} className="mt-4 space-y-3">
            <label className="block text-xs">
              Agent name
              <input
                aria-label="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Category
              <select
                aria-label="Agent category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AgentCategory)}
                className={inputCls}
              >
                {agentCategories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Mission
              <textarea
                aria-label="Agent mission"
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </label>
            <fieldset className="text-xs">
              <legend>Declared capabilities</legend>
              {agentCapabilities.map((c) => (
                <label key={c} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={caps.includes(c)} onChange={() => toggleCap(c)} />{" "}
                  {c}
                </label>
              ))}
            </fieldset>
            <label className="block text-xs">
              Opted-in project IDs (UUIDs, space or comma separated)
              <input
                aria-label="Opted-in project IDs"
                value={projectIds}
                onChange={(e) => setProjectIds(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I am the owner and confirm this registration
            </label>
            <Button size="sm" type="submit">
              Register agent
            </Button>
          </form>
        </section>

        <section aria-label="Registered agents">
          <h2 className="text-2xl">Registered agents</h2>
          <ul className="mt-4 space-y-2 text-xs">
            {store.agents.map((a) => (
              <li key={a.id} className="rounded border border-border p-3">
                <p>
                  <strong>{a.name}</strong> · {categoryLabels[a.category]} ·{" "}
                  {a.paused ? <span className="text-warning">paused</span> : "active declaration"} ·
                  not live
                </p>
                <p className="mt-1 text-muted-foreground">
                  Capabilities: {a.capabilities.join(", ")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => togglePause(a.id, a.paused)}
                >
                  {a.paused ? "Resume" : "Pause"}
                </Button>
              </li>
            ))}
            {store.agents.length === 0 && (
              <li className="text-muted-foreground">No agents registered.</li>
            )}
          </ul>
        </section>
      </div>

      <section aria-label="Task and result reporting" className="mt-10">
        <h2 className="text-2xl">Task, result &amp; coordination reports</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
          Reports record intent or outcome between agents — they never execute anything. Reports
          touching an approval boundary are flagged for owner review.
        </p>
        <form onSubmit={saveReport} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-xs">
            Reporting agent
            <select
              aria-label="Reporting agent"
              value={repAgent}
              onChange={(e) => setRepAgent(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {store.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Kind
            <select
              aria-label="Report kind"
              value={repKind}
              onChange={(e) => setRepKind(e.target.value as ReportKind)}
              className={inputCls}
            >
              {reportKinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Coordinate with (optional)
            <select
              aria-label="Coordination target"
              value={repTo}
              onChange={(e) => setRepTo(e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {store.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Approval boundary (optional)
            <select
              aria-label="Approval boundary"
              value={repBoundary}
              onChange={(e) => setRepBoundary(e.target.value)}
              className={inputCls}
            >
              <option value="">None</option>
              {approvalBoundaries.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs md:col-span-2">
            Summary
            <textarea
              aria-label="Report summary"
              value={repSummary}
              onChange={(e) => setRepSummary(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </label>
          <div className="md:col-span-2">
            <Button size="sm" type="submit">
              File report
            </Button>
          </div>
        </form>
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {store.reports.map((r) => (
            <li key={r.id}>
              {r.at.slice(0, 19)} · {r.kind} · {r.summary}
              {r.boundary && (
                <span className="text-warning">
                  {" "}
                  · boundary: {r.boundary} — owner review required
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div aria-live="polite" className="mt-6">
        {status && (
          <p role="status" className="text-xs text-gold">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
