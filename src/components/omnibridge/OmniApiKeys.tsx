import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  KeyRound,
  Copy,
  RefreshCw,
  Ban,
  Plus,
  ShieldCheck,
  TerminalSquare,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JackboyLinkPanel } from "./JackboyLinkPanel";
import { JackboyDispatchReview } from "./JackboyDispatchReview";
import { OmniNoopWorker } from "./OmniNoopWorker";
import { OwnerConnectionStatus } from "./OwnerConnectionStatus";
import {
  createOmniApiKey,
  listOmniApiKeyAudit,
  listOmniApiKeys,
  revokeOmniApiKey,
  rotateOmniApiKey,
} from "@/lib/omni-api-keys.functions";
import {
  OMNI_API_SCOPES,
  OMNI_EXPIRY_PRESETS,
  OMNI_KEY_MAX_AGE_DAYS,
  OMNI_SCOPE_CHOICES,
  omniExpiryFromChoice,
  omniKeyAuditLabel,
  omniKeyExpiryLabel,
  omniKeyStatus,
  type OmniApiKeyRow,
  type OmniApiScope,
  type OmniExpiryPresetId,
} from "@/lib/omni-api-keys";
import { keyCounts } from "@/lib/owner-dashboard";

interface AuditRow {
  id: string;
  action: string;
  record_id: string;
  occurred_at: string;
}

const KNOWN_FAILURE = /^API key could not be (created|rotated|revoked)/;

export function OmniApiKeys() {
  const listKeys = useServerFn(listOmniApiKeys);
  const listAudit = useServerFn(listOmniApiKeyAudit);
  const createKey = useServerFn(createOmniApiKey);
  const rotateKey = useServerFn(rotateOmniApiKey);
  const revokeKey = useServerFn(revokeOmniApiKey);

  const [keys, setKeys] = useState<OmniApiKeyRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("keys");

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<OmniApiScope[]>(["health"]);
  const [preset, setPreset] = useState<OmniExpiryPresetId>("30");
  const [customDays, setCustomDays] = useState(60);
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

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

  const expiry = omniExpiryFromChoice(preset, customDays);
  const problems = [
    !name.trim() && "add a name",
    !scopes.length && "choose at least one access",
    !expiry && `enter 1–${OMNI_KEY_MAX_AGE_DAYS} days`,
  ].filter(Boolean) as string[];
  const summary = useMemo(() => {
    if (!expiry) return "";
    const access = scopes.map((s) => OMNI_SCOPE_CHOICES[s].title.toLowerCase()).join(" and ");
    const until =
      expiry.kind === "never"
        ? "never expires — works until you revoke it"
        : `expires in ${expiry.days} day${expiry.days === 1 ? "" : "s"} (${new Date(
            Date.now() + expiry.days * 86_400_000,
          ).toLocaleDateString()})`;
    return `“${name.trim() || "Untitled"}” can ${access || "do nothing yet"} · ${until}.`;
  }, [expiry, scopes, name]);

  async function run(
    action: () => Promise<{ id: string; secret?: string }>,
    done: string,
    onSuccess?: () => void,
  ) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (result.secret) {
        setShownSecret({ id: result.id, secret: result.secret });
        setCopyNotice("");
      }
      onSuccess?.();
      setNotice({ text: done, error: false });
      try {
        await refresh();
      } catch {
        setNotice({
          text: `${done} The list could not be refreshed; do not repeat the change. Refresh owner records to confirm.`,
          error: true,
        });
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setNotice({
        text: KNOWN_FAILURE.test(message)
          ? `${message} Nothing was changed.`
          : "The request was not confirmed. Check owner access and refresh before retrying.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (access !== "ok") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <h1 className="text-2xl">Owner dashboard</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {access === "checking"
            ? "Checking owner access…"
            : "This workspace is private to the verified owner with strong MFA. Sign in through the owner flow to manage API keys; no keys are visible or usable here without that verified session."}
        </p>
        {access === "denied" && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/auth">Owner sign in</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAccess("checking");
                void refresh().then(
                  () => setAccess("ok"),
                  () => setAccess("denied"),
                );
              }}
            >
              Retry access check
            </Button>
          </div>
        )}
      </main>
    );
  }

  const now = Date.now();
  const counts = keyCounts(keys ?? [], now);
  const current = (keys ?? []).filter((k) => omniKeyStatus(k, now) === "active");
  const past = (keys ?? []).filter((k) => omniKeyStatus(k, now) !== "active");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl">
          <KeyRound size={22} aria-hidden /> Owner dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          API keys, live connection status and owner tools in one place. Nothing on this page
          switches anything on.
        </p>
      </header>

      <nav
        aria-label="Primary owner actions"
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      >
        <Button
          variant="default"
          onClick={() => {
            setTab("keys");
            requestAnimationFrame(() => nameRef.current?.focus());
          }}
        >
          <Plus size={14} aria-hidden /> New API key
        </Button>
        <Button asChild variant="outline">
          <Link to="/activation-approvals">
            <ShieldCheck size={14} aria-hidden /> Approvals
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/omni-terminal">
            <TerminalSquare size={14} aria-hidden /> Terminal
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/omni-dock">
            <Smartphone size={14} aria-hidden /> Devices
          </Link>
        </Button>
      </nav>

      <OwnerConnectionStatus />

      {shownSecret && (
        <section
          aria-live="polite"
          className="space-y-3 rounded-lg border border-primary/40 bg-card p-4"
        >
          <h2 className="text-lg">New key — shown once</h2>
          <p className="text-xs text-muted-foreground">
            Copy this secret now. It is never stored or shown again; only its hash is kept.
          </p>
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <code className="min-w-0 break-all rounded bg-background px-3 py-2 text-sm">
              {shownSecret.secret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setCopyNotice("");
                try {
                  await navigator.clipboard.writeText(shownSecret.secret);
                  setCopyNotice("Key copied. Save it securely before hiding it.");
                } catch {
                  setCopyNotice(
                    "Copy failed. Select and copy the visible key manually; it remains here until you hide it.",
                  );
                }
              }}
            >
              <Copy size={14} /> Copy
            </Button>
          </div>
          {copyNotice && (
            <p role="status" className="text-sm text-muted-foreground">
              {copyNotice}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShownSecret(null)}>
            I have saved it — hide
          </Button>
        </section>
      )}

      {notice && (
        <p
          aria-live="polite"
          className={
            notice.error
              ? "rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
              : "rounded-md border px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {notice.text}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          aria-label="Owner dashboard sections"
          className="h-auto w-full flex-wrap justify-start sm:w-auto"
        >
          <TabsTrigger value="keys">API keys</TabsTrigger>
          <TabsTrigger value="jackboy">Jackboy tools</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-6 space-y-6">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="API key summary">
            {(
              [
                ["Active", counts.active],
                ["Never expire", counts.neverExpires],
                ["Expired", counts.expired],
                ["Revoked", counts.revoked],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg">{keys === null ? "…" : value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="create-key" className="space-y-4 rounded-lg border bg-card p-4">
            <h2 id="create-key" className="text-lg">
              Create an API key
            </h2>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (problems.length || !expiry) return;
                void run(
                  () => createKey({ data: { name, scopes, expiry, confirm: true } }),
                  expiry.kind === "never"
                    ? "Key created with no expiry. Save the secret shown above; revoke it when no longer needed."
                    : "Key created. Save the secret shown above.",
                  () => setName(""),
                );
              }}
            >
              <label className="block text-sm">
                <span className="font-medium">1. Name</span>
                <input
                  ref={nameRef}
                  aria-label="Name"
                  className="exchange-select mt-2 w-full"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Laptop health check"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">2. What can it do?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OMNI_API_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary/60"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={scopes.includes(scope)}
                        onChange={(e) =>
                          setScopes((prev) =>
                            e.target.checked
                              ? [...new Set([...prev, scope])]
                              : prev.filter((s) => s !== scope),
                          )
                        }
                      />
                      <span>
                        <span className="block">{OMNI_SCOPE_CHOICES[scope].title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {OMNI_SCOPE_CHOICES[scope].help}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">3. Expires</span>
                  <select
                    aria-label="Expires"
                    className="exchange-select mt-2 w-full"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as OmniExpiryPresetId)}
                  >
                    {OMNI_EXPIRY_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {preset === "custom" && (
                  <label className="block text-sm">
                    <span className="font-medium">Number of days (1–{OMNI_KEY_MAX_AGE_DAYS})</span>
                    <input
                      className="exchange-select mt-2 w-full"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={OMNI_KEY_MAX_AGE_DAYS}
                      value={Number.isFinite(customDays) ? customDays : ""}
                      onChange={(e) => setCustomDays(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
              {preset === "never" && (
                <p className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-muted-foreground">
                  A never-expiring key keeps working until you revoke it. Store it safely and revoke
                  it here at once if it might have been exposed.
                </p>
              )}

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {problems.length ? `To create a key, ${problems.join(", ")}.` : summary}
                </p>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={busy || problems.length > 0}
                >
                  <Plus size={14} /> {busy ? "Creating…" : "Create key"}
                </Button>
              </div>
            </form>
          </section>

          <section aria-labelledby="key-list" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="key-list" className="text-lg">
                Your keys
              </h2>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setNotice({ text: "Reading owner records…", error: false });
                  void refresh()
                    .then(
                      () => setNotice({ text: "Owner records refreshed.", error: false }),
                      () =>
                        setNotice({
                          text: "Refresh failed. Check owner access; no key was changed.",
                          error: true,
                        }),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <RefreshCw size={14} />
                Refresh records
              </Button>
            </div>
            {keys === null ? (
              <p className="text-sm text-muted-foreground">Reading owner records…</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys yet.</p>
            ) : (
              <>
                {current.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active keys.</p>
                ) : (
                  <KeyList
                    keys={current}
                    now={now}
                    busy={busy}
                    onRotate={(id) =>
                      void run(
                        () => rotateKey({ data: { id, confirm: true } }),
                        "Key rotated. The old secret stopped working immediately; save the new one above.",
                      )
                    }
                    onRevoke={(id) =>
                      void run(
                        () => revokeKey({ data: { id, confirm: true } }),
                        "Key revoked. It can no longer authenticate any endpoint.",
                      )
                    }
                  />
                )}
                {past.length > 0 && (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm">
                      Expired and revoked keys ({past.length})
                    </summary>
                    <div className="mt-3">
                      <KeyList keys={past} now={now} busy={busy} />
                    </div>
                  </details>
                )}
              </>
            )}
          </section>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">Key activity log ({audit.length})</summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Metadata record of key creation, rotation, revocation and jobs-endpoint use. This is
              an owner-visible activity log, not a trusted external audit.
            </p>
            {audit.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No recorded key activity yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {audit.map((row) => (
                  <li key={row.id}>
                    {new Date(row.occurred_at).toLocaleString()} — {omniKeyAuditLabel(row.action)} (
                    {row.record_id.slice(0, 8)}…)
                  </li>
                ))}
              </ul>
            )}
          </details>
        </TabsContent>

        <TabsContent value="jackboy" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Manual Jackboy tools for the fixed protocol self-test, receive-only dispatch review and
            the no-op test worker. Each keeps its own approval and confirmation.
          </p>
          <JackboyLinkPanel />
          <JackboyDispatchReview />
          <OmniNoopWorker />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function KeyList({
  keys,
  now,
  busy,
  onRotate,
  onRevoke,
}: {
  keys: OmniApiKeyRow[];
  now: number;
  busy: boolean;
  onRotate?: (id: string) => void;
  onRevoke?: (id: string) => void;
}) {
  return (
    <ul className="space-y-3">
      {keys.map((key) => {
        const state = omniKeyStatus(key, now);
        return (
          <li key={key.id} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{key.name}</span>
              <code className="text-xs text-muted-foreground">{key.key_prefix}…</code>
              <span
                className={
                  state === "active"
                    ? "rounded-full border border-primary/50 px-2 text-xs text-primary"
                    : "rounded-full border px-2 text-xs text-muted-foreground"
                }
              >
                {state}
              </span>
              {state === "active" && key.never_expires === true && (
                <span className="rounded-full border border-destructive/40 px-2 text-xs text-muted-foreground">
                  no expiry
                </span>
              )}
            </div>
            <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="inline">Can: </dt>
                <dd className="inline">
                  {key.scopes
                    .map((s) =>
                      s in OMNI_SCOPE_CHOICES ? OMNI_SCOPE_CHOICES[s as OmniApiScope].title : s,
                    )
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Expiry</dt>
                <dd>{state === "revoked" ? "Revoked" : omniKeyExpiryLabel(key, now)}</dd>
              </div>
              <div>
                <dt className="inline">Last used: </dt>
                <dd className="inline">
                  {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}
                </dd>
              </div>
              <div>
                <dt className="inline">Created: </dt>
                <dd className="inline">
                  {new Date(key.created_at).toLocaleDateString()}
                  {key.rotated_at && ` · rotated ${new Date(key.rotated_at).toLocaleString()}`}
                </dd>
              </div>
            </dl>
            {state === "active" && onRotate && onRevoke && (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRotate(key.id)}
                >
                  <RefreshCw size={14} /> Rotate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRevoke(key.id)}
                >
                  <Ban size={14} /> Revoke
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
