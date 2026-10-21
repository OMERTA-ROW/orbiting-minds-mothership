import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/reset-password")({ head: () => seo("Reset your password", "Set a new Evolution account password using your recovery email. Public recovery page for the private beta."), component: ResetPassword });
function ResetPassword() {
  const [recovery, setRecovery] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    const check = () => setRecovery(sessionStorage.getItem("evolution-password-recovery") === "true" || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery" || new URLSearchParams(window.location.search).get("type") === "recovery");
    check(); const timer = window.setInterval(check, 250); return () => window.clearInterval(timer);
  }, []);
  return <section className="mx-auto max-w-lg px-6 py-16"><h1 className="text-3xl">Set a new password</h1>{recovery ? <form className="mt-8 space-y-5" onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget), password = String(form.get("password"));
    if (password !== form.get("confirm")) { setNotice("Passwords do not match."); return; }
    const { error } = await supabase.auth.updateUser({ password }); if (!error) sessionStorage.removeItem("evolution-password-recovery"); setNotice(error ? error.message : "Password updated. You can return to your projects.");
  }}><label className="block">New password<input name="password" type="password" autoComplete="new-password" minLength={12} required className="exchange-select mt-2 w-full" /></label><label className="block">Confirm password<input name="confirm" type="password" autoComplete="new-password" required className="exchange-select mt-2 w-full" /></label><Button type="submit" variant="cosmic">Update password</Button></form> : <p className="mt-6 text-sm text-warning">Open the recovery link from your email. No password can be changed here without a valid recovery session.</p>}{notice && <p role="status" className="mt-5 text-sm text-warning">{notice}</p>}<Button asChild variant="ghost" className="mt-6"><Link to="/auth">Return to sign in</Link></Button></section>;
}