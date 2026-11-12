import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { LEGACY_TOTP_ISSUER, TOTP_ISSUER, ownerMfaState, type OwnerMfaState } from "@/lib/owner-mfa";

export const Route = createFileRoute("/sign-in-help")({
  head: () =>
    seo(
      "How to sign in",
      "Step-by-step help for signing in to Evolution, setting up the owner's two-factor code, and recovering access safely.",
    ),
  component: SignInHelp,
});

const MESSAGES: [string, string][] = [
  ["Email or password is wrong", "Check both. If you first used Google, press “Continue with Google” — Google accounts have no password here."],
  ["Confirm your email first", "Open the confirmation link we emailed you (check spam), then sign in again."],
  ["An account with this email already exists", "Sign in instead, or use “Forgot password” if you made a password."],
  ["That code didn't match", "Codes change every 30 seconds. Wait for a new one and make sure your phone sets its time automatically."],
  ["Too many attempts", "Wait a minute, then try again with the newest code."],
  ["Your sign-in expired", "Sign in again. Owner pages also ask for a fresh code after a while — that's expected."],
  ["This sign-in option is turned off", "Use another button on the sign-in page."],
];

function Step({ done, children }: { done?: boolean; children: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex gap-3">
      <Icon size={18} className={`mt-0.5 shrink-0 ${done ? "text-success" : "text-muted-foreground"}`} aria-hidden />
      <span>
        {done && <span className="sr-only">Done: </span>}
        {children}
      </span>
    </li>
  );
}

function YourStatus() {
  const { user, ready } = useAccount();
  const [mfa, setMfa] = useState<OwnerMfaState | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!user) return setMfa("signed_out");
    let live = true;
    void Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([f, a]) => {
      if (!live) return;
      const verified = f.error ? 0 : (f.data.all ?? []).filter((x) => x.factor_type === "totp" && x.status === "verified").length;
      setMfa(ownerMfaState({ signedIn: true, verifiedFactors: verified, aal: a.error ? null : a.data.currentLevel }));
    });
    return () => {
      live = false;
    };
  }, [user, ready]);

  const text =
    mfa === null
      ? "Checking…"
      : mfa === "signed_out"
        ? "You're not signed in."
        : mfa === "needs_setup"
          ? "You're signed in. No authenticator app is set up (only the owner needs one)."
          : mfa === "needs_code"
            ? "You're signed in. Your authenticator is set up — enter a code to open owner pages."
            : "You're signed in and your authenticator code is confirmed for this session.";

  return (
    <section aria-labelledby="status-h" className="rounded-lg border border-gold/30 p-5">
      <h2 id="status-h" className="text-lg text-foreground">Your status</h2>
      <p role="status" className="mt-2 text-sm text-muted-foreground">{text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {mfa === "signed_out" && (
          <Button asChild variant="cosmic" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
        {(mfa === "needs_setup" || mfa === "needs_code" || mfa === "verified") && (
          <>
            <Button asChild variant="cosmic" size="sm">
              <Link to="/beta">Open my projects</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/account-security">Two-factor & recovery</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function SignInHelp() {
  return (
    <article className="mx-auto max-w-2xl space-y-10 px-5 py-12 text-sm leading-7 sm:px-6 sm:py-16">
      <header>
        <p className="eyebrow">Settings / help</p>
        <h1 className="mt-4 text-3xl text-foreground">How to sign in</h1>
        <p className="mt-3 text-muted-foreground">
          Most people only need a Google account or an email address. Nothing to install. The owner
          adds one extra step — a 6-digit code from an authenticator app — to open owner-only pages.
        </p>
      </header>

      <YourStatus />

      <section aria-labelledby="install-h" className="space-y-3">
        <h2 id="install-h" className="text-xl text-foreground">Do I need to install anything?</h2>
        <ul className="space-y-2 text-muted-foreground">
          <li><strong className="text-foreground">Members:</strong> no. Sign in with Google, Lovable, or email and password.</li>
          <li>
            <strong className="text-foreground">Owner:</strong> yes, one authenticator app on your phone — any app that shows 6-digit
            codes works (for example Google Authenticator, Microsoft Authenticator, 1Password or Authy).
          </li>
          <li>
            <strong className="text-foreground">Passkey (owner, optional):</strong> only the OMNI Workspace on the OMNI Terminal page uses
            one. It uses your device's built-in Face ID, fingerprint, Windows Hello or security key —
            no extra app. You add it there after entering your authenticator code.
          </li>
        </ul>
      </section>

      <section aria-labelledby="signin-h" className="space-y-3">
        <h2 id="signin-h" className="text-xl text-foreground">Sign in</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>Open <Link to="/auth" className="text-gold-light underline underline-offset-4">Sign in</Link>.</li>
          <li>Choose <strong className="text-foreground">Continue with Google</strong>, <strong className="text-foreground">Continue with Lovable</strong>, or enter your email and password.</li>
          <li>Always use the same option you started with. A Google account has no password here.</li>
        </ol>
        <p className="text-muted-foreground">
          <strong className="text-foreground">New with email?</strong> Choose “Create an account”, use at least 12 characters, then open the
          confirmation email before signing in.
        </p>
        <p className="text-muted-foreground">
          <strong className="text-foreground">Forgot your password?</strong> Choose “Forgot password” on the sign-in page and open the link
          on the same device. (Google sign-in has no password to reset — use Google's own recovery.)
        </p>
      </section>

      <section aria-labelledby="invite-h" className="space-y-3">
        <h2 id="invite-h" className="text-xl text-foreground">Accept an invitation</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>Open the invitation link the owner sent you. It works once and expires after 72 hours.</li>
          <li>Press <strong className="text-foreground">Sign in to accept</strong> and sign in with the exact email it was sent to.</li>
          <li>You come back to the invitation. Press <strong className="text-foreground">Accept invitation</strong>.</li>
        </ol>
      </section>

      <section aria-labelledby="owner-h" className="space-y-3">
        <h2 id="owner-h" className="text-xl text-foreground">Owner: set up two-factor</h2>
        <ol className="space-y-3 text-muted-foreground">
          <Step>Sign in with the owner email (the owner role is already claimed; it can't be given to anyone else).</Step>
          <Step>
            Open <Link to="/account-security" className="text-gold-light underline underline-offset-4">Two-factor & recovery</Link>. If it says
            “Not set up”, press <strong className="text-foreground">Set up authenticator app</strong> and scan the QR code.
          </Step>
          <Step>Type the 6-digit code from the new <strong className="text-foreground">{TOTP_ISSUER}</strong> entry. Two-factor only turns on after a code works.</Step>
          <Step>
            Press <strong className="text-foreground">Create recovery codes</strong>. Download or write them down and keep them off your
            phone (a password manager or paper in a safe place). Each code works once.
          </Step>
          <Step>Next time, owner pages ask for the current code. That's normal.</Step>
        </ol>
      </section>

      <section aria-labelledby="lost-h" className="space-y-3">
        <h2 id="lost-h" className="text-xl text-foreground">Lost your authenticator?</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Look in your app for <strong className="text-foreground">{TOTP_ISSUER}</strong> or, for older setups,{" "}
            <strong className="text-foreground">{LEGACY_TOTP_ISSUER}</strong>. Check other phones and your app's cloud backup.
          </li>
          <li>
            Still lost? On <Link to="/account-security" hash="recovery" className="text-gold-light underline underline-offset-4">Two-factor & recovery</Link>,
            sign in again, then enter one unused recovery code within 10 minutes. The old authenticator
            is removed, your other sign-ins end, and you set up a new one.
          </li>
          <li>
            No recovery codes? There is no self-service way around two-factor — on purpose. The
            project administrator has to remove the old authenticator after checking it's really you.
          </li>
        </ol>
      </section>

      <section aria-labelledby="msg-h" className="space-y-3">
        <h2 id="msg-h" className="text-xl text-foreground">What the messages mean</h2>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {MESSAGES.map(([m, fix]) => (
            <div key={m} className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-foreground">“{m}”</dt>
              <dd className="text-muted-foreground">{fix}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="not-h" className="space-y-2 text-muted-foreground">
        <h2 id="not-h" className="text-xl text-foreground">Not offered</h2>
        <p>
          Text-message codes, email “magic links”, Apple or Microsoft sign-in, and signing in with a
          passkey alone are not available. We will never ask for your password, code or recovery
          codes in chat or email.
        </p>
      </section>
    </article>
  );
}
