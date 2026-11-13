import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { signInNeedsCode, takeSignInReturn } from "@/lib/owner-mfa";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import { authErrorMessage, takePendingInvite } from "@/lib/sign-in-help";
import "@lovable.dev/cloud-auth-js/styles.css";
export const Route = createFileRoute("/auth")({
  head: () =>
    seo(
      "Sign in",
      "Sign in to Evolution with Google, Lovable, or email and password. Optional two-step sign-in. Private beta.",
    ),
  component: AuthPage,
});

const CONFIRM_FAILED = "Sign-in could not be confirmed. Please try again.";

function AuthPage() {
  const { user, ready } = useAccount(),
    navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  /** Go to the remembered page: a pending invitation first, then an owner page, else projects. */
  const leaving = useRef(false);
  const destination = useRef<{
    invite: string | null;
    to: ReturnType<typeof takeSignInReturn>;
  } | null>(null);
  const [codeStep, setCodeStep] = useState<"none" | "code" | "error">("none");
  const go = () => {
    const d = destination.current ?? { invite: null, to: null };
    if (d.invite) return navigate({ to: "/invite", search: { token: d.invite }, replace: true });
    return navigate({ to: d.to ?? "/beta", replace: true });
  };
  const goOn = async () => {
    // Session events can fire more than once; only the first one picks the destination.
    if (leaving.current) return;
    leaving.current = true;
    destination.current ??= {
      invite: takePendingInvite(window.sessionStorage),
      to: takeSignInReturn(),
    };
    // Account security handles its own code / recovery step (a lost phone must still reach recovery).
    if (destination.current.to !== "/account-security") {
      // Two-step sign-in is optional: only accounts that turned it on are asked for a code.
      // Factors are read fresh from the server (the stored session's copy can be stale).
      const [level, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (level.error || factors.error) {
        leaving.current = false;
        return setCodeStep("error");
      }
      const hasAuthenticator = (factors.data.totp ?? []).some((f) => f.status === "verified");
      if (
        signInNeedsCode({
          currentLevel: level.data.currentLevel,
          nextLevel: hasAuthenticator ? "aal2" : level.data.currentLevel,
        })
      )
        return setCodeStep("code");
    }
    return go();
  };

  useEffect(() => {
    if (ready && user) void goOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready]);

  const fail = (e: unknown) =>
    setNotice({
      ok: false,
      text:
        e instanceof Error && e.message === CONFIRM_FAILED
          ? CONFIRM_FAILED
          : authErrorMessage(e as { code?: string; status?: number; message?: string }),
    });

  const oauth = async (provider: "google" | "lovable") => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) throw result.error;
      if (!result.redirected) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error(CONFIRM_FAILED);
        await goOn();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "reset"
        ? "Reset your password"
        : "Sign in to Evolution";

  if (codeStep !== "none")
    return (
      <section className="mx-auto max-w-lg space-y-5 px-5 py-12 sm:px-6 sm:py-14">
        <p className="eyebrow">Evolution / two-step sign-in</p>
        <h1 className="text-3xl">Enter your code</h1>
        {codeStep === "error" ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-warning">
              We couldn't check your two-step sign-in. Check your connection, then try again.
            </p>
            <Button variant="cosmic" onClick={() => void goOn()}>
              Try again
            </Button>
          </div>
        ) : (
          <OwnerCodeForm
            intro="Two-step sign-in is on for this account. Enter the 6-digit code from your authenticator app."
            successText="Code accepted. Opening your page…"
            onVerified={() => go()}
          />
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            to="/account-security"
            hash="recovery"
            className="text-gold-light underline underline-offset-4"
          >
            Lost your phone? Use a recovery code
          </Link>
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setCodeStep("none");
              leaving.current = false;
              destination.current = null;
              void supabase.auth.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </section>
    );

  return (
    <section className="mx-auto max-w-lg px-5 py-12 sm:px-6 sm:py-14">
      <p className="eyebrow">Evolution / private beta</p>
      <h1 className="mt-5 text-3xl">{title}</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        {mode === "reset"
          ? "Enter the email you signed up with. If you signed in with Google, you don't have a password here — use “Continue with Google”."
          : "No app to install. Use the same option every time: if you started with Google, keep using Google."}
      </p>

      {mode !== "reset" && (
        <div className="mt-7 space-y-3">
          <Button
            variant="signal"
            className="h-11 w-full"
            disabled={busy}
            onClick={() => void oauth("google")}
          >
            Continue with Google
          </Button>
          <Button
            className="lovable-auth-button h-11 w-full"
            disabled={busy}
            onClick={() => void oauth("lovable")}
          >
            Continue with Lovable
          </Button>
          <p className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            or with email and password
            <span className="h-px flex-1 bg-border" aria-hidden />
          </p>
        </div>
      )}

      <form
        method="post"
        className="mt-5 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice(null);
          const form = new FormData(e.currentTarget);
          const email = String(form.get("email")),
            password = String(form.get("password"));
          try {
            if (mode === "reset") {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) throw error;
              setNotice({
                ok: true,
                text: "If this email has a password account, a reset link is on its way. Open it on this device.",
              });
            } else if (mode === "signup") {
              const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: `${window.location.origin}/auth` },
              });
              if (error) throw error;
              if (data.session) await goOn();
              else
                setNotice({
                  ok: true,
                  text: "Almost done: open the confirmation link we emailed you, then sign in. You are not signed in yet. If this email already has an account (for example through Google), no second account is made: sign in the way you did before.",
                });
            } else {
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              if (error) throw error;
              await goOn();
            }
          } catch (error) {
            fail(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          Email
          <input
            className="exchange-select mt-2 w-full"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        {mode !== "reset" && (
          <label className="block text-sm">
            Password
            <input
              className="exchange-select mt-2 w-full"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 12 : undefined}
              aria-describedby={mode === "signup" ? "password-rule" : undefined}
              required
            />
            {mode === "signup" && (
              <span id="password-rule" className="mt-1 block text-xs text-muted-foreground">
                At least 12 characters.
              </span>
            )}
          </label>
        )}
        {mode === "signup" && (
          <label className="flex items-start gap-2 text-xs leading-6">
            <input type="checkbox" required aria-label="Accept private beta data storage" />I agree
            to private beta storage of my project and agent declarations. Do not submit credentials,
            confidential source, or personal evidence. AI text is sent only with separate consent.
          </label>
        )}
        <Button type="submit" variant="cosmic" className="h-11 w-full" disabled={busy || !hydrated}>
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : mode === "reset"
                ? "Send reset link"
                : "Sign in with email"}
        </Button>
      </form>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mt-5 break-words text-sm leading-6 ${notice.ok ? "text-success" : "text-warning"}`}
        >
          {notice.text}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setNotice(null);
          }}
        >
          {mode === "signup" ? "Already have an account" : "Create an account"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode(mode === "reset" ? "login" : "reset");
            setNotice(null);
          }}
        >
          {mode === "reset" ? "Back to sign in" : "Forgot password"}
        </Button>
      </div>
      <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
        Stuck?{" "}
        <Link to="/sign-in-help" className="text-gold-light underline underline-offset-4">
          How to sign in, set up two-factor and recover access
        </Link>
      </p>
    </section>
  );
}
