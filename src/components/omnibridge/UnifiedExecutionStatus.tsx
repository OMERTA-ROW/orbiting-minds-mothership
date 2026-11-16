import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getUnifiedExecutionState,
  controlUnifiedExecution,
  runAuthorizedPlan,
} from "@/lib/unified-activation.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Status = Awaited<ReturnType<typeof getUnifiedExecutionState>>;

/** Unmet prerequisites for "Authorize autonomous capability" (Jackboy re-checks all of them). */
export function armBlockers(status: Status | null): string[] {
  const state = status?.state;
  if (!state) return ["Fresh signed backend state is unavailable."];
  const out: string[] = [];
  if (!state.connected) out.push("Step 9 live link is not active at Jackboy — activate it first.");
  if (!state.configured)
    out.push("Step 10 \"Activate autonomy authorization\" has not configured Jackboy yet.");
  if (!state.executorRelease)
    out.push("No verified executor release — click Verify executor (valid 15 minutes).");
  if ("release" in status && status.release && !status.release.mothershipPinned)
    out.push(`Mothership's reviewed-release setting is not ${status.release.expected}.`);
  if (state.emergencyStop !== false) out.push("Jackboy CODE Emergency Stop is engaged or unknown.");
  if (state.killSwitch !== false) out.push("Jackboy System Kill Switch is on or unknown.");
  if (state.armed) out.push("Already authorized (armed).");
  return out;
}

export function UnifiedExecutionStatus({
  onChanged,
  onExecutorVerified,
}: {
  onChanged?: () => void;
  /** Display only: lets the combined panel mark an older result out of date. */
  onExecutorVerified?: (at: number) => void;
} = {}) {
  const read = useServerFn(getUnifiedExecutionState);
  const control = useServerFn(controlUnifiedExecution);
  const runPlan = useServerFn(runAuthorizedPlan);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planText, setPlanText] = useState("");
  const [outcome, setOutcome] = useState("");
  useEffect(() => {
    let alive = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await read();
        if (alive) setStatus(value);
      } catch {
        if (alive) {
          setStatus(null);
          setError("Fresh safety information is unavailable; execution is blocked.");
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [read]);
  async function act(operation: "verify" | "arm" | "disarm" | "reconcile") {
    if (
      !window.confirm(
        operation === "verify"
          ? "Run the isolated executor verification and cancellation drill? No autonomous job will start. Jackboy disarms on every verification, so arm again afterwards if you want bounded plans."
          : operation === "arm"
            ? "Authorize bounded autonomous plans? Emergency Stop is not released and no job starts."
            : operation === "reconcile"
              ? "Roll back pending activation, cancel its work and close the failed attempt? No approval is granted."
              : "Disarm autonomous execution and cancel outstanding plans?",
      )
    )
      return;
    setBusy(true);
    setError("");
    setOutcome("");
    try {
      const result = await control({ data: { operation, confirm: true } });
      if (operation === "verify" && result && "executorRelease" in result) onExecutorVerified?.(Date.now());
      if (operation === "verify" && result && "executorRelease" in result)
        setOutcome(
          `Jackboy verified the executor (release ${result.executorRelease}) at ${new Date(result.checkedAt).toLocaleTimeString()}. Jackboy needs a fresh verification within 15 minutes before configuring or authorizing. Nothing was armed or started.`,
        );
      if (operation === "reconcile") {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith("activation-operation:")) sessionStorage.removeItem(key);
      }
      if (operation === "reconcile")
        setOutcome("Reconciled: the earlier activation was rolled back and closed. Nothing was granted.");
      setStatus(await read());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Execution control failed");
      setStatus(null);
    } finally {
      setBusy(false);
      // The approvals panel reads the same records; refresh it so Step 9/10 controls update at once.
      onChanged?.();
    }
  }
  const blockers = armBlockers(status);
  async function submitPlan() {
    if (
      !window.confirm(
        "Authorize this exact bounded plan to run once in the isolated executor? Fresh owner authentication and Jackboy permission are still required.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setOutcome("");
    try {
      const result = await runPlan({
        data: {
          jobId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          commands: JSON.parse(planText),
          confirm: true,
        },
      });
      setOutcome(
        `Job ${result.jobId}: ${result.outcome}. Paid-provider cost: $${result.providerCostUsd}. Infrastructure cost is not measured.`,
      );
      setStatus(await read());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Plan outcome is unverified; do not replay it.",
      );
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="backend-execution"
      className="scroll-mt-24 space-y-2 rounded-lg border bg-card p-4"
      aria-label="Backend execution state"
    >
      <h2 className="text-lg">Backend: {status?.label ?? "Blocked"}</h2>
      <p className="text-sm">
        Signed connection: {status?.state?.connected ? "active" : "unverified"} · Configuration:{" "}
        {status?.state?.configured ? "configured" : "not configured"} · Jackboy Stop:{" "}
        {status?.state?.emergencyStop === false ? "released" : "engaged or unknown"} · Jackboy Kill
        Switch: {status?.state?.killSwitch === false ? "off" : "on or unknown"}.
      </p>
      {status && !status.state && "reason" in status && status.reason && (
        <p className="text-sm text-muted-foreground">Why blocked: {status.reason}.</p>
      )}
      {status && "release" in status && status.release && (
        <p className="text-sm text-muted-foreground">
          Executor release reported by Jackboy: {status.release.jackboyRelease ?? "none"}
          {status.release.jackboyRelease
            ? status.release.jackboyMatches
              ? " (the accepted release)"
              : ` (not the accepted ${status.release.expected})`
            : ""}{" "}
          · Mothership reviewed-release setting:{" "}
          {status.release.mothershipPinned
            ? `set to ${status.release.expected}`
            : `not set to ${status.release.expected}, so Authorize autonomous capability is refused`}
          . Jackboy does not report when it last verified the executor.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        No approval starts jobs. Manual sandbox sessions retain their separate policy.{" "}
        {status?.state?.cancellationPending
          ? "Cancellation is pending; do not claim jobs have stopped."
          : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} variant="outline" onClick={() => void act("verify")}>
          Verify executor
        </Button>
        <Button
          disabled={busy || blockers.length > 0}
          variant="outline"
          aria-describedby="arm-blockers"
          onClick={() => void act("arm")}
        >
          Authorize autonomous capability
        </Button>
        <Button disabled={busy} variant="destructive" onClick={() => void act("disarm")}>
          Disarm autonomy
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => void act("reconcile")}>
          Reconcile pending activation
        </Button>
      </div>
      {blockers.length > 0 && (
        <div id="arm-blockers" className="text-xs text-muted-foreground">
          <p className="font-medium">Authorize autonomous capability needs:</p>
          <ul className="list-disc pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <label htmlFor="bounded-omni-plan" className="block text-sm">
        Explicit bounded plan (JSON command array; no shell, network or provider calls)
      </label>
      <Textarea
        id="bounded-omni-plan"
        value={planText}
        onChange={(event) => setPlanText(event.target.value)}
        placeholder={'[{"argv":["/usr/bin/true"],"timeoutMs":1000}]'}
      />
      <Button
        disabled={busy || !status?.state?.executionReady || !planText.trim()}
        onClick={() => void submitPlan()}
      >
        Authorize and run this plan once
      </Button>
      {outcome && (
        <p role="status" className="text-sm">
          {outcome}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
