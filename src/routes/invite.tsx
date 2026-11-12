import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { seo } from "@/lib/seo";
import { acceptInvitation, declineInvitation } from "@/lib/members.functions";
import { memberErrorMessage } from "@/lib/invitations";
import { rememberPendingInvite } from "@/lib/sign-in-help";

// Public page: a signed-out invitee is asked to sign in and brought back here.
// Accepting still requires a signed-in account whose confirmed email matches (checked on the server).
export const Route = createFileRoute("/invite")({
  validateSearch: z.object({
    token: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional()
      .catch(undefined),
  }),
  head: () =>
    seo(
      "Accept invitation",
      "Accept a single-use private Evolution invitation with your own confirmed account.",
    ),
  component: Invite,
});

function Invite() {
  const { token } = Route.useSearch();
  const { user, ready } = useAccount();
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitation);
  const decline = useServerFn(declineInvitation);
  const [state, setState] = useState<{ ok?: string; err?: string; declined?: boolean }>({});
  const [busy, setBusy] = useState(false);

  return (
    <section className="mx-auto max-w-xl space-y-5 px-5 py-16 sm:px-6 sm:py-24">
      <h1 className="font-display text-3xl text-foreground">Accept invitation</h1>
      {!token ? (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p role="alert">This invitation link is incomplete or damaged.</p>
          <p>
            Copy the whole link from the message the owner sent you and open it again. If it still
            fails, ask the owner for a new link.
          </p>
        </div>
      ) : state.declined ? (
        <p role="status" className="text-foreground">
          You declined this invitation. The link no longer works. Nothing else changed.
        </p>
      ) : state.ok ? (
        <p role="status" className="text-foreground">
          You joined as {state.ok}.{" "}
          <Link to="/beta" className="text-primary underline">
            Open your private workspace
          </Link>
        </p>
      ) : !ready ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your sign-in…
        </p>
      ) : !user ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Sign in, or create an account, with the same email the invitation was sent to.</li>
            <li>If you created a new account, confirm your email first.</li>
            <li>You'll come back here to accept. The link works once and expires.</li>
          </ol>
          <Button
            variant="cosmic"
            onClick={() => {
              rememberPendingInvite(window.sessionStorage, token);
              void navigate({ to: "/auth" });
            }}
          >
            Sign in to accept
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            The invitation only works for the confirmed email it was issued to, and only once.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState({});
              try {
                const r = await accept({ data: { token } });
                setState({ ok: r.role });
              } catch (e) {
                setState({ err: memberErrorMessage(e instanceof Error ? e.message : "") });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Please wait…" : "Accept invitation"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Decline this invitation? The link will stop working.")) return;
              setBusy(true);
              setState({});
              try {
                await decline({ data: { token } });
                setState({ declined: true });
              } catch (e) {
                setState({ err: memberErrorMessage(e instanceof Error ? e.message : "") });
              } finally {
                setBusy(false);
              }
            }}
          >
            Decline
          </Button>
          {state.err && (
            <p role="alert" className="text-sm text-destructive">
              {state.err}
            </p>
          )}
        </>
      )}
      <p className="text-sm">
        <Link to="/sign-in-help" className="text-gold-light underline underline-offset-4">
          Help with signing in
        </Link>
      </p>
    </section>
  );
}
