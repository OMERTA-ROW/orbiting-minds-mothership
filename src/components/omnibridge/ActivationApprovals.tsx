import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Lock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
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
  allowedActions,
  blockingStep,
  isTechnicalStep,
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
  stepState,
  type AccessReason,
} from "@/lib/activation-status";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";

type Listed = Awaited<ReturnType<typeof listActivationApprovals>>;
type Loaded = Extract<Listed, { rows: unknown }>;
type AuditRow = Loaded["audit"][number];

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

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function toLocalInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function ActivationApprovals() {
  const list = useServerFn(listActivationApprovals);
  const decide = useServerFn(decideActivationApproval);
  const runCheck = useServerFn(runActivationApprovalCheck);
  const [data, setData] = useState<Loaded | null>(null);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [reason, setReason] = useState<AccessReason>("unreadable");
  const [who, setWho] = useState<{ email: string; since: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ step: number | null; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [expiry, setExpiry] = useState(() => toLocalInput(Date.now() + 12 * 3600_000));
  const [cap, setCap] = useState(false);
  const [daily, setDaily] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const result = await list();
    if ("denied" in result) {
      setReason(result.reason);
      throw new Error(result.reason);
    }
    setData(result);
    setNow(Date.now());
  }, [list]);

  const checkAccess = useCallback(() => {
    setAccess("checking");
    return refresh().then(
      () => setAccess("ok"),
      (error: unknown) => {
        // Thrown before the owner check (no session, network): say so specifically.
        const msg = error instanceof Error ? error.message : "";
        if (!(msg in ACCESS_TEXT)) setReason(accessReason(msg));
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const mfaFresh = useMemo(() => {
    if (!data || data.mfaAgeSeconds === null) return false;
    return data.mfaAgeSeconds <= FRESH_MFA_SECONDS;
  }, [data]);

  async function reverify() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((f) => f.status === "verified");
      if (!factor) {
        setNotice({
          step: null,
          text: "No verified authenticator found. Set one up on Two-factor.",
        });
        return;
      }
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (r.error) {
        setNotice({ step: null, text: "That code was not accepted. Try the current code." });
        return;
      }
      setCode("");
      await refresh();
      setNotice({
        step: null,
        text: "Two-factor re-verified. You can record decisions for 15 minutes.",
      });
    } catch {
      setNotice({ step: null, text: "Re-verification could not complete. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function act(row: ApprovalRow, action: ApprovalAction) {
    if (busy) return;
    const note = notes[row.step] ?? "";
    const problem = noteProblem(note);
    if (problem) return setNotice({ step: row.step, text: problem });
    let expiresAt: string | null = null;
    if (action === "approve" && row.step === 7) {
      const iso = new Date(expiry).toISOString();
      const bad = validateExpiry(iso, Date.now());
      if (bad) return setNotice({ step: row.step, text: bad });
      expiresAt = iso;
    }
    if (action === "approve" && row.step === 10 && !(cap && daily))
      return setNotice({
        step: row.step,
        text: "Tick both confirmations: $10 OpenAI cap and $5 daily limit.",
      });
    if (
      action !== "approve" &&
      data?.rows.some((r) => r.step > row.step && r.status !== "pending") &&
      !window.confirm("This also resets every later step to Pending. Continue?")
    )
      return;
    setBusy(true);
    setNotice({ step: row.step, text: "Recording…" });
    try {
      const result = await decide({
        data: {
          step: row.step,
          action,
          note,
          expiresAt,
          capConfirmed: row.step === 10 && cap,
          dailyConfirmed: row.step === 10 && daily,
        },
      });
      if (!result.ok) {
        setNotice({ step: row.step, text: result.message });
        if (result.reason === "mfa") await refresh().catch(() => {});
        return;
      }
      setNotes((n) => ({ ...n, [row.step]: "" }));
      if (row.step === 10) {
        setCap(false);
        setDaily(false);
      }
      await refresh();
      setNotice({
        step: row.step,
        text: `${ACTION_LABEL[action]} — recorded only. Nothing was switched, set, deployed or run.`,
      });
    } catch {
      setNotice({ step: row.step, text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  const signedInLine = who && (
    <p className="text-xs text-muted-foreground">
      Signed in as {who.email} · account created {who.since}
    </p>
  );

  if (access !== "ok" || !data) {
    const text = ACCESS_TEXT[reason];
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-16">
        <h1 className="text-2xl">Activation Approvals</h1>
        {access === "checking" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking owner access…
          </p>
        ) : (
          <section aria-labelledby="access-title" className="space-y-3 rounded-lg border bg-card p-4">
            <h2 id="access-title" className="text-lg">
              {text.title}
            </h2>
            <p role="alert" className="text-sm">
              {text.detail}
            </p>
            {signedInLine}
            {reason === "needs_code" ? (
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

  const latestAudit = (step: number): AuditRow | undefined =>
    data.audit.find((a) => a.record_id === String(step));
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

  async function checkStep(step: number) {
    if (busy) return;
    setBusy(true);
    setNotice({ step, text: "Running server-side check…" });
    try {
      const result = await runCheck({ data: { step } });
      if (!result.ok) {
        setNotice({ step, text: result.message });
        if (result.reason === "mfa") await refresh().catch(() => {});
        return;
      }
      await refresh();
      setNotice({ step, text: result.check.summary });
    } catch {
      setNotice({ step, text: "Check could not complete. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl">
          <ShieldCheck size={22} aria-hidden /> Activation Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Go-live checklist for the OMNI–Jackboy link and CODE. Steps unlock in order.{" "}
          {approvedCount} of {ACTIVATION_STEPS.length} approved.
        </p>
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
          signed Jackboy link, or inspect a self-test result; it never flips switches, sets secrets,
          deploys, runs the self-test, or makes paid calls.
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
            Run check for step {next.step}
          </Button>
        )}
        {(next.kind === "approve" || next.kind === "fresh_approval") && next.step !== null && (
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
              Re-verify with your authenticator to approve, fail or revoke a step.
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
          <p role="status" className="text-sm text-muted-foreground">
            {notice.text}
          </p>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void refresh()
              .then(
                () => setNotice({ step: null, text: "Records refreshed." }),
                () => setNotice({ step: null, text: "Refresh failed. Nothing was changed." }),
              )
              .finally(() => setBusy(false));
          }}
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      <ol className="space-y-4">
        {ACTIVATION_STEPS.map((meta) => {
          const row = data.rows.find((r) => r.step === meta.step)!;
          const blocker = blockingStep(effective, meta.step, now);
          const stale = approvedBeforeReset(row, resetAt);
          const actions: ApprovalAction[] = stale
            ? ["revoke"]
            : allowedActions(effective, meta.step, now);
          const technical = isTechnicalStep(meta.step);
          const check = data.checks.find((c) => c.step === meta.step);
          const audit = latestAudit(meta.step);
          const state = stepState(row, {
            rows: data.rows,
            now,
            resetAt,
            lastAuditAction: audit?.action,
          });
          const Icon =
            state === "approved"
              ? CheckCircle2
              : state === "failed"
                ? XCircle
                : state === "locked"
                  ? Lock
                  : CircleDashed;
          return (
            <li
              key={meta.step}
              id={`step-${meta.step}`}
              className="scroll-mt-24 space-y-3 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">
                    {meta.step}. {meta.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{meta.detail}</p>
                </div>
                <span className="text-xs uppercase tracking-wide">{STEP_STATE_LABEL[state]}</span>
              </div>

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
                  <dt className="inline">Audit: </dt>
                  <dd className="inline">
                    {audit
                      ? `${ACTION_LABEL[audit.action] ?? audit.action} · ${when(audit.occurred_at)}`
                      : "No entries yet"}
                  </dd>
                </div>
                {row.step === 7 && row.approval_expires_at && (
                  <div className="sm:col-span-3">
                    Expiry recorded: {when(row.approval_expires_at)}
                  </div>
                )}
                {row.note && <div className="sm:col-span-3">Note: {row.note}</div>}
              </dl>

              {technical && check && (
                <section
                  aria-label={`Step ${meta.step} check result`}
                  className="space-y-2 rounded border p-3"
                >
                  <p className="text-sm">
                    <strong className="capitalize">{check.status.replace("_", " ")}:</strong>{" "}
                    {check.summary}{" "}
                    <span className="text-xs text-muted-foreground">· {when(check.checkedAt)}</span>
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {check.details.map((detail, index) => (
                      <li key={`${detail.label}-${index}`}>
                        <strong>{detail.label}:</strong> {detail.detail}
                      </li>
                    ))}
                  </ul>
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
                        {s.present ? "present" : s.deferred ? "unset · set at step 7" : "missing"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {blocker && !stale && row.status === "pending" ? (
                <p className="text-xs text-muted-foreground">Locked — waiting on step {blocker}.</p>
              ) : (
                <div className="space-y-3">
                  {meta.step === 7 && actions.includes("approve") && (
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
                  {meta.step === 10 && actions.includes("approve") && (
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
                  {!technical && (
                    <Input
                      aria-label={`Note for step ${meta.step} (optional, no secrets)`}
                      placeholder="Optional note — never paste keys or tokens"
                      maxLength={NOTE_MAX}
                      value={notes[meta.step] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [meta.step]: e.target.value }))}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {technical && (
                      <Button
                        size="sm"
                        disabled={busy || !mfaFresh || !checksReady}
                        onClick={() => void checkStep(meta.step)}
                      >
                        Run check
                      </Button>
                    )}
                    {!technical && actions.includes("approve") && (
                      <Button
                        size="sm"
                        disabled={busy || !mfaFresh}
                        onClick={() => act(row, "approve")}
                      >
                        Approve
                      </Button>
                    )}
                    {actions.includes("revoke") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || !mfaFresh}
                        onClick={() => act(row, "revoke")}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {notice?.step === meta.step && (
                <p role="status" className="text-sm text-muted-foreground">
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
