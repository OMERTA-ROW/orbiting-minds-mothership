import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Bot, CheckCircle2, CircleSlash, KeyRound, OctagonX, Power, Send, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  decideStep,
  endSession,
  passkeyCheckOptions,
  passkeyCheckVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  pollSession,
  proposePullRequest,
  readWorkspace,
  runCommand,
  runSandboxSelfTest,
  runStopDrill,
  sendChat,
  setAutonomy,
  setKillSwitch,
  startSession,
  stopWork,
  updateAgent,
} from "@/lib/omni-workspace.functions";
import {
  AGENT_ACTIONS,
  AUTONOMY_MINUTES,
  FUTURE_AGENTS,
  GLOBAL_LIMITS,
  IDLE_LIMIT_MS,
  PROVIDERS,
  PROVIDER_LABEL,
  REPOSITORY,
  fmtCents,
  type AgentAction,
  type Provider,
} from "@/lib/omni-workspace";

type Snap = Awaited<ReturnType<typeof readWorkspace>>;
type Step = Snap["steps"][number];
type Purpose = "open" | "session" | "kill_switch" | "autonomy" | "approval" | "agent";

const ACTION_LABEL: Record<AgentAction, string> = { chat: "Chat", edit_files: "Edit files", run_commands: "Run commands" };
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

function Diff({ text }: { text: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded border border-border bg-background p-2 font-mono text-xs">
      {text.split("\n").map((l, i) => (
        <div key={i} className={l.startsWith("+") ? "text-primary" : l.startsWith("-") ? "text-destructive" : "text-muted-foreground"}>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

export function OmniWorkspace() {
  const read = useServerFn(readWorkspace);
  const fns = {
    regOpt: useServerFn(passkeyRegisterOptions),
    regVer: useServerFn(passkeyRegisterVerify),
    chkOpt: useServerFn(passkeyCheckOptions),
    chkVer: useServerFn(passkeyCheckVerify),
    kill: useServerFn(setKillSwitch),
    start: useServerFn(startSession),
    chat: useServerFn(sendChat),
    cmd: useServerFn(runCommand),
    poll: useServerFn(pollSession),
    end: useServerFn(endSession),
    stop: useServerFn(stopWork),
    auto: useServerFn(setAutonomy),
    decide: useServerFn(decideStep),
    agent: useServerFn(updateAgent),
    selfTest: useServerFn(runSandboxSelfTest),
    pr: useServerFn(proposePullRequest),
    drill: useServerFn(runStopDrill),
  };
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [agentId, setAgentId] = useState("omni");
  const [auditAgent, setAuditAgent] = useState<string>("");
  const [chatText, setChatText] = useState("");
  const [cmdText, setCmdText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [histFilter, setHistFilter] = useState("");
  const [minutes, setMinutes] = useState<(typeof AUTONOMY_MINUTES)[number]>(15);
  const [provider, setProvider] = useState<Provider>("none");
  const [repo, setRepo] = useState("");
  const [ref, setRef] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const termRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const s = await read({ data: { agentFilter: auditAgent || undefined, sessionId: sessionId ?? undefined } });
    setSnap(s);
    if (sessionId) setSteps(s.steps);
    return s;
  }, [read, auditAgent, sessionId]);

  useEffect(() => {
    void refresh().catch(() => setError("Workspace records could not be read."));
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const session = snap?.sessions.find((s) => s.id === sessionId) ?? null;
  const gateOpen = Boolean(snap?.gate.open);

  // Near-live output: ask the server for new OMNI events about once a second.
  useEffect(() => {
    if (!sessionId || !gateOpen) return;
    let alive = true;
    const t = setInterval(async () => {
      const r = await fns.poll({ data: { sessionId } }).catch(() => null);
      if (!alive) return;
      if (!r || !r.ok) {
        setError(r && !r.ok ? r.message : "Lost contact with OMNI.");
        setSessionId(null);
        void refresh();
        return;
      }
      setSteps(r.steps);
    }, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId, gateOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [steps]);

  async function act<T extends { ok: boolean; message?: string }>(label: string, fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.message ?? `${label} failed.`);
      else setNotice(`${label}: done.`);
      await refresh().catch(() => {});
      return r;
    } catch (e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Passkey check was cancelled." : `${label} failed. Nothing was changed.`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function passkey(purpose: Purpose): Promise<string> {
    const o = await fns.chkOpt({ data: { purpose } });
    if (!o.ok) throw new Error(o.message);
    const response = await startAuthentication({ optionsJSON: o.options });
    const v = await fns.chkVer({ data: { checkId: o.checkId, response } });
    if (!v.ok) throw new Error(v.message);
    return o.checkId;
  }
  const withPasskey = (purpose: Purpose, label: string, run: (checkId: string) => Promise<{ ok: boolean; message?: string }>) =>
    act(label, async () => {
      try {
        return await run(await passkey(purpose));
      } catch (e) {
        if (e instanceof Error && e.name === "NotAllowedError") throw e;
        return { ok: false, message: e instanceof Error ? e.message : "Passkey check failed." };
      }
    });

  const terminalLines = useMemo(() => steps.filter((s) => s.kind === "command" || s.kind === "output" || s.kind === "result"), [steps]);
  const chatCards = useMemo(() => steps.filter((s) => s.kind !== "output"), [steps]);

  if (!snap) {
    return (
      <section aria-label="OMNI agent workspace" className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
        {error ?? "Loading OMNI agent workspace…"}
      </section>
    );
  }

  const idleLeft = session ? Math.max(0, Date.parse(session.last_activity_at) + IDLE_LIMIT_MS - now) : 0;
  const win = snap.windows.find((w) => w.agent_id === agentId);
  const autoLeft = win ? Math.max(0, Date.parse(win.expires_at) - now) : 0;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const enrolled = snap.agents.filter((a) => a.status === "enrolled");
  const checklist: [string, boolean][] = [
    [`Cloud sandbox settings present${snap.link.problem ? ` — ${snap.link.problem}` : ""}`, snap.link.configured],
    ["Cloud sandbox switch on (OMNI_SANDBOX_ENABLED)", snap.link.enabled],
    [`Sandbox self-test passed in the last 24 h${snap.link.selfTestPassedAt ? ` (${new Date(snap.link.selfTestPassedAt).toLocaleString()})` : ""}`, !snap.gate.blockers.some((b) => b.includes("self-test"))],
    ["Kill switch: terminal enabled", snap.killSwitchEnabled === true],
    ["Emergency Stop released", snap.emergencyStopReleased],
    ["Passkey confirmed in the last 5 minutes", snap.passkeyFreshAt !== null],
  ];
  const health = snap.link.lastCheck?.health ?? null;
  const providerStatus = (id: "openai" | "anthropic") => {
    const p = health?.providers.find((x) => x.id === id);
    if (!snap.link.lastCheck) return "Not reported — run the sandbox self-test";
    if (!p || !p.configured) return "Not set up on the sandbox service";
    if (!p.verified) return `Key set (${p.model ?? "no model"}) but not accepted by the provider`;
    return `Connected · ${p.model}${p.pricing ? "" : " · prices not set, chat refused"} · checked ${when(p.checkedAt)}`;
  };
  const repoOk = !repo || REPOSITORY.test(repo);
  const ready = snap.autonomy[agentId];
  // The passkey gate is asked for when you press the button, so it is not shown as missing here.
  const missing = (ready?.gates ?? []).filter((g) => !g.ok && g.id !== "passkey");

  return (
    <section aria-label="OMNI agent workspace" className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg">
          <Bot size={18} aria-hidden /> OMNI agent workspace
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Kill switch: {snap.killSwitchEnabled ? "Terminal enabled" : "Terminal disabled"}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              withPasskey("kill_switch", snap.killSwitchEnabled ? "Disable terminal" : "Enable terminal", (checkId) =>
                fns.kill({ data: { checkId, enabled: !snap.killSwitchEnabled, reason: snap.killSwitchEnabled ? "Owner disabled terminal" : "Owner enabled terminal" } }),
              )
            }
          >
            <Power size={14} /> {snap.killSwitchEnabled ? "Disable terminal" : "Enable terminal"}
          </Button>
          <Button size="lg" variant="destructive" disabled={busy} onClick={() => act("Stop", () => fns.stop({ data: sessionId ? { sessionId } : {} }))}>
            <OctagonX size={16} /> STOP
          </Button>
        </div>
      </header>

      {error && <p role="alert" className="rounded border border-destructive/50 p-2 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      {/* Header strip */}
      <div className="grid gap-2 rounded border border-border p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <div>Sandbox: <b>{session?.sandbox_name ? `${session.sandbox_name} (${session.sandbox_id})` : "none"}</b></div>
        <div>Session: <b>{session ? session.id.slice(0, 8) : "none"}</b></div>
        <div>Model: <b>{session?.model ?? "—"}</b></div>
        <div>Idle lock: <b>{session ? mmss(idleLeft) : "—"}</b></div>
        <div>Spend: <b>{fmtCents(snap.spend.day)}</b> today / <b>{fmtCents(snap.spend.total)}</b> of {fmtCents(GLOBAL_LIMITS.total)}</div>
        <div>Autonomous: <b>{win ? `ON · ${mmss(autoLeft)}` : "OFF"}</b></div>
      </div>

      {/* Passkeys */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <KeyRound size={14} aria-hidden />
        <span className="text-muted-foreground">
          Passkeys: {snap.passkeys.length ? snap.passkeys.map((p) => `${p.name} (${p.rp_id})`).join(", ") : "none yet"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            act("Add passkey", async () => {
              const o = await fns.regOpt();
              if (!o.ok) return o;
              const response = await startRegistration({ optionsJSON: o.options });
              return fns.regVer({ data: { checkId: o.checkId, name: "Owner passkey", response } });
            })
          }
        >
          Add passkey
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !snap.passkeys.length} onClick={() => withPasskey("open", "Passkey check", async () => ({ ok: true }))}>
          Confirm with passkey
        </Button>
      </div>

      <div className="space-y-2 rounded border border-border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Cloud sandbox (OMNI on Railway)</p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !snap.link.configured || !snap.passkeys.length}
            onClick={() => withPasskey("open", "Sandbox self-test", (checkId) => fns.selfTest({ data: { checkId } }))}
          >
            Run sandbox self-test
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {snap.link.lastCheck
            ? `Last self-test ${when(snap.link.lastCheck.at)}: ${snap.link.lastCheck.passed ? "passed" : `failed — ${snap.link.lastCheck.failures[0] ?? "see audit"}`}.`
            : "No self-test recorded. Commands stay off until one passes."}
          {health && ` Network: ${health.isolation.network}. User: uid ${health.isolation.uid}. Limits: ${health.limits.commandTimeoutSec}s per command, ${health.limits.memoryMb} MB, ${Math.round(health.limits.outputCapBytes / 1024)} KB output.`}
        </p>
        <ul className="grid gap-1 text-xs sm:grid-cols-3">
          <li>OpenAI (Codex): {providerStatus("openai")}</li>
          <li>Claude: {providerStatus("anthropic")}</li>
          <li>
            GitHub:{" "}
            {!health
              ? "Not reported"
              : !health.github.configured
                ? "No token on the sandbox service"
                : health.github.repositories.length
                  ? health.github.repositories.map((r) => `${r.fullName} (${r.access ? "can push" : "no push access"})`).join(", ")
                  : "Token set, no repositories allowed"}
          </li>
        </ul>
      </div>

      {!gateOpen && (
        <div className="rounded border border-border p-4">
          <p className="font-medium">Not connected — commands and chat stay off until every item is green.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {checklist.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2">
                {ok ? <CheckCircle2 size={14} className="text-primary" aria-hidden /> : <CircleSlash size={14} className="text-muted-foreground" aria-hidden />}
                <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
                <span className="sr-only">{ok ? "done" : "not done"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Session controls */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-muted-foreground" htmlFor="ws-agent">Agent</label>
        <select id="ws-agent" className="rounded border border-border bg-background px-2 py-1" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {snap.agents.map((a) => (
            <option key={a.id} value={a.id}>{a.display_name} ({a.status})</option>
          ))}
        </select>
        {!sessionId && (
          <>
            <select aria-label="Model provider" className="rounded border border-border bg-background px-2 py-1" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
            <Input aria-label="Repository (owner/name, optional)" className="h-8 w-48" placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value.trim())} />
            <Input aria-label="Branch" className="h-8 w-28" placeholder="main" value={ref} onChange={(e) => setRef(e.target.value.trim())} disabled={!repo} />
          </>
        )}
        {!sessionId ? (
          <Button
            size="sm"
            disabled={busy || !gateOpen || !repoOk || !enrolled.some((a) => a.id === agentId)}
            onClick={() =>
              withPasskey("session", "Start session", async (checkId) => {
                const r = await fns.start({
                  data: { checkId, agentId, provider, ...(repo ? { repository: repo, ref: ref || "main" } : {}) },
                });
                if (r.ok) {
                  setSessionId(r.sessionId);
                  if ("warning" in r && r.warning) setError(r.warning);
                }
                return r;
              })
            }
          >
            Start session
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act("End session", async () => { const r = await fns.end({ data: { sessionId } }); setSessionId(null); setSteps([]); return r; })}>
            End session
          </Button>
        )}
        {win ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act("Autonomous Mode off", () => fns.auto({ data: { agentId, on: false } }))}>
            Autonomous: ON — turn off
          </Button>
        ) : (
          <>
            <select aria-label="Autonomous duration" className="rounded border border-border bg-background px-2 py-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as 15 | 30 | 60)}>
              {AUTONOMY_MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !ready?.allowed}
              title={ready?.allowed ? "Needs your passkey" : `Locked: ${missing.length} gate(s) not met`}
              onClick={() => withPasskey("autonomy", `Autonomous Mode on for ${minutes} min`, (checkId) => fns.auto({ data: { agentId, on: true, minutes, checkId } }))}
            >
              {ready?.allowed ? `Turn Autonomous on (${minutes} min)` : `Autonomous: OFF (locked · ${missing.length} missing)`}
            </Button>
          </>
        )}
      </div>

      <details className="rounded border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Autonomous Mode readiness · {snap.agents.find((a) => a.id === agentId)?.display_name ?? agentId}: {missing.length ? `${missing.length} gate(s) missing — stays OFF` : "all recorded gates met"}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Off by default. Windows are 15, 30 or 60 minutes and end on their own, on Stop, when the agent is paused, when the terminal is disabled or when Emergency Stop is engaged. Spending stays inside {fmtCents(GLOBAL_LIMITS.task)} per task, {fmtCents(GLOBAL_LIMITS.day)} per day and {fmtCents(GLOBAL_LIMITS.total)} total. Gated steps (merge, deploy, publish, secrets, GitHub permissions, network, pull requests) always wait for you. Jackboy CODE keeps its own controls.
        </p>
        <ul className="mt-2 space-y-1">
          {(ready?.gates ?? []).map((g) => (
            <li key={g.id} className="flex items-start gap-2">
              {g.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-primary" aria-label="met" /> : <CircleSlash size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-label="not met" />}
              <span>
                {g.label}
                <span className="block text-xs text-muted-foreground">{g.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={busy || !sessionId || !gateOpen}
          title={!sessionId ? "Start a session first" : "Runs `sleep 30` in the sandbox, then stops it"}
          onClick={() => sessionId && withPasskey("autonomy", "Stop drill", (checkId) => fns.drill({ data: { sessionId, checkId } }))}
        >
          Run live stop drill
        </Button>
      </details>

      {session?.repository && (
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sessionId || prTitle.trim().length < 3) return;
            const title = prTitle;
            setPrTitle("");
            void act("Pull request proposal", () => fns.pr({ data: { sessionId, title } }));
          }}
        >
          <span className="text-muted-foreground">
            Repository {session.repository}@{session.repo_ref ?? "main"} ·
          </span>
          <Input aria-label="Pull request title" className="h-8 w-64" placeholder="Pull request title" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} maxLength={120} />
          <Button size="sm" type="submit" variant="outline" disabled={busy || !gateOpen || prTitle.trim().length < 3}>
            Propose draft pull request
          </Button>
          <span className="text-xs text-muted-foreground">Opening it needs your passkey in Approvals waiting. OMNI never merges.</span>
        </form>
      )}

      {/* Chat + terminal */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[420px] flex-col rounded border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">Chat with OMNI</div>
          <ol className="flex-1 space-y-2 overflow-auto p-3 text-sm" aria-live="polite">
            {!chatCards.length && <li className="text-muted-foreground">{gateOpen ? "Start a session, then describe what you want built." : "Locked until connected."}</li>}
            {chatCards.map((s) => (
              <li key={s.id} className="rounded border border-border p-2">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wide">{s.kind === "diff" ? "Files changed" : s.kind === "command" ? "Command run" : s.kind}</span>
                  <span>{s.model ?? ""} {s.cost_cents ? fmtCents(s.cost_cents) : ""} · {s.status.replace("_", " ")}</span>
                </div>
                {s.title && <p className="mt-1 font-medium">{s.title}</p>}
                {s.kind === "diff" ? <Diff text={s.body} /> : s.body && <p className="mt-1 whitespace-pre-wrap">{s.body.slice(0, 2000)}</p>}
                {s.exit_code !== null && <p className="mt-1 text-xs">Exit code {s.exit_code}</p>}
                {s.status === "pending_approval" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => act("Approve step", () => fns.decide({ data: { stepId: s.id, approve: true } }))}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act("Reject step", () => fns.decide({ data: { stepId: s.id, approve: false } }))}>Reject</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sessionId || !chatText.trim()) return;
              const text = chatText;
              setChatText("");
              void act("Message", () => fns.chat({ data: { sessionId, text } }));
            }}
          >
            <Textarea aria-label="Message OMNI" rows={2} disabled={!sessionId || !gateOpen} value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Ask OMNI to build, fix or explain…" />
            <Button type="submit" disabled={!sessionId || !gateOpen || busy} aria-label="Send message"><Send size={14} /></Button>
          </form>
        </div>

        <div className="flex min-h-[420px] flex-col rounded border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
            <TerminalSquare size={14} aria-hidden /> Live terminal
          </div>
          <div ref={termRef} className="flex-1 overflow-auto p-3 font-mono text-xs" role="log" aria-live="polite">
            {!terminalLines.length && <p className="text-muted-foreground">{gateOpen ? "No output yet." : "Not connected."}</p>}
            {terminalLines.map((s) => (
              <div key={s.id} className={s.stream === "stderr" || s.status === "failed" ? "text-destructive" : s.stream === "system" ? "text-muted-foreground" : ""}>
                {s.kind === "command" ? `$ ${s.title || s.body}` : s.body}
                {s.exit_code !== null && <span className="text-muted-foreground"> [exit {s.exit_code}]</span>}
                {s.kind === "command" && s.status === "pending_approval" && (
                  <span className="ml-2 inline-flex gap-1 font-sans">
                    <Button size="sm" className="h-6 px-2 text-xs" disabled={busy} onClick={() => act("Approve command", () => fns.decide({ data: { stepId: s.id, approve: true } }))}>Approve &amp; run</Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy} onClick={() => act("Reject command", () => fns.decide({ data: { stepId: s.id, approve: false } }))}>Reject</Button>
                  </span>
                )}
                {s.kind === "command" && s.status === "rejected" && <span className="text-muted-foreground"> [rejected]</span>}
              </div>
            ))}
          </div>
          <form
            className="space-y-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sessionId || !cmdText.trim()) return;
              const command = cmdText;
              setHistory((h) => [command, ...h.filter((x) => x !== command)].slice(0, 100));
              setHistIdx(-1);
              setCmdText("");
              void act("Command", () => fns.cmd({ data: { sessionId, command } }));
            }}
          >
            <Input
              aria-label="Terminal command"
              className="font-mono"
              disabled={!sessionId || !gateOpen}
              value={cmdText}
              placeholder={gateOpen ? "> type a command — you approve it before it runs" : "Locked"}
              onChange={(e) => setCmdText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && history.length) {
                  e.preventDefault();
                  const i = Math.min(histIdx + 1, history.length - 1);
                  setHistIdx(i);
                  setCmdText(history[i]!);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const i = histIdx - 1;
                  setHistIdx(Math.max(i, -1));
                  setCmdText(i >= 0 ? history[i]! : "");
                }
              }}
            />
            {history.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">History ({history.length})</summary>
                <Input aria-label="Search history" className="mt-1 h-7 text-xs" value={histFilter} onChange={(e) => setHistFilter(e.target.value)} placeholder="Search" />
                <ul className="mt-1 max-h-32 overflow-auto font-mono">
                  {history.filter((h) => h.includes(histFilter)).map((h) => (
                    <li key={h}><button type="button" className="hover:underline" onClick={() => setCmdText(h)}>{h}</button></li>
                  ))}
                </ul>
              </details>
            )}
          </form>
        </div>
      </div>

      <Tabs defaultValue="agents">
        <TabsList className="flex-wrap">
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="approvals">Approvals waiting ({snap.approvals.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="grid gap-3 md:grid-cols-2">
          {snap.agents.map((a) => {
            const jobs = snap.jobs.filter((j) => j.agent_id === a.id);
            const count = (st: string) => jobs.filter((j) => j.status === st).length;
            const w = snap.windows.find((x) => x.agent_id === a.id);
            const sp = snap.agentSpend[a.id];
            return (
              <article key={a.id} className="space-y-2 rounded border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{a.display_name}</h3>
                  <span className="text-xs text-muted-foreground">{a.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">ID {a.id} · model {a.model ?? "reported by OMNI"} · {a.link_kind}</p>
                <p>Allowed: {a.allowed_actions.length ? a.allowed_actions.map((x) => ACTION_LABEL[x as AgentAction] ?? x).join(", ") : "nothing yet"}</p>
                <p>Jobs: {count("queued")} queued · {count("running")} running · {count("done")} done · {count("failed")} failed · {count("stopped")} stopped</p>
                <p>Budget: {fmtCents(sp?.day ?? 0)} / {fmtCents(a.budget_day_cents)} today · {fmtCents(sp?.total ?? 0)} / {fmtCents(a.budget_total_cents)} total · {fmtCents(a.budget_task_cents)} per task</p>
                <p>Autonomous: {w ? `ON until ${new Date(w.expires_at).toLocaleTimeString()}` : "OFF"}</p>
                <AgentGrant agent={a} busy={busy} onSave={(g) => withPasskey("agent", `Update ${a.display_name}`, (checkId) => fns.agent({ data: { ...g, checkId, agentId: a.id } }))} />
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => act(`Stop ${a.display_name}`, () => fns.stop({ data: { agentId: a.id } }))}>
                  <OctagonX size={14} /> Stop {a.display_name}
                </Button>
              </article>
            );
          })}
          {FUTURE_AGENTS.map((f) => (
            <article key={f.id} className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              <h3 className="font-medium">{f.name}</h3>
              <p>Not enrolled. No identity, permissions or budget.</p>
            </article>
          ))}
        </TabsContent>

        <TabsContent value="approvals" className="space-y-2">
          {!snap.approvals.length && <p className="text-sm text-muted-foreground">Nothing waiting. Merges, deploys, publishing, secrets, GitHub permissions and outside network access always land here.</p>}
          {snap.approvals.map((a) => (
            <div key={a.id} className="rounded border border-border p-3 text-sm">
              <p className="font-medium">{a.action_kind.replace("_", " ")} · {a.agent_id}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{a.description}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => withPasskey("approval", "Approve", (checkId) => fns.decide({ data: { approvalId: a.id, approve: true, checkId } }))}>Approve with passkey</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => withPasskey("approval", "Reject", (checkId) => fns.decide({ data: { approvalId: a.id, approve: false, checkId } }))}>Reject</Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="audit" className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="audit-agent" className="text-muted-foreground">Agent</label>
            <select id="audit-agent" className="rounded border border-border bg-background px-2 py-1" value={auditAgent} onChange={(e) => setAuditAgent(e.target.value)}>
              <option value="">All</option>
              {snap.agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const blob = new Blob([JSON.stringify(snap.audit, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `omni-audit-${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export
            </Button>
          </div>
          <ul className="max-h-80 space-y-1 overflow-auto font-mono text-xs">
            {!snap.audit.length && <li className="text-muted-foreground">No entries.</li>}
            {snap.audit.map((r) => (
              <li key={r.id} className="border-b border-border py-1">
                {when(r.at)} · {r.actor} · {r.agent_id ?? "—"} · {r.event}
                {r.output_head && <span className="text-muted-foreground"> · {r.output_head.slice(0, 120)}</span>}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="sessions">
          <ul className="space-y-1 text-sm">
            {!snap.sessions.length && <li className="text-muted-foreground">No sessions yet.</li>}
            {snap.sessions.map((s) => (
              <li key={s.id}>
                {s.id.slice(0, 8)} · {s.agent_id} · {s.sandbox_name ?? "no sandbox"} · {when(s.started_at)} → {s.ended_at ? `${when(s.ended_at)} (${s.end_reason})` : "open"}
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </section>
  );
}

type AgentRow = Snap["agents"][number];
function AgentGrant({ agent, busy, onSave }: { agent: AgentRow; busy: boolean; onSave: (g: { status: "enrolled" | "paused" | "revoked"; allowedActions: AgentAction[]; budgetTaskCents: number; budgetDayCents: number; budgetTotalCents: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(agent.status as "enrolled" | "paused" | "revoked");
  const [actions, setActions] = useState<AgentAction[]>(agent.allowed_actions as AgentAction[]);
  const [task, setTask] = useState(agent.budget_task_cents / 100);
  const [day, setDay] = useState(agent.budget_day_cents / 100);
  const [total, setTotal] = useState(agent.budget_total_cents / 100);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Permissions & budget</Button>;
  const c = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v * 100)));
  return (
    <div className="space-y-2 rounded border border-border p-2 text-xs">
      <select aria-label="Agent status" className="rounded border border-border bg-background px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        <option value="enrolled">Enrolled</option>
        <option value="paused">Paused</option>
        <option value="revoked">Revoked</option>
      </select>
      <div className="flex flex-wrap gap-3">
        {AGENT_ACTIONS.map((x) => (
          <label key={x} className="flex items-center gap-1">
            <input type="checkbox" checked={actions.includes(x)} onChange={(e) => setActions((a) => (e.target.checked ? [...a, x] : a.filter((y) => y !== x)))} />
            {ACTION_LABEL[x]}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label>Per task $<Input type="number" step="0.01" min={0} max={1} value={task} onChange={(e) => setTask(Number(e.target.value))} /></label>
        <label>Per day $<Input type="number" step="0.01" min={0} max={5} value={day} onChange={(e) => setDay(Number(e.target.value))} /></label>
        <label>Total $<Input type="number" step="0.01" min={0} max={10} value={total} onChange={(e) => setTotal(Number(e.target.value))} /></label>
      </div>
      <Button size="sm" disabled={busy} onClick={() => onSave({ status, allowedActions: actions, budgetTaskCents: c(task, GLOBAL_LIMITS.task), budgetDayCents: c(day, GLOBAL_LIMITS.day), budgetTotalCents: c(total, GLOBAL_LIMITS.total) })}>
        Save with passkey
      </Button>
    </div>
  );
}
