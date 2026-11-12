import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteAgentMemory,
  listAgentMemories,
  saveAgentMemory,
} from "@/lib/omni-memory.functions";
import {
  MEMORY_AGENTS,
  MEMORY_AGENT_LABEL,
  MEMORY_BACKEND,
  MEMORY_KINDS,
  MEMORY_KIND_LABEL,
  MEMORY_LIMITS,
  MEMORY_SOURCES,
  MEMORY_SOURCE_LABEL,
  memorySaveInput,
  type MemoryAgent,
  type MemoryKind,
  type MemoryRow,
  type MemorySource,
} from "@/lib/omni-memory";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60";
const empty = { kind: "note" as MemoryKind, title: "", body: "", sourceKind: "owner_typed" as MemorySource, sourceRef: "" };

/** Owner-controlled memory for one agent at a time. Nothing is shared with any agent yet. */
export function AgentMemory() {
  const list = useServerFn(listAgentMemories);
  const save = useServerFn(saveAgentMemory);
  const remove = useServerFn(deleteAgentMemory);
  const [agent, setAgent] = useState<MemoryAgent>("omni");
  const [rows, setRows] = useState<MemoryRow[] | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(
    async (which: MemoryAgent) => {
      setRows(null);
      try {
        const r = await list({ data: { agent: which } });
        if (!r.ok) {
          setNotice(r.message);
          setRows([]);
          return;
        }
        setRows(r.rows);
      } catch {
        setNotice("Memories could not be read. Refresh and retry.");
        setRows([]);
      }
    },
    [list],
  );

  useEffect(() => {
    setConfirmId(null);
    void load(agent);
  }, [agent, load]);

  async function onSave() {
    if (busy) return;
    const parsed = memorySaveInput.safeParse({ agent, ...form });
    if (!parsed.success) return setNotice(parsed.error.issues[0]?.message ?? "Check the entry.");
    setBusy(true);
    setNotice("Saving…");
    try {
      const r = await save({ data: parsed.data });
      if (!r.ok) return setNotice(r.message);
      setForm(empty);
      await load(agent);
      setNotice(`Saved to ${MEMORY_AGENT_LABEL[agent]} only.`);
    } catch {
      setNotice("Not confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await remove({ data: { agent, id } });
      if (!r.ok) return setNotice(r.message);
      setConfirmId(null);
      await load(agent);
      setNotice("Deleted. The text is gone; the history keeps only that a deletion happened.");
    } catch {
      setNotice("Not confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="agent-memory" className="space-y-4">
      <div className="space-y-1">
        <h2 id="agent-memory" className="flex items-center gap-2 text-sm font-medium">
          <Brain size={16} aria-hidden /> Agent memory
        </h2>
        <p role="note" className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
          Each agent has its own separate memory. Stored in {MEMORY_BACKEND.storedIn}. No agent, model,
          OMNI on Railway or Jackboy reads these yet — there is no outside memory service connected.
          You save, view and delete every entry yourself; saves, views and deletions are logged without
          their text.
        </p>
      </div>

      <label className="block max-w-xs space-y-1 text-sm">
        Agent
        <select
          className={selectClass}
          value={agent}
          disabled={busy}
          onChange={(e) => setAgent(e.target.value as MemoryAgent)}
        >
          {MEMORY_AGENTS.map((a) => (
            <option key={a} value={a}>
              {MEMORY_AGENT_LABEL[a]}
            </option>
          ))}
        </select>
      </label>

      <form
        className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        <label className="space-y-1 text-sm">
          Type
          <select
            className={selectClass}
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as MemoryKind }))}
          >
            {MEMORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEMORY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Title
          <Input
            maxLength={MEMORY_LIMITS.title}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Preferred test command"
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          What to remember (no keys or tokens)
          <Textarea
            rows={3}
            maxLength={MEMORY_LIMITS.body}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          Where it came from
          <select
            className={selectClass}
            value={form.sourceKind}
            onChange={(e) => setForm((f) => ({ ...f, sourceKind: e.target.value as MemorySource }))}
          >
            {MEMORY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {MEMORY_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Source detail (optional)
          <Input
            maxLength={MEMORY_LIMITS.sourceRef}
            value={form.sourceRef}
            onChange={(e) => setForm((f) => ({ ...f, sourceRef: e.target.value }))}
            placeholder="Link, file name or session"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>
            Save to {MEMORY_AGENT_LABEL[agent]}
          </Button>
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      </form>

      <ul className="space-y-2" aria-label={`${MEMORY_AGENT_LABEL[agent]} memories`}>
        {rows === null && <li className="text-sm text-muted-foreground">Loading…</li>}
        {rows?.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No memories for {MEMORY_AGENT_LABEL[agent]} yet.
          </li>
        )}
        {rows?.map((m) => (
          <li key={m.id} className="space-y-1 rounded-lg border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{m.title}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {MEMORY_KIND_LABEL[m.kind as MemoryKind] ?? m.kind}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className="text-xs text-muted-foreground">
              Source: {MEMORY_SOURCE_LABEL[m.source_kind as MemorySource] ?? m.source_kind}
              {m.source_ref ? ` · ${m.source_ref}` : ""} · {new Date(m.created_at).toLocaleString()} ·
              fingerprint {m.body_sha256.slice(0, 12)}
            </p>
            {confirmId === m.id ? (
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => onDelete(m.id)}>
                  Confirm delete
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(m.id)}>
                <Trash2 size={14} aria-hidden /> Delete
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
