import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { OctagonX, Power, RefreshCw, ShieldCheck, TerminalSquare, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { OmniWorkspace } from "./OmniWorkspace";
import { TaskHandoff, type HandoffRow } from "./TaskHandoff";
import { readTaskHandoffs } from "@/lib/jackboy-handoff.functions";
import { FRESH_MFA_SECONDS, noteProblem } from "@/lib/activation-approvals";
import {
  cancelTerminalTask,
  queueTerminalTask,
  readOmniTerminal,
  runTerminalCommand,
  setTerminalEmergencyStop,
} from "@/lib/omni-terminal.functions";
import {
  AGENT_LABEL,
  KIND_LABEL,
  TASK_AGENTS,
  TASK_KINDS,
  agentRegistry,
  capabilities,
  taskInput,
  type Capability,
  type Snapshot,
  type TaskAgent,
  type TaskKind,
} from "@/lib/omni-terminal";

type Line = { id: number; kind: "in" | "out" | "blocked" | "denied" | "error"; text: string };

const READY_LABEL: Record<Capability["readiness"], string> = {
  ready: "Configured",
  partial: "Partly configured",
  not_ready: "Not configured",
  unknown: "Not visible here",
};
const QUICK = ["status", "health", "approvals", "agents", "queue", "ping", "help"];
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60";

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function OmniTerminal() {
  const read = useServerFn(readOmniTerminal);
  const run = useServerFn(runTerminalCommand);
  const setStop = useServerFn(setTerminalEmergencyStop);
  const queue = useServerFn(queueTerminalTask);
  const cancel = useServerFn(cancelTerminalTask);

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ area: string; text: string } | null>(null);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<Line[]>([
    {
      id: 0,
      kind: "out",
      text: "OMNI Terminal. Type help. Commands are read-only; nothing runs code.",
    },
  ]);
  const [command, setCommand] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [code, setCode] = useState("");
  const [task, setTask] = useState({
    kind: "code.generate" as TaskKind,
    agent: "jackboy" as TaskAgent,
    project: "",
    repository: "",
    instructions: "",
  });
  const lineId = useRef(1);
  const logEnd = useRef<HTMLDivElement>(null);

  const readHandoffs = useServerFn(readTaskHandoffs);
  const [handoffs, setHandoffs] = useState<{ rows: HandoffRow[]; configured: boolean }>({
    rows: [],
    configured: false,
  });
  const loadHandoffs = useCallback(async () => {
    try {
      const r = await readHandoffs();
      setHandoffs({ rows: r.handoffs, configured: r.configured });
    } catch {
      setHandoffs((h) => h);
    }
  }, [readHandoffs]);
  const refresh = useCallback(async () => {
    setSnap(await read());
    void loadHandoffs();
  }, [read, loadHandoffs]);

  useEffect(() => {
    refresh().then(
      () => setAccess("ok"),
      () => setAccess("denied"),
    );
  }, [refresh]);

  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [lines]);

  const caps = useMemo(() => (snap ? capabilities(snap) : []), [snap]);
  const agents = useMemo(() => (snap ? agentRegistry(snap) : []), [snap]);
  const mfaFresh =
    snap?.mfaAgeSeconds !== null && (snap?.mfaAgeSeconds ?? Infinity) <= FRESH_MFA_SECONDS;
  const cap = (id: Capability["id"]) => caps.find((c) => c.id === id);

  function push(kind: Line["kind"], text: string) {
    setLines((prev) => [...prev.slice(-300), { id: lineId.current++, kind, text }]);
  }

  async function exec(raw: string): Promise<string[]> {
    const text = raw.trim();
    if (!text || busy) return [];
    if (text.toLowerCase() === "clear") {
      setLines([]);
      setCommand("");
      return [];
    }
    setBusy(true);
    setCommand("");
    push("in", noteProblem(text) ? "omni> [redacted]" : `omni> ${text}`);
    try {
      const result = await run({ data: { sessionId, command: text } });
      const kind = result.outcome === "ok" ? "out" : result.outcome;
      result.lines.forEach((l) => push(kind, l));
      await refresh().catch(() => {});
      return result.lines;
    } catch {
      const text = "The command could not be confirmed. Check owner access and retry.";
      push("error", text);
      return [text];
    } finally {
      setBusy(false);
    }
  }

  async function reverify() {
    if (busy) return;
    setBusy(true);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((f) => f.status === "verified");
      if (!factor)
        return setNotice({
          area: "stop",
          text: "No verified authenticator. Set one up on Two-factor.",
        });
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (r.error)
        return setNotice({
          area: "stop",
          text: "That code was not accepted. Try the current code.",
        });
      setCode("");
      await refresh();
      setNotice({ area: "stop", text: "Two-factor re-verified for 15 minutes." });
    } catch {
      setNotice({ area: "stop", text: "Re-verification could not complete. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function changeStop(engaged: boolean) {
    if (busy) return;
    if (!engaged && releaseReason.trim().length < 3)
      return setNotice({
        area: "stop",
        text: "Give a short reason to release the Emergency Stop.",
      });
    if (!engaged && noteProblem(releaseReason))
      return setNotice({ area: "stop", text: "Remove anything that looks like a key or token." });
    setBusy(true);
    setNotice({ area: "stop", text: engaged ? "Engaging…" : "Releasing…" });
    try {
      const r = await setStop({
        data: { engaged, reason: engaged ? "Engaged from control strip" : releaseReason },
      });
      if (!r.ok) return setNotice({ area: "stop", text: r.message });
      setReleaseReason("");
      await refresh();
      setNotice({
        area: "stop",
        text: engaged
          ? "Emergency Stop engaged. Jackboy requests, receipt grants and callbacks are refused."
          : "Emergency Stop released. Nothing was turned on; every switch and approval still applies.",
      });
    } catch {
      setNotice({ area: "stop", text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  async function holdTask() {
    if (busy) return;
    const parsed = taskInput.safeParse({ id: crypto.randomUUID(), ...task });
    if (!parsed.success)
      return setNotice({
        area: "task",
        text: parsed.error.issues[0]?.message ?? "Check the task.",
      });
    setBusy(true);
    setNotice({ area: "task", text: "Saving…" });
    try {
      const r = await queue({ data: parsed.data });
      if (!r.ok) return setNotice({ area: "task", text: r.message });
      setTask((t) => ({ ...t, instructions: "" }));
      await refresh();
      setNotice({
        area: "task",
        text: "Held. Saved to the queue but not sent — CODE is off and no dispatcher exists.",
      });
    } catch {
      setNotice({ area: "task", text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await cancel({ data: { id } });
      if (!r.ok) return setNotice({ area: "task", text: r.message });
      await refresh();
      setNotice({ area: "task", text: "Task cancelled." });
    } catch {
      setNotice({ area: "task", text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  if (access !== "ok" || !snap) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl">OMNI Terminal</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {access === "checking"
            ? "Checking owner access…"
            : "This terminal is private to the verified owner with two-factor sign-in."}
        </p>
        {access === "denied" && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/auth">Owner sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/account-security">Two-factor</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAccess("checking");
                void refresh().then(
                  () => setAccess("ok"),
                  () => setAccess("denied"),
                );
              }}
            >
              Retry access check
            </Button>
          </div>
        )}
      </main>
    );
  }

  const stop = snap.emergencyStop;
  const link = cap("link")!;
  const held = snap.tasks.filter((t) => t.state === "held");
  const sessions = groupSessions(snap.log);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl">
            <TerminalSquare size={22} aria-hidden /> OMNI Terminal
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Status, history, held tasks and controls for OMNI and its agents. “Configured” and
            “Authorized” are shown separately: a setting being present never means it is approved or
            switched on.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh()
              .then(
                () => setNotice({ area: "top", text: "Refreshed." }),
                () => setNotice({ area: "top", text: "Refresh failed. Nothing changed." }),
              )
              .finally(() => setBusy(false));
          }}
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </header>
      <OmniWorkspace />
      {notice?.area === "top" && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice.text}
        </p>
      )}

      <section aria-label="Controls" className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div
          className={`space-y-3 rounded-lg border p-4 ${stop.engaged ? "border-destructive bg-destructive/10" : "bg-card"}`}
        >
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <OctagonX size={16} aria-hidden /> Emergency Stop
          </h2>
          <p className="text-lg font-semibold">{stop.engaged ? "Engaged" : "Released"}</p>
          <p className="text-xs text-muted-foreground">
            {stop.changedAt ? `Changed ${when(stop.changedAt)}.` : "Engaged by default."} While
            engaged, Jackboy link requests, receipt grants and callbacks are refused on the server.
          </p>
          {stop.engaged ? (
            <div className="space-y-2">
              {!mfaFresh ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void reverify();
                  }}
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-label="6-digit authenticator code to release"
                    placeholder="Code to release"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={busy || code.length !== 6}
                  >
                    Verify
                  </Button>
                </form>
              ) : (
                <>
                  <Input
                    aria-label="Reason for releasing (no secrets)"
                    placeholder="Reason for releasing"
                    maxLength={280}
                    value={releaseReason}
                    onChange={(e) => setReleaseReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => changeStop(false)}
                  >
                    Release
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => changeStop(true)}
            >
              Engage Emergency Stop
            </Button>
          )}
          {notice?.area === "stop" && (
            <p role="status" className="text-xs text-muted-foreground">
              {notice.text}
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Power size={16} aria-hidden /> Autonomous mode
          </h2>
          <div role="group" aria-label="Autonomous mode" className="flex gap-2">
            <Button size="sm" variant="secondary" aria-pressed="true" disabled={busy}>
              Off
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed="false"
              disabled={busy}
              onClick={() =>
                void exec("autonomy on").then((out) =>
                  setNotice({ area: "autonomy", text: out[0] ?? "Refused." }),
                )
              }
            >
              On
            </Button>
          </div>
          {notice?.area === "autonomy" && (
            <p role="status" className="text-xs font-medium">
              Refused — {notice.text}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Stays off. Turning it on is refused until: {cap("autonomy")?.authorizationNote}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">CODE</h2>
          <p className="text-lg font-semibold">Off</p>
          <p className="text-xs text-muted-foreground">{cap("code")?.authorizationNote}</p>
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Wifi size={16} aria-hidden /> Jackboy link
          </h2>
          <p className="text-lg font-semibold">{link.authorized ? "Authorized" : "Off"}</p>
          <p className="text-xs text-muted-foreground">
            {READY_LABEL[link.readiness]}. {link.evidence}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void exec("ping").then((out) =>
                setNotice({ area: "link", text: out[0] ?? "No result." }),
              )
            }
          >
            Check Railway reachability
          </Button>
          {notice?.area === "link" && (
            <p role="status" className="text-xs">
              {notice.text}
            </p>
          )}
        </div>
      </section>

      <Tabs defaultValue="terminal">
        <TabsList aria-label="Terminal sections" className="h-auto flex-wrap justify-start">
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="code">CODE & tasks ({held.length})</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Session {sessionId.slice(0, 8)} · saved to your private history on the server
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSessionId(crypto.randomUUID());
                setLines([{ id: lineId.current++, kind: "out", text: "New session started." }]);
              }}
            >
              New session
            </Button>
          </div>
          <div
            role="log"
            aria-live="polite"
            aria-label="Terminal output"
            className="h-80 overflow-y-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed"
          >
            {lines.map((l) => (
              <div
                key={l.id}
                className={
                  l.kind === "in"
                    ? "text-foreground"
                    : l.kind === "out"
                      ? "text-muted-foreground"
                      : l.kind === "error"
                        ? "text-destructive"
                        : "text-primary"
                }
              >
                {l.kind === "blocked" || l.kind === "denied" ? `[${l.kind}] ` : ""}
                {l.text}
              </div>
            ))}
            <div ref={logEnd} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void exec(command);
            }}
          >
            <span aria-hidden className="self-center font-mono text-sm text-muted-foreground">
              omni&gt;
            </span>
            <Input
              aria-label="Terminal command"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="status"
            />
            <Button type="submit" disabled={busy || !command.trim()}>
              Run
            </Button>
          </form>
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <Button key={q} size="sm" variant="ghost" disabled={busy} onClick={() => exec(q)}>
                {q}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="code" className="space-y-6 pt-4">
          <p role="note" className="rounded-lg border bg-card p-3 text-sm">
            Held tasks are saved privately but never sent. CODE is off, there is no dispatcher and
            no isolated test runner. Sending later needs approval step 10, the Railway CODE switch
            and a released Emergency Stop.
          </p>
          <form
            className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void holdTask();
            }}
          >
            <label className="space-y-1 text-sm">
              Type
              <select
                className={selectClass}
                value={task.kind}
                onChange={(e) => {
                  const kind = e.target.value as TaskKind;
                  setTask((t) => ({
                    ...t,
                    kind,
                    agent: kind === "agent.handoff" ? t.agent : "jackboy",
                  }));
                }}
              >
                {TASK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Agent
              <select
                className={selectClass}
                value={task.agent}
                disabled={task.kind !== "agent.handoff"}
                onChange={(e) => setTask((t) => ({ ...t, agent: e.target.value as TaskAgent }))}
              >
                {TASK_AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {AGENT_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Project
              <Input
                maxLength={120}
                value={task.project}
                onChange={(e) => setTask((t) => ({ ...t, project: e.target.value }))}
                placeholder="e.g. Orbiting Minds Mothership"
              />
            </label>
            <label className="space-y-1 text-sm">
              Repository (optional)
              <Input
                maxLength={200}
                value={task.repository}
                onChange={(e) => setTask((t) => ({ ...t, repository: e.target.value }))}
                placeholder="owner/repository"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              Instructions (no keys or tokens)
              <Textarea
                rows={4}
                maxLength={4000}
                value={task.instructions}
                onChange={(e) => setTask((t) => ({ ...t, instructions: e.target.value }))}
                placeholder="Describe what to generate, edit, test or debug."
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={busy}>
                Hold task
              </Button>
              {notice?.area === "task" && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice.text}
                </p>
              )}
            </div>
          </form>
          <ul className="space-y-2">
            {snap.tasks.length === 0 && (
              <li className="text-sm text-muted-foreground">No tasks yet.</li>
            )}
            {snap.tasks.map((t) => (
              <li key={t.id} className="space-y-1 rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {KIND_LABEL[t.kind as TaskKind] ?? t.kind} →{" "}
                    {AGENT_LABEL[t.agent as TaskAgent] ?? t.agent}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.state === "held" ? "Held · not sent" : "Cancelled"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.project_label}
                  {t.repository ? ` · ${t.repository}` : ""} · {when(t.created_at)}
                </p>
                <p className="whitespace-pre-wrap break-words">{t.instructions}</p>
                <TaskHandoff
                  task={t}
                  handoff={handoffs.rows.find((h) => h.task_id === t.id)}
                  configured={handoffs.configured}
                  stopEngaged={stop !== "released"}
                  onChanged={refresh}
                />
                {t.state === "held" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => cancelTask(t.id)}
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="agents" className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">
            Agents coordinate only through held tasks today. Nothing is handed off automatically.
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {agents.map((a) => (
              <li key={a.id} className="space-y-1 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {a.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{a.note}</p>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="health" className="space-y-4 pt-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Capability</th>
                  <th className="p-2">Configured?</th>
                  <th className="p-2">Authorized?</th>
                  <th className="p-2">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-2">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.state}</div>
                    </td>
                    <td className="p-2 text-xs">
                      <div>{READY_LABEL[c.readiness]}</div>
                      <div className="text-muted-foreground">{c.readinessNote}</div>
                    </td>
                    <td className="p-2 text-xs">
                      <div>{c.authorized ? "Yes" : "No"}</div>
                      <div className="text-muted-foreground">{c.authorizationNote}</div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{c.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section aria-labelledby="settings" className="space-y-2">
            <h2 id="settings" className="text-sm font-medium">
              Link settings (names only — values are never read out)
            </h2>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {snap.settings.map((s) => (
                <li key={s.name} className="flex justify-between gap-2 rounded border px-2 py-1">
                  <code>{s.name}</code>
                  <span className="text-muted-foreground">{s.present ? "present" : "missing"}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 rounded border px-2 py-1">
                <code>OMNI_LINK_APPROVAL_EXPIRES_AT</code>
                <span className="text-muted-foreground">
                  {snap.expirySet ? "present" : "unset · step 7"}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded border px-2 py-1">
                <code>JACKBOY_LINK_ENABLED</code>
                <span className="text-muted-foreground">
                  {snap.switches.linkEnabled ? "ON" : "off"}
                </span>
              </li>
              <li className="flex justify-between gap-2 rounded border px-2 py-1">
                <code>JACKBOY_LINK_SELF_TEST_ENABLED</code>
                <span className="text-muted-foreground">
                  {snap.switches.selfTestEnabled ? "ON" : "off"}
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Owner ID setting:{" "}
              {snap.ownerIdMatches === "match" ? "matches you" : snap.ownerIdMatches}. Two-factor:{" "}
              {snap.mfaAgeSeconds === null
                ? "no recent check"
                : `verified ${Math.round(snap.mfaAgeSeconds / 60)} min ago`}
              .
            </p>
          </section>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={14} aria-hidden /> Approvals:{" "}
            <Link to="/activation-approvals" className="underline">
              Activation Approvals
            </Link>
          </p>
        </TabsContent>

        <TabsContent value="history" className="space-y-6 pt-4">
          <section aria-labelledby="sessions" className="space-y-2">
            <h2 id="sessions" className="text-sm font-medium">
              Terminal sessions
            </h2>
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            )}
            {sessions.map((s) => (
              <details key={s.id} className="rounded-lg border bg-card p-3 text-sm">
                <summary className="cursor-pointer">
                  Session {s.id.slice(0, 8)} · {s.entries.length} entr
                  {s.entries.length === 1 ? "y" : "ies"} · {when(s.last)}
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {s.entries.map((e) => (
                    <li key={e.id}>
                      {when(e.created_at)} [{e.outcome}] {e.command} — {e.summary}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
          <section aria-labelledby="audit" className="space-y-2">
            <h2 id="audit" className="text-sm font-medium">
              Audit log (link, terminal and approvals)
            </h2>
            {snap.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {snap.audit.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap justify-between gap-2 rounded border px-2 py-1"
                  >
                    <span>
                      {a.record_type} · {a.action}
                    </span>
                    <span className="text-muted-foreground">{when(a.occurred_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function groupSessions(log: Snapshot["log"]) {
  const map = new Map<string, { id: string; last: string; entries: Snapshot["log"] }>();
  for (const entry of log) {
    const s = map.get(entry.session_id) ?? {
      id: entry.session_id,
      last: entry.created_at,
      entries: [],
    };
    s.entries.push(entry);
    if (entry.created_at > s.last) s.last = entry.created_at;
    map.set(entry.session_id, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, entries: [...s.entries].reverse() }))
    .sort((a, b) => b.last.localeCompare(a.last));
}
