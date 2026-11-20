/**
 * POST /api/omni/fusion/plans with an owner delegation ("fusion:plan"). Server-to-server only.
 * One database call (`omni_delegation_fusion_plan_gate`, migration 0067) checks the delegation,
 * scope, owner and Emergency Stop and logs the request. Nothing else happens: this module has no
 * path to tasks, handoffs, Jackboy, executors, permits, models or providers (checked by tests).
 */
import { sha256Hex } from "./omni-api-keys";
import { DELEGATION_AUDIENCE, classifyBearer, isBrowserRequest } from "./omni-delegation";
import {
  FUSION_PLAN_GATE_RPC,
  FUSION_PLAN_MAX_BODY,
  FUSION_PLAN_READY_RPC,
  FUSION_REFUSALS,
  INVALID_DELEGATION_REASONS,
  fusionPlanBody,
} from "./omni-fusion";

export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const serviceRpc: Rpc = async (fn, args) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.rpc as unknown as Rpc)(fn, args);
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers: NO_STORE });

function refuse(reason: string) {
  const r = FUSION_REFUSALS[reason];
  if (r) return json({ ok: false, error: r.error, message: r.message }, r.status);
  if ((INVALID_DELEGATION_REASONS as readonly string[]).includes(reason))
    return json(
      {
        ok: false,
        error: "invalid_token",
        reason,
        message: "The owner delegation is not valid. The owner must approve a new connection.",
      },
      401,
    );
  return json({ ok: false, error: "refused" }, 403);
}

/** Whether migration 0067 is installed (marker function). Unreadable = not installed. */
export async function fusionPlanInstalled(rpc: Rpc = serviceRpc): Promise<boolean> {
  try {
    const r = await rpc(FUSION_PLAN_READY_RPC, {});
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}

async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > FUSION_PLAN_MAX_BODY) return "too_large" as const;
  try {
    return fusionPlanBody.safeParse(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function omniFusionPlanRequest(request: Request, rpc: Rpc = serviceRpc) {
  if (isBrowserRequest(request.headers))
    return json(
      {
        ok: false,
        error: "server_to_server_only",
        message: "Call this from OMNI's server. Browser requests are refused.",
      },
      403,
    );
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation")
    return json(
      {
        ok: false,
        error: "invalid_token",
        state: "delegation_required",
        reason: "A Mothership owner delegation with fusion:plan is required.",
      },
      401,
    );
  if (!(await fusionPlanInstalled(rpc))) return refuse("not_installed");
  const body = await readBody(request);
  if (body === "too_large") return json({ ok: false, error: "invalid_request" }, 413);
  if (!body?.success)
    return json(
      { ok: false, error: "invalid_request", message: 'Send {"taskId": "<held task id>"}.' },
      400,
    );
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc(FUSION_PLAN_GATE_RPC, {
      _token_hash: await sha256Hex(bearer.token),
      _audience: DELEGATION_AUDIENCE,
    });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error || !r.data || typeof r.data !== "object")
    return json({ ok: false, error: "fusion_unavailable" }, 503);
  const result = r.data as { ok?: unknown; reason?: unknown; planner?: unknown };
  if (result.ok === false) return refuse(typeof result.reason === "string" ? result.reason : "");
  // Admitted, but no planner exists: never report a plan, step, run or cost.
  if (result.ok === true) return refuse("planner_not_available");
  return json({ ok: false, error: "fusion_unavailable" }, 503);
}
