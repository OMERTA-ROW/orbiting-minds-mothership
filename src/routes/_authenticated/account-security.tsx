import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/account-security")({
  head: () => ({
    meta: [
      { title: "Two-Factor Authentication · OMNI Account Security" },
      {
        name: "description",
        content: "Set up and verify an authenticator app for your OMNI account.",
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
type Pending = { id: string; qr: string; secret: string };

function AccountSecurity() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [f, a] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (f.error) setMsg({ ok: false, text: "Could not load your security settings. Try again." });
    else setFactors((f.data.all ?? []).filter((x) => x.factor_type === "totp") as Factor[]);
    if (!a.error) setLevel(a.data.currentLevel ?? "");
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verified = factors.filter((f) => f.status === "verified");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Try again." });
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
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (r.error) {
        setMsg({ ok: false, text: `Could not start setup: ${r.error.message}` });
        return;
      }
      setPending({ id: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret });
    });

  const verify = (factorId: string) =>
    run(async () => {
      if (!/^\d{6}$/.test(code)) {
        setMsg({ ok: false, text: "Enter the 6-digit code from your authenticator app." });
        return;
      }
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      setCode("");
      if (r.error) {
        setMsg({
          ok: false,
          text: "That code didn't work. Check your phone's time and try a fresh code.",
        });
        return;
      }
      setPending(null);
      setMsg({ ok: true, text: "Two-factor authentication is verified for this session." });
    });

  const remove = (id: string) =>
    run(async () => {
      if (
        !window.confirm(
          "Remove this authenticator? Owner-only pages will lock until you add one again.",
        )
      )
        return;
      const r = await supabase.auth.mfa.unenroll({ factorId: id });
      setMsg(
        r.error
          ? {
              ok: false,
              text: `Could not remove: ${r.error.message}. You may need to verify a code first.`,
            }
          : { ok: true, text: "Authenticator removed." },
      );
    });

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Account Security</p>
        <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Owner-only pages need an authenticator app code. Status:{" "}
          <strong>
            {verified.length
              ? level === "aal2"
                ? "On and verified this session"
                : "On — enter a code to unlock owner pages"
              : "Not set up"}
          </strong>
        </p>
      </div>

      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}
        >
          {msg.text}
        </p>
      )}

      {verified.length === 0 && !pending && (
        <Button disabled={busy} onClick={start}>
          Set up authenticator app
        </Button>
      )}

      {pending && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            1. Scan this code with Google Authenticator, 1Password, Authy or similar.
          </p>
          <img
            src={pending.qr}
            alt="Authenticator setup QR code"
            className="h-48 w-48 rounded bg-foreground p-2"
          />
          <details className="text-sm">
            <summary className="cursor-pointer">Can't scan? Show setup key</summary>
            <code className="mt-2 block break-all">{pending.secret}</code>
            <p className="mt-1 text-xs text-muted-foreground">
              Keep this private. It is shown only during setup.
            </p>
          </details>
          <p className="text-sm">2. Enter the 6-digit code it shows.</p>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="6-digit code"
            />
            <Button disabled={busy} onClick={() => verify(pending.id)}>
              Verify
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await supabase.auth.mfa.unenroll({ factorId: pending.id });
                setPending(null);
                setMsg({ ok: true, text: "Setup cancelled." });
              })
            }
          >
            Cancel setup
          </Button>
        </section>
      )}

      {verified.map((f) => (
        <section key={f.id} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{f.friendly_name || "Authenticator app"} · verified</p>
          {level !== "aal2" && (
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="6-digit code"
              />
              <Button disabled={busy} onClick={() => verify(f.id)}>
                Unlock with code
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => remove(f.id)}>
            Remove authenticator
          </Button>
        </section>
      ))}

      <section className="text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">If you lose your phone</h2>
        <p>
          Backup codes aren't available. Back up your authenticator (most apps support encrypted
          cloud backup), or add the setup key to a second device during setup. Without it, account
          recovery needs manual help from the backend administrator.
        </p>
      </section>
      <Link to="/members" className="text-sm underline">
        Back to Members
      </Link>
    </main>
  );
}
