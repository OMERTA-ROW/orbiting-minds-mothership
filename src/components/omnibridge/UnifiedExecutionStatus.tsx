import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getUnifiedExecutionState, controlUnifiedExecution } from "@/lib/unified-activation.functions";
import { Button } from "@/components/ui/button";

export function UnifiedExecutionStatus() {
  const read = useServerFn(getUnifiedExecutionState);
  const control = useServerFn(controlUnifiedExecution);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getUnifiedExecutionState>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => read().then((value) => { if (alive) setStatus(value); }).catch(() => {
      if (alive) { setStatus(null); setError("Fresh safety information is unavailable; execution is blocked."); }
    });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [read]);
  async function act(operation: "verify" | "arm" | "disarm") {
    if (!window.confirm(operation === "verify" ? "Run the isolated executor verification and cancellation drill? No autonomous job will start." :
      operation === "arm" ? "Authorize bounded autonomous plans? Emergency Stop is not released and no job starts." : "Disarm autonomous execution and cancel outstanding plans?")) return;
    setBusy(true);
    setError("");
    try { await control({ data: { operation, confirm: true } }); setStatus(await read()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Execution control failed"); setStatus(null); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2 rounded-lg border bg-card p-4" aria-label="Backend execution state">
    <h2 className="text-lg">Backend: {status?.label ?? "Blocked"}</h2>
    <p className="text-sm">Signed connection: {status?.state?.connected ? "active" : "unverified"} · Configuration: {status?.state?.configured ? "configured" : "not configured"} · Jackboy Stop: {status?.state?.emergencyStop === false ? "released" : "engaged or unknown"}.</p>
    <p className="text-sm text-muted-foreground">No approval starts jobs. Manual sandbox sessions retain their separate policy. {status?.state?.cancellationPending ? "Cancellation is pending; do not claim jobs have stopped." : ""}</p>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} variant="outline" onClick={() => void act("verify")}>Verify executor</Button>
      <Button disabled={busy || !status?.state?.configured || status.state.emergencyStop || status.state.killSwitch} variant="outline" onClick={() => void act("arm")}>Authorize autonomous capability</Button>
      <Button disabled={busy} variant="destructive" onClick={() => void act("disarm")}>Disarm autonomy</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
