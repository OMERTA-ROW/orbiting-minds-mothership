import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import {
  adapterKinds,
  declareAdapter,
  discoverCapabilities,
  dispatchStages,
  issuePassport,
  loadModelGatewayStore,
  modelGatewayReadiness,
  OMNI_MODEL_GW_STORE_KEY,
  passportPermissions,
  recordDispatch,
  revokePassport,
  routeTask,
  type AdapterKind,
  type DispatchStage,
  type ModelGatewayStore,
  type PassportPermission,
} from "@/lib/omni-model-gateway";

const inputCls = "mt-1 w-full rounded border border-border bg-background p-2 text-sm";

export function OmniModelGateway() {
  const [store, setStore] = useState<ModelGatewayStore>(() =>
    loadModelGatewayStore(
      typeof window === "undefined" ? null : window.localStorage.getItem(OMNI_MODEL_GW_STORE_KEY),
    ),
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // adapter form
  const [aName, setAName] = useState("");
  const [aKind, setAKind] = useState<AdapterKind>("cloud-api");
  const [aEndpoint, setAEndpoint] = useState("");
  const [aModels, setAModels] = useState("");
  const [aCred, setACred] = useState("");

  // passport form
  const [pAgent, setPAgent] = useState("");
  const [pSpecialty, setPSpecialty] = useState("");
  const [pAdapter, setPAdapter] = useState("");
  const [pProject, setPProject] = useState("");
  const [pPerms, setPPerms] = useState<PassportPermission[]>([
    "inspect-own-project",
    "report-gaps",
  ]);
  const [pEndpoint, setPEndpoint] = useState("");
  const [pConfirmed, setPConfirmed] = useState(false);

  // dispatch form
  const [dPassport, setDPassport] = useState("");
  const [dStage, setDStage] = useState<DispatchStage>("inspect");
  const [dSummary, setDSummary] = useState("");

  useEffect(() => {
    window.localStorage.setItem(OMNI_MODEL_GW_STORE_KEY, JSON.stringify(store));
  }, [store]);

  const readiness = modelGatewayReadiness();
  const capabilities = discoverCapabilities(store.adapters);
  const togglePerm = (p: PassportPermission) =>
    setPPerms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  function saveAdapter(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const adapter = declareAdapter(
        {
          name: aName,
          kind: aKind,
          endpoint: aEndpoint,
          models: aModels.split(/[\s,]+/).filter(Boolean),
          credentialName: aCred || undefined,
        },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, adapters: [...s.adapters, adapter] }));
      setAName("");
      setAEndpoint("");
      setAModels("");
      setACred("");
      setStatus(`Adapter declared (${adapter.status}); no live probe has run.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adapter was not accepted.");
    }
  }

  function savePassport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const passport = issuePassport(
        {
          agentName: pAgent,
          specialty: pSpecialty,
          adapterId: pAdapter,
          projectId: pProject,
          permissions: pPerms,
          endpoint: pEndpoint,
          ownerConfirmed: pConfirmed,
        },
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, passports: [...s.passports, passport] }));
      setPAgent("");
      setPSpecialty("");
      setPProject("");
      setPEndpoint("");
      setPConfirmed(false);
      setStatus(`Passport issued for ${passport.agentName}; health unknown until a real probe.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passport was not accepted.");
    }
  }

  function planRoute(passportId: string, permission: PassportPermission) {
    const passport = store.passports.find((p) => p.id === passportId);
    if (!passport) return;
    const adapter = store.adapters.find((a) => a.id === passport.adapterId);
    const decision = routeTask(
      passport,
      adapter,
      permission,
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    setStore((s) => ({ ...s, routes: [...s.routes, decision] }));
    setStatus(`Route ${decision.kind}: ${decision.reason}`);
  }

  function saveDispatch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const passport = store.passports.find((p) => p.id === dPassport);
      const rec = recordDispatch(
        { passportId: dPassport, stage: dStage, summary: dSummary },
        passport,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      setStore((s) => ({ ...s, dispatches: [...s.dispatches, rec] }));
      setDSummary("");
      setStatus("Dispatch-loop step recorded (simulated until the runner exists).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Record was not accepted.");
    }
  }

  function revoke(id: string) {
    const at = new Date().toISOString();
    setStore((s) => ({
      ...s,
      passports: s.passports.map((p) => (p.id === id ? revokePassport(p, at) : p)),
    }));
    setStatus("Passport revoked; permissions withdrawn.");
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Private · owner accounts only</p>
          <h1 className="mt-3 text-4xl">OMNI Model Gateway</h1>
        </div>
        <DemoBadge label="DECLARATIONS · NO MODEL CONNECTED" />
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
        A model-agnostic gateway — open doors for all AI models, starting with your own custom
        agents. Adapters, passports and routing are declarations and plans only: no provider
        credential, model endpoint or runner is connected, and nothing here claims otherwise.
      </p>

      <section aria-label="Real vs simulated" className="mt-8 rounded border border-gold/30 p-5">
        <h2 className="text-xl">Real vs simulated</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm text-gold">Real (working locally)</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {readiness.real.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm text-warning">Simulated (not connected)</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {readiness.simulated.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
        <h3 className="mt-4 text-sm">Credential prerequisites</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {readiness.credentialPrerequisites.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm">End-to-end acceptance test</h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{readiness.acceptanceTest}</p>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section aria-label="Provider adapters">
          <h2 className="text-2xl">Provider adapters</h2>
          <form onSubmit={saveAdapter} className="mt-4 space-y-3">
            <label className="block text-xs">
              Adapter name
              <input
                aria-label="Adapter name"
                value={aName}
                onChange={(e) => setAName(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Kind
              <select
                aria-label="Adapter kind"
                value={aKind}
                onChange={(e) => setAKind(e.target.value as AdapterKind)}
                className={inputCls}
              >
                {adapterKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Endpoint
              <input
                aria-label="Adapter endpoint"
                value={aEndpoint}
                onChange={(e) => setAEndpoint(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Models (space or comma separated)
              <input
                aria-label="Adapter models"
                value={aModels}
                onChange={(e) => setAModels(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Credential name (from Project Settings → Secrets; cloud APIs without one are marked
              credential-missing)
              <input
                aria-label="Credential name"
                value={aCred}
                onChange={(e) => setACred(e.target.value)}
                className={inputCls}
              />
            </label>
            <Button size="sm" type="submit">
              Declare adapter
            </Button>
          </form>
          <ul className="mt-4 space-y-2 text-xs">
            {capabilities.map((c) => (
              <li key={c.adapter} className="rounded border border-border p-3">
                <strong>{c.adapter}</strong> · {c.kind} · {c.status} · models: {c.models.join(", ")}
                <p className="mt-1 text-muted-foreground">{c.note}</p>
              </li>
            ))}
            {capabilities.length === 0 && (
              <li className="text-muted-foreground">No adapters declared.</li>
            )}
          </ul>
        </section>

        <section aria-label="Agent passports">
          <h2 className="text-2xl">Agent passports</h2>
          <form onSubmit={savePassport} className="mt-4 space-y-3">
            <label className="block text-xs">
              Agent name
              <input
                aria-label="Passport agent name"
                value={pAgent}
                onChange={(e) => setPAgent(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Specialty
              <input
                aria-label="Passport specialty"
                value={pSpecialty}
                onChange={(e) => setPSpecialty(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Adapter
              <select
                aria-label="Passport adapter"
                value={pAdapter}
                onChange={(e) => setPAdapter(e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {store.adapters.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Project ID (UUID)
              <input
                aria-label="Passport project ID"
                value={pProject}
                onChange={(e) => setPProject(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block text-xs">
              Endpoint
              <input
                aria-label="Passport endpoint"
                value={pEndpoint}
                onChange={(e) => setPEndpoint(e.target.value)}
                className={inputCls}
              />
            </label>
            <fieldset className="text-xs">
              <legend>Permissions</legend>
              {passportPermissions.map((p) => (
                <label key={p} className="mr-3 inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={pPerms.includes(p)}
                    onChange={() => togglePerm(p)}
                  />{" "}
                  {p}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={pConfirmed}
                onChange={(e) => setPConfirmed(e.target.checked)}
              />
              I am the owner and confirm this passport
            </label>
            <Button size="sm" type="submit">
              Issue passport
            </Button>
          </form>
          <ul className="mt-4 space-y-2 text-xs">
            {store.passports.map((p) => (
              <li key={p.id} className="rounded border border-border p-3">
                <p>
                  <strong>{p.agentName}</strong> · {p.specialty} · health: {p.health} ·{" "}
                  {p.revoked ? (
                    <span className="text-destructive">revoked</span>
                  ) : (
                    "active declaration"
                  )}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Permissions: {p.permissions.join(", ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => planRoute(p.id, "inspect-own-project")}
                  >
                    Plan inspection route
                  </Button>
                  {!p.revoked && (
                    <Button variant="outline" size="sm" onClick={() => revoke(p.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {store.passports.length === 0 && (
              <li className="text-muted-foreground">No passports issued.</li>
            )}
          </ul>
        </section>
      </div>

      <section aria-label="Jackboy dispatch loop" className="mt-10">
        <h2 className="text-2xl">Jackboy dispatch loop</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-muted-foreground">
          Project-assigned agents inspect their own project within approved scopes and report gaps
          to Jackboy; Jackboy dispatches coding and tests through OMNI and reports outcomes. Every
          record is simulated until the runner and backend exist. JAX runs as a separately enrolled
          agent with its own approved broker workflow — never Honeycomb Vault secrets, never
          external data submission without explicit consent.
        </p>
        <form onSubmit={saveDispatch} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-xs">
            Agent passport
            <select
              aria-label="Dispatch passport"
              value={dPassport}
              onChange={(e) => setDPassport(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {store.passports
                .filter((p) => !p.revoked)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.agentName}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs">
            Stage
            <select
              aria-label="Dispatch stage"
              value={dStage}
              onChange={(e) => setDStage(e.target.value as DispatchStage)}
              className={inputCls}
            >
              {dispatchStages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Summary
            <input
              aria-label="Dispatch summary"
              value={dSummary}
              onChange={(e) => setDSummary(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="md:col-span-3">
            <Button size="sm" type="submit">
              Record step
            </Button>
          </div>
        </form>
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {store.dispatches.map((d) => (
            <li key={d.id}>
              {d.at.slice(0, 19)} · {d.stage} · {d.summary} · simulated
            </li>
          ))}
        </ul>
        {store.routes.length > 0 && (
          <>
            <h3 className="mt-6 text-sm">Routing decisions</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {store.routes.map((r) => (
                <li key={r.id}>
                  {r.at.slice(0, 19)} · {r.kind} · {r.reason}
                </li>
              ))}
            </ul>
          </>
        )}
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
