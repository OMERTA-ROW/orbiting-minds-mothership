import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReadinessItem } from "@/lib/activation-self-test";

export type SelfTestOutcome =
  | {
      ok: true;
      outcome: "passed" | "failed";
      resumed: boolean;
      job: { id: string; status: string; checks: number; runner: string } | null;
      startedAt: string | null;
      finishedAt: string | null;
      approvalNeeded: boolean;
    }
  | {
      ok: false;
      reason: string;
      message: string;
      details: Array<{ label: string; status: string; detail: string }>;
      sent: boolean;
    };

const REASON_TITLE: Record<string, string> = {
  safety_denial: "Safety denial — nothing was run",
  not_ready: "Not sent — a setting needs attention",
  timeout: "Timeout — no usable reply in time",
  client_timeout: "This page stopped waiting",
  refused: "Jackboy refused the request",
  link_failure: "Signed link did not complete",
  invalid_reply: "Reply was not valid evidence",
  busy: "Another self-test is still running",
  pending: "Self-test still running",
  closed: "Job closed without a result",
  mfa: "Fresh two-step code needed",
  rule: "Not available yet",
  already_approved: "Already approved",
  denied: "Could not be recorded",
  store_missing: "Check store unavailable",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function Step8SelfTest(props: {
  readiness: ReadinessItem[] | undefined;
  /** Step unlocked, check store ready and two-step code fresh. */
  stepReady: boolean;
  mfaFresh: boolean;
  busy: boolean;
  running: boolean;
  elapsedSeconds: number;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  /** An unfinished attempt exists: the next click only continues it (status read). */
  attemptPending: boolean;
  retry: boolean;
  result: SelfTestOutcome | null;
  onRun: () => void;
  onVerifyOnly: () => void;
  onNewAttempt: () => void;
}) {
  const readiness = props.readiness ?? [];
  const blockers = readiness.filter((item) => !item.ok);
  const settingsReady = readiness.length > 0 && blockers.length === 0;
  const canRun =
    props.stepReady && settingsReady && props.confirmed && !props.busy && props.mfaFresh;
  const label = props.attemptPending
    ? "Continue pending self-test (status only)"
    : props.retry
      ? "Retry protocol self-test & verify"
      : "Run protocol self-test & verify";
  const hint = !props.mfaFresh
    ? "Enter a fresh two-step code first."
    : !settingsReady
      ? "Resolve the settings marked below first."
      : !props.confirmed
        ? "Tick the authorization box to enable the button."
        : null;
  const result = props.result;

  return (
    <section aria-labelledby="step-8-selftest-title" className="space-y-3 rounded border p-3">
      <h4 id="step-8-selftest-title" className="text-sm font-medium">
        Run protocol self-test &amp; verify
      </h4>
      <p className="text-xs text-muted-foreground">
        One click asks Jackboy, through the signed link, to run its fixed restricted protocol
        self-test once, waits up to about 30 seconds, then verifies the signed result and records it
        as Step 8 evidence. It runs no CODE, writes no files, changes no switches or limits and never
        approves Step 8 for you.
      </p>

      <div>
        <p className="text-xs font-medium">Before sending (read from the server)</p>
        {readiness.length === 0 ? (
          <p className="text-xs text-muted-foreground">Readiness could not be read; nothing can be sent.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs" aria-label="Self-test readiness">
            {readiness.map((item) => (
              <li key={item.key} className="flex gap-2">
                {item.ok ? (
                  <CheckCircle2 size={14} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                ) : (
                  <XCircle size={14} aria-hidden className="mt-0.5 shrink-0 text-destructive" />
                )}
                <span>
                  <strong>{item.label}</strong> ({item.ok ? "ready" : "needs attention"}):{" "}
                  <span className="text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
            <li className="flex gap-2 text-muted-foreground">
              <ShieldAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <strong>Jackboy Kill Switch</strong>: checked by Jackboy when the test is sent. If it
                is on, you will see a safety denial; it is never bypassed or released from here.
              </span>
            </li>
          </ul>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={props.confirmed}
          disabled={props.busy}
          onChange={(e) => props.onConfirmedChange(e.target.checked)}
        />
        <span>
          I authorize Mothership to ask Jackboy to run the fixed protocol self-test once now. I
          understand this approves nothing and enables no CODE or autonomy.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canRun || !props.stepReady} onClick={props.onRun}>
          {props.running && (
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
          )}
          {label}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={props.busy || !props.stepReady}
          onClick={props.onVerifyOnly}
        >
          Verify recorded proof only
        </Button>
        {props.attemptPending && !props.busy && (
          <Button size="sm" variant="ghost" onClick={props.onNewAttempt}>
            Start a new attempt
          </Button>
        )}
        {hint && !props.busy && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      {props.running && (
        <p role="status" className="text-xs text-muted-foreground">
          Running the self-test through Jackboy… {props.elapsedSeconds} s
        </p>
      )}

      {result && !props.running && (
        <div
          aria-label="Self-test result"
          className={`space-y-1 rounded border p-2 text-xs ${
            result.ok && result.outcome === "passed" ? "" : "border-destructive/50"
          }`}
        >
          {result.ok ? (
            <>
              <p className="text-sm">
                <strong>{result.outcome === "passed" ? "Passed" : "Failed"}</strong>
                {result.resumed ? " (recorded result of this attempt; not run again)" : ""}
              </p>
              {result.job && (
                <p>
                  Job {result.job.id} · {result.job.status} · {result.job.checks} check(s)
                  {result.job.runner ? ` · ${result.job.runner}` : ""} · signature verified
                </p>
              )}
              <p className="text-muted-foreground">
                Started {when(result.startedAt)} · finished {when(result.finishedAt)}
              </p>
              <p>
                {result.outcome === "passed"
                  ? "Not approved yet: approve Step 8 yourself within 15 minutes, with a fresh two-step code."
                  : "Step 8 stays locked as failed. Fix the cause in Jackboy/Railway, then retry."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                <strong>{REASON_TITLE[result.reason] ?? "Not completed"}</strong>
              </p>
              <p>{result.message}</p>
              {result.details.length > 0 && (
                <ul className="space-y-0.5 text-muted-foreground">
                  {result.details.map((d, i) => (
                    <li key={`${d.label}-${i}`}>
                      <strong>{d.label}</strong>: {d.detail}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
