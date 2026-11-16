import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { activateTogether, getActivationReadiness } from "@/lib/activation-orchestrate.functions";
import {
  readinessChecklist,
  STAGE_LABEL,
  type CheckStatus,
  type StageResult,
} from "@/lib/activation-orchestration";
import { FlowTimeoutError, withTimeout } from "@/lib/activation-flow";
import {
  attemptTime,
  outcomeStaleReason,
  stageLine,
  type InEffect,
  type ShownOutcome,
} from "@/lib/activation-outcome";
import { Button } from "@/components/ui/button";

type Facts = Awaited<ReturnType<typeof getActivationReadiness>>;
type Outcome = ShownOutcome | { inProgress: true; attemptedAt: number };

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: "Done",
  action: "Needs action",
  blocked: "Blocked",
  unknown: "Unknown",
  info: "Info",
};
const STAGE_TEXT: Record<StageResult["status"], string> = {
  done: "Done",
  already: "Already in effect",
  failed: "Failed (rolled back)",
  skipped: "Not attempted",
  not_selected: "Not selected",
};

/** Combined activation can run Step 9, Step 10 (verify + configure) and arm in one request. */
export const ORCHESTRATE_TIMEOUT_MS = 150_000;

export function ActivationOrchestrator(props: {
  mfaFresh: boolean;
  step9Approved: boolean;
  step10Approved: boolean;
  busy: boolean;
  onChanged?: () => void;
  timeoutMs?: number;
  /** Client time of the latest successful "Verify executor" (display only). */
  executorVerifiedAt?: number | null;
}) {
  const read = useServerFn(getActivationReadiness);
  const run = useServerFn(activateTogether);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [factsReadAt, setFactsReadAt] = useState(0);
  const [readError, setReadError] = useState("");
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [sel, setSel] = useState({ liveLink: false, autonomy: false, arm: false });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Kept across an unanswered request so a retry continues the same attempts, never duplicates them.
  const attempts = useRef<{ live_link: string; autonomy: string } | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setReadError("");
    try {
      setFacts(await withTimeout(read(), 30_000));
      setFactsReadAt(Date.now());
    } catch {
      setFacts(null);
      setReadError("Readiness could not be read; everything counts as not ready.");
    } finally {
      setChecking(false);
    }
  }, [read]);
  useEffect(() => {
    void check();
  }, [check]);

  const list = facts
    ? readinessChecklist({
        now: Date.now(),
        jackboyBuild: facts.jackboyBuild,
        windowEndsAt: facts.windowEndsAt,
        step9Approved: props.step9Approved,
        step10Approved: props.step10Approved,
        linkEffective: facts.linkEffective,
        autonomyEffective: facts.autonomyEffective,
        mothershipStop: facts.mothershipStop,
        jackboy: facts.jackboy,
        executor: facts.executor,
        pinned: facts.pinned,
        codeEnabled: facts.codeEnabled,
        codeAllowed: null,
        activePermits: facts.activePermits,
        sandbox: facts.sandbox,
      })
    : null;

  const inEffect: InEffect | null = facts
    ? {
        live_link: facts.linkEffective && !!facts.jackboy?.connected,
        autonomy: facts.autonomyEffective && !!facts.jackboy?.configured,
        arm: !!facts.jackboy?.armed,
        readAt: factsReadAt,
      }
    : null;
  const stale =
    outcome && !("inProgress" in outcome)
      ? outcomeStaleReason(outcome, {
          executorVerifiedAt: props.executorVerifiedAt ?? null,
          inEffect,
        })
      : null;

  const anySelected = sel.liveLink || sel.autonomy || sel.arm;
  const disabled = props.busy || running || !props.mfaFresh || !anySelected;

  async function start() {
    const chosen = [
      sel.liveLink && STAGE_LABEL.live_link,
      sel.autonomy && STAGE_LABEL.autonomy,
      sel.arm && STAGE_LABEL.arm,
    ].filter(Boolean);
    if (
      !window.confirm(
        `Run, in order: ${chosen.join(" → ")}? Steps already in effect are skipped. No stop is released, CODE is not turned on, caps are unchanged and no plan starts.`,
      )
    )
      return;
    const attemptedAt = Date.now();
    setRunning(true);
    // Replace any earlier result at once, so an old failure never reads as this attempt.
    setOutcome({ inProgress: true, attemptedAt });
    attempts.current ??= { live_link: crypto.randomUUID(), autonomy: crypto.randomUUID() };
    try {
      const result = await withTimeout(
        run({ data: { confirm: true, ...sel, attempts: attempts.current } }),
        props.timeoutMs ?? ORCHESTRATE_TIMEOUT_MS,
      );
      attempts.current = null;
      setOutcome({
        summary: result.summary,
        stages: result.stages,
        ownerAction: result.ownerAction,
        ok: result.ok,
        attemptedAt,
      });
      setSel({ liveLink: false, autonomy: false, arm: false });
    } catch (error) {
      setOutcome({
        ok: false,
        stages: [],
        ownerAction: null,
        attemptedAt,
        summary:
          error instanceof FlowTimeoutError
            ? `${error.message} The result is unknown, not active. Refresh; retrying continues the same attempts.`
            : "The combined activation did not complete; its result is unknown, not active. Refresh; retrying continues the same attempts.",
      });
    } finally {
      setRunning(false);
      props.onChanged?.();
      await check();
    }
  }

  return (
    <section
      aria-label="Activate OMNI and Jackboy together"
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Activate OMNI and Jackboy together</h2>
        <Button size="sm" variant="outline" disabled={checking || running} onClick={() => void check()}>
          {checking ? "Checking…" : "Check readiness"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        One place for the whole sequence. Each step still uses its own approval and checks, and any
        failed step is rolled back. Stops, CODE and spending limits are never changed here.
      </p>
      {readError && (
        <p role="alert" className="text-sm text-destructive">
          {readError}
        </p>
      )}
      {list && (
        <>
          <p
            role="status"
            className={`text-sm font-medium ${list.operational ? "text-primary" : "text-destructive"}`}
          >
            {list.headline}
          </p>
          <p className="text-sm">
            <strong>Next:</strong> {list.nextAction}
          </p>
          <ul className="space-y-1 text-sm" aria-label="Readiness checklist">
            {list.items.map((item) => (
              <li key={item.id} className="border-b py-1.5 last:border-b-0">
                <span className="font-medium">{item.label}</span>{" "}
                <span
                  className={
                    item.status === "ok"
                      ? "text-primary"
                      : item.status === "info"
                        ? "text-muted-foreground"
                        : "text-destructive"
                  }
                >
                  — {STATUS_TEXT[item.status]}
                  {item.required ? "" : " (separate)"}
                </span>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Checked {facts ? new Date(facts.checkedAt).toLocaleTimeString() : ""}. Read-only: nothing
            was changed by this check.
          </p>
        </>
      )}
      <fieldset className="space-y-1 text-sm" disabled={running || props.busy}>
        <legend className="font-medium">Include (each is your separate choice)</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sel.liveLink}
            disabled={!props.step9Approved}
            onChange={(e) => setSel((s) => ({ ...s, liveLink: e.target.checked }))}
          />
          {STAGE_LABEL.live_link}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sel.autonomy}
            disabled={!props.step10Approved}
            onChange={(e) => setSel((s) => ({ ...s, autonomy: e.target.checked }))}
          />
          {STAGE_LABEL.autonomy}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sel.arm}
            disabled={!props.step10Approved}
            onChange={(e) => setSel((s) => ({ ...s, arm: e.target.checked }))}
          />
          {STAGE_LABEL.arm} (needs the staging executor (Vultr) enabled; starts nothing)
        </label>
      </fieldset>
      <Button disabled={disabled} onClick={() => void start()}>
        {running ? "Activating… (up to 2½ minutes)" : "Activate selected together"}
      </Button>
      {!props.mfaFresh && (
        <p className="text-xs text-muted-foreground">
          Re-verify with your authenticator at the top of this page first.
        </p>
      )}
      {outcome && "inProgress" in outcome && (
        <p role="status" className="text-sm" aria-label="Activation in progress">
          <strong>In progress</strong> — started at {attemptTime(outcome.attemptedAt)}. The previous
          result was cleared; this attempt's result appears here when it finishes.
        </p>
      )}
      {outcome && !("inProgress" in outcome) && (
        <div
          role={outcome.ok || stale ? "status" : "alert"}
          aria-label="Previous activation attempt"
          className={`space-y-1 rounded-md border p-3 text-sm ${
            stale ? "text-muted-foreground" : outcome.ok ? "" : "text-destructive"
          }`}
        >
          <p className="font-medium">
            Previous attempt — Last attempt at {attemptTime(outcome.attemptedAt)}
            {stale ? " (out of date)" : ""}
          </p>
          {stale && (
            <p>
              <strong>Out of date:</strong> {stale} The checklist above shows the current state.
            </p>
          )}
          <p>{outcome.summary}</p>
          {outcome.stages.length > 0 && (
            <ol className="list-decimal pl-5 text-muted-foreground">
              {outcome.stages.map((s) => (
                <li key={s.id}>
                  <strong>{STAGE_LABEL[s.id]}:</strong> {STAGE_TEXT[s.status]} —{" "}
                  {stageLine(s, outcome.ownerAction)}
                </li>
              ))}
            </ol>
          )}
          {outcome.ownerAction && (
            <p>
              <strong>Your action{stale ? " (at that time)" : ""}:</strong> {outcome.ownerAction}{" "}
              (from the attempt at {attemptTime(outcome.attemptedAt)})
            </p>
          )}
        </div>
      )}
    </section>
  );
}
