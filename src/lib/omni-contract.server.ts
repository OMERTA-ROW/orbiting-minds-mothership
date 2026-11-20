import { parseOmniBearer, sha256Hex, OMNI_API_SCOPES, type OmniApiScope } from "./omni-api-keys";
import {
  CONTRACT_SCOPE,
  runsToTasks,
  type ObservatoryRun,
  OMNI_CONTRACT_VERSION,
  buildManifest,
  httpsOrigin,
  unsupportedBody,
  type ManifestLive,
  type UnsupportedCapability,
} from "./omni-contract";
import type { SpendEvidenceRead } from "./omni-spend-evidence";

const NO_STORE = { "Cache-Control": "no-store" };
type Verification =
  { status: "valid"; keyId: string } | { status: "invalid" } | { status: "unavailable" };
type Verify = (hash: string, scope: OmniApiScope) => Promise<Verification>;

async function serviceVerify(hash: string, scope: OmniApiScope): Promise<Verification> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.rpc("omni_api_key_verify", { _key_hash: hash, _scope: scope });
    if (r.error) {
      console.error("OMNI credential verification failed.");
      return { status: "unavailable" };
    }
    return r.data ? { status: "valid", keyId: String(r.data) } : { status: "invalid" };
  } catch {
    console.error("OMNI credential verification failed.");
    return { status: "unavailable" };
  }
}

/** Verification outages must never be confused with rejected credentials. */
async function authorize(request: Request, scope: OmniApiScope | null, verify: Verify) {
  const key = parseOmniBearer(request.headers.get("authorization"));
  if (!key)
    return Response.json(
      { ok: false, error: "A valid OMNI API key is required" },
      { status: 401, headers: NO_STORE },
    );
  const hash = await sha256Hex(key);
  if (scope) {
    const result = await verify(hash, scope);
    if (result.status === "unavailable") return verificationUnavailable();
    if (result.status === "valid") return { keyId: result.keyId };
  }
  for (const s of OMNI_API_SCOPES) {
    if (s === scope) continue;
    const result = await verify(hash, s);
    if (result.status === "unavailable") return verificationUnavailable();
    if (result.status === "valid")
      return scope
        ? Response.json(
            { ok: false, error: "scope_missing", needs: scope },
            { status: 403, headers: NO_STORE },
          )
        : "valid";
  }
  return Response.json(
    { ok: false, error: "Credential rejected" },
    { status: 401, headers: NO_STORE },
  );
}

function verificationUnavailable() {
  return Response.json(
    { ok: false, error: "credential_verification_unavailable" },
    { status: 503, headers: NO_STORE },
  );
}

/** Newest signed permit limits the Mothership recorded (signature and caps verified before recording). */
async function serviceSpendEvidence(): Promise<SpendEvidenceRead> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin
      .from("jackboy_permits")
      .select("per_call_usd,per_task_usd,daily_usd,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (r.error) return { status: "unreadable" };
    const row = r.data?.[0];
    if (!row) return { status: "read", latest: null };
    return {
      status: "read",
      latest: {
        perCallUsd: Number(row.per_call_usd),
        perTaskUsd: Number(row.per_task_usd),
        dailyUsd: Number(row.daily_usd),
        recordedAt: new Date(row.updated_at).toISOString(),
      },
    };
  } catch {
    return { status: "unreadable" };
  }
}

/** Live manifest facts: provider key presence (boolean only), 0066/0067 installs, signed cap evidence. */
async function serviceManifestLive(): Promise<ManifestLive> {
  const { delegatedChatInstalled } = await import("./omni-delegated-chat.server");
  const fusion = await import("./omni-fusion.server");
  const [chatInstalled, fusionPlanInstalled, fusionPlannerInstalled, spend] = await Promise.all([
    delegatedChatInstalled(),
    fusion.fusionPlanInstalled(),
    fusion.fusionPlannerInstalled(),
    serviceSpendEvidence(),
  ]);
  return {
    aiConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
    chatInstalled,
    fusionPlanInstalled,
    fusionPlannerInstalled,
    spend,
    now: Date.now(),
  };
}

export async function omniContractRead(
  request: Request,
  what: "health" | "manifest",
  verify: Verify = serviceVerify,
  readLive: () => Promise<ManifestLive> = serviceManifestLive,
) {
  const denied = await authorize(request, CONTRACT_SCOPE[what], verify);
  if (denied instanceof Response) return denied;
  const body =
    what === "health"
      ? {
          ok: true,
          version: OMNI_CONTRACT_VERSION,
          service: "omni-mothership",
          checkedAt: new Date().toISOString(),
        }
      : buildManifest(httpsOrigin(request.url), await readLive());
  return Response.json(body, { headers: NO_STORE });
}

/**
 * A metadata API key on a privileged write: 403 naming the owner delegation scope it needs.
 * Keys never authorize writes, whatever their scopes.
 */
export async function omniContractNeedsDelegation(
  request: Request,
  scope: "tasks:write" | "safety:emergency-stop" | "chat:write" | "fusion:plan",
  verify: Verify = serviceVerify,
) {
  const denied = await authorize(request, null, verify);
  if (denied instanceof Response) return denied;
  const origin = httpsOrigin(request.url);
  return Response.json(
    {
      ok: false,
      error: "delegation_required",
      needs: scope,
      reason: "API keys only read metadata. This needs a short-lived owner delegation.",
      ...(origin ? { authorize: `${origin}/omni-authorize` } : {}),
    },
    { status: 403, headers: NO_STORE },
  );
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

/** Reads recent observatory runs and records the key's use; same data and audit as /api/public/omni/jobs. */
type ReadRuns = (keyId: string) => Promise<ObservatoryRun[] | "read-failed" | "audit-failed">;

async function serviceReadRuns(
  keyId: string,
): Promise<ObservatoryRun[] | "read-failed" | "audit-failed"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const runs = await supabaseAdmin
    .from("razul_runs")
    .select("id,status,started_at,finished_at,fetched,inserted,alerts")
    .order("started_at", { ascending: false })
    .limit(10);
  if (runs.error) return "read-failed";
  const audit = await supabaseAdmin.from("razul_control_audit").insert({
    actor_id: null,
    action: "use-jobs",
    record_type: "omni_api_key",
    record_id: keyId,
  });
  if (audit.error) return "audit-failed";
  return (runs.data ?? []) as ObservatoryRun[];
}

/**
 * GET /api/omni/tasks — read-only. Needs the existing "jobs" scope and returns only the
 * observatory runs that /api/public/omni/jobs already exposes, as tasks that never ask
 * for approval. Held OMNI Terminal tasks are not included: they need the owner's sign-in.
 */
export async function omniContractTasks(
  request: Request,
  verify: Verify = serviceVerify,
  readRuns: ReadRuns = serviceReadRuns,
) {
  const denied = await authorize(request, CONTRACT_SCOPE.tasks, verify);
  if (denied instanceof Response) return denied;
  if (!denied || denied === "valid")
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  const runs = await readRuns(denied.keyId);
  if (runs === "read-failed")
    return Response.json(
      { ok: false, error: "Job metadata could not be read" },
      { status: 500, headers: NO_STORE },
    );
  if (runs === "audit-failed")
    return Response.json(
      { ok: false, error: "Job access could not be audited" },
      { status: 503, headers: NO_STORE },
    );
  return Response.json(
    {
      ok: true,
      scope: "jobs",
      source: "observatory-runs",
      tasks: runsToTasks(runs),
      notIncluded: "Held OMNI Terminal tasks need the owner's sign-in on the Mothership.",
      time: new Date().toISOString(),
    },
    { headers: NO_STORE },
  );
}
