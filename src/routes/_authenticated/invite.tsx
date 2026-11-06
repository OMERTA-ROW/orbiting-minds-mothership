import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { acceptInvitation } from "@/lib/members.functions";

export const Route = createFileRoute("/_authenticated/invite")({
  validateSearch: z.object({
    token: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
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
  const accept = useServerFn(acceptInvitation);
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  return (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-24">
      <h1 className="font-display text-3xl text-foreground">Accept invitation</h1>
      {!token ? (
        <p className="text-muted-foreground">This link is missing or malformed.</p>
      ) : state.ok ? (
        <p className="text-foreground">
          You joined as {state.ok}.{" "}
          <Link to="/beta" className="text-primary underline">
            Open your private workspace
          </Link>
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            The invitation only works for the confirmed email it was issued to, and only once.
          </p>
          <Button
            onClick={async () => {
              try {
                const r = await accept({ data: { token } });
                setState({ ok: r.role });
              } catch (e) {
                setState({ err: e instanceof Error ? e.message : "Failed" });
              }
            }}
          >
            Accept
          </Button>
          {state.err && (
            <p role="alert" className="text-sm text-destructive">
              {state.err}
            </p>
          )}
        </>
      )}
    </main>
  );
}
