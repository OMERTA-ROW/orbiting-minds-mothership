import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import { FRESH_MFA_SECONDS, mfaAgeSeconds } from "@/lib/activation-approvals";
import {
  LEGACY_TOTP_ISSUER,
  RECOVERY_FRESH_SIGNIN_SECONDS,
  SETUP_WINDOW_MS,
  TOTP_ISSUER,
  afterFailedCode,
  formatSetupKey,
  isQrImage,
  isSixDigitCode,
  isStandardTotpUri,
  mfaErrorMessage,
  ownerMfaState,
  rememberSignInReturn,
  totpFriendlyName,
} from "@/lib/owner-mfa";
import {
  createRecoveryCodes,
  disableTwoStep,
  readAccountMfa,
  recoverAuthenticator,
} from "@/lib/account-mfa.functions";

export const Route = createFileRoute("/_authenticated/account-security")({
  head: () => ({
    meta: [
      { title: "Account Security · Two-Step Sign-In" },
      {
        name: "description",
        content:
          "Turn on optional two-step sign-in with an authenticator app, save recovery codes, or recover access.",
      },
      { property: "og:title", content: "Account Security · Two-Step Sign-In" },
      { property: "og:description", content: "Private account security settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountSecurity,
});

type Factor = { id: string; friendly_name?: string; status: string };
type Pending = { id: string; qr: string; secret: string; startedAt: number };
type Account = Awaited<ReturnType<typeof readAccountMfa>>;
type Event = { id: string; event: string; detail: string; created_at: string };
type Msg = { ok: boolean; text: string } | null;

const EVENT_LABEL: Record<string, string> = {
  codes_created: "Recovery codes created",
  recovery_refused: "Wrong recovery code",
  recovery_locked: "Recovery paused",
  recovery_completed: "Authenticator recovered",
  recovery_failed: "Recovery did not finish",
  mfa_disabled: "Two-step sign-in turned off",
  mfa_disable_failed: "Turning off did not finish",
};

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      role={msg.ok ? "status" : "alert"}
      className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}
    >
      {msg.text}
    </p>
  );
}

function AccountSecurity() {
  const navigate = useNavigate();
  const readAccount = useServerFn(readAccountMfa);
  const makeCodes = useServerFn(createRecoveryCodes);
  const recover = useServerFn(recoverAuthenticator);
  const disable = useServerFn(disableTwoStep);

  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>("");
  const [mfaAge, setMfaAge] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupFails, setSetupFails] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesMsg, setCodesMsg] = useState<Msg>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState<Msg>(null);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    const [f, a, c, u] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.getClaims(),
      supabase.auth.getUser(),
    ]);
    if (f.error) setMsg({ ok: false, text: "Could not load your security settings. Try again." });
    else setFactors((f.data.all ?? []).filter((x) => x.factor_type === "totp") as Factor[]);
    const lvl = a.error ? "" : (a.data.currentLevel ?? "");
    setLevel(lvl);
    setEmail(u.data.user?.email ?? "");
    const amr = c.error ? null : (c.data?.claims as Record<string, unknown> | undefined)?.["amr"];
    setMfaAge(mfaAgeSeconds(amr, Math.floor(Date.now() / 1000)));
    try {
      setAccount(await readAccount());
    } catch {
      setAccount(null);
    }
    const e = await supabase
      .from("owner_mfa_recovery_events")
      .select("id,event,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    setEvents(e.error ? [] : (e.data as Event[]));
    setLoaded(true);
  }, [readAccount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Ticks for the 10-minute setup window and the wrong-code pause.
  useEffect(() => {
    if (!pending && pausedUntil <= Date.now()) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pending, pausedUntil]);
  const setupExpired = Boolean(pending && now && now - pending.startedAt > SETUP_WINDOW_MS);
  const waitSeconds = pausedUntil > now ? Math.ceil((pausedUntil - now) / 1000) : 0;

  const verified = factors.filter((f) => f.status === "verified");
  const state = ownerMfaState({ signedIn: true, verifiedFactors: verified.length, aal: level });
  const fresh = mfaAge !== null && mfaAge <= FRESH_MFA_SECONDS;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Nothing was changed; try again." });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const start = () =>
    run(async () => {
      // Remove abandoned unverified setups so a fresh QR can be issued.
      for (const f of factors.filter((x) => x.status !== "verified"))
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      const r = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: TOTP_ISSUER,
        friendlyName: totpFriendlyName(new Date()),
      });
      if (r.error) {
        const text = mfaErrorMessage(r.error) ?? "Setup could not start.";
        if (r.error.code === "mfa_totp_enroll_not_enabled") setUnavailable(text);
        setMsg({ ok: false, text });
        return;
      }
      // Only show what the sign-in provider really issued: a standard otpauth:// TOTP URI and its QR image.
      if (!isStandardTotpUri(r.data.totp.uri) || !isQrImage(r.data.totp.qr_code)) {
        await supabase.auth.mfa.unenroll({ factorId: r.data.id });
        setUnavailable(
          "The sign-in service did not return a usable setup code, so nothing was shown.",
        );
        return;
      }
      setSetupFails(0);
      setPending({
        id: r.data.id,
        qr: r.data.totp.qr_code,
        secret: r.data.totp.secret,
        startedAt: Date.now(),
      });
      setMsg({ ok: true, text: "Scan the code, then enter the 6-digit code to finish." });
    });

  const cancelSetup = (id: string) =>
    run(async () => {
      setPending(null);
      await supabase.auth.mfa.unenroll({ factorId: id });
      setMsg({
        ok: true,
        text: "Setup cancelled. Delete the new entry from your app if you added it.",
      });
    });

  const confirmSetup = (factorId: string) =>
    run(async () => {
      if (waitSeconds > 0) return;
      if (!isSixDigitCode(setupCode)) {
        setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
        return;
      }
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId, code: setupCode });
      setSetupCode("");
      if (r.error) {
        const next = afterFailedCode(setupFails, Date.now());
        setSetupFails(next.fails);
        if (next.pausedUntil) setPausedUntil(next.pausedUntil);
        setMsg({
          ok: false,
          text: next.pausedUntil
            ? "Several codes didn't match. Wait 30 seconds, check your phone sets its time automatically, then try the newest code."
            : (mfaErrorMessage(r.error) ?? "Try again."),
        });
        return;
      }
      setPending(null);
      setMsg({
        ok: true,
        text: "Two-step sign-in is on. Next, create recovery codes below in case you lose your phone.",
      });
    });

  const turnOff = () =>
    run(async () => {
      if (!fresh) {
        setMsg({ ok: false, text: "Enter a fresh authenticator code first (last 15 minutes)." });
        return;
      }
      const ownerNote = account?.isOwner
        ? " Owner-only pages will lock until you set it up again."
        : "";
      if (
        !window.confirm(
          `Turn off two-step sign-in? Your authenticator and recovery codes stop working.${ownerNote}`,
        )
      )
        return;
      const r = await disable();
      if (!r.ok) {
        setMsg({ ok: false, text: r.message });
        return;
      }
      await supabase.auth.refreshSession();
      setCodes(null);
      setMsg({
        ok: true,
        text: "Two-step sign-in is off. Delete its entry from your authenticator app too.",
      });
    });

  async function newCodes() {
    if (busy) return;
    if (
      account?.codesRemaining &&
      !window.confirm("Create new recovery codes? Your earlier codes will stop working.")
    )
      return;
    setBusy(true);
    setCodesMsg({ ok: true, text: "Creating recovery codes…" });
    try {
      const r = await makeCodes();
      if (!r.ok) return setCodesMsg({ ok: false, text: r.message });
      setCodes(r.codes);
      setCodesMsg({
        ok: true,
        text: "Save these now. They are shown only once; each works one time.",
      });
    } catch {
      setCodesMsg({ ok: false, text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  function downloadCodes() {
    if (!codes) return;
    const text = `${TOTP_ISSUER} recovery codes (each works once)\nCreated ${new Date().toLocaleString()}\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "omni-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function signInAgain() {
    setRecoveryMsg({ ok: true, text: "Signing out so you can sign in again…" });
    rememberSignInReturn("/account-security");
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  async function submitRecoveryCode() {
    if (busy) return;
    setBusy(true);
    setRecoveryMsg({ ok: true, text: "Checking recovery code…" });
    try {
      const r = await recover({ data: { code: recoveryCode } });
      setRecoveryCode("");
      if (!r.ok) return setRecoveryMsg({ ok: false, text: r.message });
      await supabase.auth.refreshSession();
      setRecoveryMsg({
        ok: true,
        text: "Recovered. The lost authenticator was removed and other sign-ins were ended. Set up a new authenticator now.",
      });
    } catch {
      setRecoveryMsg({
        ok: false,
        text: "Recovery could not complete. Nothing changed; try again.",
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const signInFresh =
    typeof account?.signInAgeSeconds === "number" &&
    account.signInAgeSeconds <= RECOVERY_FRESH_SIGNIN_SECONDS;

  const statusText = !loaded
    ? "Checking…"
    : state === "verified"
      ? fresh
        ? "On · code confirmed in the last 15 minutes"
        : "On · code confirmed this session"
      : state === "needs_code"
        ? "On · enter a code to confirm it's you"
        : "Off";

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Account · Security</p>
        <h1 className="text-2xl font-semibold">Two-step sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Optional: adds a 6-digit code from an authenticator app after you sign in. Nothing changes
          until you turn it on. The owner needs it to open owner-only pages.{" "}
          <Link to="/sign-in-help" className="underline underline-offset-4">
            How this works
          </Link>
        </p>
        <p className="mt-2 text-sm">
          Status: <strong role="status">{statusText}</strong>
        </p>
      </div>

      <Notice msg={msg} />

      {loaded && unavailable && (
        <section className="rounded-lg border border-border p-4 text-sm" role="alert">
          <p className="font-medium">Two-step sign-in is unavailable right now</p>
          <p className="mt-1 text-muted-foreground">{unavailable} Your sign-in is unchanged.</p>
        </section>
      )}

      {loaded && verified.length === 0 && !pending && !unavailable && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-medium">Set up an authenticator</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Install any authenticator app (Google Authenticator, Microsoft Authenticator,
              1Password, Authy…).
            </li>
            <li>Press the button and scan the QR code, or type the setup key.</li>
            <li>Enter the 6-digit code the app shows. Only then is two-step sign-in turned on.</li>
          </ol>
          <Button disabled={busy} onClick={start}>
            Set up authenticator
          </Button>
        </section>
      )}

      {pending && !setupExpired && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">1. Scan this code with your authenticator app.</p>
          <img
            src={pending.qr}
            alt="Authenticator setup QR code"
            className="h-48 w-48 rounded bg-foreground p-2"
          />
          <p className="text-xs text-muted-foreground">
            It appears in the app as <strong>{TOTP_ISSUER}</strong>
            {email ? ` (${email})` : ""}.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer">Can't scan? Type the setup key instead</summary>
            <code className="mt-2 block break-all font-mono text-base tracking-wider">
              {formatSetupKey(pending.secret)}
            </code>
            <p className="mt-1 text-xs text-muted-foreground">
              In your app choose “Enter a setup key”, type it exactly (spaces don't matter) and pick
              “time-based” if asked. Keep it private: it's shown only now and disappears after 10
              minutes or when you leave this page.
            </p>
          </details>
          <p className="text-sm">
            2. Enter the 6-digit code your app shows for <strong>{TOTP_ISSUER}</strong>.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              confirmSetup(pending.id);
            }}
          >
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={setupCode}
              disabled={waitSeconds > 0}
              onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ""))}
              aria-label="6-digit code"
            />
            <Button type="submit" disabled={busy || setupCode.length !== 6 || waitSeconds > 0}>
              {waitSeconds > 0 ? `Wait ${waitSeconds}s` : "Verify and turn on"}
            </Button>
          </form>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => cancelSetup(pending.id)}>
            Cancel setup
          </Button>
        </section>
      )}

      {pending && setupExpired && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            This setup code expired. Delete the unfinished {TOTP_ISSUER} entry from your app if you
            added one, then start again.
          </p>
          <Button disabled={busy} onClick={() => cancelSetup(pending.id)}>
            Start again
          </Button>
        </section>
      )}

      {state === "needs_code" && (
        <OwnerCodeForm
          intro="Enter the current code from your authenticator app to confirm it's you."
          successText="Code accepted."
          onVerified={refresh}
        />
      )}

      {verified.map((f) => (
        <section key={f.id} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{f.friendly_name || "Authenticator app"} · verified</p>
          {state === "verified" && !fresh && (
            <OwnerCodeForm
              intro="Changing these settings needs a code from the last 15 minutes."
              successText="Code accepted. You can change settings for 15 minutes."
              onVerified={refresh}
            />
          )}
          {state === "verified" && (
            <Button variant="outline" size="sm" disabled={busy || !fresh} onClick={turnOff}>
              Turn off two-step sign-in
            </Button>
          )}
        </section>
      ))}

      {state === "verified" && account && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-medium">Recovery codes</h2>
          <p className="text-sm text-muted-foreground">
            {account.codesRemaining
              ? `${account.codesRemaining} unused code${account.codesRemaining === 1 ? "" : "s"} saved${account.codesCreatedAt ? ` (created ${new Date(account.codesCreatedAt).toLocaleDateString()})` : ""}.`
              : "No recovery codes yet. Without them, a lost phone can lock you out."}{" "}
            Keep them offline, away from your phone. We only keep a scrambled fingerprint of each
            code.
          </p>
          {codes ? (
            <div className="space-y-2">
              <ol className="grid grid-cols-2 gap-1 font-mono text-sm">
                {codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={downloadCodes}>
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(codes.join("\n")).then(
                      () => setCodesMsg({ ok: true, text: "Copied. Paste them somewhere safe." }),
                      () => setCodesMsg({ ok: false, text: "Copy failed. Use Download instead." }),
                    )
                  }
                >
                  Copy
                </Button>
                <Button size="sm" onClick={() => setCodes(null)}>
                  I saved them
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" disabled={busy || !fresh} onClick={() => void newCodes()}>
              {account.codesRemaining ? "Replace recovery codes" : "Create recovery codes"}
            </Button>
          )}
          {!fresh && !codes && (
            <p className="text-xs text-muted-foreground">Enter a fresh code above first.</p>
          )}
          <Notice msg={codesMsg} />
        </section>
      )}

      {events.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Recent security activity</h2>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {events.map((e) => (
              <li key={e.id}>
                {new Date(e.created_at).toLocaleString()} · {EVENT_LABEL[e.event] ?? e.event}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="recovery" className="space-y-3 text-sm">
        <h2 className="font-medium text-foreground">Can't find your authenticator?</h2>
        <p className="text-muted-foreground">
          First check your app for an entry named <strong>{TOTP_ISSUER}</strong> or{" "}
          <strong>{LEGACY_TOTP_ISSUER}</strong> (older setups) next to your email. Also check other
          phones and your app's cloud backup.
        </p>
        {state === "needs_code" && account && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p>
              Lost it for good? Use one of your recovery codes. You need a verified email, a sign-in
              from the last 10 minutes and an unused recovery code. The old authenticator is then
              removed, your other sign-ins end, and you can set up a new one.
            </p>
            {!signInFresh ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void signInAgain()}
              >
                Step 1: Sign in again
              </Button>
            ) : (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitRecoveryCode();
                }}
              >
                <Input
                  className="max-w-56 font-mono"
                  autoComplete="off"
                  maxLength={20}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  aria-label="Recovery code"
                  placeholder="XXXX-XXXX-XXXX"
                />
                <Button type="submit" size="sm" disabled={busy || recoveryCode.trim().length < 12}>
                  Step 2: Use recovery code
                </Button>
              </form>
            )}
            <Notice msg={recoveryMsg} />
            {account.codesRemaining === 0 && (
              <p className="text-xs text-muted-foreground">
                No recovery codes were saved for this account. Then only the project administrator,
                signed in to the Lovable editor for this project, can remove the lost authenticator.
                Signing in here alone is never enough.
              </p>
            )}
          </div>
        )}
      </section>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link to="/beta" className="underline">
          Back to my projects
        </Link>
        <Link to="/sign-in-help" className="underline">
          Sign-in help
        </Link>
      </p>
    </div>
  );
}
