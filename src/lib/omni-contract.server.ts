import { parseOmniBearer, sha256Hex, OMNI_API_SCOPES, type OmniApiScope } from "./omni-api-keys";
import {
  CONTRACT_SCOPE,
  OMNI_CONTRACT_VERSION,
  buildManifest,
  httpsOrigin,
  unsupportedBody,
  type UnsupportedCapability,
} from "./omni-contract";

const NO_STORE = { "Cache-Control": "no-store" };
type Verify = (hash: string, scope: OmniApiScope) => Promise<string | null>;

async function serviceVerify(hash: string, scope: OmniApiScope): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const r = await supabaseAdmin.rpc("omni_api_key_verify", { _key_hash: hash, _scope: scope });
  return r.error || !r.data ? null : String(r.data);
}

/** 401 without a usable key, 403 with a valid key that lacks the scope. */
async function authorize(request: Request, scope: OmniApiScope | null, verify: Verify) {
  const key = parseOmniBearer(request.headers.get("authorization"));
  if (!key)
    return Response.json(
      { ok: false, error: "A valid OMNI API key is required" },
      { status: 401, headers: NO_STORE },
    );
  const hash = await sha256Hex(key);
  if (scope && (await verify(hash, scope))) return null;
  for (const s of OMNI_API_SCOPES)
    if (s !== scope && (await verify(hash, s)))
      return scope
        ? Response.json(
            { ok: false, error: "scope_missing", needs: scope },
            { status: 403, headers: NO_STORE },
          )
        : "valid";
  return Response.json(
    { ok: false, error: "Credential rejected" },
    { status: 401, headers: NO_STORE },
  );
}

export async function omniContractRead(
  request: Request,
  what: "health" | "manifest",
  verify: Verify = serviceVerify,
) {
  const denied = await authorize(request, CONTRACT_SCOPE[what], verify);
  if (denied instanceof Response) return denied;
  const body =
    what === "health"
      ? { ok: true, version: OMNI_CONTRACT_VERSION, service: "omni-mothership" }
      : buildManifest(httpsOrigin(request.url));
  return Response.json(body, { headers: NO_STORE });
}

/** Any valid key gets an honest 403 naming what is missing; never a simulated result. */
export async function omniContractUnsupported(
  request: Request,
  capability: UnsupportedCapability,
  verify: Verify = serviceVerify,
) {
  const denied = await authorize(request, null, verify);
  if (denied instanceof Response) return denied;
  return Response.json(unsupportedBody(capability, httpsOrigin(request.url)), {
    status: 403,
    headers: NO_STORE,
  });
}
