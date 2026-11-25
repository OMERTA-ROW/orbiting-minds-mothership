import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OwnerCodeForm } from "@/components/account/OwnerCodeForm";
import { useAccount } from "@/hooks/use-account";
import { rememberSignInReturn } from "@/lib/owner-mfa";
import { PERMISSION_INFO } from "@/lib/omni-dock";
import {
  clearPendingNativeAuthorize,
  nativeAuthorizeSearchSchema,
  nativeCallbackUrl,
  parseNativeAuthorizationRequest,
  readPendingNativeAuthorize,
  savePendingNativeAuthorize,
  type NativeAuthorizeSearch,
  type NativeDevicePermission,
} from "@/lib/omni-native";
import {
  approveNativeAuthorization,
  describeNativeAuthorization,
} from "@/lib/omni-native.functions";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/omni-native-authorize")({
  validateSearch: (search: Record<string, unknown>): NativeAuthorizeSearch => {
    const pick = (key: string) =>
      typeof search[key] === "string" ? (search[key] as string) : undefined;
    const parsed = nativeAuthorizeSearchSchema.safeParse({
      response_type: pick("response_type"),
      client_id: pick("client_id"),
      redirect_uri: pick("redirect_uri"),
      state: pick("state"),
      code_challenge: pick("code_challenge"),
      code_challenge_method: pick("code_challenge_method"),
      label: pick("label"),
      platform: pick("platform"),
      public_key: pick("public_key"),
      timestamp: pick("timestamp"),
      nonce: pick("nonce"),
      proof: pick("proof"),
      rotation_device_id: pick("rotation_device_id"),
    });
    return parsed.success ? parsed.data : {};
  },
  head: () =>
    seo(
      "Approve native OMNI sign-in",
      "Owner-only browser sign-in and device-key authorization for the native OMNI CLI.",
    ),
  component: NativeAuthorizePage,
});

type Description =
  | { valid: false; error: string }
  | {
      valid: true;
      installed: boolean;
      readiness: "ready" | "not_installed" | "unavailable";
      owner: boolean;
      needsSecondStep: boolean;
      mfaBlocker: string | null;
      clientName: string;
      fingerprint: string;
      safetyCode: string;
      label: string;
      platform: string;
      rotation: boolean;
      rotationDeviceId: string | null;
      grantable: NativeDevicePermission[];
      permissions: NativeDevicePermission[];
      chatPermissionAvailable: boolean;
      codeLifetimeSeconds: number;
      notice: string;
    };

function NativeAuthorizePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, ready } = useAccount();
  const describe = useServerFn(describeNativeAuthorization);
  const approve = useServerFn(approveNativeAuthorization);
  const [params, setParams] = useState<NativeAuthorizeSearch | null>(null);
  const [description, setDescription] = useState<Description | null>(null);
  const [proofValid, setProofValid] = useState(false);
  const [chosen, setChosen] = useState<NativeDevicePermission[]>([]);
  const [fingerprintConfirmed, setFingerprintConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (search.client_id) {
      clearPendingNativeAuthorize(window.sessionStorage);
      setParams(search);
    } else setParams(readPendingNativeAuthorize(window.sessionStorage));
  }, [search]);

  const load = useCallback(async () => {
    if (!params || !user) return;
    try {
      const request = await parseNativeAuthorizationRequest(params);
      if (!request.ok) {
        setProofValid(false);
        setDescription({ valid: false, error: authorizationError(request.error) });
        return;
      }
      setProofValid(true);
      setDescription((await describe({ data: { request: params } })) as Description);
    } catch {
      setDescription({
        valid: false,
        error: "Owner access could not be checked. Refresh to retry.",
      });
    }
  }, [describe, params, user]);

  useEffect(() => {
    if (params && user) void load();
  }, [load, params, user]);

  const deny = async () => {
    if (!params) return;
    const request = await parseNativeAuthorizationRequest(params);
    if (!request.ok) return;
    clearPendingNativeAuthorize(window.sessionStorage);
    window.location.assign(
      nativeCallbackUrl(request.request.redirectUri, request.request.state, {
        error: "access_denied",
      }),
    );
  };

  const submit = async () => {
    if (!params || !description?.valid || !proofValid || busy || !fingerprintConfirmed) return;
    if (!description.rotation && chosen.length === 0) return;
    setBusy(true);
    setMessage({ ok: true, text: "Recording your approval…" });
    try {
      const result = await approve({
        data: { request: params, permissions: chosen, confirm: true },
      });
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      clearPendingNativeAuthorize(window.sessionStorage);
      setMessage({ ok: true, text: "Approved. Returning to the native CLI…" });
      window.location.assign(result.redirectTo);
    } catch {
      setMessage({
        ok: false,
        text: "The approval was not confirmed. Nothing was shared; refresh and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (!ready) body = <p className="text-sm text-muted-foreground">Checking the request…</p>;
  else if (!params)
    body = (
      <p role="alert" className="text-sm text-destructive">
        No native sign-in request is pending. Start sign-in again from the OMNI CLI.
      </p>
    );
  else if (!user)
    body = (
      <div className="space-y-3">
        <p className="text-sm">Sign in as the verified Mothership owner to review this request.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              savePendingNativeAuthorize(window.sessionStorage, params);
              rememberSignInReturn("/omni-native-authorize");
              void navigate({ to: "/auth" });
            }}
          >
            Sign in
          </Button>
          <Button variant="ghost" onClick={() => void deny()}>
            Don’t allow
          </Button>
        </div>
      </div>
    );
  else if (!description)
    body = <p className="text-sm text-muted-foreground">Checking owner access and device proof…</p>;
  else if (!description.valid || !proofValid)
    body = (
      <p role="alert" className="text-sm text-destructive">
        {description.valid ? "The device-key proof could not be checked." : description.error}
        {" Nothing was shared."}
      </p>
    );
  else if (!description.installed)
    body = (
      <p role="alert" className="text-sm text-destructive">
        {description.readiness === "not_installed"
          ? "Native sign-in is unavailable because its database migration is not installed."
          : "Native sign-in status could not be checked. Try again shortly."}{" "}
        Nothing was shared.
      </p>
    );
  else if (!description.owner)
    body = (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          Only the verified Mothership owner can authorize a native OMNI device.
        </p>
        <Button variant="ghost" onClick={() => void deny()}>
          Don’t allow
        </Button>
      </div>
    );
  else if (description.mfaBlocker)
    body = (
      <div className="space-y-3">
        <OwnerCodeForm
          intro="Enter your authenticator code. Native sign-in requires a fresh owner MFA check."
          onVerified={load}
          successText="Verified. Review the device and permissions below."
        />
        <Button variant="ghost" onClick={() => void deny()}>
          Don’t allow
        </Button>
      </div>
    );
  else
    body = (
      <div className="space-y-5">
        <div className="rounded-lg border p-4 text-sm">
          <p>
            <strong>{description.clientName}</strong> requests owner authorization for{" "}
            <strong>{description.label}</strong> ({description.platform}).
          </p>
          <p className="mt-3 break-all font-mono text-xs">{description.fingerprint}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Safety code: {description.safetyCode}. Compare the fingerprint with the CLI before
            approving.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">{description.notice}</p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={fingerprintConfirmed}
            disabled={busy}
            onCheckedChange={(checked) => setFingerprintConfirmed(checked === true)}
          />
          I compared this device fingerprint with the one displayed by the CLI.
        </label>
        {description.rotation ? (
          <p className="rounded-lg border p-3 text-sm">
            This replaces the key for device {description.rotationDeviceId}. Its existing
            permissions are preserved. The old key stops working immediately after exchange.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Choose the device permissions:</p>
            <ul className="space-y-3">
              {description.grantable.map((permission) => {
                const info = PERMISSION_INFO[permission];
                const checked = chosen.includes(permission);
                return (
                  <li key={permission} className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      onCheckedChange={(value) =>
                        setChosen((current) =>
                          value === true
                            ? [...current, permission]
                            : current.filter((entry) => entry !== permission),
                        )
                      }
                    />
                    <span className="space-y-1 text-sm">
                      <strong>{info.label}</strong> <span className="text-xs">({permission})</span>
                      <span className="block text-muted-foreground">{info.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The authorization code expires in {description.codeLifetimeSeconds} seconds and is
          single-use. The CLI receives no bearer token. You can revoke this device from Docking Bay.
          {description.chatPermissionAvailable
            ? " Chat uses text-only Claude replies and never stores your transcript. Task execution remains unavailable."
            : " Native chat and task execution are not available."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void submit()}
            disabled={
              busy || !fingerprintConfirmed || (!description.rotation && chosen.length === 0)
            }
          >
            {busy ? "Approving…" : "Approve native sign-in"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void deny()}>
            Don’t allow
          </Button>
        </div>
      </div>
    );

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-5 py-12 sm:px-6 sm:py-16">
      <header className="space-y-2">
        <p className="eyebrow">Mothership / owner approval</p>
        <h1 className="text-3xl font-semibold text-foreground">Approve native sign-in</h1>
        <p className="text-sm text-muted-foreground">
          This browser flow authorizes one P-256 device key. It is separate from OMNI web
          delegations and does not issue a reusable bearer token.
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
    </main>
  );
}

function authorizationError(error: string) {
  switch (error) {
    case "unknown_client":
      return "Unknown native app.";
    case "invalid_callback":
      return "The return address must be the exact loopback callback on 127.0.0.1.";
    case "invalid_state":
      return "The request is missing a valid one-time state value.";
    case "invalid_pkce":
      return "The request is missing its PKCE S256 proof.";
    case "proof_expired":
      return "This device request expired. Start sign-in again from the CLI.";
    case "bad_proof":
      return "The device-key proof did not match.";
    default:
      return "The native device request is malformed.";
  }
}
