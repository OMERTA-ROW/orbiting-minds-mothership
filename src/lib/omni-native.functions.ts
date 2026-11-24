/** Owner-approved OAuth-PKCE enrollment for a native OMNI CLI device. */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stepUpBlocker } from "./owner-mfa";
import { staged } from "./staged-rpc";
import { sha256Hex } from "./omni-api-keys";
import { safetyCode } from "./omni-dock";
import {
  NATIVE_AUTH_CODE_SECONDS,
  NATIVE_CLIENT,
  NATIVE_DEVICE_PERMISSIONS,
  nativeAuthorizeSearchSchema,
  nativeCallbackUrl,
  nativeProofNonceHash,
  parseNativeAuthorizationRequest,
  type NativeAuthorizeSearch,
  type NativeDevicePermission,
} from "./omni-native";

type Ctx = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};

const grantable = [...NATIVE_DEVICE_PERMISSIONS];

export type NativeAuthorizationReadiness = "ready" | "not_installed" | "unavailable";

export async function nativeAuthorizationReadiness(
  client: Parameters<typeof staged>[0],
): Promise<NativeAuthorizationReadiness> {
  try {
    const result = await staged(client).rpc("omni_native_authorization_ready");
    if (!result.error) return result.data === true ? "ready" : "not_installed";
    return isMissingReadinessFunction(result.error) ? "not_installed" : "unavailable";
  } catch {
    return "unavailable";
  }
}

function isMissingReadinessFunction(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "PGRST202" || error.code === "42883";
}

function failureMessage(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (/Fresh two-factor/i.test(message))
    return "Enter a fresh authenticator code first, then approve.";
  if (/Too many native sign-in/i.test(message))
    return "Too many native sign-in approvals. Wait 10 minutes, then try again.";
  if (/key.*already registered/i.test(message))
    return "This device key is already registered. Revoke its existing device or generate a new key.";
  if (/rotation|device is not available/i.test(message))
    return "That native device cannot be rotated. Refresh the Docking Bay and try again.";
  if (/permissions/i.test(message)) return "Choose only the device permissions shown on this page.";
  return "The native authorization was not recorded. Nothing was shared; refresh and try again.";
}

async function owner(context: Ctx) {
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

const requestSchema = z
  .object({
    request: nativeAuthorizeSearchSchema,
  })
  .strict();

export const describeNativeAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const parsed = await parseNativeAuthorizationRequest(data.request);
    if (!parsed.ok) return { valid: false as const, error: authorizationError(parsed.error) };
    const readiness = await nativeAuthorizationReadiness(context.supabase);
    if (readiness === "unavailable")
      return {
        valid: false as const,
        error: "Native sign-in status could not be checked. Try again shortly.",
      };
    const role = await context.supabase.rpc("is_razul_owner");
    const isOwner = !role.error && role.data === true;
    return {
      valid: true as const,
      installed: readiness === "ready",
      readiness,
      owner: isOwner,
      needsSecondStep: !isOwner && context.claims["aal"] !== "aal2",
      mfaBlocker: isOwner
        ? stepUpBlocker(context.claims["aal"], context.claims["amr"], Math.floor(Date.now() / 1000))
        : null,
      clientName: "OMNI CLI",
      fingerprint: parsed.request.fingerprint,
      safetyCode: safetyCode(parsed.request.fingerprint),
      label: parsed.request.label,
      platform: parsed.request.platform,
      rotation: parsed.request.rotationDeviceId !== null,
      rotationDeviceId: parsed.request.rotationDeviceId,
      grantable,
      codeLifetimeSeconds: NATIVE_AUTH_CODE_SECONDS,
      permissions: parsed.request.rotationDeviceId ? [] : grantable,
      notice:
        "The Mothership verifies the P-256 key proof, but cannot verify whether macOS Keychain or Secure Enclave hardware protects that key.",
    };
  });

const approveSchema = z
  .object({
    request: nativeAuthorizeSearchSchema,
    permissions: z.array(z.enum(NATIVE_DEVICE_PERMISSIONS)).max(NATIVE_DEVICE_PERMISSIONS.length),
    confirm: z.literal(true),
  })
  .strict();

export const approveNativeAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveSchema.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await owner(context);
    const parsed = await parseNativeAuthorizationRequest(data.request);
    if (!parsed.ok) return { ok: false as const, message: authorizationError(parsed.error) };
    const readiness = await nativeAuthorizationReadiness(context.supabase);
    if (readiness !== "ready")
      return {
        ok: false as const,
        message:
          readiness === "not_installed"
            ? "Native sign-in is unavailable because its database migration is not installed."
            : "Native sign-in readiness could not be checked. Nothing was shared; try again shortly.",
      };
    const rotation = parsed.request.rotationDeviceId !== null;
    if (
      (rotation && data.permissions.length !== 0) ||
      (!rotation && data.permissions.length === 0) ||
      new Set(data.permissions).size !== data.permissions.length
    )
      return { ok: false as const, message: "Choose at least one unique permission to continue." };
    const blocker = stepUpBlocker(
      context.claims["aal"],
      context.claims["amr"],
      Math.floor(Date.now() / 1000),
    );
    if (blocker) return { ok: false as const, message: blocker };

    const code = generateNativeCode();
    const result = await staged(context.supabase).rpc("omni_native_authorize", {
      _client_id: NATIVE_CLIENT.id,
      _audience: NATIVE_CLIENT.audience,
      _port: parsed.request.port,
      _code_hash: await sha256Hex(code),
      _code_challenge: parsed.request.codeChallenge,
      _proof_nonce_hash: await nativeProofNonceHash(parsed.request.proofNonce),
      _proof_timestamp_ms: parsed.request.proofTimestamp,
      _public_key: parsed.request.publicKey,
      _fingerprint: parsed.request.fingerprint,
      _label: parsed.request.label,
      _platform: parsed.request.platform,
      _permissions: data.permissions as NativeDevicePermission[],
      _rotation_device: parsed.request.rotationDeviceId,
    });
    if (result.error) return { ok: false as const, message: failureMessage(result.error) };
    return {
      ok: true as const,
      redirectTo: nativeCallbackUrl(parsed.request.redirectUri, parsed.request.state, { code }),
      expiresIn: NATIVE_AUTH_CODE_SECONDS,
    };
  });

function authorizationError(error: string) {
  switch (error) {
    case "unknown_client":
      return "Unknown native app. Nothing was shared.";
    case "invalid_callback":
      return "The return address must be the exact loopback callback on 127.0.0.1.";
    case "invalid_state":
      return "The request is missing a valid one-time state value.";
    case "invalid_pkce":
      return "The request is missing its PKCE S256 proof.";
    case "proof_expired":
      return "This device request expired. Start sign-in again from the CLI.";
    case "bad_proof":
      return "The device-key proof did not match. Nothing was shared.";
    default:
      return "The native device request is malformed. Nothing was shared.";
  }
}

function generateNativeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `omnicli_${hex}`;
}

export type NativePermissionForConsent = NativeDevicePermission;
export type NativeSearchForConsent = NativeAuthorizeSearch;
