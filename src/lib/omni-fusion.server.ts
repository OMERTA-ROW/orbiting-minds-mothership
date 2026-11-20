/**
 * POST /api/omni/fusion/plans with an owner delegation ("fusion:plan"). Server-to-server only.
 * With the rules planner installed (0069), one database call checks the delegation, scope, owner,
 * Emergency Stop, the owner's held task and the daily limit and logs the request; the reply is a
 * rules-only proposal built from that metadata. Without 0069, the 0067 gate checks and logs, and
 * the answer is `planner_not_available`. This module has no path to task changes, Jackboy,
 * executors, models, providers or the Stop (checked by tests).
 */
import { sha256Hex } from "./omni-api-keys";
import { DELEGATION_AUDIENCE, classifyBearer, isBrowserRequest } from "./omni-delegation";
import {
  FUSION_PLAN_CONTEXT_RPC,
  FUSION_PLANNER_READY_RPC,
  FUSION_PLAN_GATE_RPC,
  FUSION_PLAN_MAX_BODY,
  FUSION_PLAN_READY_RPC,
  FUSION_REFUSALS,
  INVALID_DELEGATION_REASONS,
  fusionPlanBody,
} from "./omni-fusion";
import { buildFusionPlan, canonicalPlanInput, planContextSchema } from "./omni-fusion-plan";

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

async function marker(rpc: Rpc, fn: string): Promise<boolean> {
  try {
    const r = await rpc(fn, {});
    return !r.error && r.data === true;
  } catch {
    return false;
  }
}

/** Whether migration 0067 is installed (marker function). Unreadable = not installed. */
export function fusionPlanInstalled(rpc: Rpc = serviceRpc): Promise<boolean> {
  return marker(rpc, FUSION_PLAN_READY_RPC);
}

/** Whether the rules-only planner (migration 0069) is installed. Unreadable = not installed. */
export function fusionPlannerInstalled(rpc: Rpc = serviceRpc): Promise<boolean> {
  return marker(rpc, FUSION_PLANNER_READY_RPC);
}

async function callRpc(rpc: Rpc, fn: string, args: Record<string, unknown>) {
  try {
    return await rpc(fn, args);
  } catch {
    return { data: null, error: true };
  }
}

const unavailable = () => json({ ok: false, error: "fusion_unavailable" }, 503);

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
  const tokenHash = await sha256Hex(bearer.token);
  if (await fusionPlannerInstalled(rpc)) {
    const r = await callRpc(rpc, FUSION_PLAN_CONTEXT_RPC, {
      _token_hash: tokenHash,
      _audience: DELEGATION_AUDIENCE,
      _task_id: body.data.taskId,
    });
    if (r.error || !r.data || typeof r.data !== "object") return unavailable();
    const result = r.data as { ok?: unknown; reason?: unknown };
    if (result.ok === false) return refuse(typeof result.reason === "string" ? result.reason : "");
    // Only an exact, well-formed answer for the requested task becomes a proposal.
    const ctx = planContextSchema.safeParse(r.data);
    if (!ctx.success || ctx.data.task.id !== body.data.taskId) return unavailable();
    const digest = await sha256Hex(canonicalPlanInput(ctx.data));
    return json({ ok: true, plan: buildFusionPlan(ctx.data, digest, Date.now()) }, 200);
  }
  const r = await callRpc(rpc, FUSION_PLAN_GATE_RPC, {
    _token_hash: tokenHash,
    _audience: DELEGATION_AUDIENCE,
  });
  if (r.error || !r.data || typeof r.data !== "object") return unavailable();
  const result = r.data as { ok?: unknown; reason?: unknown; planner?: unknown };
  if (result.ok === false) return refuse(typeof result.reason === "string" ? result.reason : "");
  // Admitted by the 0067 gate, but no planner is installed: never report a plan, step, run or cost.
  if (result.ok === true) return refuse("planner_not_available");
  return unavailable();
}
