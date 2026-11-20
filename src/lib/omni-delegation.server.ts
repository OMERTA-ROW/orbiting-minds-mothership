/**
 * OMNI owner delegation — server handlers for the token exchange, status, revocation and the
 * delegated writes (held task, Stop engage). Server-to-server only; every check that grants
 * anything runs inside one database function together with the action (migration 0062).
 * Bearer secrets are generated here, returned once and stored only as SHA-256 hashes.
 */
import { sha256Hex } from "./omni-api-keys";
import { unsupportedBody, httpsOrigin, type UnsupportedCapability } from "./omni-contract";
import {
  AUTH_CODE_PATTERN,
  CODE_VERIFIER_PATTERN,
  DELEGATION_AUDIENCE,
  DELEGATION_CLIENT,
  HELD_TASK_AGENTS,
  classifyBearer,
  delegatedTaskBody,
  delegationStatusBody,
  delegationTokenPrefix,
  generateDelegationSecret,
  isBrowserRequest,
  s256Challenge,
  type DelegationRecord,
  type DelegationScope,
} from "./omni-delegation";

export type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const serviceRpc: Rpc = async (fn, args) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin.rpc as unknown as Rpc)(fn, args);
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const MAX_BODY = 16_384;

function browserRefused() {
  return json(
    {
      ok: false,
      error: "server_to_server_only",
      message: "Call this from OMNI's server. Browser requests are refused.",
    },
    403,
  );
}

async function readBody(request: Request): Promise<Record<string, unknown> | "too_large" | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return "too_large";
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const GRANT_REASONS: Record<string, string> = {
  unknown_code: "The code is not recognised.",
  code_already_used:
    "The code was already used. Any connection it made has been cancelled; ask the owner to approve again.",
  code_expired: "The code expired (60 seconds). Ask the owner to approve again.",
  client_mismatch: "The code was issued for a different app or return address.",
  pkce_mismatch: "The code_verifier does not match the code_challenge.",
  owner_unverified: "The Mothership owner is no longer verified.",
};

/** POST /api/public/omni/delegation/token — authorization_code + PKCE, server-to-server. */
export async function omniDelegationToken(request: Request, rpc: Rpc = serviceRpc) {
  if (isBrowserRequest(request.headers)) return browserRefused();
  const body = await readBody(request);
  if (body === "too_large") return json({ error: "invalid_request" }, 413);
  if (!body)
    return json({ error: "invalid_request", error_description: "Send JSON or form fields." }, 400);
  const field = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  if (field("grant_type") !== "authorization_code")
    return json({ error: "unsupported_grant_type" }, 400);
  if (
    field("client_id") !== DELEGATION_CLIENT.id ||
    field("redirect_uri") !== DELEGATION_CLIENT.redirectUri
  )
    return json(
      { error: "invalid_client", error_description: "Unknown app or return address." },
      401,
    );
  const code = field("code");
  const verifier = field("code_verifier");
  if (!AUTH_CODE_PATTERN.test(code) || !CODE_VERIFIER_PATTERN.test(verifier))
    return json(
      { error: "invalid_grant", error_description: "Malformed code or code_verifier." },
      400,
    );
  const token = generateDelegationSecret("omnid");
  let result: { data: unknown; error: unknown };
  try {
    result = await rpc("omni_delegation_exchange", {
      _code_hash: await sha256Hex(code),
      _code_challenge: await s256Challenge(verifier),
      _client_id: DELEGATION_CLIENT.id,
      _redirect_uri: DELEGATION_CLIENT.redirectUri,
      _token_hash: await sha256Hex(token),
      _token_prefix: delegationTokenPrefix(token),
    });
  } catch {
    result = { data: null, error: true };
  }
  if (result.error || !result.data || typeof result.data !== "object")
    return json({ error: "temporarily_unavailable" }, 503);
  const d = result.data as {
    ok: boolean;
    reason?: string;
    delegation_id?: string;
    scopes?: string[];
    issued_at?: string;
    expires_at?: string;
    audience?: string;
    client_id?: string;
  };
  if (!d.ok)
    return json(
      { error: "invalid_grant", error_description: GRANT_REASONS[d.reason ?? ""] ?? "Refused." },
      400,
    );
  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(d.expires_at ?? "") - Date.parse(d.issued_at ?? "")) / 1000),
  );
  // Shown exactly once; only the hash is stored.
  return json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    expires_at: d.expires_at,
    issued_at: d.issued_at,
    scope: (d.scopes ?? []).join(" "),
    scopes: d.scopes ?? [],
    delegation_id: d.delegation_id,
    audience: d.audience,
    client_id: d.client_id,
  });
}

function needsDelegation() {
  return json(
    {
      ok: false,
      error: "invalid_token",
      state: "delegation_required",
      reason: "A Mothership owner delegation is required.",
    },
    401,
  );
}

/** GET /api/public/omni/delegation/status — safe metadata for the bearer's own delegation. */
export async function omniDelegationStatus(request: Request, rpc: Rpc = serviceRpc) {
  if (isBrowserRequest(request.headers)) return browserRefused();
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc("omni_delegation_status", { _token_hash: await sha256Hex(bearer.token) });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error) return json({ ok: false, state: "error", reason: "Status could not be read." }, 503);
  if (!r.data) return needsDelegation();
  return json({ ok: true, ...delegationStatusBody(r.data as DelegationRecord) });
}

/** POST /api/public/omni/delegation/revoke — immediate and idempotent. */
export async function omniDelegationRevoke(request: Request, rpc: Rpc = serviceRpc) {
  if (isBrowserRequest(request.headers)) return browserRefused();
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc("omni_delegation_revoke", { _token_hash: await sha256Hex(bearer.token) });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error || !r.data)
    return json(
      { ok: false, error: "revocation_not_confirmed", message: "Retry; nothing was confirmed." },
      503,
    );
  const d = r.data as {
    found: boolean;
    already_revoked?: boolean;
    revoked_at?: string;
    delegation_id?: string;
  };
  if (!d.found) return needsDelegation();
  return json({
    ok: true,
    revoked: true,
    alreadyRevoked: d.already_revoked === true,
    revokedAt: d.revoked_at,
    delegationId: d.delegation_id,
  });
}

/** Refusals from `omni_delegation_use` and the delegated actions, mapped to HTTP. */
function refusal(reason: string, scope: DelegationScope) {
  switch (reason) {
    case "scope_missing":
      return json(
        {
          ok: false,
          error: "scope_missing",
          needs: scope,
          message: `This owner delegation does not include ${scope}. The owner must approve it.`,
        },
        403,
      );
    case "invalid":
    case "revoked":
    case "expired":
    case "wrong_audience":
    case "owner_unverified":
      return json(
        {
          ok: false,
          error: "invalid_token",
          reason,
          message: "The owner delegation is not valid. The owner must approve a new connection.",
        },
        401,
      );
    case "invalid_task":
      return json(
        { ok: false, error: "invalid_request", message: "Task fields are out of range." },
        422,
      );
    case "agent_not_accepted":
      return json(
        {
          ok: false,
          error: "agent_not_accepted",
          message: `Held tasks can name: ${HELD_TASK_AGENTS.join(", ")}.`,
        },
        422,
      );
    case "secret_like":
      return json(
        {
          ok: false,
          error: "secret_like",
          message: "Task text looks like a key or token; remove it.",
        },
        422,
      );
    case "id_conflict":
      return json(
        {
          ok: false,
          error: "idempotency_conflict",
          message: "This idempotencyKey was already used for a different task.",
        },
        409,
      );
    case "daily_limit":
      return json(
        {
          ok: false,
          error: "daily_limit",
          message: "OMNI web can add at most 20 held tasks per day.",
        },
        429,
      );
    default:
      return json({ ok: false, error: "refused" }, 403);
  }
}

/** POST /api/omni/tasks with an owner delegation ("tasks:write"): stores a held task only. */
export async function omniDelegatedHoldTask(request: Request, rpc: Rpc = serviceRpc) {
  if (isBrowserRequest(request.headers)) return browserRefused();
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  const raw = await readBody(request);
  if (raw === "too_large") return json({ ok: false, error: "invalid_request" }, 413);
  const parsed = delegatedTaskBody.safeParse(raw);
  if (!parsed.success)
    return json(
      {
        ok: false,
        error: "invalid_request",
        message:
          'Expected {task:{title(1-120),instruction(3-4000),agentId,github?},idempotencyKey(uuid),timeoutMs(1000-120000),ownerApproved:true,autonomous:false,source:"omni-web"}.',
      },
      422,
    );
  const body = parsed.data;
  if (body.autonomous)
    return json(
      {
        ok: false,
        error: "autonomous_refused",
        message: "Autonomous Mode is off. Nothing was stored.",
      },
      403,
    );
  if (!(HELD_TASK_AGENTS as readonly string[]).includes(body.task.agentId))
    return refusal("agent_not_accepted", "tasks:write");
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc("omni_delegation_hold_task", {
      _token_hash: await sha256Hex(bearer.token),
      _audience: DELEGATION_AUDIENCE,
      _id: body.idempotencyKey,
      _agent: body.task.agentId,
      _title: body.task.title,
      _instructions: body.task.instruction,
      _repository: body.task.github?.repository ?? null,
    });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error || !r.data || typeof r.data !== "object")
    return json(
      {
        ok: false,
        error: "not_stored",
        message: "The task was not confirmed. Retry with the same idempotencyKey.",
      },
      503,
    );
  const d = r.data as {
    ok: boolean;
    reason?: string;
    duplicate?: boolean;
    task?: {
      id: string;
      agent: string;
      title: string;
      repository: string | null;
      state: string;
      created_at: string;
    };
  };
  if (!d.ok || !d.task) return refusal(d.reason ?? "", "tasks:write");
  const origin = httpsOrigin(request.url);
  const ignored = ["timeoutMs (held tasks never run)"];
  if (body.task.github?.reference !== undefined) ignored.push("task.github.reference (not stored)");
  return json(
    {
      ok: true,
      duplicate: d.duplicate === true,
      task: {
        id: d.task.id,
        title: d.task.title,
        status: d.task.state,
        requiresApproval: false,
        agentId: d.task.agent,
        updatedAt: d.task.created_at,
        ownerActionRequired: true,
        ...(origin ? { ownerPage: `${origin}/omni-terminal` } : {}),
        ...(d.task.repository ? { repository: d.task.repository } : {}),
        logs: [
          {
            at: d.task.created_at,
            message:
              "Held on the Mothership. Nothing runs until the owner hands it off in OMNI Terminal.",
          },
        ],
      },
      ignored,
    },
    d.duplicate ? 200 : 201,
  );
}

const reconcileStop = async () => (await import("./unified-stop.server")).reconcileTerminalStop();

/**
 * POST /api/omni/emergency-stop with an owner delegation ("safety:emergency-stop"). Engages the
 * same Stop as the owner's button; `ok:true` only after remote cancellation is verified.
 */
export async function omniDelegatedStop(
  request: Request,
  rpc: Rpc = serviceRpc,
  reconcile: () => Promise<void> = reconcileStop,
) {
  if (isBrowserRequest(request.headers)) return browserRefused();
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  const raw = await readBody(request);
  if (raw === "too_large" || raw === null)
    return json({ ok: false, error: "invalid_request" }, 400);
  if (raw["autonomous"] === true)
    return json(
      { ok: false, error: "autonomous_refused", message: "Autonomous Mode is off." },
      403,
    );
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc("omni_delegation_engage_stop", {
      _token_hash: await sha256Hex(bearer.token),
      _audience: DELEGATION_AUDIENCE,
    });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error || !r.data || typeof r.data !== "object")
    return json(
      {
        ok: false,
        error: "stop_not_recorded",
        message: "The Stop was not confirmed. Retry, or press it in OMNI Terminal.",
      },
      503,
    );
  const d = r.data as { ok: boolean; reason?: string; revision?: number };
  if (!d.ok) return refusal(d.reason ?? "", "safety:emergency-stop");
  try {
    await reconcile();
  } catch {
    return json(
      {
        ok: false,
        error: "remote_cancellation_unverified",
        localStopEngaged: true,
        message:
          "Local Stop is engaged. Remote cancellation remains unverified; keep Stop engaged and reconcile on the Mothership.",
      },
      502,
    );
  }
  return json({
    ok: true,
    localStopEngaged: true,
    revision: d.revision,
    message: "Emergency Stop engaged. Releasing it needs the owner on the Mothership.",
  });
}

/** Chat / decisions with a delegation: honest 403 when the delegation is real, else 401. */
export async function omniDelegatedUnsupported(
  request: Request,
  capability: UnsupportedCapability,
  rpc: Rpc = serviceRpc,
) {
  const bearer = classifyBearer(request.headers.get("authorization"));
  if (bearer.kind !== "delegation") return needsDelegation();
  let r: { data: unknown; error: unknown };
  try {
    r = await rpc("omni_delegation_status", { _token_hash: await sha256Hex(bearer.token) });
  } catch {
    r = { data: null, error: true };
  }
  if (r.error) return json({ ok: false, error: "credential_verification_unavailable" }, 503);
  if (!r.data || delegationStatusBody(r.data as DelegationRecord).state !== "active")
    return needsDelegation();
  return json(unsupportedBody(capability, httpsOrigin(request.url)), 403);
}
