/** Native CLI OAuth-PKCE code exchange. No bearer token is issued or returned. */
import { sha256Hex } from "./omni-api-keys";
import {
  NATIVE_AUTH_CODE_PATTERN,
  NATIVE_CLIENT,
  nativeCallbackPort,
  nativeCodeChallenge,
  nativeTokenBodySchema,
} from "./omni-native";

export type NativeRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

const serviceRpc: NativeRpc = async (fn, args) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.rpc as unknown as NativeRpc)(fn, args);
};

const refusals: Record<string, { status: number; message: string }> = {
  unknown_code: { status: 400, message: "Authorization code not recognized." },
  code_already_used: { status: 400, message: "Authorization code already used. Start again." },
  code_expired: { status: 400, message: "Authorization code expired. Start again." },
  client_mismatch: { status: 400, message: "Native client or loopback callback did not match." },
  pkce_mismatch: { status: 400, message: "PKCE verification failed. Start sign-in again." },
  owner_unverified: { status: 401, message: "Owner access changed. Sign in again." },
  key_in_use: { status: 409, message: "Device key is already registered." },
  rotation_stale: { status: 409, message: "Device changed before key rotation completed." },
  invalid_request: { status: 400, message: "Native token request is invalid." },
};

export type NativeAuthorizationReadiness = "ready" | "not_installed" | "unavailable";

function isMissingReadinessFunction(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "PGRST202" || error.code === "42883";
}

export async function nativeAuthorizationReadiness(
  rpc: NativeRpc = serviceRpc,
): Promise<NativeAuthorizationReadiness> {
  try {
    const result = await rpc("omni_native_authorization_ready", {});
    if (!result.error) return result.data === true ? "ready" : "not_installed";
    return isMissingReadinessFunction(result.error) ? "not_installed" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * POST /api/public/omni/native/token. Native clients exchange an owner-approved,
 * one-use PKCE code for a device ID; every later request uses its P-256 key.
 */
export async function exchangeNativeAuthorizationCode(
  request: Request,
  rpc: NativeRpc = serviceRpc,
) {
  if (request.headers.has("origin"))
    return json(
      { ok: false, error: "native_client_only", message: "Browser token requests are refused." },
      403,
    );
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return json({ ok: false, error: "invalid_request" }, 415);

  const text = await readBody(request);
  if (text === null) return json({ ok: false, error: "invalid_request" }, 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  const body = nativeTokenBodySchema.safeParse(input);
  if (!body.success || !NATIVE_AUTH_CODE_PATTERN.test(body.data?.code ?? ""))
    return json({ ok: false, error: "invalid_request" }, 400);
  const port = nativeCallbackPort(body.data.redirect_uri);
  const challenge = await nativeCodeChallenge(body.data.code_verifier);
  if (port === null || challenge === null)
    return json({ ok: false, error: "invalid_request" }, 400);
  const readiness = await nativeAuthorizationReadiness(rpc);
  if (readiness === "not_installed")
    return json(
      {
        ok: false,
        error: "not_installed",
        message:
          "Native authorization is unavailable because its database migration is not installed.",
      },
      503,
    );
  if (readiness === "unavailable")
    return json(
      {
        ok: false,
        error: "temporarily_unavailable",
        message: "Native authorization readiness could not be checked. Retry shortly.",
      },
      503,
    );

  let result: { data: unknown; error: unknown };
  try {
    result = await rpc("omni_native_exchange", {
      _code_hash: await sha256Hex(body.data.code),
      _code_challenge: challenge,
      _client_id: NATIVE_CLIENT.id,
      _audience: NATIVE_CLIENT.audience,
      _port: port,
    });
  } catch {
    result = { data: null, error: true };
  }
  if (result.error || !result.data || typeof result.data !== "object")
    return json({ ok: false, error: "temporarily_unavailable" }, 503);
  const record = result.data as Record<string, unknown>;
  if (record["ok"] !== true) {
    const reason = typeof record["reason"] === "string" ? record["reason"] : "";
    const refusal = refusals[reason];
    return json(
      {
        ok: false,
        error: refusal ? reason : "refused",
        message: refusal?.message ?? "Native device enrollment was refused.",
      },
      refusal?.status ?? 403,
    );
  }
  if (
    typeof record["device_id"] !== "string" ||
    record["status"] !== "paired" ||
    !Array.isArray(record["permissions"]) ||
    typeof record["key_fingerprint"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(record["key_fingerprint"])
  )
    return json({ ok: false, error: "temporarily_unavailable" }, 503);

  return json({
    ok: true,
    protocol: "omni.native-auth/v1",
    credentialType: "device-signature",
    bearerTokenIssued: false,
    deviceId: record["device_id"],
    status: record["status"],
    permissions: record["permissions"],
    keyFingerprint: record["key_fingerprint"],
    revision: record["revision"],
  });
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > 16_384) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return text + decoder.decode();
}
