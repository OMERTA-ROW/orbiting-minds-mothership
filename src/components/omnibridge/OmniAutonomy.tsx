import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/evo";
import { useAccount } from "@/hooks/use-account";
import { readAutonomyReadiness, submitAutonomyTask } from "@/lib/omni-autonomy.functions";
import {
  allowedActions,
  canTransition,
  protectedActions,
  type AllowedAction,
  type AutonomyReadiness,
  type AutonomyTask,
  type ProtectedAction,
  type TaskState,
} from "@/lib/omni-autonomy";

export function OmniAutonomy() {
  const { user } = useAccount();
  const check = useServerFn(readAutonomyReadiness);
  const submit = useServerFn(submitAutonomyTask);
  const [ready, setReady] = useState<AutonomyReadiness | null>(null);
  const [goal, setGoal] = useState("");
  const [hosts, setHosts] = useState("");
  const [actions, setActions] = useState<AllowedAction[]>(["read", "navigate"]);
  const [grants, setGrants] = useState<ProtectedAction[]>([]);
  const [task, setTask] = useState<AutonomyTask | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"check" | "submit" | null>(null);
  const revision = useRef(0);
  useEffect(() => { revision.current++; setReady(null); setTask(null); setError(""); setBusy(null); return () => { revision.current++; }; }, [user?.id]);

  const move = (to: TaskState, note: string) =>
    setTask((t) =>
      t && canTransition(t.state, to)
        ? { ...t, state: to, log: [...t.log, { at: new Date().toISOString(), state: to, note }] }
        : t,
    );
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function run() {
    if (busy) return;
    const current = ++revision.current;
    setBusy("submit");
    setError("");
    try {
      const allowlist = hosts.split(/[\s,]+/).filter(Boolean).map((host) => ({ host, actions }));
      const result = await submit({ data: { requestId: crypto.randomUUID(), goal, allowlist, grants, maxSteps: 10 } });
      if (revision.current === current) setTask(result);
    } catch (e) {
      if (revision.current === current) setError(e instanceof Error ? e.message : "Task was not accepted.");
    } finally {
      if (revision.current === current) setBusy(null);
    }
  }

  return (
    <section aria-label="Autonomous task mode" className="my-7 border-y border-gold/30 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Private accounts only</p>
          <h2 className="mt-3 text-2xl">Autonomous task mode</h2>
        </div>
        <DemoBadge label="BLOCKED · EXECUTOR NOT CONNECTED" />
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
        OMNI cannot control a browser or computer yet: no executor or host companion is connected. Tasks are
        checked against your account and allowlist on the server, then stop as Blocked. Spending, deleting,
        credential changes, public posts and outside messages always need your approval.
      </p>
      {!user ? (
        <p className="mt-4 text-xs text-warning">Blocked: sign in with an owner or invited private account.</p>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Button variant="outline" size="sm" disabled={!!busy} onClick={async () => {
              if (busy) return;
              const current = ++revision.current;
              setBusy("check"); setError(""); setReady(null);
              try { const result = await check(); if (revision.current === current) setReady(result); }
              catch (e) { if (revision.current === current) setError(e instanceof Error ? e.message : "Readiness check failed. Retry; no task was started."); }
              finally { if (revision.current === current) setBusy(null); }
            }}>
              {busy === "check" ? "Checking…" : "Check readiness"}
            </Button>
            {ready && <p role="status" className="text-xs text-warning">{ready.state}{ready.role ? ` · role ${ready.role}` : ""}</p>}
            <label className="block text-xs">
              Goal
              <textarea aria-label="Task goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" rows={3} />
            </label>
            <label className="block text-xs">
              Allowed websites (hosts)
              <input aria-label="Allowed websites" value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="example.com" className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" />
            </label>
            <fieldset className="text-xs">
              <legend>Allowed actions</legend>
              {allowedActions.map((a) => (
                <label key={a} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={actions.includes(a)} onChange={() => setActions(toggle(actions, a))} /> {a}
                </label>
              ))}
            </fieldset>
            <fieldset className="text-xs">
              <legend>Task-specific approvals (still confirmed live)</legend>
              {protectedActions.map((a) => (
                <label key={a} className="mr-3 inline-flex items-center gap-1">
                  <input type="checkbox" checked={grants.includes(a)} onChange={() => setGrants(toggle(grants, a))} /> {a.replace("_", " ")}
                </label>
              ))}
            </fieldset>
            <Button size="sm" disabled={!!busy} onClick={() => void run()}>{busy === "submit" ? "Submitting…" : "Submit task"}</Button>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <div aria-live="polite">
            {task ? (
              <>
                <p className="text-sm">State: <strong>{task.state}</strong> · not saved</p>
                {task.hints.length > 0 && (
                  <p className="mt-1 text-xs text-warning">Goal mentions protected actions: {task.hints.join(", ")}. Approval required.</p>
                )}
                <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {task.log.map((l, i) => <li key={i}>{l.at.slice(11, 19)} · {l.state} · {l.note}</li>)}
                </ol>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!canTransition(task.state, "paused")} onClick={() => move("paused", "Paused by you.")}>Pause</Button>
                  <Button variant="outline" size="sm" disabled={!canTransition(task.state, "stopped")} onClick={() => move("stopped", "Stopped by you.")}>Stop</Button>
                  <Button variant="outline" size="sm" disabled={!canTransition(task.state, "revoked")} onClick={() => move("revoked", "Access revoked by you.")}>Revoke</Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No task submitted.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
