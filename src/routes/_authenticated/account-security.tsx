import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import { FRESH_MFA_SECONDS, mfaAgeSeconds } from "@/lib/activation-approvals";
import {
  LEGACY_TOTP_ISSUER,
  RECOVERY_FRESH_SIGNIN_SECONDS,
  SETUP_WINDOW_MS,
  TOTP_ISSUER,
  isSixDigitCode,
  mfaErrorMessage,
  ownerMfaState,
  rememberSignInReturn,
  totpFriendlyName,
} from "@/lib/owner-mfa";
import {
  createOwnerRecoveryCodes,
  readOwnerRecovery,
  recoverOwnerAuthenticator,
} from "@/lib/owner-mfa.functions";

export const Route = createFileRoute("/_authenticated/account-security")({
  head: () => ({
    meta: [
      { title: "Two-Factor Authentication · OMNI Account Security" },
      {
        name: "description",
        content: "Set up, verify or recover the authenticator app for your OMNI account.",
      },
      { property: "og:title", content: "Two-Factor Authentication · OMNI" },
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
type Recovery = Awaited<ReturnType<typeof readOwnerRecovery>>;
type Event = { id: string; event: string; detail: string; created_at: string };
type Msg = { ok: boolean; text: string } | null;

const EVENT_LABEL: Record<string, string> = {
  codes_created: "Recovery codes created",
  recovery_refused: "Wrong recovery code",
  recovery_locked: "Recovery paused",
  recovery_completed: "Authenticator recovered",
  recovery_failed: "Recovery did not finish",
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
  const readRecovery = useServerFn(readOwnerRecovery);
  const makeCodes = useServerFn(createOwnerRecoveryCodes);
  const recover = useServerFn(recoverOwnerAuthenticator);

  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>("");
  const [mfaAge, setMfaAge] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesMsg, setCodesMsg] = useState<Msg>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState<Msg>(null);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    const [f, a, c] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.getClaims(),
    ]);
    if (f.error) setMsg({ ok: false, text: "Could not load your security settings. Try again." });
    else setFactors((f.data.all ?? []).filter((x) => x.factor_type === "totp") as Factor[]);
    const lvl = a.error ? "" : (a.data.currentLevel ?? "");
    setLevel(lvl);
    const amr = c.error ? null : (c.data?.claims as Record<string, unknown> | undefined)?.["amr"];
    setMfaAge(mfaAgeSeconds(amr, Math.floor(Date.now() / 1000)));
    try {
      setRecovery(await readRecovery());
    } catch {
      setRecovery(null);
    }
    if (lvl === "aal2") {
      const e = await supabase
        .from("owner_mfa_recovery_events")
        .select("id,event,detail,created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setEvents(e.error ? [] : (e.data as Event[]));
    } else setEvents([]);
    setLoaded(true);
  }, [readRecovery]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Hide an unfinished setup QR/key after 10 minutes.
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [pending]);
  const setupExpired = Boolean(pending && now && now - pending.startedAt > SETUP_WINDOW_MS);

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
        setMsg({ ok: false, text: mfaErrorMessage(r.error) ?? "Setup could not start." });
        return;
      }
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
      setMsg({ ok: true, text: "Setup cancelled. Delete the new entry from your app if you added it." });
    });

  const confirmSetup = (factorId: string) =>
    run(async () => {
      if (!isSixDigitCode(setupCode)) {
        setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
        return;
      }
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId, code: setupCode });
      setSetupCode("");
      if (r.error) {
        setMsg({ ok: false, text: mfaErrorMessage(r.error) ?? "Try again." });
        return;
      }
      setPending(null);
      setMsg({
        ok: true,
        text: "Authenticator set up and verified. Now create recovery codes below in case you lose your phone.",
      });
    });

  const remove = (id: string) =>
    run(async () => {
      if (!fresh) {
        setMsg({ ok: false, text: "Enter a fresh authenticator code first (last 15 minutes)." });
        return;
      }
      if (!window.confirm("Remove this authenticator? Owner-only pages will lock until you add one again."))
        return;
      const r = await supabase.auth.mfa.unenroll({ factorId: id });
      setMsg(
        r.error
          ? { ok: false, text: mfaErrorMessage(r.error) ?? "Could not remove it." }
          : { ok: true, text: "Authenticator removed. Delete its entry from your app too." },
      );
      if (!r.error) await supabase.auth.refreshSession();
    });

  async function newCodes() {
    if (busy) return;
    if (
      recovery?.codesRemaining &&
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

  async function freshSignIn() {
    setRecoveryMsg({ ok: true, text: "Opening Google sign-in…" });
    rememberSignInReturn("/account-security");
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (r.error) throw r.error;
      if (!r.redirected) {
        setRecoveryMsg({ ok: true, text: "Signed in again. You have 10 minutes to enter a recovery code." });
        await refresh();
      }
    } catch {
      setRecoveryMsg({ ok: false, text: "Sign-in did not complete. Try again." });
    }
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
      setRecoveryMsg({ ok: false, text: "Recovery could not complete. Nothing changed; try again." });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const signInFresh =
    recovery?.signInAgeSeconds !== null &&
    recovery?.signInAgeSeconds !== undefined &&
    recovery.signInAgeSeconds <= RECOVERY_FRESH_SIGNIN_SECONDS;

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Account Security</p>
        <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Owner-only pages need an authenticator app code. Status:{" "}
          <strong>
            {!loaded
              ? "Checking…"
              : state === "verified"
                ? fresh
                  ? "On and verified in the last 15 minutes"
                  : "On and verified this session"
                : state === "needs_code"
                  ? "On — enter a code to unlock owner pages"
                  : "Not set up"}
          </strong>
        </p>
      </div>

      <Notice msg={msg} />

      {loaded && verified.length === 0 && !pending && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            Set up an authenticator app (Google Authenticator, 1Password, Authy or similar). It will
            appear in the app as <strong>{TOTP_ISSUER}</strong>. Two-factor only turns on after you
            enter a working code.
          </p>
          <Button disabled={busy} onClick={start}>
            Set up authenticator app
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
          <details className="text-sm">
            <summary className="cursor-pointer">Can't scan? Show setup key</summary>
            <code className="mt-2 block break-all">{pending.secret}</code>
            <p className="mt-1 text-xs text-muted-foreground">
              Keep this private. It is shown only now and disappears after 10 minutes or when you
              leave this page. Choose “time-based” if your app asks.
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
              onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ""))}
              aria-label="6-digit code"
            />
            <Button type="submit" disabled={busy || setupCode.length !== 6}>
              Verify and turn on
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
          intro="Enter the current code from your authenticator app to unlock owner pages."
          onVerified={refresh}
        />
      )}

      {verified.map((f) => (
        <section key={f.id} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{f.friendly_name || "Authenticator app"} · verified</p>
          {state === "verified" && !fresh && (
            <OwnerCodeForm
              intro="Changing two-factor settings needs a code from the last 15 minutes."
              onVerified={refresh}
            />
          )}
          {state === "verified" && (
            <Button variant="outline" size="sm" disabled={busy || !fresh} onClick={() => remove(f.id)}>
              Remove authenticator
            </Button>
          )}
        </section>
      ))}

      {state === "verified" && recovery?.isOwner && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="font-medium">Recovery codes</h2>
          <p className="text-sm text-muted-foreground">
            {recovery.codesRemaining
              ? `${recovery.codesRemaining} unused code${recovery.codesRemaining === 1 ? "" : "s"} saved${recovery.codesCreatedAt ? ` (created ${new Date(recovery.codesCreatedAt).toLocaleDateString()})` : ""}.`
              : "No recovery codes yet. Without them, a lost phone locks owner pages."}{" "}
            Keep them offline, away from your phone.
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
              {recovery.codesRemaining ? "Replace recovery codes" : "Create recovery codes"}
            </Button>
          )}
          {!fresh && !codes && (
            <p className="text-xs text-muted-foreground">Enter a fresh code above first.</p>
          )}
          <Notice msg={codesMsg} />
          {events.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {events.map((e) => (
                <li key={e.id}>
                  {new Date(e.created_at).toLocaleString()} · {EVENT_LABEL[e.event] ?? e.event}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="recovery" className="space-y-3 text-sm">
        <h2 className="font-medium text-foreground">Can't find your authenticator?</h2>
        <p className="text-muted-foreground">
          First check your app for an entry named <strong>{TOTP_ISSUER}</strong> or{" "}
          <strong>{LEGACY_TOTP_ISSUER}</strong> (older setups) next to your email. Also check other
          phones and your app's cloud backup.
        </p>
        {state === "needs_code" && recovery?.isOwner && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p>
              Lost it for good? Use one of your recovery codes. You need two things: a sign-in from
              the last 10 minutes and an unused recovery code. The old authenticator is then
              removed, your other sign-ins end, and you set up a new one.
            </p>
            {!signInFresh ? (
              <Button size="sm" variant="outline" onClick={() => void freshSignIn()}>
                Step 1: Sign in again with Google
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
            {recovery.codesRemaining === 0 && (
              <p className="text-xs text-muted-foreground">
                No recovery codes were ever created for this account. In that case only the
                project owner, signed in to the Lovable editor for this project, can ask for the
                lost authenticator to be removed. Signing in here alone is never enough.
              </p>
            )}
          </div>
        )}
      </section>
      <Link to="/members" className="text-sm underline">
        Back to Members
      </Link>
    </main>
  );
}
