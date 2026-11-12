import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  LEGACY_TOTP_ISSUER,
  afterFailedCode,
  TOTP_ISSUER,
  isSixDigitCode,
  mfaErrorMessage,
} from "@/lib/owner-mfa";

/**
 * Asks the provider to check a six-digit authenticator code for the account's
 * verified authenticator. Never shows or stores the code after submitting.
 */
export function OwnerCodeForm({
  intro,
  onVerified,
  disabled,
  successText = "Verified. Unlocked for 15 minutes.",
}: {
  intro: string;
  onVerified: () => Promise<void> | void;
  disabled?: boolean;
  successText?: string;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fails, setFails] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (pausedUntil <= Date.now()) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pausedUntil]);
  const waitSeconds = pausedUntil > now ? Math.ceil((pausedUntil - now) / 1000) : 0;

  async function submit() {
    if (busy || waitSeconds > 0) return;
    if (!isSixDigitCode(code))
      return setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
    setBusy(true);
    setMsg({ ok: true, text: "Checking code…" });
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((f) => f.status === "verified");
      if (factors.error || !factor) {
        setMsg({
          ok: false,
          text: "No verified authenticator is on this account. Set one up in Account security.",
        });
        return;
      }
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      setCode("");
      if (r.error) {
        const next = afterFailedCode(fails, Date.now());
        setFails(next.fails);
        if (next.pausedUntil) {
          setPausedUntil(next.pausedUntil);
          setMsg({
            ok: false,
            text: "Several codes didn't match. Wait 30 seconds, check your phone's time is set automatically, then try the newest code.",
          });
        } else setMsg({ ok: false, text: mfaErrorMessage(r.error) ?? "Try again." });
        return;
      }
      setFails(0);
      setMsg({ ok: true, text: successText });
      await onVerified();
    } catch {
      setMsg({ ok: false, text: "The code could not be checked. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-md space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm">
        <ShieldCheck size={14} className="mr-1 inline" aria-hidden />
        {intro}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-40"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-label="6-digit authenticator code"
          placeholder="6-digit code"
          disabled={disabled || waitSeconds > 0}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={disabled || busy || code.length !== 6 || waitSeconds > 0}
        >
          {waitSeconds > 0 ? `Wait ${waitSeconds}s` : busy ? "Checking…" : "Verify"}
        </Button>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {msg.text}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        In your authenticator app, look for <strong>{TOTP_ISSUER}</strong> or, for setups made
        before November 12, 2026, <strong>{LEGACY_TOTP_ISSUER}</strong> with your email.{" "}
        <Link to="/account-security" hash="recovery" className="underline">
          Can't find it?
        </Link>
      </p>
    </form>
  );
}
