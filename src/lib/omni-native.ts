/**
 * Browser authorization contract for the native OMNI CLI. This is separate
 * from the omni-web bearer delegation: exchange creates a signed Dock device.
 */
import { z } from "zod";
import {
  base64UrlDecode,
  base64UrlEncode,
  canonicalJwk,
  keyFingerprint,
  publicJwkSchema,
  sha256Hex,
  type DockPublicJwk,
} from "./omni-dock";

export const NATIVE_AUTH_PROTOCOL = "omni.native-auth/v1";
export const NATIVE_CLIENT = {
  id: "omni-native-cli",
  audience: "omni-mothership",
  authorizePath: "/omni-native-authorize",
  callbackPath: "/callback",
  callbackHost: "127.0.0.1",
} as const;
export const NATIVE_AUTH_CODE_SECONDS = 60;
export const NATIVE_PROOF_MAX_SKEW_MS = 5 * 60_000;
export const NATIVE_AUTH_CODE_PATTERN = /^omnicli_[0-9a-f]{64}$/;
export const NATIVE_AUTH_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
function isValidDeviceLabel(value: string | undefined): value is string {
  if (!value || !value.trim() || value.length > 60) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

export const NATIVE_DEVICE_PERMISSIONS = [
  "status.read",
  "jobs.propose",
  "stop.engage",
  "cloud.read",
  "audit.read",
  "jobs.pause",
] as const;
export type NativeDevicePermission = (typeof NATIVE_DEVICE_PERMISSIONS)[number];

export const nativeAuthorizeSearchSchema = z
  .object({
    response_type: z.string().max(20).optional(),
    client_id: z.string().max(100).optional(),
    redirect_uri: z.string().max(100).optional(),
    state: z.string().max(300).optional(),
    code_challenge: z.string().max(100).optional(),
    code_challenge_method: z.string().max(20).optional(),
    label: z.string().max(80).optional(),
    platform: z.string().max(20).optional(),
    public_key: z.string().max(500).optional(),
    timestamp: z.string().max(20).optional(),
    nonce: z.string().max(100).optional(),
    proof: z.string().max(120).optional(),
    rotation_device_id: z.string().uuid().optional(),
  })
  .strict();
export type NativeAuthorizeSearch = z.infer<typeof nativeAuthorizeSearchSchema>;

export type NativeAuthorizationRequest = {
  clientId: typeof NATIVE_CLIENT.id;
  audience: typeof NATIVE_CLIENT.audience;
  port: number;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  proofTimestamp: number;
  proofNonce: string;
  publicKey: DockPublicJwk;
  fingerprint: string;
  label: string;
  platform: "macos" | "linux" | "windows";
  rotationDeviceId: string | null;
};

export type NativeAuthorizationError =
  | "unknown_client"
  | "invalid_callback"
  | "invalid_state"
  | "invalid_pkce"
  | "invalid_device"
  | "proof_expired"
  | "bad_proof";

export type NativeAuthorizationParse =
  | { ok: true; request: NativeAuthorizationRequest }
  | { ok: false; error: NativeAuthorizationError };

function decodePublicKey(value: string): DockPublicJwk | null {
  const bytes = base64UrlDecode(value);
  if (!bytes) return null;
  try {
    const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const fields = Object.keys(json).sort().join(",");
    if (fields !== "crv,kty,x,y") return null;
    const parsed = publicJwkSchema.strict().safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeNativePublicKey(key: DockPublicJwk): string {
  return base64UrlEncode(new TextEncoder().encode(canonicalJwk(key)));
}

export function nativeAuthorizeSigningString(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  timestamp: string;
  nonce: string;
  publicKey: DockPublicJwk;
  label: string;
  platform: string;
  rotationDeviceId?: string | undefined;
}): string {
  return [
    "OMNI-NATIVE-AUTH-V1",
    "GET",
    NATIVE_CLIENT.authorizePath,
    p.clientId,
    p.redirectUri,
    p.state,
    p.codeChallenge,
    "S256",
    p.timestamp,
    p.nonce,
    canonicalJwk(p.publicKey),
    p.label,
    p.platform,
    p.rotationDeviceId ?? "-",
  ].join("\n");
}

async function verifyProof(publicKey: DockPublicJwk, message: string, signatureText: string) {
  const signature = base64UrlDecode(signatureText);
  if (!signature || signature.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { ...publicKey, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new Uint8Array(signature).buffer,
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

function parseLoopbackCallback(value: string): { port: number; uri: string } | null {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    if (
      url.protocol !== "http:" ||
      url.hostname !== NATIVE_CLIENT.callbackHost ||
      url.username ||
      url.password ||
      url.pathname !== NATIVE_CLIENT.callbackPath ||
      url.search ||
      url.hash ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      url.href !== `http://${NATIVE_CLIENT.callbackHost}:${port}${NATIVE_CLIENT.callbackPath}`
    )
      return null;
    return { port, uri: url.href };
  } catch {
    return null;
  }
}

export async function parseNativeAuthorizationRequest(
  input: NativeAuthorizeSearch,
  now = Date.now(),
): Promise<NativeAuthorizationParse> {
  if (input.client_id !== NATIVE_CLIENT.id || input.response_type !== "code")
    return { ok: false, error: "unknown_client" };
  const callback = parseLoopbackCallback(input.redirect_uri ?? "");
  if (!callback) return { ok: false, error: "invalid_callback" };
  if (!STATE_PATTERN.test(input.state ?? "")) return { ok: false, error: "invalid_state" };
  if (
    input.code_challenge_method !== "S256" ||
    !CODE_CHALLENGE_PATTERN.test(input.code_challenge ?? "")
  )
    return { ok: false, error: "invalid_pkce" };
  const publicKey = decodePublicKey(input.public_key ?? "");
  const platform = input.platform;
  if (
    !publicKey ||
    !isValidDeviceLabel(input.label) ||
    !["macos", "linux", "windows"].includes(platform ?? "") ||
    !/^\d{13}$/.test(input.timestamp ?? "") ||
    !NONCE_PATTERN.test(input.nonce ?? "") ||
    !SIGNATURE_PATTERN.test(input.proof ?? "")
  )
    return { ok: false, error: "invalid_device" };
  const proofTimestamp = Number(input.timestamp);
  if (
    !Number.isSafeInteger(proofTimestamp) ||
    Math.abs(now - proofTimestamp) > NATIVE_PROOF_MAX_SKEW_MS
  )
    return { ok: false, error: "proof_expired" };
  const signed = nativeAuthorizeSigningString({
    clientId: NATIVE_CLIENT.id,
    redirectUri: callback.uri,
    state: input.state!,
    codeChallenge: input.code_challenge!,
    timestamp: input.timestamp!,
    nonce: input.nonce!,
    publicKey,
    label: input.label!,
    platform: platform!,
    rotationDeviceId: input.rotation_device_id,
  });
  if (!(await verifyProof(publicKey, signed, input.proof!)))
    return { ok: false, error: "bad_proof" };
  return {
    ok: true,
    request: {
      clientId: NATIVE_CLIENT.id,
      audience: NATIVE_CLIENT.audience,
      port: callback.port,
      redirectUri: callback.uri,
      state: input.state!,
      codeChallenge: input.code_challenge!,
      proofTimestamp,
      proofNonce: input.nonce!,
      publicKey,
      fingerprint: await keyFingerprint(publicKey),
      label: input.label!,
      platform: platform as NativeAuthorizationRequest["platform"],
      rotationDeviceId: input.rotation_device_id ?? null,
    },
  };
}

export async function nativeCodeChallenge(verifier: string): Promise<string | null> {
  if (!NATIVE_AUTH_CODE_VERIFIER_PATTERN.test(verifier)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function nativeProofNonceHash(nonce: string): Promise<string> {
  return sha256Hex(`${NATIVE_AUTH_PROTOCOL}:nonce:${nonce}`);
}

export function nativeCallbackUrl(
  redirectUri: string,
  state: string,
  result: { code: string } | { error: "access_denied" },
): string {
  const callback = parseLoopbackCallback(redirectUri);
  if (!callback || !STATE_PATTERN.test(state)) throw new Error("Invalid native callback.");
  const url = new URL(callback.uri);
  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);
  url.searchParams.set("state", state);
  return url.toString();
}

export const nativeTokenBodySchema = z
  .object({
    grant_type: z.literal("authorization_code"),
    client_id: z.literal(NATIVE_CLIENT.id),
    redirect_uri: z.string().max(100),
    code: z.string().max(100),
    code_verifier: z.string().max(128),
  })
  .strict();

const PENDING_AUTHORIZE_KEY = "omni.native-authorize";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function savePendingNativeAuthorize(storage: StorageLike, request: NativeAuthorizeSearch) {
  storage.setItem(PENDING_AUTHORIZE_KEY, JSON.stringify(request));
}

export function readPendingNativeAuthorize(storage: StorageLike): NativeAuthorizeSearch | null {
  const text = storage.getItem(PENDING_AUTHORIZE_KEY);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const result = nativeAuthorizeSearchSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function clearPendingNativeAuthorize(storage: StorageLike) {
  storage.removeItem(PENDING_AUTHORIZE_KEY);
}

export function nativeCallbackPort(redirectUri: string): number | null {
  return parseLoopbackCallback(redirectUri)?.port ?? null;
}
