import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/use-account";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { knownAuthMessage } from "@/lib/sign-in-help";
export const Route = createFileRoute("/reset-password")({
  head: () =>
    seo(
      "Reset your password",
      "Set a new Evolution account password using your recovery email. Public recovery page for the private beta.",
    ),
  component: ResetPassword,
});
function ResetPassword() {
  const { user, ready, recoveryUserId, finishRecovery } = useAccount();
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false);
  const recovery = ready && !!user && recoveryUserId === user.id;
  return (
    <section className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-3xl">Set a new password</h1>
      {!ready ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Checking your recovery session…
        </p>
      ) : complete ? (
        <p role="status" className="mt-6 text-sm text-success">
          Password updated. You can return to your projects.
        </p>
      ) : recovery ? (
        <form
          className="mt-8 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget),
              password = String(form.get("password"));
            if (busy) return;
            if (password !== form.get("confirm")) {
              setNotice("Passwords do not match.");
              return;
            }
            setBusy(true);
            setNotice("");
            try {
              const { data, error: sessionError } = await supabase.auth.getUser();
              if (sessionError || !data.user || data.user.id !== recoveryUserId)
                throw new Error(
                  "Your recovery session is unavailable. Open a fresh link from your email.",
                );
              const { error } = await supabase.auth.updateUser({ password });
              if (error) throw error;
              setComplete(true);
              finishRecovery();
            } catch (error) {
              setNotice(
                knownAuthMessage(error as { code?: string; message?: string }) ??
                  (error instanceof Error
                    ? error.message
                    : "Password could not be updated. Try again."),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              disabled={busy}
              className="exchange-select mt-2 w-full"
            />
          </label>
          <label className="block">
            Confirm password
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={busy}
              className="exchange-select mt-2 w-full"
            />
          </label>
          <Button type="submit" variant="cosmic" disabled={busy}>
            {busy ? "Updating password…" : "Update password"}
          </Button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-warning">
          Open the recovery link from your email. No password can be changed here without a valid
          recovery session.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 break-words text-sm text-warning">
          {notice}
        </p>
      )}
      <Button asChild variant="ghost" className="mt-6">
        <Link to="/auth">Return to sign in</Link>
      </Button>
    </section>
  );
}
