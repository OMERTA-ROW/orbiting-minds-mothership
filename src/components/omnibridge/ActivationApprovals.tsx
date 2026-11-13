import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  decideActivationApproval,
  listActivationApprovals,
  runActivationApprovalCheck,
} from "@/lib/activation-approvals.functions";
import {
  ACTIVATION_STEPS,
  FRESH_MFA_SECONDS,
  NOTE_MAX,
  isEffectivelyApproved,
  noteProblem,
  validateExpiry,
  type ApprovalAction,
  type ApprovalRow,
} from "@/lib/activation-approvals";
import {
  ACCESS_TEXT,
  STEP_STATE_LABEL,
  accessReason,
  approvedBeforeReset,
  effectiveRows,
  nextAction,
  type AccessReason,
} from "@/lib/activation-status";
import {
  FLOW_TIMEOUTS,
  FlowTimeoutError,
  nextEligibleStep,
  stepViews,
  withTimeout,
  type FlowTimeouts,
} from "@/lib/activation-flow";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";

type Listed = Awaited<ReturnType<typeof listActivationApprovals>>;
type Loaded = Extract<Listed, { rows: unknown }>;

const ACTION_LABEL: Record<string, string> = {
  approve: "Approved",
  fail: "Marked failed",
  revoke: "Revoked",
  revoke_cascade: "Reset (earlier step changed)",
  check_passed: "Check passed",
  check_failed: "Check failed",
  check_needs_attention: "Check needs attention",
  fresh_evidence_required: "Reset for fresh evidence",
};

const CHECK_LABEL = { passed: "Passed", failed: "Failed", needs_attention: "Needs attention" };

type Pending = {
  kind: "check" | "decide" | "refresh" | "reverify";
  step: number | null;
  since: number;
};
type Notice = { step: number | null; text: string; tone?: "ok" | "error" };

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function toLocalInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function ActivationApprovals({ timeouts }: { timeouts?: Partial<FlowTimeouts> } = {}) {
  const limits = useMemo(() => ({ ...FLOW_TIMEOUTS, ...timeouts }), [timeouts]);
  const list = useServerFn(listActivationApprovals);
  const decide = useServerFn(decideActivationApproval);
  const runCheck = useServerFn(runActivationApprovalCheck);
  const [data, setData] = useState<Loaded | null>(null);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [reason, setReason] = useState<AccessReason>("unreadable");
  const [stalled, setStalled] = useState(false);
  const [who, setWho] = useState<{ email: string; since: string } | null>(null);
  // One action at a time: the ref blocks a second click before React re-renders.
  const inFlight = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const busy = pending !== null;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [expiry, setExpiry] = useState(() => toLocalInput(Date.now() + 12 * 3600_000));
  const [cap, setCap] = useState(false);
  const [daily, setDaily] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const focused = useRef<number | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const result = await withTimeout(list(), limits.list);
    if ("denied" in result) {
      setReason(result.reason ?? "unreadable");
      throw new Error(result.reason);
    }
    setData(result);
    setNow(Date.now());
  }, [list, limits.list]);

  const checkAccess = useCallback(() => {
    setAccess("checking");
    setStalled(false);
    return refresh().then(
      () => setAccess("ok"),
      (error: unknown) => {
        if (error instanceof FlowTimeoutError) {
          setStalled(true);
          setReason("unreadable");
        } else {
          // Thrown before the owner check (no session, network): say so specifically.
          const msg = error instanceof Error ? error.message : "";
          if (!(msg in ACCESS_TEXT)) setReason(accessReason(msg));
        }
        setAccess("denied");
      },
    );
  }, [refresh]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  // Which account is signed in, so a returning owner can see it is the same account.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data: u }) => {
      if (u.user?.email)
        setWho({ email: u.user.email, since: new Date(u.user.created_at).toLocaleDateString() });
      else setWho(null);
    });
  }, [access]);

  // Clock: every 30 s normally, every second while an action is running (elapsed time).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), pending ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [pending]);

  const mfaFresh = useMemo(() => {
    if (!data || data.mfaAgeSeconds === null) return false;
    return data.mfaAgeSeconds <= FRESH_MFA_SECONDS;
  }, [data]);

  const views = useMemo(
    () =>
      data
        ? stepViews({
            rows: data.rows,
            checks: data.checks,
            audit: data.audit,
            now,
            resetAt: data.securityResetAt,
            mfaFresh,
            checksStore: data.checksStore,
          })
        : [],
    [data, now, mfaFresh],
  );
  const nextStep = nextEligibleStep(views);

  // Move focus to the next eligible step on load and whenever it changes.
  useEffect(() => {
    if (!data || focused.current === nextStep) return;
    focused.current = nextStep;
    if (nextStep === null) return;
    const el = document.getElementById(`step-${nextStep}-title`);
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [data, nextStep]);

  /** Runs one owner action; ignores any second request while one is in flight. */
  async function exclusive(kind: Pending["kind"], step: number | null, task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending({ kind, step, since: Date.now() });
    setNow(Date.now());
    try {
      await task();
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  /** Reads recorded status only; never reruns a check. */
  async function refreshAfter(step: number | null, prefix: string, tone: Notice["tone"]) {
    try {
      await refresh();
      setNotice({ step, text: prefix, tone });
    } catch {
      setNotice({
        step,
        tone: "error",
        text: `${prefix} The latest status could not be loaded; use Refresh status before trying again.`,
      });
    }
  }

  function reverify() {
    return exclusive("reverify", null, async () => {
      setNotice(null);
      try {
        const factors = await supabase.auth.mfa.listFactors();
        const factor = factors.data?.totp.find((f) => f.status === "verified");
        if (!factor) {
          setNotice({
            step: null,
            tone: "error",
            text: "No verified authenticator found. Set one up on Two-factor.",
          });
          return;
        }
        const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (r.error) {
          setNotice({
            step: null,
            tone: "error",
            text: "That code was not accepted. Try the current code.",
          });
          return;
        }
        setCode("");
        await refreshAfter(
          null,
          "Two-factor re-verified. You can record decisions for 15 minutes.",
          "ok",
        );
      } catch {
        setNotice({
          step: null,
          tone: "error",
          text: "Re-verification could not complete. Try again.",
        });
      }
    });
  }

  function act(row: ApprovalRow, action: ApprovalAction) {
    const note = notes[row.step] ?? "";
    const problem = noteProblem(note);
    if (problem) return setNotice({ step: row.step, tone: "error", text: problem });
    let expiresAt: string | null = null;
    if (action === "approve" && row.step === 7) {
      const iso = new Date(expiry).toISOString();
      const bad = validateExpiry(iso, Date.now());
      if (bad) return setNotice({ step: row.step, tone: "error", text: bad });
      expiresAt = iso;
    }
    if (action === "approve" && row.step === 10 && !(cap && daily))
      return setNotice({
        step: row.step,
        tone: "error",
        text: "Tick both confirmations: $10 OpenAI cap and $5 daily limit.",
      });
    if (
      action !== "approve" &&
      data?.rows.some((r) => r.step > row.step && r.status !== "pending") &&
      !window.confirm("This also resets every later step to Pending. Continue?")
    )
      return;
    return exclusive("decide", row.step, async () => {
      setNotice({ step: row.step, text: "Recording your decision…" });
      let result: Awaited<ReturnType<typeof decide>>;
      try {
        result = await withTimeout(
          decide({
            data: {
              step: row.step,
              action,
              note,
              expiresAt,
              capConfirmed: row.step === 10 && cap,
              dailyConfirmed: row.step === 10 && daily,
            },
          }),
          limits.decide,
        );
      } catch (error) {
        const prefix =
          error instanceof FlowTimeoutError
            ? `${error.message} It may still have been recorded, so it was not resent. Showing the recorded status.`
            : "The decision was not confirmed. Showing the recorded status.";
        await refreshAfter(row.step, prefix, "error");
        return;
      }
      if (!result.ok) {
        if (result.reason === "mfa" || result.reason === "already_approved")
          await refresh().catch(() => {});
        setNotice({ step: row.step, tone: "error", text: result.message });
        return;
      }
      setNotes((n) => ({ ...n, [row.step]: "" }));
      if (row.step === 10) {
        setCap(false);
        setDaily(false);
      }
      await refreshAfter(
        row.step,
        `${ACTION_LABEL[action]} — recorded only. Nothing was switched, set, deployed or run.`,
        "ok",
      );
    });
  }

  function checkStep(step: number) {
    return exclusive("check", step, async () => {
      setNotice({ step, text: "Running server-side check…" });
      let result: Awaited<ReturnType<typeof runCheck>>;
      try {
        result = await withTimeout(runCheck({ data: { step } }), limits.check);
      } catch (error) {
        const prefix =
          error instanceof FlowTimeoutError
            ? `${error.message} The server may still record a result, so the check was not retried. Showing the recorded status; retry only if it is unchanged.`
            : "The check could not complete. Nothing was approved. Showing the recorded status.";
        await refreshAfter(step, prefix, "error");
        return;
      }
      if (!result.ok) {
        if (result.reason === "mfa" || result.reason === "already_approved")
          await refresh().catch(() => {});
        setNotice({ step, tone: "error", text: result.message });
        return;
      }
      const passed = result.check.status === "passed";
      await refreshAfter(
        step,
        passed
          ? `${result.check.summary} Not approved yet — review it and approve within 15 minutes.`
          : `${result.check.summary} Nothing was approved; the reasons are listed below.`,
        passed ? "ok" : "error",
      );
    });
  }

  const signedInLine = who && (
    <p className="text-xs text-muted-foreground">
      Signed in as {who.email} · account created {who.since}
    </p>
  );

  if (access !== "ok" || !data) {
    const text = stalled
      ? {
          title: "Loading is taking too long",
          detail: `No reply after ${Math.round(limits.list / 1000)} seconds. Nothing was changed. Retry when you are ready.`,
        }
      : ACCESS_TEXT[reason];
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-16">
        <h1 className="text-2xl">Activation Approvals</h1>
        {access === "checking" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
            Checking owner access…
          </p>
        ) : (
          <section
            aria-labelledby="access-title"
            className="space-y-3 rounded-lg border bg-card p-4"
          >
            <h2 id="access-title" className="text-lg">
              {text.title}
            </h2>
            <p role="alert" className="text-sm">
              {text.detail}
            </p>
            {signedInLine}
            {reason === "needs_code" && !stalled ? (
              <OwnerCodeForm
                intro="Your approvals are kept. Enter your code to see them."
                successText="Code accepted. Loading your approvals…"
                onVerified={() => checkAccess()}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {reason !== "unreadable" && (
                  <Button asChild variant="outline">
                    <Link to="/auth">Owner sign in</Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link to="/account-security">Two-step sign-in settings</Link>
                </Button>
                <Button variant="ghost" onClick={() => void checkAccess()}>
                  Retry access check
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
    );
  }

  const resetAt = data.securityResetAt;
  const effective = effectiveRows(data.rows, resetAt);
  const checksReady = data.checksStore === "ready";
  const approvedCount = effective.filter((r) => isEffectivelyApproved(r, now)).length;
  const next = nextAction({
    rows: data.rows,
    checks: data.checks,
    now,
    resetAt,
    mfaFresh,
    checksStore: data.checksStore,
  });
  const checkCounts = {
    passed: data.checks.filter((c) => c.status === "passed").length,
    failed: data.checks.filter((c) => c.status === "failed").length,
    needsAttention: data.checks.filter((c) => c.status === "needs_attention").length,
  };
  const elapsed = pending ? Math.max(0, Math.round((now - pending.since) / 1000)) : 0;
  const pendingText =
    pending &&
    (pending.kind === "check"
      ? `Running the step ${pending.step} check… ${elapsed}s (stops waiting after ${Math.round(limits.check / 1000)}s)`
      : pending.kind === "decide"
        ? `Recording step ${pending.step}… ${elapsed}s`
        : pending.kind === "refresh"
          ? "Refreshing status…"
          : "Verifying code…");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-16" aria-busy={busy}>
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl">
          <ShieldCheck size={22} aria-hidden /> Activation Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Go-live checklist for the OMNI–Jackboy link and CODE. Steps unlock in order.{" "}
          {approvedCount} of {ACTIVATION_STEPS.length} approved.
        </p>
        <div
          role="progressbar"
          aria-label="Approved steps"
          aria-valuemin={0}
          aria-valuemax={ACTIVATION_STEPS.length}
          aria-valuenow={approvedCount}
          aria-valuetext={`${approvedCount} of ${ACTIVATION_STEPS.length} approved`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${(approvedCount / ACTIVATION_STEPS.length) * 100}%` }}
          />
        </div>
        {signedInLine}
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Technical checks: {checkCounts.passed} passed · {checkCounts.failed} failed ·{" "}
          {checkCounts.needsAttention} need attention.
        </p>
        <p
          role="note"
          className="rounded-lg border border-primary/40 bg-card p-3 text-sm text-foreground"
        >
          Owner approvals only record decisions. Run check may read server configuration, verify the
          signed Jackboy link, or inspect a self-test result; it never approves, flips switches,
          sets secrets, deploys, runs the self-test, or makes paid calls.
        </p>
      </header>

      <section
        aria-labelledby="next-step"
        className="space-y-2 rounded-lg border border-primary/60 bg-card p-4"
      >
        <h2 id="next-step" className="text-lg">
          Next step
        </h2>
        <p className="font-medium">{next.title}</p>
        <p className="text-sm text-muted-foreground">{next.detail}</p>
        {resetAt && data.rows.some((r) => approvedBeforeReset(r, resetAt)) && (
          <p className="text-xs text-muted-foreground">
            Last security reset on this account: {when(resetAt)}. Approvals recorded before it need
            fresh approval; ordinary sign-ins never reset them.
          </p>
        )}
        {next.kind === "run_check" && next.step !== null && (
          <Button size="sm" disabled={busy} onClick={() => void checkStep(next.step!)}>
            {views.find((v) => v.step === next.step)?.checkLabel === "Retry check"
              ? `Retry check for step ${next.step}`
              : `Run check for step ${next.step}`}
          </Button>
        )}
        {(next.kind === "approve" ||
          next.kind === "approve_checked" ||
          next.kind === "fresh_approval") &&
          next.step !== null && (
            <Button asChild size="sm" variant="outline">
              <a href={`#step-${next.step}`}>Go to step {next.step}</a>
            </Button>
          )}
        {next.kind === "reverify" && (
          <Button asChild size="sm" variant="outline">
            <a href="#mfa">Enter code</a>
          </Button>
        )}
      </section>

      {!checksReady && (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-card p-3 text-sm">
          {data.checksStore === "missing"
            ? "Technical checks are paused: the check store (database update 0051) is not installed yet, so Run check can't save results. Your existing approvals are shown unchanged."
            : "Saved check results could not be read. Technical steps can't be approved until they can."}
        </p>
      )}

      <section
        aria-labelledby="deployment-mode"
        className="space-y-2 rounded-lg border bg-card p-4"
      >
        <h2 id="deployment-mode" className="text-lg">
          Deployment configuration
        </h2>
        {data.deployment.mode === "runner_only" ? (
          <p className="text-sm">
            The runner-only target is configured; Step 2 still requires signed remote evidence.
            Jackboy on Lovable owns the database; Railway runs the self-test only. Do not configure
            Supabase credentials on Railway.
          </p>
        ) : (
          <>
            <p role="status" className="text-sm">
              {data.deployment.mode === "unknown"
                ? "Deployment setup is unknown. The remote target references need confirming."
                : "Deployment target references are inconsistent. Confirm separate Jackboy and runner origins."}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirm Mothership's nonsecret <code>JACKBOY_LINK_ORIGIN</code> and{" "}
              <code>JACKBOY_LINK_RUNNER_ORIGIN</code> references. Missing remote evidence does not
              mean the Railway variables are missing. These belong on the Railway runner, not
              Mothership: <code>OMNI_LINK_RUNNER_MODE=true</code>,{" "}
              <code>OMNI_LINK_NODE_RUNNER_ENABLED=true</code>, and{" "}
              <code>OMNI_LINK_REMOTE_RUNNER_SECRET</code>. Do not repeat completed setup or copy its
              secret here. Railway must not receive <code>SUPABASE_URL</code> or{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code>.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="mfa" className="space-y-3 rounded-lg border bg-card p-4">
        <h2 id="mfa" className="text-lg">
          Two-factor
        </h2>
        {mfaFresh ? (
          <p className="text-sm text-muted-foreground">
            Verified {Math.round((data.mfaAgeSeconds ?? 0) / 60)} min ago. Decisions need a check
            within the last 15 minutes.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Re-verify with your authenticator to run checks, approve or revoke a step.
            </p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void reverify();
              }}
            >
              <Input
                className="w-40"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="6-digit authenticator code"
              />
              <Button type="submit" disabled={busy || code.length !== 6}>
                Re-verify
              </Button>
              <Button asChild variant="ghost">
                <Link to="/account-security">Two-factor settings</Link>
              </Button>
            </form>
          </>
        )}
        {notice?.step === null && (
          <p
            role="status"
            className={`text-sm ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {notice.text}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {pendingText && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
            {pendingText}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void exclusive("refresh", null, () =>
              refreshAfter(null, "Status refreshed from the server. No checks were run.", "ok"),
            )
          }
        >
          <RefreshCw size={14} aria-hidden /> Refresh status
        </Button>
      </div>

      <ol className="space-y-4">
        {views.map((view) => {
          const meta = ACTIVATION_STEPS.find((s) => s.step === view.step)!;
          const row = data.rows.find((r) => r.step === view.step)!;
          const check = data.checks.find((c) => c.step === view.step);
          const open = expanded[view.step] ?? !view.collapsedByDefault;
          const running = pending?.step === view.step;
          const Icon =
            view.state === "approved"
              ? CheckCircle2
              : view.state === "failed"
                ? XCircle
                : view.state === "locked"
                  ? Lock
                  : CircleDashed;
          const bodyId = `step-${view.step}-body`;
          return (
            <li
              key={view.step}
              id={`step-${view.step}`}
              aria-current={view.isNext ? "step" : undefined}
              className={`scroll-mt-24 space-y-3 rounded-lg border bg-card p-4 ${
                view.isNext ? "border-primary" : view.complete ? "opacity-90" : ""
              }`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <h3
                    id={`step-${view.step}-title`}
                    tabIndex={-1}
                    className="font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {meta.step}. {meta.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{meta.detail}</p>
                </div>
                {view.isNext && (
                  <span className="rounded border border-primary px-1.5 text-xs text-primary">
                    Next
                  </span>
                )}
                <span className="text-xs uppercase tracking-wide">
                  {STEP_STATE_LABEL[view.state]}
                </span>
              </div>

              {view.complete && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Approved by{" "}
                    {row.approver_id === data.viewerId
                      ? "Owner (you)"
                      : row.approver_id
                        ? `Account ${row.approver_id.slice(0, 8)}`
                        : "—"}{" "}
                    · {when(row.decided_at)}
                  </span>
                  <Button size="sm" variant="secondary" disabled title="Already approved">
                    {view.technical ? "Run check" : "Approve"}
                  </Button>
                  {view.technical && (
                    <Button size="sm" variant="secondary" disabled title="Already approved">
                      Approve
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setExpanded((e) => ({ ...e, [view.step]: !open }))}
                  >
                    {open ? (
                      <ChevronDown size={14} aria-hidden />
                    ) : (
                      <ChevronRight size={14} aria-hidden />
                    )}
                    {open ? "Hide details" : "Show details"}
                  </Button>
                </div>
              )}

              {open && (
                <div id={bodyId} className="space-y-3">
                  <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt className="inline">Approver: </dt>
                      <dd className="inline">
                        {row.approver_id
                          ? row.approver_id === data.viewerId
                            ? "Owner (you)"
                            : `Account ${row.approver_id.slice(0, 8)}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Time: </dt>
                      <dd className="inline">{when(row.decided_at)}</dd>
                    </div>
                    <div>
                      <dt className="inline">Revision: </dt>
                      <dd className="inline">{row.revision}</dd>
                    </div>
                    {row.step === 7 && row.approval_expires_at && (
                      <div className="sm:col-span-3">
                        Expiry recorded: {when(row.approval_expires_at)}
                      </div>
                    )}
                    {row.note && <div className="sm:col-span-3">Note: {row.note}</div>}
                  </dl>

                  {view.technical && check && (
                    <section
                      aria-label={`Step ${meta.step} check result`}
                      className={`space-y-2 rounded border p-3 ${
                        check.status === "passed" ? "" : "border-destructive/50"
                      }`}
                    >
                      <p className="text-sm">
                        <strong>{CHECK_LABEL[check.status]}:</strong> {check.summary}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {when(check.checkedAt)}
                        </span>
                      </p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {check.details.map((detail, index) => (
                          <li key={`${detail.label}-${index}`}>
                            <strong>{detail.label}</strong> ({CHECK_LABEL[detail.status]}):{" "}
                            {detail.detail}
                          </li>
                        ))}
                      </ul>
                      {check.status === "passed" && !view.complete && !view.freshPass && (
                        <p className="text-xs">
                          This pass is older than 15 minutes. Run the check again before approving.
                        </p>
                      )}
                    </section>
                  )}

                  {meta.step === 8 && data.selfTest && (
                    <p className="text-xs text-muted-foreground">
                      Latest protocol result:{" "}
                      {data.selfTest.action === "self_test_passed" ? "passed" : "failed"}
                      {data.selfTest.fresh
                        ? " within the last 24 hours."
                        : " · older than 24 hours."}{" "}
                      Run check to verify and record it here.
                    </p>
                  )}

                  {meta.step === 1 && (
                    <ul className="grid gap-1 text-xs sm:grid-cols-2">
                      {data.settings.map((s) => (
                        <li
                          key={s.name}
                          className="flex justify-between gap-2 rounded border px-2 py-1"
                        >
                          <code>{s.name}</code>
                          <span className="text-muted-foreground">
                            {s.present
                              ? "present"
                              : s.deferred
                                ? "unset · set at step 7"
                                : "missing"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {view.blocker !== null && !view.stale && row.status === "pending" ? (
                    <p className="text-xs text-muted-foreground">
                      Locked — waiting on step {view.blocker}.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {meta.step === 7 && view.canApprove && (
                        <label className="block text-sm">
                          Approval expiry (at most 24 hours ahead)
                          <Input
                            type="datetime-local"
                            className="mt-1 w-64"
                            value={expiry}
                            min={toLocalInput(Date.now())}
                            max={toLocalInput(Date.now() + 24 * 3600_000)}
                            onChange={(e) => setExpiry(e.target.value)}
                          />
                        </label>
                      )}
                      {meta.step === 10 && view.canApprove && (
                        <fieldset className="space-y-1 text-sm">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={cap}
                              onChange={(e) => setCap(e.target.checked)}
                            />
                            I confirm the $10 OpenAI cap is set.
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={daily}
                              onChange={(e) => setDaily(e.target.checked)}
                            />
                            I confirm the $5 daily limit is set.
                          </label>
                        </fieldset>
                      )}
                      {!view.technical && !view.complete && (
                        <Input
                          aria-label={`Note for step ${meta.step} (optional, no secrets)`}
                          placeholder="Optional note — never paste keys or tokens"
                          maxLength={NOTE_MAX}
                          value={notes[meta.step] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [meta.step]: e.target.value }))}
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {view.technical && !view.complete && (
                          <Button
                            size="sm"
                            disabled={busy || !view.canRunCheck}
                            onClick={() => void checkStep(meta.step)}
                          >
                            {running && pending?.kind === "check" && (
                              <Loader2
                                size={14}
                                className="animate-spin motion-reduce:animate-none"
                                aria-hidden
                              />
                            )}
                            {view.checkLabel}
                          </Button>
                        )}
                        {!view.complete && (view.canApprove || view.technical) && (
                          <Button
                            size="sm"
                            variant={view.technical ? "outline" : "default"}
                            disabled={busy || !view.canApprove}
                            onClick={() => void act(row, "approve")}
                          >
                            Approve
                          </Button>
                        )}
                        {row.status !== "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy || !view.canRevoke}
                            onClick={() => void act(row, "revoke")}
                          >
                            Revoke
                          </Button>
                        )}
                        {view.blockedReason && !view.complete && (
                          <span className="text-xs text-muted-foreground">
                            {view.blockedReason}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <section aria-label={`Step ${meta.step} audit history`}>
                    <p className="text-xs font-medium">Audit history</p>
                    {view.audit.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No entries yet</p>
                    ) : (
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {view.audit.slice(0, 10).map((a) => (
                          <li key={a.id}>
                            {when(a.occurred_at)} · {ACTION_LABEL[a.action] ?? a.action}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}
              {notice?.step === view.step && (
                <p
                  role="status"
                  className={`text-sm ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {notice.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="audit" className="space-y-2">
        <h2 id="audit" className="text-lg">
          Audit log
        </h2>
        {data.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {data.audit.map((a) => (
              <li key={a.id}>
                {when(a.occurred_at)} · Step {a.record_id} · {ACTION_LABEL[a.action] ?? a.action}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
