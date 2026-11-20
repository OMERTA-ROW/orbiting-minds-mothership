import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import { useAccount } from "@/hooks/use-account";
import { seo } from "@/lib/seo";
import { rememberSignInReturn } from "@/lib/owner-mfa";
import {
  DELEGATION_CLIENT,
  DELEGATION_SCOPE_INFO,
  DELEGATION_TOKEN_SECONDS,
  authorizeParamsSchema,
  callbackUrl,
  parseAuthorizeRequest,
  savePendingAuthorize,
  readPendingAuthorize,
  clearPendingAuthorize,
  type AuthorizeParams,
  type SupportedDelegationScope,
} from "@/lib/omni-delegation";
import {
  approveOmniAuthorization,
  describeOmniAuthorization,
} from "@/lib/omni-delegation.functions";

export const Route = createFileRoute("/omni-authorize")({
  validateSearch: (search: Record<string, unknown>): AuthorizeParams => {
    const pick = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const parsed = authorizeParamsSchema.safeParse({
      response_type: pick("response_type"),
      client_id: pick("client_id"),
      redirect_uri: pick("redirect_uri"),
      scope: pick("scope"),
      state: pick("state"),
      code_challenge: pick("code_challenge"),
      code_challenge_method: pick("code_challenge_method"),
    });
    return parsed.success ? parsed.data : {};
  },
  head: () =>
    seo(
      "Approve OMNI connection",
      "Owner-only approval for a short-lived OMNI web connection to the Mothership: chosen permissions, 15-minute limit, cancel any time.",
    ),
  component: OmniAuthorizePage,
});

type Described =
  { valid: false; error: string } | { valid: true; owner: boolean; mfaBlocker: string | null };

function OmniAuthorizePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, ready } = useAccount();
  const describe = useServerFn(describeOmniAuthorization);
  const approve = useServerFn(approveOmniAuthorization);
  const [params, setParams] = useState<AuthorizeParams | null>(null);
  const [described, setDescribed] = useState<Described | null>(null);
  const [chosen, setChosen] = useState<SupportedDelegationScope[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // The URL wins; after sign-in (which drops the URL) the saved request is restored once.
  useEffect(() => {
    if (search.client_id) {
      clearPendingAuthorize(window.sessionStorage);
      setParams(search);
    } else setParams(readPendingAuthorize(window.sessionStorage) ?? {});
  }, [search]);

  const parsed = params ? parseAuthorizeRequest(params) : null;

  const load = useCallback(async () => {
    if (!params || !parsed?.ok || !user) return;
    try {
      setDescribed((await describe({ data: params })) as Described);
    } catch {
      setDescribed({ valid: false, error: "Owner access could not be checked. Refresh to retry." });
    }
  }, [describe, params, parsed?.ok, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const deny = () => {
    if (!parsed?.ok) return;
    clearPendingAuthorize(window.sessionStorage);
    window.location.assign(callbackUrl({ error: "access_denied" }, parsed.state));
  };

  const submit = async () => {
    if (!params || busy || chosen.length === 0) return;
    setBusy(true);
    setMessage({ ok: true, text: "Recording your approval…" });
    try {
      const r = await approve({ data: { request: params, scopes: chosen, confirm: true } });
      if (!r.ok) {
        setMessage({ ok: false, text: r.message });
        return;
      }
      clearPendingAuthorize(window.sessionStorage);
      setMessage({ ok: true, text: "Approved. Returning to OMNI…" });
      window.location.assign(r.redirectTo);
    } catch {
      setMessage({
        ok: false,
        text: "The approval was not confirmed. Nothing was shared; try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (!params || !ready)
    body = <p className="text-sm text-muted-foreground">Checking the request…</p>;
  else if (!parsed?.ok)
    body = (
      <p role="alert" className="text-sm text-destructive">
        {parsed?.error ?? "This request isn't valid."} Nothing was shared. Start again from OMNI.
      </p>
    );
  else if (!user)
    body = (
      <div className="space-y-3">
        <p className="text-sm">Sign in as the Mothership owner to review this request.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="cosmic"
            onClick={() => {
              savePendingAuthorize(window.sessionStorage, params);
              rememberSignInReturn("/omni-authorize");
              void navigate({ to: "/auth" });
            }}
          >
            Sign in
          </Button>
          <Button variant="ghost" onClick={deny}>
            Don't allow
          </Button>
        </div>
      </div>
    );
  else if (!described)
    body = <p className="text-sm text-muted-foreground">Checking owner access…</p>;
  else if (!described.valid)
    body = (
      <p role="alert" className="text-sm text-destructive">
        {described.error}
      </p>
    );
  else if (!described.owner && described.needsSecondStep)
    body = (
      <div className="space-y-3">
        <OwnerCodeForm
          intro="Enter your authenticator code to continue as the Mothership owner."
          onVerified={load}
          successText="Verified."
        />
        <Button variant="ghost" onClick={deny}>
          Don't allow
        </Button>
      </div>
    );
  else if (!described.owner)
    body = (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          Only the verified Mothership owner, signed in with two-step sign-in, can approve OMNI.
        </p>
        <Button variant="ghost" onClick={deny}>
          Don't allow
        </Button>
      </div>
    );
  else
    body = (
      <div className="space-y-5">
        <ul className="space-y-3">
          {parsed.requested.map((scope) => {
            const info = DELEGATION_SCOPE_INFO[scope];
            const id = `scope-${scope.replace(/[^a-z]/g, "-")}`;
            return (
              <li key={scope} className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id={id}
                  disabled={!info.supported || busy}
                  checked={info.supported && chosen.includes(scope as SupportedDelegationScope)}
                  onCheckedChange={(v) =>
                    setChosen((c) =>
                      v === true
                        ? [...c, scope as SupportedDelegationScope]
                        : c.filter((s) => s !== scope),
                    )
                  }
                />
                <label htmlFor={id} className="space-y-1 text-sm">
                  <span className="font-medium">{info.title}</span>{" "}
                  <span className="text-xs text-muted-foreground">({scope})</span>
                  <span className="block text-muted-foreground">{info.effect}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Lasts {DELEGATION_TOKEN_SECONDS / 60} minutes at most. You can cancel it any time in the
          Owner dashboard. It never approves tasks, spends money, turns on autonomy or releases the
          Emergency Stop.
        </p>
        {described.mfaBlocker ? (
          <OwnerCodeForm
            intro="Enter your authenticator code to approve (needed within the last 15 minutes)."
            onVerified={load}
            successText="Verified."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="cosmic"
              disabled={busy || chosen.length === 0}
              onClick={() => void submit()}
            >
              {busy ? "Approving…" : `Allow ${chosen.length || ""} selected`.trim()}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={deny}>
              Don't allow
            </Button>
          </div>
        )}
        {parsed.supported.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None of the requested permissions are available yet, so there is nothing to approve.
          </p>
        )}
      </div>
    );

  return (
    <div className="mx-auto max-w-xl space-y-6 px-5 py-12 sm:px-6 sm:py-16">
      <header className="space-y-2">
        <p className="eyebrow">Mothership / owner approval</p>
        <h1 className="flex items-center gap-2 text-2xl">
          <ShieldCheck size={22} aria-hidden /> Connect {DELEGATION_CLIENT.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {DELEGATION_CLIENT.origin} is asking for permission to act for you. Choose exactly what it
          may do.
        </p>
      </header>
      {body}
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
