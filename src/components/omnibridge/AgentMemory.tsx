import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  deleteAgentMemory,
  deleteAllAgentMemories,
  getAgentMemoryChatSettings,
  listAgentMemories,
  saveAgentMemory,
  setAgentMemoryChatSetting,
} from "@/lib/omni-memory.functions";
import {
  MEMORY_AGENTS,
  MEMORY_AGENT_LABEL,
  CHAT_MEMORY_LIMITS,
  MEMORY_BACKEND,
  MEMORY_KINDS,
  STORED_SOURCE_LABEL,
  isChatMemoryAgent,
  type ChatMemoryAgent,
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
const empty = {
  kind: "note" as MemoryKind,
  title: "",
  body: "",
  sourceKind: "owner_typed" as MemorySource,
  sourceRef: "",
};

type ChatSettings = {
  useInChat: boolean;
  saveChats: boolean;
  lastUsed: { at: string; entries: number } | null;
  lastSavedAt: string | null;
};

/** Dread/Draco owner switches: read own memory in chat replies, and save every chat. */
function ChatMemorySwitches({
  agent,
  onChanged,
}: {
  agent: ChatMemoryAgent;
  onChanged: () => void;
}) {
  const read = useServerFn(getAgentMemoryChatSettings);
  const write = useServerFn(setAgentMemoryChatSetting);
  const [state, setState] = useState<ChatSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = MEMORY_AGENT_LABEL[agent];

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await read({ data: { agent } });
      if (!r.ok) return setError(r.message);
      setState(r);
    } catch {
      setError("Memory settings could not be read. Refresh and retry.");
    }
  }, [agent, read]);
  useEffect(() => {
    setState(null);
    void load();
  }, [load]);

  async function flip(setting: "use_in_chat" | "save_chats", on: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await write({ data: { agent, setting, on } });
      if (!r.ok) setError(r.message);
      await load();
      onChanged();
    } catch {
      setError("Not confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-4 text-sm"
      aria-label={`${name} chat memory`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Use these in {name}'s chat replies</p>
          <p className="text-xs text-muted-foreground">
            {name} reads only its own entries below (newest first, up to{" "}
            {CHAT_MEMORY_LIMITS.entries} entries or {CHAT_MEMORY_LIMITS.chars.toLocaleString()}{" "}
            characters per reply), only while your connection, AI approval and the Emergency Stop
            allow the reply. Deletions apply from the next reply.
          </p>
        </div>
        <Switch
          aria-label={`Use memory in ${name}'s chat replies`}
          checked={state?.useInChat ?? false}
          disabled={busy || !state}
          onCheckedChange={(on) => void flip("use_in_chat", on)}
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Save every chat with {name}</p>
          <p className="text-xs text-muted-foreground">
            Each finished reply is kept here with your message, marked "Saved from an OMNI web
            chat", so you can review or delete it. Anything that looks like a key or token is not
            saved. Off means nothing from chats is kept.
          </p>
        </div>
        <Switch
          aria-label={`Save every chat with ${name}`}
          checked={state?.saveChats ?? false}
          disabled={busy || !state}
          onCheckedChange={(on) => void flip("save_chats", on)}
        />
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {error ??
          (state === null
            ? "Reading settings…"
            : [
                state.lastUsed
                  ? `Last read in a reply: ${new Date(state.lastUsed.at).toLocaleString()} (${state.lastUsed.entries} entries).`
                  : "Not read in any reply yet.",
                state.lastSavedAt
                  ? `Last chat saved: ${new Date(state.lastSavedAt).toLocaleString()}.`
                  : "No chats saved yet.",
              ].join(" "))}
      </p>
    </div>
  );
}

/** Owner-controlled memory, one agent at a time. Only Dread and Draco read theirs, in chat, when switched on. */
export function AgentMemory() {
  const list = useServerFn(listAgentMemories);
  const save = useServerFn(saveAgentMemory);
  const remove = useServerFn(deleteAgentMemory);
  const removeAll = useServerFn(deleteAllAgentMemories);
  const [confirmAll, setConfirmAll] = useState(false);
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
    setConfirmAll(false);
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

  async function onDeleteAll() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await removeAll({ data: { agent, confirm: true } });
      if (!r.ok) return setNotice(r.message);
      setConfirmAll(false);
      await load(agent);
      setNotice(
        `Deleted ${r.deleted} ${r.deleted === 1 ? "entry" : "entries"} for ${MEMORY_AGENT_LABEL[agent]}.`,
      );
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
          Each agent has its own separate memory, stored in {MEMORY_BACKEND.storedIn}. Only Dread
          and Draco can read theirs — each only its own, in chat replies, and only when you switch
          it on. No other agent, OMNI on Railway or Jackboy reads these, and there is no outside
          memory service. You review and delete every entry yourself; saves, reads, switch changes
          and deletions are logged without their text.
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

      {isChatMemoryAgent(agent) && (
        <ChatMemorySwitches agent={agent} onChanged={() => void load(agent)} />
      )}

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

      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? "entry" : "entries"} shown (newest first)
          </span>
          {confirmAll ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void onDeleteAll()}
              >
                Confirm: delete all of {MEMORY_AGENT_LABEL[agent]}'s memory
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmAll(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmAll(true)}>
              <Trash2 size={14} aria-hidden /> Delete all
            </Button>
          )}
        </div>
      )}

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
              Source: {STORED_SOURCE_LABEL[m.source_kind] ?? m.source_kind}
              {m.source_ref ? ` · ${m.source_ref}` : ""} · {new Date(m.created_at).toLocaleString()}{" "}
              · fingerprint {m.body_sha256.slice(0, 12)}
            </p>
            {confirmId === m.id ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onDelete(m.id)}
                >
                  Confirm delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmId(null)}
                >
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
