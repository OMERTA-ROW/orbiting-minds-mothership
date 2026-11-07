import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Anchor, OctagonX, Power, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { FRESH_MFA_SECONDS, noteProblem } from "@/lib/activation-approvals";
import {
  approveDockDevice,
  cancelDockInvite,
  createDockInvite,
  readDockingBay,
  revokeDockDevice,
  setDockAutonomy,
  setDockPermissions,
  type DockDeviceView,
} from "@/lib/omni-dock.functions";
import {
  AUTONOMY_SWITCHES,
  BRANCH_KINDS,
  BRANCH_LABEL,
  DEFAULT_MOBILE_PERMISSIONS,
  DOCK_PATHS,
  DOCK_PERMISSIONS,
  DOCK_PROTOCOL,
  PERMISSION_INFO,
  STATUS_LABEL,
  type BranchKind,
  type DockPermission,
} from "@/lib/omni-dock";

type Bay = Awaited<ReturnType<typeof readDockingBay>>;
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const STATUS_TONE: Record<DockDeviceView["status"], string> = {
  connected: "border-primary text-primary",
  awaiting_approval: "border-border text-foreground",
  never_connected: "border-border text-muted-foreground",
  disconnected: "border-border text-muted-foreground",
  revoked: "border-destructive text-destructive",
};

export function DockingBay() {
  const read = useServerFn(readDockingBay);
  const create = useServerFn(createDockInvite);
  const cancel = useServerFn(cancelDockInvite);
  const approve = useServerFn(approveDockDevice);
  const setPerms = useServerFn(setDockPermissions);
  const revoke = useServerFn(revokeDockDevice);
  const autonomy = useServerFn(setDockAutonomy);

  const [bay, setBay] = useState<Bay | null>(null);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ area: string; text: string; lines?: string[] } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<BranchKind>("honeycomb_mobile");
  const [requested, setRequested] = useState<DockPermission[]>(DEFAULT_MOBILE_PERMISSIONS);
  const [minutes, setMinutes] = useState(10);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [origin, setOrigin] = useState("");

  const refresh = useCallback(async () => setBay(await read()), [read]);
  useEffect(() => {
    setOrigin(window.location.origin);
    refresh().then(
      () => setAccess("ok"),
      () => setAccess("denied"),
    );
  }, [refresh]);

  const mfaFresh =
    bay?.mfaAgeSeconds !== null && (bay?.mfaAgeSeconds ?? Infinity) <= FRESH_MFA_SECONDS;

  async function act(
    area: string,
    pending: string,
    fn: () => Promise<{ ok: boolean; message?: string }>,
    done: string,
  ) {
    if (busy) return;
    setBusy(true);
    setNotice({ area, text: pending });
    try {
      const r = await fn();
      if (!r.ok) return setNotice({ area, text: r.message ?? "Not confirmed." });
      await refresh();
      setNotice({ area, text: done });
    } catch {
      setNotice({ area, text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  async function reverify() {
    if (busy) return;
    setBusy(true);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((f) => f.status === "verified");
      if (!factor)
        return setNotice({
          area: "mfa",
          text: "No verified authenticator. Set one up on Two-factor.",
        });
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (r.error)
        return setNotice({
          area: "mfa",
          text: "That code was not accepted. Try the current code.",
        });
      setCode("");
      await refresh();
      setNotice({ area: "mfa", text: "Two-factor re-verified for 15 minutes." });
    } catch {
      setNotice({ area: "mfa", text: "Re-verification could not complete. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (busy) return;
    setBusy(true);
    setIssued(null);
    setNotice({ area: "pair", text: "Creating a pairing code…" });
    try {
      const r = await create({ data: { kind, permissions: requested, minutes } });
      if (!r.ok) return setNotice({ area: "pair", text: r.message });
      setIssued({ code: r.code, expiresAt: r.expiresAt });
      await refresh();
      setNotice({ area: "pair", text: "Code created. It is shown only once and works one time." });
    } catch {
      setNotice({ area: "pair", text: "Not confirmed. Refresh before retrying." });
    } finally {
      setBusy(false);
    }
  }

  async function tryAutonomy(d: DockDeviceView) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await autonomy({ data: { id: d.id, label: d.label, on: true } });
      setNotice({ area: d.id, text: r.message, lines: d.autonomyBlockers });
    } catch {
      setNotice({ area: d.id, text: "Not confirmed. Mobile autonomy stays off." });
    } finally {
      setBusy(false);
    }
  }

  if (access !== "ok" || !bay) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl">OMNI Docking Bay</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {access === "checking"
            ? "Checking owner access…"
            : "The Docking Bay is private to the verified owner with two-factor sign-in."}
        </p>
        {access === "denied" && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/auth">Owner sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/account-security">Two-factor</Link>
            </Button>
          </div>
        )}
      </main>
    );
  }

  const live = bay.devices.filter((d) => d.status !== "revoked");
  const revoked = bay.devices.filter((d) => d.status === "revoked");
  const openInvites = bay.invites.filter((i) => i.state === "open");
  const msg = (area: string) =>
    notice?.area === area ? (
      <div role="status" className="space-y-1 text-sm text-muted-foreground">
        <p>{notice.text}</p>
        {notice.lines && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {notice.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    ) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl">
            <Anchor size={22} aria-hidden /> OMNI Docking Bay
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Where OMNI branches attach: Honeycomb Terminal on phone or tablet, OMNI desktop and the
            command-line companion. Docking lets a device show status, propose tasks for you to hold
            and engage the Emergency Stop. It never runs commands on the device or here.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void act("top", "Refreshing…", async () => ({ ok: true }), "Refreshed.")}
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </header>
      {msg("top")}

      <section aria-label="Switches" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className={`space-y-1 rounded-lg border p-4 ${bay.emergencyStopEngaged ? "border-destructive bg-destructive/10" : "bg-card"}`}
        >
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <OctagonX size={16} aria-hidden /> Emergency Stop
          </h2>
          <p className="text-lg font-semibold">
            {bay.emergencyStopEngaged ? "Engaged" : "Released"}
          </p>
          <p className="text-xs text-muted-foreground">
            Shared with OMNI Terminal. Docked devices with permission can engage it, never release
            it.{" "}
            <Link to="/omni-terminal" className="underline">
              Change in Terminal
            </Link>
          </p>
        </div>
        {AUTONOMY_SWITCHES.map((s) => (
          <div key={s.id} className="space-y-1 rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Power size={16} aria-hidden /> {s.label}
            </h2>
            <p className="text-lg font-semibold">Off</p>
            <p className="text-xs text-muted-foreground">
              Separate switch · {s.where}. Cannot be turned on yet.
            </p>
          </div>
        ))}
      </section>

      {!mfaFresh && (
        <form
          className="flex max-w-md flex-wrap items-center gap-2 rounded-lg border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void reverify();
          }}
        >
          <p className="w-full text-sm">
            <ShieldCheck size={14} className="mr-1 inline" aria-hidden />
            Creating codes, approving devices and changing permissions need two-factor from the last
            15 minutes.
          </p>
          <Input
            className="max-w-40"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="6-digit authenticator code"
            placeholder="6-digit code"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || code.length !== 6}>
            Verify
          </Button>
          {msg("mfa")}
        </form>
      )}

      <section aria-labelledby="pair-h" className="space-y-4 rounded-lg border bg-card p-4 md:p-5">
        <h2 id="pair-h" className="flex items-center gap-2 text-lg">
          <Smartphone size={18} aria-hidden /> Dock a branch
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Branch</span>
            <select
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as BranchKind)}
              disabled={busy}
            >
              {BRANCH_KINDS.map((k) => (
                <option key={k} value={k}>
                  {BRANCH_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Code lasts</span>
            <select
              className={selectClass}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              disabled={busy}
            >
              {[5, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm">
            Permissions it may ask for (you confirm them again when approving)
          </legend>
          {DOCK_PERMISSIONS.map((p) => (
            <label key={p} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={requested.includes(p)}
                onChange={() =>
                  setRequested((r) => (r.includes(p) ? r.filter((x) => x !== p) : [...r, p]))
                }
                disabled={busy}
              />
              <span>
                {PERMISSION_INFO[p].label}
                <span className="block text-xs text-muted-foreground">
                  {PERMISSION_INFO[p].detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button onClick={() => void issue()} disabled={busy || !mfaFresh}>
          Create pairing code
        </Button>
        {!mfaFresh && (
          <p className="text-xs text-muted-foreground">Re-verify two-factor above first.</p>
        )}
        {msg("pair")}
        {issued && (
          <div className="space-y-2 rounded-md border border-primary/40 p-4">
            <p className="text-xs text-muted-foreground">One-time pairing code</p>
            <p className="font-mono text-3xl tracking-widest" aria-live="polite">
              {issued.code}
            </p>
            <p className="text-xs text-muted-foreground">
              Expires {when(issued.expiresAt)}. On the device, enter this code and the Mothership
              address <span className="font-mono">{origin}</span>. The device then shows a six-digit
              safety code — check it matches the one listed below before you approve. Honeycomb's
              own dock screen still has to be built in the Honeycomb project.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Hide code
            </Button>
          </div>
        )}
        {openInvites.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Open codes ({openInvites.length}/3)</h3>
            {openInvites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {BRANCH_LABEL[i.branchKind as BranchKind] ?? i.branchKind} · expires{" "}
                  {when(i.expiresAt)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      "pair",
                      "Cancelling…",
                      () => cancel({ data: { id: i.id } }),
                      "Code cancelled.",
                    )
                  }
                >
                  Cancel code
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="devices-h" className="space-y-3">
        <h2 id="devices-h" className="text-lg">
          Docked branches ({live.length})
        </h2>
        {live.length === 0 && (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            No branch has docked. Nothing is paired or connected yet.
          </p>
        )}
        {live.map((d) => {
          const draft =
            edits[d.id] ?? (d.status === "awaiting_approval" ? d.requested : d.permissions);
          const choices = d.status === "awaiting_approval" ? d.requested : DOCK_PERMISSIONS;
          const changed = draft.slice().sort().join() !== d.permissions.slice().sort().join();
          return (
            <article key={d.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{d.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {BRANCH_LABEL[d.branchKind as BranchKind] ?? d.branchKind} · {d.platform}
                    {d.appVersion ? ` · v${d.appVersion}` : ""}
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_TONE[d.status]}`}>
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <dt className="text-muted-foreground">Safety code</dt>
                <dd className="font-mono text-base">{d.safetyCode}</dd>
                <dt className="text-muted-foreground">Key fingerprint</dt>
                <dd className="font-mono">{d.fingerprintShort}…</dd>
                <dt className="text-muted-foreground">Last signed contact</dt>
                <dd>{when(d.lastSeenAt)}</dd>
                <dt className="text-muted-foreground">Device says it can</dt>
                <dd>{d.capabilities.length ? d.capabilities.join(", ") : "Nothing reported"}</dd>
                <dt className="text-muted-foreground">Held tasks from it</dt>
                <dd>
                  {d.heldTasks}{" "}
                  {d.heldTasks > 0 && (
                    <Link to="/omni-terminal" className="underline">
                      View in Terminal
                    </Link>
                  )}
                </dd>
              </dl>
              <fieldset className="space-y-1">
                <legend className="text-sm">
                  {d.status === "awaiting_approval" ? "Allow when approving" : "Allowed by you"}
                </legend>
                {choices.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.includes(p)}
                      disabled={busy}
                      onChange={() =>
                        setEdits((e) => ({
                          ...e,
                          [d.id]: draft.includes(p) ? draft.filter((x) => x !== p) : [...draft, p],
                        }))
                      }
                    />
                    {PERMISSION_INFO[p as DockPermission]?.label ?? p}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                {d.status === "awaiting_approval" ? (
                  <Button
                    size="sm"
                    disabled={busy || !mfaFresh}
                    onClick={() =>
                      void act(
                        d.id,
                        "Approving…",
                        () =>
                          approve({ data: { id: d.id, permissions: draft as DockPermission[] } }),
                        "Approved. The device is paired with only the permissions you ticked.",
                      )
                    }
                  >
                    Safety codes match — approve
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !mfaFresh || !changed}
                    onClick={() =>
                      void act(
                        d.id,
                        "Saving…",
                        () =>
                          setPerms({
                            data: {
                              id: d.id,
                              permissions: draft as DockPermission[],
                              revision: d.revision,
                            },
                          }),
                        "Permissions saved.",
                      )
                    }
                  >
                    Save permissions
                  </Button>
                )}
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    Mobile autonomy for this device: <strong>Off</strong>
                  </span>
                  <div
                    className="flex gap-1"
                    role="group"
                    aria-label={`Mobile autonomy for ${d.label}`}
                  >
                    <Button size="sm" variant="secondary" aria-pressed="true" disabled>
                      Off
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void tryAutonomy(d)}
                    >
                      On
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  When enabled in future, this would let the device send scoped jobs to OMNI without
                  you confirming each one. It never allows commands to run on the device itself.
                </p>
              </div>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = reasons[d.id] ?? "";
                  if (noteProblem(reason))
                    return setNotice({
                      area: d.id,
                      text: "Remove anything that looks like a key or token.",
                    });
                  void act(
                    d.id,
                    "Revoking…",
                    () => revoke({ data: { id: d.id, reason } }),
                    "Revoked. The device's key is refused and its held tasks were cancelled.",
                  );
                }}
              >
                <Input
                  className="max-w-xs"
                  value={reasons[d.id] ?? ""}
                  maxLength={200}
                  onChange={(e) => setReasons((r) => ({ ...r, [d.id]: e.target.value }))}
                  placeholder="Reason (optional)"
                  aria-label={`Reason to revoke ${d.label}`}
                />
                <Button type="submit" size="sm" variant="destructive" disabled={busy}>
                  Revoke device
                </Button>
              </form>
              {msg(d.id)}
            </article>
          );
        })}
        {revoked.length > 0 && (
          <details className="rounded-lg border bg-card p-4 text-sm">
            <summary>Revoked ({revoked.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {revoked.map((d) => (
                <li key={d.id}>
                  {d.label} · revoked {when(d.revokedAt)}
                  {d.revokeReason ? ` · ${d.revokeReason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="log-h" className="space-y-2">
        <h2 id="log-h" className="text-lg">
          Dock log
        </h2>
        {bay.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dock activity recorded.</p>
        ) : (
          <ol className="max-h-80 space-y-1 overflow-y-auto rounded-lg border bg-card p-3 font-mono text-xs">
            {bay.events.map((e) => {
              const dev = bay.devices.find((d) => d.id === e.device_id);
              return (
                <li key={e.id} className={e.outcome === "ok" ? "" : "text-destructive"}>
                  {when(e.created_at)} · {e.event.replace(/_/g, " ")} · {e.outcome}
                  {dev ? ` · ${dev.label}` : ""}
                  {e.detail ? ` · ${e.detail}` : ""}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <details className="rounded-lg border bg-card p-4 text-sm">
        <summary>How docking works ({DOCK_PROTOCOL})</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            You create a one-time code here (two-factor, 2–15 minutes). Only its fingerprint is
            stored.
          </li>
          <li>
            The device makes its own key, which never leaves it, and sends the code signed with that
            key to <span className="font-mono">{DOCK_PATHS.pair}</span>.
          </li>
          <li>Both screens show a six-digit safety code. You approve here only if they match.</li>
          <li>
            Every later request is signed, used once and must be within one minute:{" "}
            <span className="font-mono">{DOCK_PATHS.heartbeat}</span>,{" "}
            <span className="font-mono">{DOCK_PATHS.jobs}</span>,{" "}
            <span className="font-mono">{DOCK_PATHS.stop}</span>.
          </li>
          <li>
            Connected means a signed contact in the last two minutes. Revoking refuses the key
            immediately and cancels its held tasks.
          </li>
        </ol>
      </details>
    </main>
  );
}
