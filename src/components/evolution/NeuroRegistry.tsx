import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Plus, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { neuroRegistryQuery } from "@/lib/neuro-query";
import {
  emptyNeuroProfile,
  NEURO_FIELDS,
  neuroDestination,
  neuroProfile,
  type NeuroProfile,
} from "@/lib/neuro";
import {
  changeNeuroProfile,
  registerNeuroComponent,
  registerNeuroEcosystem,
} from "@/lib/neuro.functions";

const labels: Record<keyof NeuroProfile, string> = {
  knowledge: "Knowledge scope",
  reasoning: "Reasoning boundaries",
  memory: "Memory boundaries",
  learning: "Learning policy",
  evaluations: "Evaluations",
  version: "Version",
  evidence: "Evidence & source references",
};

export function NeuroRegistry() {
  const { data } = useSuspenseQuery(neuroRegistryQuery);
  const cache = useQueryClient();
  const register = useServerFn(registerNeuroEcosystem);
  const add = useServerFn(registerNeuroComponent);
  const change = useServerFn(changeNeuroProfile);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  async function act(work: () => Promise<string>) {
    setBusy(true);
    setNotice("");
    try {
      setNotice(await work());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action refused. Nothing was connected.");
    } finally {
      await cache.invalidateQueries({ queryKey: neuroRegistryQuery.queryKey });
      setBusy(false);
    }
  }
  const c = data.ok ? (data.components.find((r) => r.id === selected) ?? data.components[0]) : null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:px-10">
      <header className="mb-7 border-b border-border pb-6">
        <p className="text-xs uppercase text-gold-light">Evolution / Owner workspace</p>
        <h1 className="mt-3 flex items-center gap-3 font-display text-3xl">
          <BrainCircuit className="shrink-0 text-gold-light" aria-hidden /> Neuro Intelligence
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Private component registry · Autonomy off · No Neuro adapters connected
        </p>
      </header>
      {notice && (
        <p role="status" className="mb-5 break-words border-l-2 border-primary pl-4 text-sm">
          {notice}
        </p>
      )}
      {!data.ok ? (
        <div className="border-y border-border py-8">
          <h2 className="text-xl">Owner workspace unavailable</h2>
          <p className="my-4 text-sm text-muted-foreground">{data.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/account-security">Account Security</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void cache.invalidateQueries({ queryKey: neuroRegistryQuery.queryKey })
              }
            >
              <RefreshCw size={15} /> Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const r = await register();
                  return `${r.count} pathways registered. Existing profiles preserved; no integrations enabled.`;
                })
              }
            >
              <Plus size={15} /> Register ecosystem
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => setAdding(!adding)}>
              <Plus size={15} /> Add component
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void act(async () => "Private records refreshed.")}
            >
              <RefreshCw size={15} /> Refresh
            </Button>
            <Button asChild variant="outline">
              <Link to="/omni-razul">Razul Observatory</Link>
            </Button>
          </div>
          {adding && (
            <form
              className="mt-5 flex flex-wrap items-end gap-3 border-y border-border py-5"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const r = await add({ data: { key, name } });
                  setSelected(r.id);
                  setAdding(false);
                  setName("");
                  setKey("");
                  return "Component registered. No connection or permissions granted.";
                });
              }}
            >
              <label className="min-w-0 text-sm">
                Name
                <Input
                  value={name}
                  maxLength={120}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="min-w-0 text-sm">
                Pathway key
                <Input
                  value={key}
                  required
                  pattern="[a-z0-9][a-z0-9-]{0,79}"
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy}>
                <Plus size={15} /> Register
              </Button>
            </form>
          )}
          <div className="mt-7 border-y border-border py-4 text-sm text-muted-foreground">
            <p>
              PR #1 foundation: access blocked by OMERTA-ROW’s GitHub organization restrictions. No
              foundation code has been installed.
            </p>
            <p className="mt-2">
              Razul permissions remain separate. Reviews here are owner-recorded evidence, not agent
              activity or permission grants. No memories are read, no learning is run, and
              user-directed work is unchanged.
            </p>
          </div>
          {!c ? (
            <p className="py-10 text-muted-foreground">No components registered yet.</p>
          ) : (
            <div className="mt-7 grid min-w-0 gap-7 md:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="min-w-0">
                <label className="text-sm" htmlFor="neuro-component">
                  Neuropathway
                </label>
                <select
                  id="neuro-component"
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={c.id}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.components.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-4 break-words font-mono text-xs text-muted-foreground">
                  {c.pathway_key}
                </p>
                <p className="mt-3 text-sm">Not connected to Neuro</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.components.length} registered components · up to 600 shown
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Active revision: {c.active_revision || "none"}
                </p>
                {(() => {
                  const d = neuroDestination(c.pathway_key);
                  return d ? (
                    <Button asChild className="mt-5" variant="outline">
                      <Link to={d.to}>{d.label}</Link>
                    </Button>
                  ) : (
                    <p className="mt-5 text-sm text-muted-foreground">
                      No verified destination linked.
                    </p>
                  );
                })()}
              </aside>
              <ProfileEditor
                key={`${c.id}-${c.active_revision}`}
                component={c}
                revisions={data.revisions.filter((r) => r.component_id === c.id)}
                reviews={data.reviews.filter((r) => r.component_id === c.id)}
                busy={busy}
                onAction={(payload) =>
                  void act(async () => {
                    const r = await change({ data: payload });
                    return `Revision ${r.revision}: ${payload.action === "propose" ? "proposal saved; inactive pending review" : payload.action === "scope_review" ? "integrity verified and owner scope review recorded" : payload.action === "approved" ? "profile approved; no integration enabled" : "previous approved profile restored; no external rollback performed"}.`;
                  })
                }
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

type RegistryData = Extract<
  Awaited<ReturnType<typeof import("@/lib/neuro.functions").readNeuroRegistry>>,
  { ok: true }
>;
function ProfileEditor({
  component,
  revisions,
  reviews,
  busy,
  onAction,
}: {
  component: RegistryData["components"][number];
  revisions: RegistryData["revisions"];
  reviews: RegistryData["reviews"];
  busy: boolean;
  onAction: (payload: import("zod").infer<typeof import("@/lib/neuro").neuroChangeInput>) => void;
}) {
  const active = revisions.find((r) => r.revision === component.active_revision);
  const parsed = neuroProfile.safeParse(active?.profile);
  const [draft, setDraft] = useState<NeuroProfile>(
    parsed.success ? parsed.data : { ...emptyNeuroProfile },
  );
  const [target, setTarget] = useState(0);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const chosen = revisions.find((r) => r.revision === target) ?? revisions[0];
  const reviewed = reviews.some(
    (r) => r.revision === chosen?.revision && r.action === "scope_review",
  );
  const approved = reviews.some(
    (r) => r.revision === chosen?.revision && (r.action === "approved" || r.action === "rollback"),
  );
  const stale = chosen?.base_revision !== component.active_revision;
  const ready = !busy && confirm && note.trim().length >= 10 && Boolean(chosen);
  function review(action: "scope_review" | "approved" | "rollback") {
    if (!chosen || !ready) return;
    onAction({
      action,
      componentId: component.id,
      expected: component.active_revision,
      target: chosen.revision,
      note,
      confirm: true,
    });
    setConfirm(false);
  }
  return (
    <div className="min-w-0">
      <h2 className="text-xl">{component.name}</h2>
      <h3 className="mt-6 text-base">Active profile</h3>
      {!active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {component.active_revision
            ? "Active profile is outside the recent history window; do not infer its contents."
            : "No approved profile yet."}
        </p>
      ) : (
        <dl className="mt-3 divide-y divide-border">
          {NEURO_FIELDS.map((f) => (
            <div key={f} className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-sm text-muted-foreground">{labels[f]}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm">
                {parsed.success ? parsed.data[f] || "Not recorded" : "Profile unavailable"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <form
        className="mt-8 border-t border-border pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          onAction({
            action: "propose",
            componentId: component.id,
            expected: component.active_revision,
            profile: draft,
          });
        }}
      >
        <h3 className="text-base">Propose profile update</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {NEURO_FIELDS.map((f) => (
            <label key={f} className={`min-w-0 text-sm ${f === "evidence" ? "sm:col-span-2" : ""}`}>
              {labels[f]}
              {f === "version" ? (
                <Input
                  className="mt-2 bg-background/70"
                  maxLength={80}
                  required
                  value={draft[f]}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                />
              ) : (
                <Textarea
                  className="mt-2 bg-background/70"
                  maxLength={2000}
                  value={draft[f]}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        <Button type="submit" className="mt-4" disabled={busy}>
          <Plus size={15} /> Save proposal
        </Button>
      </form>
      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-base">Scoped review & rollback</h3>
        {!chosen ? (
          <p className="mt-3 text-sm text-muted-foreground">No revisions to review.</p>
        ) : (
          <>
            <label className="mt-4 block text-sm">
              Revision
              <select
                className="mt-2 block w-full rounded-md border border-input bg-background px-3 py-2"
                value={chosen.revision}
                onChange={(e) => {
                  setTarget(Number(e.target.value));
                  setConfirm(false);
                }}
              >
                {revisions.map((r) => (
                  <option key={r.id} value={r.revision}>
                    Revision {r.revision}
                    {r.revision === component.active_revision ? " · active" : ""}
                  </option>
                ))}
              </select>
            </label>
            <dl className="mt-4 divide-y divide-border">
              {NEURO_FIELDS.map((f) => (
                <div key={f} className="py-2">
                  <dt className="text-xs text-muted-foreground">{labels[f]}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm">
                    {String((chosen.profile as Record<string, unknown>)[f] ?? "Not recorded") ||
                      "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
              SHA-256: {chosen.digest}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {reviewed ? "Owner scope review recorded" : "Owner scope review required"} ·{" "}
              {stale ? "Not based on current active revision" : "Based on current active revision"}
            </p>
            <label className="mt-4 block text-sm">
              Scope, evidence & decision reason
              <Textarea
                className="mt-2 bg-background/70"
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I reviewed this exact profile and its evidence. This changes registry metadata only.
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={!ready || stale}
                variant="outline"
                onClick={() => review("scope_review")}
              >
                <ShieldCheck size={15} /> Check integrity & record review
              </Button>
              <Button
                disabled={
                  !ready || stale || !reviewed || chosen.revision === component.active_revision
                }
                onClick={() => review("approved")}
              >
                Approve profile
              </Button>
              <Button
                disabled={!ready || !approved || chosen.revision === component.active_revision}
                variant="outline"
                onClick={() => review("rollback")}
              >
                <Undo2 size={15} /> Restore approved profile
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="mt-8 border-t border-border pt-6">
        <h3 className="text-base">Review history</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Up to 1,000 recent revisions and review events across the registry.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {reviews.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <p>
                {r.action.replaceAll("_", " ")} · revision {r.revision} ·{" "}
                {new Date(r.created_at).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{r.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
