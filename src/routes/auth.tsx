import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import "@lovable.dev/cloud-auth-js/styles.css";
export const Route = createFileRoute("/auth")({ head: () => seo("Private beta · Sign in", "Create an Evolution account for private projects and operator-owned agent declarations. Email confirmation and founder-approved AI access; no public launch."), component: AuthPage });
function AuthPage() {
  const { user, ready } = useAccount(), navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => { if (ready && user) void navigate({ to: "/beta", replace: true }); }, [user, ready, navigate]);
  const oauth = async (provider: "google" | "lovable") => {
    setBusy(true); setNotice("");
    try { const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` }); if (result.error) throw result.error; if (!result.redirected) { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error("Sign-in could not be confirmed. Please try again."); await navigate({ to: "/beta", replace: true }); } }
    catch (e) { setNotice(e instanceof Error ? e.message : "Sign-in unavailable."); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-lg px-6 py-14">
    <p className="eyebrow">Evolution / limited beta</p><h1 className="mt-5 text-3xl">{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h1>
    <p className="mt-5 text-sm leading-7 text-muted-foreground">Private projects and agent declarations. AI access requires founder approval. Existing demonstrations remain separate.</p>
    <form method="post" className="mt-8 space-y-5" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(e.currentTarget); const email = String(form.get("email")), password = String(form.get("password"));
      try {
        if (mode === "reset") { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (error) throw error; setNotice("If this account exists, check your email for a password reset link."); }
        else if (mode === "signup") { const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth` } }); if (error) throw error; if (data.session) await navigate({ to: "/beta", replace: true }); else setNotice("Check your email to confirm your account. You are not signed in yet."); }
        else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; await navigate({ to: "/beta", replace: true }); }
      } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to sign in."); } finally { setBusy(false); }
    }}>
      <label className="block text-sm">Email<input className="exchange-select mt-2 w-full" name="email" type="email" autoComplete="email" required /></label>
      {mode !== "reset" && <label className="block text-sm">Password<input className="exchange-select mt-2 w-full" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : undefined} required /></label>}
      {mode === "signup" && <label className="flex items-start gap-2 text-xs leading-6"><input type="checkbox" required aria-label="Accept private beta data storage" />I agree to private beta storage of my project and agent declarations. Do not submit credentials, confidential source, or personal evidence. AI text is sent only with separate consent.</label>}
      <Button type="submit" variant="cosmic" className="w-full" disabled={busy || !hydrated}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</Button>
    </form>
    {notice && <p role="status" className="mt-5 break-words text-sm leading-6 text-warning">{notice}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setNotice(""); }}>{mode === "signup" ? "Already have an account" : "Create an account"}</Button><Button variant="ghost" disabled={busy} onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setNotice(""); }}>{mode === "reset" ? "Back to sign in" : "Forgot password"}</Button></div>
    <div className="mt-5 space-y-3 border-t border-border pt-6"><Button variant="signal" className="w-full" disabled={busy} onClick={() => void oauth("google")}>Continue with Google</Button><Button className="lovable-auth-button w-full" disabled={busy} onClick={() => void oauth("lovable")}>Continue with Lovable</Button></div>
    <Button asChild variant="ghost" className="mt-6"><Link to="/launch-control">Launch readiness</Link></Button>
  </section>;
}