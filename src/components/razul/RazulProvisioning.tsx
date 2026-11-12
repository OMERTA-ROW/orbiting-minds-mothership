import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  addKnowledge,
  decideProvisioning,
  deleteKnowledge,
  proposeManifest,
  readProvisioning,
  searchKnowledge,
} from "@/lib/razul-provisioning.functions";
import {
  AGENT_TOOLS,
  MANIFEST_CONTRACT,
  PROVIDERS,
  ROLLOUT_STAGES,
  applyProposal,
  lintManifest,
  namespaceFor,
  rollbackRecommended,
  type AgentTool,
  type Proposal,
  type ProposalAction,
  type RetrievalHit,
} from "@/lib/razul-provisioning";

type Snap = Awaited<ReturnType<typeof readProvisioning>>;
type Row = Snap["proposals"][number];

/** What exists today versus what is only specified. Kept literal so the screen never overstates. */
const PIPELINE: { step: string; state: "Built" | "Specified" }[] = [
  { step: "Per-app agent manifest (identity, purpose, tools, model, knowledge, memory, version, budgets)", state: "Built" },
  { step: "Static checks: forbidden tools, $1/$5/$10 caps, own namespace, setting names only", state: "Built" },
  { step: "Update proposals with escalation list you must acknowledge", state: "Built" },
  { step: "Per-agent knowledge with sources, digests and your add/delete/search", state: "Built" },
  { step: "Integration health (settings by name, sandbox, knowledge, provider)", state: "Built" },
  { step: "Staged rollout 10 → 50 → 100 % and rollback rules", state: "Built" },
  { step: "Append-only provisioning history", state: "Built" },
  { step: "Sandbox evaluations on the OMNI cloud sandbox (signed results)", state: "Specified" },
  { step: "Agent runtime that loads the active manifest, knowledge and memory", state: "Specified" },
  { step: "Razul drafting proposals by itself", state: "Specified" },
];

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function RazulProvisioning() {
  const read = useServerFn(readProvisioning);
  const propose = useServerFn(proposeManifest);
  const decide = useServerFn(decideProvisioning);
  const add = useServerFn(addKnowledge);
  const remove = useServerFn(deleteKnowledge);
  const search = useServerFn(searchKnowledge);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (message = "") => {
    setBusy(true);
    try {
      setSnap(await read());
      setNotice(message);
    } catch (e) {
      setSnap(null);
      setNotice(e instanceof Error ? e.message : "Owner access could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Razul intelligence provisioning" className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">Intelligence provisioning</h2>
          <p className="text-xs text-muted-foreground">
            Razul proposes which specialist agent each app Jackboy builds should get. Proposals never
            grant tools, add settings or change a running agent; you approve every step.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
          {busy ? "Checking…" : snap ? "Refresh" : "Open (owner)"}
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
      <ul className="grid gap-1 sm:grid-cols-2">
        {PIPELINE.map((p) => (
          <li key={p.step} className="flex gap-2 text-xs">
            {p.state === "Built" ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <CircleSlash size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span>
              <b>{p.state}</b> · {p.step}
            </span>
          </li>
        ))}
      </ul>
      {snap && (
        <>
          <Status snap={snap} />
          <ManifestForm
            onSubmit={async (manifest, note) => {
              const r = await propose({ data: { manifest, note } });
              if (!r.ok) return r.problems;
              await load("Proposal saved. It waits for a sandbox evaluation; nothing changed.");
              return [];
            }}
          />
          <Proposals
            snap={snap}
            onDecide={async (proposalId, action, stage, acknowledge) => {
              const r = await decide({ data: { proposalId, action, stage, acknowledge } });
              if (!r.ok) setNotice(r.message);
              else await load(`Recorded: ${action}.`);
            }}
          />
          <Knowledge
            snap={snap}
            onAdd={async (data) => {
              const r = await add({ data });
              if (!r.ok) return r.message;
              await load("Document saved to that agent's knowledge only.");
              return null;
            }}
            onDelete={async (id) => {
              const r = await remove({ data: { id } });
              if (!r.ok) setNotice(r.message);
              else await load("Document deleted.");
            }}
            onSearch={async (namespace, query) => {
              const r = await search({ data: { namespace, query } });
              return r.ok ? r.hits : [];
            }}
          />
          <History snap={snap} />
        </>
      )}
    </section>
  );
}

function Status({ snap }: { snap: Snap }) {
  return (
    <div className="rounded border border-border p-3 text-xs">
      <p>
        Cloud sandbox for evaluations:{" "}
        <b>{snap.sandbox.selfTestPassed ? "self-test passed (24 h)" : snap.sandbox.configured ? "set up, self-test not passed" : "not set up"}</b>
        {" · "}Sandbox evaluator: <b>not connected</b> · Agent runtime: <b>not connected</b> · Razul auto-proposals: <b>off</b>
      </p>
      <p className="mt-1 text-muted-foreground">
        Approval stays refused until a signed sandbox evaluation of the exact manifest passes. No
        continuous or automatic updates. Emergency Stop blocks widening and promotion; rollback always works.
      </p>
    </div>
  );
}

function ManifestForm({ onSubmit }: { onSubmit: (m: unknown, note: string) => Promise<string[]> }) {
  const [f, setF] = useState({
    appId: "",
    agentId: "",
    version: "1.0.0",
    name: "",
    purpose: "",
    tools: ["knowledge.search"] as string[],
    provider: "none" as (typeof PROVIDERS)[number],
    model: "",
    temperature: "0.2",
    maxOutputTokens: "1024",
    retentionDays: "30",
    task: "0",
    day: "0",
    total: "0",
    settings: "",
    note: "",
  });
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const cents = (v: string) => Math.round(Number(v) * 100);
  const manifest = useMemo(
    () => ({
      contract: MANIFEST_CONTRACT,
      appId: f.appId.trim(),
      agentId: f.agentId.trim(),
      version: f.version.trim(),
      identity: { name: f.name.trim(), purpose: f.purpose.trim() },
      tools: f.tools,
      model: {
        provider: f.provider,
        model: f.provider === "none" ? null : f.model.trim(),
        temperature: Number(f.temperature),
        maxOutputTokens: Number(f.maxOutputTokens),
      },
      knowledgeNamespace: namespaceFor(f.appId.trim(), f.agentId.trim()),
      memory: { scope: "agent", ownerManaged: true, retentionDays: Number(f.retentionDays) },
      budgets: { taskCents: cents(f.task), dayCents: cents(f.day), totalCents: cents(f.total) },
      requiredSettings: f.settings.split(/[,\s]+/).filter(Boolean),
    }),
    [f],
  );
  const lint = lintManifest(manifest);
  const field = (id: keyof typeof f, label: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`rp-${id}`}>{label}</Label>
      <Input id={`rp-${id}`} value={f[id] as string} onChange={set(id)} {...extra} />
    </div>
  );
  return (
    <details className="rounded border border-border p-3">
      <summary className="cursor-pointer font-medium">Propose an agent manifest</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setProblems(await onSubmit(manifest, f.note));
          setSaving(false);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {field("appId", "App ID (from Jackboy)", { placeholder: "lowercase-with-dashes" })}
          {field("agentId", "Agent ID", { placeholder: "support" })}
          {field("version", "Version")}
          {field("name", "Agent name")}
        </div>
        <div className="space-y-1">
          <Label htmlFor="rp-purpose">Purpose</Label>
          <Textarea id="rp-purpose" value={f.purpose} onChange={set("purpose")} maxLength={500} />
        </div>
        <fieldset className="space-y-1">
          <legend className="font-medium">Tools it asks for (you grant them by approving)</legend>
          {(Object.keys(AGENT_TOOLS) as AgentTool[]).map((t) => (
            <label key={t} className="flex gap-2 text-xs">
              <input
                type="checkbox"
                checked={f.tools.includes(t)}
                onChange={(e) =>
                  setF({ ...f, tools: e.target.checked ? [...f.tools, t] : f.tools.filter((x) => x !== t) })
                }
              />
              <span>
                <b>{t}</b> — {AGENT_TOOLS[t]}
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Shell, deploy, merge, secrets and permission tools can never be requested.</p>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="rp-provider">Model provider</Label>
            <select
              id="rp-provider"
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={f.provider}
              onChange={set("provider")}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {f.provider !== "none" && field("model", "Model")}
          {field("temperature", "Temperature (0–1)", { inputMode: "decimal" })}
          {field("maxOutputTokens", "Max reply tokens", { inputMode: "numeric" })}
          {field("retentionDays", "Memory kept (days)", { inputMode: "numeric" })}
          {field("task", "Budget per task ($, ≤1)", { inputMode: "decimal" })}
          {field("day", "Budget per day ($, ≤5)", { inputMode: "decimal" })}
          {field("total", "Total budget ($, ≤10)", { inputMode: "decimal" })}
        </div>
        {field("settings", "Settings it needs — names only, e.g. SHOP_API_URL (you add values yourself)")}
        {field("note", "Note (optional)")}
        <p className="text-xs text-muted-foreground">
          Knowledge namespace: <code>{manifest.knowledgeNamespace}</code> · Memory: this agent only, managed by you.
        </p>
        {[...lint.problems, ...problems].length > 0 && (
          <ul role="alert" className="space-y-1 text-xs text-destructive">
            {[...new Set([...lint.problems, ...problems])].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <Button type="submit" size="sm" disabled={saving || lint.problems.length > 0}>
          {saving ? "Saving…" : "Save proposal"}
        </Button>
      </form>
    </details>
  );
}

function toModel(row: Row, snap: Snap): Proposal {
  const m = snap.manifests.find((x) => x.id === row.manifest_id);
  return {
    status: row.status as Proposal["status"],
    manifestSha256: m?.manifest_sha256 ?? "",
    evaluations: snap.evaluations
      .filter((e) => e.proposal_id === row.id && (e.kind !== "sandbox" || e.proof_verified))
      .map((e) => ({ kind: e.kind as "static" | "sandbox", passed: e.passed, manifestSha256: e.manifest_sha256, ranAt: Date.parse(e.ran_at) })),
    stage: row.stage as Proposal["stage"],
    stageHealthy: row.stage_healthy,
  };
}

function Proposals({
  snap,
  onDecide,
}: {
  snap: Snap;
  onDecide: (id: string, action: ProposalAction["type"] & string, stage: 10 | 50 | 100 | null, ack: boolean) => Promise<void>;
}) {
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const mfaFresh = snap.mfaAgeSeconds !== null && snap.mfaAgeSeconds <= 900;
  if (!snap.proposals.length) return <p className="text-xs text-muted-foreground">No proposals yet.</p>;
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Proposals</h3>
      {!mfaFresh && (
        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldAlert size={14} aria-hidden /> Approving, widening and promoting need a two-step code from the last 15 minutes. Sign out and in again to refresh it.
        </p>
      )}
      {snap.proposals.map((row) => {
        const m = snap.manifests.find((x) => x.id === row.manifest_id);
        const model = toModel(row, snap);
        const nextStage = model.stage === null ? 10 : ROLLOUT_STAGES[ROLLOUT_STAGES.indexOf(model.stage) + 1] ?? null;
        const escalations = (row.escalations as string[]) ?? [];
        const why = (a: ProposalAction) => {
          const r = applyProposal(model, a, snap.now);
          return typeof r === "string" ? r : null;
        };
        const actions: { label: string; action: "approve" | "reject" | "withdraw" | "stage" | "promote" | "rollback"; stage?: 10 | 50 | 100; reason: string | null }[] = [
          { label: "Approve", action: "approve", reason: why({ type: "approve", by: "owner", mfaFresh }) ?? (escalations.length && !ack[row.id] ? "Acknowledge the changes first." : null) },
          ...(nextStage ? [{ label: `Roll out to ${nextStage}%`, action: "stage" as const, stage: nextStage, reason: why({ type: "stage", to: nextStage, by: "owner" }) ?? (mfaFresh ? null : "Needs a fresh two-step code.") }] : []),
          { label: "Promote", action: "promote", reason: why({ type: "promote", by: "owner" }) ?? (mfaFresh ? null : "Needs a fresh two-step code.") },
          { label: "Roll back", action: "rollback", reason: why({ type: "rollback" }) },
          { label: "Withdraw", action: "withdraw", reason: why({ type: "withdraw" }) },
          { label: "Reject", action: "reject", reason: why({ type: "reject" }) },
        ];
        const health = snap.health[row.manifest_id] ?? [];
        return (
          <article key={row.id} className="space-y-2 rounded border border-border p-3 text-xs">
            <p className="text-sm">
              <b>{row.app_id}/{row.agent_id}</b> v{m?.version} · <b>{row.status.replace("_", " ")}</b>
              {row.stage ? ` · ${row.stage}%${row.stage_healthy === null ? " (checking)" : row.stage_healthy ? " healthy" : " unhealthy"}` : ""}
              {" · "}by {row.proposed_by}
            </p>
            {rollbackRecommended(model) && <p role="alert" className="text-destructive">This stage failed its health check. Roll back.</p>}
            {m && (
              <p className="text-muted-foreground">
                Tools: {((m.manifest as { tools?: string[] }).tools ?? []).join(", ") || "none"} · Budget{" "}
                {usd((m.manifest as { budgets: { taskCents: number } }).budgets.taskCents)}/task · digest {m.manifest_sha256.slice(0, 12)}…
              </p>
            )}
            {escalations.length > 0 && (
              <div>
                <p className="font-medium">Widens what the agent can do or spend:</p>
                <ul className="list-disc pl-5">
                  {escalations.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                {row.status === "evaluated" && (
                  <label className="mt-1 flex gap-2">
                    <input type="checkbox" checked={Boolean(ack[row.id])} onChange={(e) => setAck({ ...ack, [row.id]: e.target.checked })} />
                    I reviewed each item above.
                  </label>
                )}
              </div>
            )}
            <p>
              Evaluations:{" "}
              {model.evaluations.length
                ? model.evaluations.map((e) => `${e.kind} ${e.passed ? "passed" : "failed"}`).join(" · ")
                : "none"}
              {!model.evaluations.some((e) => e.kind === "sandbox") && " · sandbox: not run (no evaluator connected)"}
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {health.map((h) => (
                <li key={h.id} className="flex gap-2">
                  {h.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden /> : <CircleSlash size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span>
                    {h.label}: {h.detail}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {actions
                .filter((a) => a.reason === null || ["approve", "stage", "promote"].includes(a.action))
                .map((a) => (
                  <Button
                    key={a.label}
                    size="sm"
                    variant={a.action === "rollback" || a.action === "reject" ? "destructive" : "outline"}
                    disabled={a.reason !== null}
                    title={a.reason ?? undefined}
                    onClick={() => void onDecide(row.id, a.action, a.stage ?? null, Boolean(ack[row.id]))}
                  >
                    {a.label}
                  </Button>
                ))}
            </div>
            {actions.find((a) => a.action === "approve")?.reason && row.status !== "rejected" && row.status !== "withdrawn" && row.status !== "promoted" && row.status !== "rolled_back" && row.status !== "staged" && row.status !== "approved" && (
              <p className="text-muted-foreground">Approve is waiting: {actions.find((a) => a.action === "approve")!.reason}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Knowledge({
  snap,
  onAdd,
  onDelete,
  onSearch,
}: {
  snap: Snap;
  onAdd: (d: { namespace: string; title: string; body: string; sourceKind: "owner_upload" | "official_url" | "owner_typed"; sourceRef: string; retrievedAt: string }) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
  onSearch: (namespace: string, query: string) => Promise<RetrievalHit[]>;
}) {
  const namespaces = [...new Set(snap.manifests.map((m) => namespaceFor(m.app_id, m.agent_id)))];
  const [ns, setNs] = useState(namespaces[0] ?? "");
  const [doc, setDoc] = useState({ title: "", body: "", sourceKind: "official_url" as const, sourceRef: "", retrievedAt: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RetrievalHit[] | null>(null);
  if (!namespaces.length) return <p className="text-xs text-muted-foreground">Knowledge: propose an agent first; each agent gets its own namespace.</p>;
  const docs = snap.docs.filter((d) => d.namespace === ns);
  return (
    <details className="rounded border border-border p-3">
      <summary className="cursor-pointer font-medium">Agent knowledge ({snap.docs.length} documents)</summary>
      <div className="mt-3 space-y-3 text-xs">
        <div className="space-y-1">
          <Label htmlFor="rk-ns">Agent namespace</Label>
          <select id="rk-ns" className="h-9 w-full rounded-md border border-input bg-background px-2" value={ns} onChange={(e) => { setNs(e.target.value); setHits(null); }}>
            {namespaces.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <p className="text-muted-foreground">Only this agent's documents are searched. Nothing here is read by a running agent yet.</p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setHits(await onSearch(ns, query));
          }}
        >
          <Input aria-label="Search this agent's knowledge" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          <Button size="sm" variant="outline" type="submit" disabled={!query.trim()}>Search</Button>
        </form>
        {hits && (
          <ul className="space-y-1">
            {hits.length ? hits.map((h) => (
              <li key={h.id}>
                <b>{h.title}</b> — {h.excerpt} <span className="text-muted-foreground">(source: {h.source.kind} {h.source.ref}, {new Date(h.source.retrievedAt).toISOString().slice(0, 10)}, sha256 {h.source.sha256.slice(0, 10)}…)</span>
              </li>
            )) : <li>No matches in this namespace.</li>}
          </ul>
        )}
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{d.title}</b> · {d.source_kind} · {d.source_ref} · retrieved {d.retrieved_at.slice(0, 10)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void onDelete(d.id)}>Delete</Button>
            </li>
          ))}
        </ul>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await onAdd({ namespace: ns, ...doc, retrievedAt: new Date(doc.retrievedAt).toISOString() });
            setError(r);
            if (!r) setDoc({ ...doc, title: "", body: "", sourceRef: "" });
          }}
        >
          <p className="font-medium">Add a document</p>
          <Input aria-label="Title" placeholder="Title" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
          <Textarea aria-label="Text" placeholder="Paste the text the agent may use" value={doc.body} onChange={(e) => setDoc({ ...doc, body: e.target.value })} maxLength={20000} />
          <div className="grid gap-2 sm:grid-cols-3">
            <select aria-label="Source type" className="h-9 rounded-md border border-input bg-background px-2" value={doc.sourceKind} onChange={(e) => setDoc({ ...doc, sourceKind: e.target.value as typeof doc.sourceKind })}>
              <option value="official_url">Official web page</option>
              <option value="owner_upload">My file</option>
              <option value="owner_typed">Typed by me</option>
            </select>
            <Input aria-label="Source (link or file name)" placeholder="Source link or file name" value={doc.sourceRef} onChange={(e) => setDoc({ ...doc, sourceRef: e.target.value })} />
            <Input aria-label="Retrieved on" type="date" value={doc.retrievedAt} onChange={(e) => setDoc({ ...doc, retrievedAt: e.target.value })} />
          </div>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <Button size="sm" type="submit" disabled={!doc.title.trim() || !doc.body.trim() || !doc.sourceRef.trim()}>Save document</Button>
        </form>
      </div>
    </details>
  );
}

function History({ snap }: { snap: Snap }) {
  return (
    <details className="rounded border border-border p-3">
      <summary className="cursor-pointer font-medium">Provisioning history ({snap.events.length})</summary>
      <ul className="mt-2 space-y-1 text-xs">
        {snap.events.length ? snap.events.map((e) => (
          <li key={e.id}>
            {e.at.slice(0, 19).replace("T", " ")} · {e.actor} · {e.event.replace(/_/g, " ")}
            {e.app_id ? ` · ${e.app_id}/${e.agent_id}` : ""}
          </li>
        )) : <li>Nothing recorded yet.</li>}
      </ul>
    </details>
  );
}
