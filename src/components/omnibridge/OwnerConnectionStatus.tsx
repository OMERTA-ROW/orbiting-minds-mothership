import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnifiedExecutionState } from "@/lib/unified-activation.functions";
import { connectionRows, type Tone, type UnifiedStatus } from "@/lib/owner-dashboard";
import { cn } from "@/lib/utils";

const TONE: Record<Tone, string> = {
  good: "border-primary/50 text-primary",
  warn: "border-destructive/50 text-destructive",
  neutral: "border-border text-foreground",
  unknown: "border-border text-muted-foreground",
};

/** Read-only signed connection status; one reading on open and on request, never a control. */
export function OwnerConnectionStatus() {
  const read = useServerFn(getUnifiedExecutionState);
  const [status, setStatus] = useState<UnifiedStatus | null>(null);
  const [phase, setPhase] = useState<"checking" | "done" | "failed">("checking");

  const check = useCallback(async () => {
    setPhase("checking");
    try {
      setStatus(await read());
      setPhase("done");
    } catch {
      setStatus(null);
      setPhase("failed");
    }
  }, [read]);

  useEffect(() => {
    void check();
  }, [check]);

  const view = connectionRows(status);
  return (
    <section
      aria-labelledby="connection-status"
      className="space-y-4 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="connection-status" className="text-lg">
          Connection status
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={phase === "checking"}
          onClick={() => void check()}
        >
          <RefreshCw size={14} aria-hidden className={phase === "checking" ? "animate-spin" : ""} />
          {phase === "checking" ? "Checking…" : "Check again"}
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {view.rows.map((row) => (
          <div key={row.label} className={cn("rounded-md border px-3 py-2", TONE[row.tone])}>
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 text-sm font-medium">
              {phase === "checking" && !status ? "Checking…" : row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p role="status" className="text-xs text-muted-foreground">
        {phase === "checking"
          ? "Asking Jackboy for a fresh signed reading…"
          : phase === "failed"
            ? "Status could not be read (owner sign-in with your 6-digit code is required). Treat everything as off."
            : `${view.note}${view.checkedAt ? ` Checked ${new Date(view.checkedAt).toLocaleTimeString()}.` : ""}`}{" "}
        <Link to="/activation-approvals" className="text-primary underline underline-offset-4">
          Full readiness details
        </Link>
      </p>
    </section>
  );
}
