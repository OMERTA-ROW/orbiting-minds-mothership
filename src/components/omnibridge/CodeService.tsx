import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, FolderLock, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readCodeService } from "@/lib/omni-code.functions";
import { CODE_QUEUE_LIMITS } from "@/lib/omni-code-queue";

type Snap = Awaited<ReturnType<typeof readCodeService>>;

/** Read-only OMNI CODE service status: supervised queue, folder permissions, why it is off. */
export function CodeService() {
  const read = useServerFn(readCodeService);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setSnap(await read());
    } catch {
      setError("CODE service status could not be read.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!snap) return <p className="text-sm text-muted-foreground">{error ?? "Loading OMNI CODE service…"}</p>;
  const s = snap.settings;
  return (
    <section aria-label="OMNI CODE service" className="space-y-3 rounded border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          OMNI CODE service: <b>{snap.status.processing ? "Processing authorized jobs" : "OFF"}</b>
        </h3>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
          {busy ? "Checking…" : "Refresh"}
        </Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Always-on means OMNI CODE picks up jobs you already authorized — up to {s.maxConcurrent} at once, {s.maxPerAgent} per agent, {s.jobsPerAgentPerHour} per agent per hour, retried at most {CODE_QUEUE_LIMITS.maxAttempts} times, resumed from their last checkpoint. Your authorization lasts at most {CODE_QUEUE_LIMITS.alwaysOnMaxHours} hours and is renewed with your passkey. File changes, overwrites and moves to Trash always wait for you. Jackboy's autonomous mode stays off separately.
      </p>
      <div>
        <p className="font-medium">Why it is off</p>
        <ul className="mt-1 space-y-1">
          {snap.status.reasons.map((r) => (
            <li key={r} className="flex gap-2"><CircleSlash size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />{r}</li>
          ))}
          {snap.readinessMissing.map((r) => (
            <li key={r} className="flex gap-2 pl-5 text-xs text-muted-foreground">Missing: {r}</li>
          ))}
          {!snap.status.reasons.length && (
            <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 text-primary" aria-hidden />All service conditions met.</li>
          )}
        </ul>
      </div>
      <p className="flex items-center gap-2">
        <Laptop size={14} aria-hidden /> Mac companion: <b>Not connected</b> <span className="text-xs text-muted-foreground">— {snap.companion.reason} Mac jobs never run while it is disconnected.</span>
      </p>
      <p className="flex items-center gap-2">
        <FolderLock size={14} aria-hidden /> Folder permissions: <b>{snap.grants.filter((g) => !g.revoked_at && Date.parse(g.expires_at) > snap.now).length} active</b>
        <span className="text-xs text-muted-foreground">— no full disk access; only folders you pick, read-only or organize, for up to 30 days.</span>
      </p>
      <p>
        Queue: {snap.jobs.length ? `${snap.jobs.filter((j) => ["queued", "retry_wait", "awaiting_approval", "paused"].includes(j.status)).length} waiting · ${snap.jobs.filter((j) => j.status === "running" || j.status === "leased").length} running` : "empty"}
        {" · "}File plans: {snap.plans.length || "none"}
      </p>
      {snap.jobs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {snap.jobs.slice(0, 10).map((j) => (
            <li key={j.id}>{j.agent_id} · {j.kind} · <b>{j.status}</b> · {j.title} · attempt {j.attempts}/{j.max_attempts}{j.error ? ` · ${j.error}` : ""}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
