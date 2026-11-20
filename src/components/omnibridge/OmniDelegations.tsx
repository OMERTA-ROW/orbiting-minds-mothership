import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { listOmniDelegations, revokeOmniDelegation } from "@/lib/omni-delegation.functions";
import { DELEGATION_SCOPE_INFO, type DelegationScope } from "@/lib/omni-delegation";

type Row = {
  id: string;
  client_id: string;
  scopes: string[];
  token_prefix: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  last_used_at: string | null;
};

const REASONS: Record<string, string> = {
  client: "cancelled by OMNI",
  owner: "cancelled by you",
  superseded: "replaced by a newer approval",
  code_replay: "cancelled: its sign-in code was reused",
  owner_changed: "cancelled: owner access changed",
};

function rowState(r: Row, now: number) {
  if (r.revoked_at)
    return `Cancelled ${new Date(r.revoked_at).toLocaleString()} (${REASONS[r.revoked_reason ?? ""] ?? "cancelled"})`;
  if (Date.parse(r.expires_at) <= now) return `Expired ${new Date(r.expires_at).toLocaleString()}`;
  return `Active until ${new Date(r.expires_at).toLocaleTimeString()}`;
}

/** Owner list of OMNI web connections with immediate cancel. Shows no secrets. */
export function OmniDelegations() {
  const list = useServerFn(listOmniDelegations);
  const revoke = useServerFn(revokeOmniDelegation);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await list()) as Row[]);
    } catch {
      setNotice({ ok: false, text: "OMNI connections could not be read." });
    }
  }, [list]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const now = Date.now();
  return (
    <section aria-labelledby="omni-connections" className="space-y-3 rounded-lg border p-4">
      <h2 id="omni-connections" className="text-lg">
        OMNI web connections
      </h2>
      <p className="text-xs text-muted-foreground">
        Short-lived permissions you approved for OMNI web (15 minutes at most). Cancelling works
        immediately. API keys above are separate and only read status.
      </p>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Reading connections…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No OMNI web connections yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const active = !r.revoked_at && Date.parse(r.expires_at) > now;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
              >
                <div className="space-y-1">
                  <p>
                    {r.scopes
                      .map((s) => DELEGATION_SCOPE_INFO[s as DelegationScope]?.title ?? s)
                      .join(" · ")}{" "}
                    <span className="text-xs text-muted-foreground">({r.token_prefix}…)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Approved {new Date(r.issued_at).toLocaleString()} · {rowState(r, now)}
                    {r.last_used_at
                      ? ` · last used ${new Date(r.last_used_at).toLocaleTimeString()}`
                      : ""}
                  </p>
                </div>
                {active && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy(r.id);
                      setNotice(null);
                      void revoke({ data: { id: r.id, confirm: true } })
                        .then(
                          () =>
                            setNotice({
                              ok: true,
                              text: "Connection cancelled. OMNI can no longer use it.",
                            }),
                          () =>
                            setNotice({
                              ok: false,
                              text: "Not confirmed. Refresh, then try again.",
                            }),
                        )
                        .then(refresh)
                        .finally(() => setBusy(null));
                    }}
                  >
                    {busy === r.id ? "Cancelling…" : "Cancel now"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={notice.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
