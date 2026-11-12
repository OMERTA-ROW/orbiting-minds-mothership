import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { invitationStatus } from "@/lib/invitations";
import {
  claimOwner,
  createInvitation,
  listMembers,
  removeMember,
  revokeInvitation,
} from "@/lib/members.functions";

export const Route = createFileRoute("/_authenticated/members")({
  head: () =>
    seo(
      "Members & Invitations",
      "Owner-managed private accounts with single-use, email-bound invitations. Server-enforced roles.",
    ),
  component: Members,
});

function Members() {
  const qc = useQueryClient();
  const list = useServerFn(listMembers),
    create = useServerFn(createInvitation),
    revoke = useServerFn(revokeInvitation),
    remove = useServerFn(removeMember),
    claim = useServerFn(claimOwner);
  const q = useQuery({ queryKey: ["members"], queryFn: () => list(), retry: false });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tester" | "admin">("tester");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const run = async (f: () => Promise<unknown>) => {
    setMsg("");
    try {
      await f();
      await qc.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-24">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Owner and admins only</p>
        <h1 className="font-display text-4xl text-foreground">Members & Invitations</h1>
        <p className="mt-2 text-muted-foreground">
          Owners and admins only. Each link works once, for one confirmed email. Nothing is emailed:
          copy the link yourself.
        </p>
      </header>
      {q.error && (
        <p role="alert" className="rounded border border-primary/40 p-4 text-sm text-foreground">
          {(q.error as Error).message}
        </p>
      )}
      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
      <section className="space-y-3 rounded-lg border border-border p-5">
        <h2 className="text-lg text-foreground">Invite a private member</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await create({ data: { email, role, hours: 72 } });
              setLink(`${window.location.origin}/invite?token=${r.token}`);
              setEmail("");
            });
          }}
        >
          <input
            aria-label="Invitee email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-64 flex-1 rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="person@example.com"
          />
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as "tester" | "admin")}
            className="rounded border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="tester">Tester</option>
            <option value="admin">Admin (owner only)</option>
          </select>
          <Button type="submit">Create link (72h)</Button>
        </form>
        {link && (
          <div className="flex gap-2">
            <input
              readOnly
              aria-label="Invitation link"
              value={link}
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(link)}>
              Copy
            </Button>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => run(() => claim())}>
          One-time setup: claim the owner role (only the configured, confirmed owner email can)
        </Button>
      </section>
      <section>
        <h2 className="mb-2 text-lg text-foreground">Invitations</h2>
        {(q.data?.invitations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <ul className="space-y-2">
            {q.data!.invitations.map((i) => {
              const s = invitationStatus(i);
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {i.email} · {i.role} · {s}
                  </span>
                  {s === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(() => revoke({ data: { id: i.id } }))}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-lg text-foreground">Members</h2>
        {(q.data?.members ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {q.data!.members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {m.email} · {m.role}
                </span>
                {m.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(() => remove({ data: { id: m.user_id } }))}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
