import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAccount } from "@/hooks/use-account";
import { seo } from "@/lib/seo";
import { memberErrorMessage, splitInvitations, type InvitationStatus } from "@/lib/invitations";
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

const MEMBERS_KEY = ["members"] as const;
const EXPIRY = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;
const HISTORY_LABEL: Record<Exclude<InvitationStatus, "open">, string> = {
  used: "Accepted",
  revoked: "Revoked",
  declined: "Declined",
  expired: "Expired",
};
type Notice = { ok: boolean; text: string } | null;
type Confirm =
  | { kind: "revoke"; id: string; email: string }
  | { kind: "remove"; id: string; email: string }
  | null;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function untilText(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  const h = Math.max(0, Math.round(ms / 3600_000));
  return h >= 48 ? `${Math.round(h / 24)} days left` : h >= 1 ? `${h} h left` : "under 1 h left";
}

function Members() {
  const qc = useQueryClient();
  const { user } = useAccount();
  const list = useServerFn(listMembers),
    create = useServerFn(createInvitation),
    revoke = useServerFn(revokeInvitation),
    remove = useServerFn(removeMember),
    claim = useServerFn(claimOwner);
  const q = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => list(),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"tester" | "admin">("tester");
  const [hours, setHours] = useState<number>(72);
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [filter, setFilter] = useState<"all" | Exclude<InvitationStatus, "open">>("all");
  const [search, setSearch] = useState("");

  const myRole = q.data?.members.find((m) => m.user_id === user?.id)?.role ?? null;
  const ownerExists = q.data?.members.some((m) => m.role === "owner") ?? false;
  const readAt = q.data ? new Date(q.data.readAt).getTime() : 0;
  const { active, history } = useMemo(
    () => splitInvitations(q.data?.invitations ?? [], readAt ? new Date(readAt) : new Date()),
    [q.data, readAt],
  );
  const shownHistory = history.filter(
    (h) =>
      (filter === "all" || h.status === filter) &&
      (!search.trim() || h.row.email.includes(search.trim().toLowerCase())),
  );

  /** Run a change, then re-read from the server; success is reported only after both finish. */
  async function change(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      await qc.refetchQueries({ queryKey: MEMBERS_KEY, exact: true });
      setNotice({ ok: true, text: success });
      return true;
    } catch (e) {
      setNotice({ ok: false, text: memberErrorMessage(e instanceof Error ? e.message : "") });
      await qc.refetchQueries({ queryKey: MEMBERS_KEY, exact: true }).catch(() => {});
      return false;
    } finally {
      setBusy(null);
    }
  }

  const loadError = q.error ? memberErrorMessage((q.error as Error).message) : null;
  const canManage = !q.error && (myRole === "owner" || myRole === "admin");

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12 sm:px-6 sm:py-16">
      <header className="space-y-2">
        <p className="eyebrow">Settings</p>
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">Members & invitations</h1>
        <p className="text-sm text-muted-foreground">
          Invite someone with a single-use link tied to their email. Nothing is emailed — you send
          the link yourself.{" "}
          <Link to="/sign-in-help" hash="invite-h" className="underline underline-offset-4">
            What the invited person sees
          </Link>
        </p>
      </header>

      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${notice.ok ? "border-success/40 text-success" : "border-destructive/50 text-destructive"}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            className="shrink-0 opacity-70 hover:opacity-100"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {q.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading members…
        </p>
      ) : loadError || !canManage ? (
        <section className="space-y-4 rounded-lg border border-border p-5 text-sm">
          <p className="text-foreground">
            {loadError && !/permission/i.test(loadError)
              ? loadError
              : "Only the owner and admins can manage members."}
          </p>
          <p className="text-muted-foreground">
            If you're the owner and haven't claimed the role yet, do it once here. It only works for
            the configured, confirmed owner email.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy === "claim"}
            onClick={() =>
              void change("claim", () => claim(), "Owner role claimed. You can manage members now.")
            }
          >
            {busy === "claim" ? "Checking…" : "Claim the owner role"}
          </Button>
          <p>
            <Link to="/beta" className="underline underline-offset-4">
              Back to my projects
            </Link>
          </p>
        </section>
      ) : (
        <>
          <section
            aria-labelledby="new-h"
            className="space-y-4 rounded-lg border border-gold/30 p-5"
          >
            <h2 id="new-h" className="text-lg text-foreground">
              Invite someone
            </h2>
            {link ? (
              <div className="space-y-3">
                <p className="text-sm text-success" role="status">
                  Link created for {link.email}. Copy it now — it isn't shown again.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    aria-label="Invitation link"
                    value={link.url}
                    className="text-xs"
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(link.url).then(
                        () => setCopied(true),
                        () =>
                          setNotice({
                            ok: false,
                            text: "Copy failed. Select the link and copy it by hand.",
                          }),
                      )
                    }
                  >
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setLink(null);
                    setCopied(false);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form
                className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = email.trim().toLowerCase();
                  if (active.some((a) => a.row.email === target)) {
                    setNotice({
                      ok: false,
                      text: `${target} already has an open invitation. Revoke it first if you need a new link.`,
                    });
                    return;
                  }
                  void (async () => {
                    let token = "";
                    const ok = await change(
                      "create",
                      async () => {
                        token = (await create({ data: { email: target, role, hours } })).token;
                      },
                      `Invitation created for ${target}.`,
                    );
                    if (ok && token) {
                      setLink({
                        url: `${window.location.origin}/invite?token=${token}`,
                        email: target,
                      });
                      setEmail("");
                    }
                  })();
                }}
              >
                <Input
                  aria-label="Email of the person to invite"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="person@example.com"
                />
                <select
                  aria-label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "tester" | "admin")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="tester">Tester</option>
                  {myRole === "owner" && <option value="admin">Admin</option>}
                </select>
                <select
                  aria-label="Link expires after"
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {EXPIRY.map((x) => (
                    <option key={x.hours} value={x.hours}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={busy === "create"}>
                  {busy === "create" ? "Creating…" : "Create link"}
                </Button>
              </form>
            )}
          </section>

          <section aria-labelledby="active-h" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="active-h" className="text-lg text-foreground">
                Open invitations ({active.length})
              </h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={q.isFetching}
                onClick={() => void q.refetch()}
              >
                {q.isFetching ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            {active.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No open invitations. Links that are used, revoked, declined or expired move to
                History below.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {active.map(({ row }) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block break-all text-foreground">{row.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.role} · {untilText(row.expires_at, readAt)}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === row.id}
                      onClick={() => setConfirm({ kind: "revoke", id: row.id, email: row.email })}
                    >
                      {busy === row.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="members-h" className="space-y-3">
            <h2 id="members-h" className="text-lg text-foreground">
              Members ({q.data!.members.length})
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {q.data!.members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block break-all text-foreground">
                      {m.email}
                      {m.user_id === user?.id && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.role}</span>
                  </span>
                  {m.role !== "owner" &&
                    m.user_id !== user?.id &&
                    (myRole === "owner" || m.role === "tester") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === m.user_id}
                        onClick={() =>
                          setConfirm({ kind: "remove", id: m.user_id, email: m.email })
                        }
                      >
                        {busy === m.user_id ? "Removing…" : "Remove"}
                      </Button>
                    )}
                </li>
              ))}
            </ul>
            {q.data!.members.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Only you so far. Invite someone above.
              </p>
            )}
          </section>

          <details
            className="group rounded-lg border border-border p-4"
            open={history.length > 0 && history.length <= 5}
          >
            <summary className="cursor-pointer text-lg text-foreground">
              History ({history.length})
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Kept as a record. Closed invitations can't be used again.
            </p>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <>
                <div
                  className="mt-3 flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Filter history"
                >
                  {(["all", "used", "revoked", "declined", "expired"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "default" : "outline"}
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all" ? "All" : HISTORY_LABEL[f]}
                    </Button>
                  ))}
                  <Input
                    aria-label="Search history by email"
                    placeholder="Search email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 max-w-48"
                  />
                </div>
                {shownHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No matches.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border text-sm">
                    {shownHistory.map(({ row, status }) => (
                      <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span className="break-all text-muted-foreground">
                          {row.email} · {row.role}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {HISTORY_LABEL[status as Exclude<InvitationStatus, "open">]} ·{" "}
                          {when(
                            row.accepted_at ?? row.revoked_at ?? row.declined_at ?? row.expires_at,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </details>
          {!ownerExists && (
            <p className="text-xs text-muted-foreground">No owner is assigned yet.</p>
          )}
        </>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "remove" ? "Remove this member?" : "Revoke this invitation?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "remove"
                ? `${confirm.email} loses their role right away. Open invitations they sent or received are cancelled, and AI/studio approval is withdrawn. Their own projects are not deleted.`
                : `The link for ${confirm?.email ?? ""} stops working immediately. You can create a new one later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (!c) return;
                if (c.kind === "remove")
                  void change(
                    c.id,
                    () => remove({ data: { id: c.id } }),
                    `${c.email} was removed.`,
                  );
                else
                  void change(
                    c.id,
                    () => revoke({ data: { id: c.id } }),
                    `Invitation for ${c.email} revoked.`,
                  );
              }}
            >
              {confirm?.kind === "remove" ? "Remove" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
