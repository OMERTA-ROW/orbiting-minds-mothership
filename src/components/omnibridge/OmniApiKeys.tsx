import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Copy, RefreshCw, Ban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createOmniApiKey,
  listOmniApiKeyAudit,
  listOmniApiKeys,
  revokeOmniApiKey,
  rotateOmniApiKey,
} from "@/lib/omni-api-keys.functions";
import {
  OMNI_API_SCOPES,
  OMNI_SCOPE_LABELS,
  omniKeyStatus,
  type OmniApiKeyRow,
  type OmniApiScope,
} from "@/lib/omni-api-keys";

interface AuditRow {
  id: string;
  action: string;
  record_id: string;
  occurred_at: string;
}

export function OmniApiKeys() {
  const listKeys = useServerFn(listOmniApiKeys);
  const listAudit = useServerFn(listOmniApiKeyAudit);
  const createKey = useServerFn(createOmniApiKey);
  const rotateKey = useServerFn(rotateOmniApiKey);
  const revokeKey = useServerFn(revokeOmniApiKey);

  const [keys, setKeys] = useState<OmniApiKeyRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<OmniApiScope[]>(["health"]);
  const [days, setDays] = useState(30);
  const [confirmed, setConfirmed] = useState(false);
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string } | null>(null);

  const refresh = useCallback(async () => {
    const [k, a] = await Promise.all([listKeys(), listAudit()]);
    setKeys(k as OmniApiKeyRow[]);
    setAudit(a as AuditRow[]);
  }, [listKeys, listAudit]);

  useEffect(() => {
    refresh()
      .then(() => setAccess("ok"))
      .catch(() => setAccess("denied"));
  }, [refresh]);

  async function run(action: () => Promise<{ id: string; secret?: string }>, done: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await action();
      if (result.secret) setShownSecret({ id: result.id, secret: result.secret });
      setNotice(done);
      await refresh();
    } catch {
      setNotice("The request was not confirmed. Check owner access and refresh before retrying.");
    } finally {
      setBusy(false);
    }
  }

  if (accessError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl">OMNI API credentials</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This workspace is private to the verified owner with strong MFA. Sign in through the
          owner flow to manage API keys; no keys are visible or usable here without that verified
          session.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-2xl">
          <KeyRound size={22} aria-hidden /> OMNI API credentials
        </h1>
        <p className="text-sm text-muted-foreground">
          Owner-only keys for the authenticated health and jobs endpoints. Secrets are shown once
          and only their hash is stored. Creating a key connects nothing external — it only permits
          the scoped endpoints listed below.
        </p>
      </header>

      {shownSecret && (
        <section
          aria-live="polite"
          className="space-y-3 rounded-lg border border-primary/40 bg-card p-4"
        >
          <h2 className="text-lg">New key — shown once</h2>
          <p className="text-xs text-muted-foreground">
            Copy this secret now. It is never stored or shown again; only its hash is kept.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-sm">
              {shownSecret.secret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(shownSecret.secret)}
            >
              <Copy size={14} /> Copy
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShownSecret(null)}>
            I have saved it — hide
          </Button>
        </section>
      )}

      <section aria-labelledby="create-key" className="space-y-4 rounded-lg border bg-card p-4">
        <h2 id="create-key" className="text-lg">
          Create a key
        </h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => createKey({ data: { name, scopes, days, confirm: true } }),
              "Key created. Save the secret shown above.",
            );
          }}
        >
          <label className="block text-sm">
            Name
            <input
              className="exchange-select mt-2 w-full"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laptop health check"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm">Scopes</legend>
            {OMNI_API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(e) =>
                    setScopes((prev) =>
                      e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope),
                    )
                  }
                />
                {OMNI_SCOPE_LABELS[scope]}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm">
            Expires after (days, 1–365)
            <input
              className="exchange-select mt-2 w-full"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I approve creating this key with exactly these scopes and expiry.
          </label>
          <Button type="submit" disabled={busy || !confirmed || !name.trim() || !scopes.length}>
            <Plus size={14} /> Create key
          </Button>
        </form>
      </section>

      <section aria-labelledby="key-list" className="space-y-4">
        <h2 id="key-list" className="text-lg">
          Your keys
        </h2>
        {keys === null ? (
          <p className="text-sm text-muted-foreground">Reading owner records…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="space-y-3">
            {keys.map((key) => {
              const state = omniKeyStatus(key);
              return (
                <li key={key.id} className="space-y-2 rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">{key.name}</span>
                    <code className="text-xs text-muted-foreground">{key.key_prefix}…</code>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {state}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scopes: {key.scopes.join(", ")} · Expires{" "}
                    {new Date(key.expires_at).toLocaleString()} · Last used{" "}
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}
                    {key.rotated_at &&
                      ` · Rotated ${new Date(key.rotated_at).toLocaleString()}`}
                  </p>
                  {state === "active" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => rotateKey({ data: { id: key.id, confirm: true } }),
                            "Key rotated. The old secret stopped working immediately; save the new one above.",
                          )
                        }
                      >
                        <RefreshCw size={14} /> Rotate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => revokeKey({ data: { id: key.id, confirm: true } }),
                            "Key revoked. It can no longer authenticate any endpoint.",
                          )
                        }
                      >
                        <Ban size={14} /> Revoke
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="key-audit" className="space-y-4">
        <h2 id="key-audit" className="text-lg">
          Audit log
        </h2>
        <p className="text-xs text-muted-foreground">
          Metadata record of key creation, rotation, revocation and jobs-endpoint use. This is an
          owner-visible activity log, not a trusted external audit.
        </p>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded key activity yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {audit.map((row) => (
              <li key={row.id}>
                {new Date(row.occurred_at).toLocaleString()} — {row.action} (
                {row.record_id.slice(0, 8)}…)
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </main>
  );
}
