import { describe, expect, it, vi } from "vitest";
import {
  DELEGATION_CLIENT,
  callbackUrl,
  classifyBearer,
  delegationStatusBody,
  isBrowserRequest,
  parseAuthorizeRequest,
  s256Challenge,
  savePendingAuthorize,
  readPendingAuthorize,
  clearPendingAuthorize,
  type DelegationRecord,
} from "./omni-delegation";
import {
  omniDelegatedHoldTask,
  omniDelegatedReadTasks,
  omniDelegatedStop,
  omniDelegatedUnsupported,
  omniDelegationRevoke,
  omniDelegationStatus,
  omniDelegationToken,
  type Rpc,
} from "./omni-delegation.server";
import { omniContractNeedsDelegation } from "./omni-contract.server";
import { buildManifest } from "./omni-contract";
import { sha256Hex } from "./omni-api-keys";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: vi.fn() } }));

const TOKEN = "omnid_" + "a".repeat(64);
const CODE = "omnic_" + "b".repeat(64);
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const KEY = "omni_" + "c".repeat(48);
const AUTH = {
  response_type: "code",
  client_id: "omni-web",
  redirect_uri: DELEGATION_CLIENT.redirectUri,
  scope: "tasks:write safety:emergency-stop chat:write",
  state: "s".repeat(32),
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
};
const TASK_BODY = {
  task: { title: "Review PR", instruction: "Review the open pull request", agentId: "jackboy" },
  idempotencyKey: "aaaaaaaa-0000-4000-8000-0000000000a1",
  timeoutMs: 30000,
  ownerApproved: true,
  autonomous: false,
  source: "omni-web",
};

function req(
  path: string,
  init: {
    method?: string;
    bearer?: string;
    body?: unknown;
    headers?: Record<string, string>;
    form?: boolean;
  } = {},
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.bearer) headers["authorization"] = `Bearer ${init.bearer}`;
  let body: string | undefined;
  if (init.body !== undefined) {
    if (init.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(init.body as Record<string, string>).toString();
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }
  }
  return new Request(`https://evoomni.tech${path}`, {
    method: init.method ?? "POST",
    headers,
    body: body ?? null,
  });
}

function fakeRpc(results: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    const v = results[fn];
    if (v instanceof Error) return { data: null, error: { message: v.message } };
    return { data: v ?? null, error: null };
  };
  return { rpc, calls };
}

describe("authorize request rules", () => {
  it("accepts only the exact client and callback, and splits supported scopes", () => {
    const p = parseAuthorizeRequest(AUTH);
    expect(p.ok && p.supported).toEqual(["tasks:write", "safety:emergency-stop"]);
    expect(p.ok && p.unsupported).toEqual(["chat:write"]);
    for (const bad of [
      { client_id: "omni-evil" },
      { redirect_uri: DELEGATION_CLIENT.redirectUri + "/x" },
      {
        redirect_uri:
          "https://omni-orbit-command-companion.lovable.app.evil.example/mothership/callback",
      },
      { code_challenge_method: "plain" },
      { code_challenge: "short" },
      { state: "short" },
      { scope: "" },
      { scope: "tasks:write tasks:write" },
      { scope: "admin" },
      { response_type: "token" },
    ])
      expect(parseAuthorizeRequest({ ...AUTH, ...bad }).ok).toBe(false);
  });
  it("S256 matches the RFC 7636 example", async () => {
    expect(await s256Challenge(VERIFIER)).toBe(CHALLENGE);
  });
  it("callback carries only the code (or denial) and state, to the allowlisted URL", () => {
    const u = new URL(callbackUrl({ code: CODE }, "state-value-1234567"));
    expect(u.origin + u.pathname).toBe(DELEGATION_CLIENT.redirectUri);
    expect([...u.searchParams.keys()].sort()).toEqual(["code", "state"]);
    expect(
      new URL(callbackUrl({ error: "access_denied" }, "x".repeat(16))).searchParams.get("error"),
    ).toBe("access_denied");
  });
  it("tells delegations from metadata keys and flags browser requests", () => {
    expect(classifyBearer(`Bearer ${TOKEN}`)).toEqual({ kind: "delegation", token: TOKEN });
    expect(classifyBearer(`Bearer ${KEY}`).kind).toBe("metadata");
    expect(classifyBearer("Bearer omnid_short").kind).toBe("none");
    expect(isBrowserRequest(new Headers({ origin: "https://x.example" }))).toBe(true);
    expect(isBrowserRequest(new Headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isBrowserRequest(new Headers())).toBe(false);
  });
  it("pending request survives sign-in until approve/decline and expires after 10 minutes", () => {
    const store = new Map<string, string>();
    const s = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    savePendingAuthorize(s, AUTH, 1000);
    expect(readPendingAuthorize(s, 2000)).toEqual(AUTH);
    expect(readPendingAuthorize(s, 2000)).toEqual(AUTH);
    clearPendingAuthorize(s);
    expect(readPendingAuthorize(s, 2000)).toBeNull();
    savePendingAuthorize(s, AUTH, 0);
    expect(readPendingAuthorize(s, 11 * 60 * 1000)).toBeNull();
    expect(store.size).toBe(0);
    savePendingAuthorize(s, { ...AUTH, redirect_uri: "https://evil.example/cb" }, 0);
    expect(readPendingAuthorize(s, 1)).toBeNull();
  });
});

const ISSUED = {
  ok: true,
  delegation_id: "d1",
  client_id: "omni-web",
  audience: "omni-mothership",
  scopes: ["safety:emergency-stop", "tasks:write"],
  issued_at: "2026-11-20T06:00:00.000Z",
  expires_at: "2026-11-20T06:15:00.000Z",
};
const TOKEN_FIELDS = {
  grant_type: "authorization_code",
  code: CODE,
  code_verifier: VERIFIER,
  client_id: "omni-web",
  redirect_uri: DELEGATION_CLIENT.redirectUri,
};

describe("token exchange", () => {
  it("issues once, stores only hashes and the PKCE challenge, and is no-store", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_exchange: ISSUED });
    const r = await omniDelegationToken(
      req("/api/public/omni/delegation/token", { body: TOKEN_FIELDS }),
      rpc,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "safety:emergency-stop tasks:write",
      delegation_id: "d1",
    });
    expect(body.access_token).toMatch(/^omnid_[0-9a-f]{64}$/);
    const args = calls[0]!.args;
    expect(args["_code_hash"]).toBe(await sha256Hex(CODE));
    expect(args["_code_challenge"]).toBe(CHALLENGE);
    expect(args["_token_hash"]).toBe(await sha256Hex(body.access_token));
    expect(JSON.stringify(args)).not.toContain(body.access_token);
    expect(JSON.stringify(args)).not.toContain(CODE);
    expect(JSON.stringify(args)).not.toContain(VERIFIER);
  });
  it("accepts form encoding too", async () => {
    const { rpc } = fakeRpc({ omni_delegation_exchange: ISSUED });
    expect(
      (await omniDelegationToken(req("/t", { body: TOKEN_FIELDS, form: true }), rpc)).status,
    ).toBe(200);
  });
  it("maps replay/expiry/PKCE refusals to invalid_grant without issuing", async () => {
    for (const reason of [
      "code_already_used",
      "code_expired",
      "pkce_mismatch",
      "client_mismatch",
      "unknown_code",
      "owner_unverified",
    ]) {
      const { rpc } = fakeRpc({
        omni_delegation_exchange: { ok: false, error: "invalid_grant", reason },
      });
      const r = await omniDelegationToken(req("/t", { body: TOKEN_FIELDS }), rpc);
      expect(r.status).toBe(400);
      const body = await r.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.access_token).toBeUndefined();
    }
  });
  it("refuses browsers, wrong clients, wrong grant types and malformed codes before the database", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_exchange: ISSUED });
    expect(
      (
        await omniDelegationToken(
          req("/t", { body: TOKEN_FIELDS, headers: { origin: DELEGATION_CLIENT.origin } }),
          rpc,
        )
      ).status,
    ).toBe(403);
    expect(
      (await omniDelegationToken(req("/t", { body: { ...TOKEN_FIELDS, client_id: "x" } }), rpc))
        .status,
    ).toBe(401);
    expect(
      (
        await omniDelegationToken(
          req("/t", { body: { ...TOKEN_FIELDS, redirect_uri: "https://evil.example/cb" } }),
          rpc,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await omniDelegationToken(
          req("/t", { body: { ...TOKEN_FIELDS, grant_type: "refresh_token" } }),
          rpc,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await omniDelegationToken(
          req("/t", { body: { ...TOKEN_FIELDS, code: "omnic_short" } }),
          rpc,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await omniDelegationToken(
          req("/t", { body: { ...TOKEN_FIELDS, code_verifier: "short" } }),
          rpc,
        )
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("database outage is 503, never a token", async () => {
    const { rpc } = fakeRpc({ omni_delegation_exchange: new Error("down") });
    const r = await omniDelegationToken(req("/t", { body: TOKEN_FIELDS }), rpc);
    expect(r.status).toBe(503);
    expect((await r.json()).access_token).toBeUndefined();
  });
});

const REC: DelegationRecord = {
  delegation_id: "d1",
  client_id: "omni-web",
  audience: "omni-mothership",
  scopes: ["tasks:write"],
  issued_at: "2026-11-20T06:00:00.000Z",
  expires_at: "2026-11-20T06:15:00.000Z",
  revoked_at: null,
  revoked_reason: null,
  owner_verified: true,
  server_time: "2026-11-20T06:05:00.000Z",
};

describe("status and revocation", () => {
  it("status reports OMNI's safe shape and no secret", async () => {
    const { rpc } = fakeRpc({ omni_delegation_status: REC });
    const r = await omniDelegationStatus(req("/s", { method: "GET", bearer: TOKEN }), rpc);
    const body = await r.json();
    expect(body).toMatchObject({
      state: "active",
      ownerVerified: true,
      scopes: ["tasks:write"],
      verifiedAt: REC.server_time,
      expiresAt: REC.expires_at,
      expiresIn: 600,
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
  it("expired, revoked and unverified-owner states are never active", () => {
    expect(delegationStatusBody({ ...REC, server_time: "2026-11-20T06:15:00.000Z" }).state).toBe(
      "expired",
    );
    expect(
      delegationStatusBody({ ...REC, revoked_at: REC.server_time, revoked_reason: "owner" }).state,
    ).toBe("delegation_required");
    expect(delegationStatusBody({ ...REC, owner_verified: false }).state).toBe(
      "owner_sign_in_required",
    );
    expect(
      delegationStatusBody({ ...REC, revoked_at: REC.server_time, revoked_reason: "client" })
        .expiresAt,
    ).toBeUndefined();
  });
  it("unknown tokens and metadata keys get 401 from status and revoke", async () => {
    const { rpc } = fakeRpc({});
    expect(
      (await omniDelegationStatus(req("/s", { method: "GET", bearer: TOKEN }), rpc)).status,
    ).toBe(401);
    expect(
      (await omniDelegationStatus(req("/s", { method: "GET", bearer: KEY }), rpc)).status,
    ).toBe(401);
    expect(
      (
        await omniDelegationRevoke(
          req("/r", { bearer: TOKEN }),
          fakeRpc({ omni_delegation_revoke: { found: false } }).rpc,
        )
      ).status,
    ).toBe(401);
  });
  it("revocation is idempotent and confirms only after the database does", async () => {
    const first = await omniDelegationRevoke(
      req("/r", { bearer: TOKEN }),
      fakeRpc({ omni_delegation_revoke: { found: true, already_revoked: false, revoked_at: "t" } })
        .rpc,
    );
    expect(await first.json()).toMatchObject({ ok: true, revoked: true, alreadyRevoked: false });
    const again = await omniDelegationRevoke(
      req("/r", { bearer: TOKEN }),
      fakeRpc({ omni_delegation_revoke: { found: true, already_revoked: true, revoked_at: "t" } })
        .rpc,
    );
    expect(await again.json()).toMatchObject({ ok: true, alreadyRevoked: true });
    const down = await omniDelegationRevoke(
      req("/r", { bearer: TOKEN }),
      fakeRpc({ omni_delegation_revoke: new Error("x") }).rpc,
    );
    expect(down.status).toBe(503);
    expect((await down.json()).ok).toBe(false);
  });
});

const HELD = {
  ok: true,
  duplicate: false,
  task: {
    id: TASK_BODY.idempotencyKey,
    agent: "jackboy",
    title: "Review PR",
    repository: null,
    state: "held",
    created_at: "2026-11-20T06:01:00Z",
  },
};

describe("delegated writes", () => {
  it("held task: stored held, never approvable, ignores timeout, 201 then 200 on retry", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_hold_task: HELD });
    const r = await omniDelegatedHoldTask(
      req("/api/omni/tasks", { bearer: TOKEN, body: TASK_BODY }),
      rpc,
    );
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.task).toMatchObject({
      id: TASK_BODY.idempotencyKey,
      status: "held",
      requiresApproval: false,
      ownerActionRequired: true,
      ownerPage: "https://evoomni.tech/omni-terminal",
    });
    expect(body.ignored).toContain("timeoutMs (held tasks never run)");
    expect(calls[0]!.args).toMatchObject({
      _audience: "omni-mothership",
      _id: TASK_BODY.idempotencyKey,
      _agent: "jackboy",
    });
    const dup = await omniDelegatedHoldTask(
      req("/api/omni/tasks", { bearer: TOKEN, body: TASK_BODY }),
      fakeRpc({ omni_delegation_hold_task: { ...HELD, duplicate: true } }).rpc,
    );
    expect(dup.status).toBe(200);
  });
  it("refuses autonomous:true, unknown agents and bad bodies without touching the database", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_hold_task: HELD });
    const auto = await omniDelegatedHoldTask(
      req("/t", { bearer: TOKEN, body: { ...TASK_BODY, autonomous: true } }),
      rpc,
    );
    expect(auto.status).toBe(403);
    expect((await auto.json()).error).toBe("autonomous_refused");
    expect(
      (
        await omniDelegatedHoldTask(
          req("/t", {
            bearer: TOKEN,
            body: { ...TASK_BODY, task: { ...TASK_BODY.task, agentId: "omni" } },
          }),
          rpc,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await omniDelegatedHoldTask(
          req("/t", { bearer: TOKEN, body: { ...TASK_BODY, ownerApproved: false } }),
          rpc,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await omniDelegatedHoldTask(
          req("/t", { bearer: TOKEN, body: { ...TASK_BODY, idempotencyKey: "x" } }),
          rpc,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await omniDelegatedHoldTask(
          req("/t", {
            bearer: TOKEN,
            body: TASK_BODY,
            headers: { origin: DELEGATION_CLIENT.origin },
          }),
          rpc,
        )
      ).status,
    ).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it("maps expired/revoked/wrong-audience/owner-changed to 401, missing scope to 403, conflicts to 409", async () => {
    for (const [reason, status] of [
      ["expired", 401],
      ["revoked", 401],
      ["wrong_audience", 401],
      ["owner_unverified", 401],
      ["invalid", 401],
      ["scope_missing", 403],
      ["id_conflict", 409],
      ["daily_limit", 429],
      ["secret_like", 422],
    ] as const) {
      const r = await omniDelegatedHoldTask(
        req("/t", { bearer: TOKEN, body: TASK_BODY }),
        fakeRpc({ omni_delegation_hold_task: { ok: false, reason } }).rpc,
      );
      expect(r.status, reason).toBe(status);
      expect((await r.json()).ok).toBe(false);
    }
  });
  it("Stop: ok only after remote cancellation is verified", async () => {
    const engaged = fakeRpc({ omni_delegation_engage_stop: { ok: true, revision: 7 } });
    const ok = await omniDelegatedStop(
      req("/s", { bearer: TOKEN, body: { source: "omni-web" } }),
      engaged.rpc,
      async () => {},
    );
    expect(await ok.json()).toMatchObject({ ok: true, localStopEngaged: true, revision: 7 });
    const unverified = await omniDelegatedStop(
      req("/s", { bearer: TOKEN, body: {} }),
      engaged.rpc,
      async () => {
        throw new Error("remote unknown");
      },
    );
    expect(unverified.status).toBe(502);
    expect(await unverified.json()).toMatchObject({
      ok: false,
      error: "remote_cancellation_unverified",
      localStopEngaged: true,
    });
    let reconciled = 0;
    const noScope = await omniDelegatedStop(
      req("/s", { bearer: TOKEN }),
      fakeRpc({ omni_delegation_engage_stop: { ok: false, reason: "scope_missing" } }).rpc,
      async () => {
        reconciled++;
      },
    );
    expect(noScope.status).toBe(403);
    expect(reconciled).toBe(0);
    const down = await omniDelegatedStop(
      req("/s", { bearer: TOKEN }),
      fakeRpc({ omni_delegation_engage_stop: new Error("x") }).rpc,
      async () => {},
    );
    expect(down.status).toBe(503);
    expect((await down.json()).ok).toBe(false);
  });
  it("chat and decisions stay unavailable even for an active delegation", async () => {
    const r = await omniDelegatedUnsupported(
      req("/api/omni/chat", { bearer: TOKEN }),
      "chat",
      fakeRpc({ omni_delegation_status: REC }).rpc,
    );
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("not_available");
    const gone = await omniDelegatedUnsupported(
      req("/c", { bearer: TOKEN }),
      "task-decision",
      fakeRpc({ omni_delegation_status: { ...REC, revoked_at: "t", revoked_reason: "owner" } }).rpc,
    );
    expect(gone.status).toBe(401);
  });
});

describe("delegated task reads", () => {
  it("uses a separate scope and returns only the database result with no-store", async () => {
    const tasks = [{ id: TASK_BODY.idempotencyKey, status: "held", handoff: null }];
    const { rpc, calls } = fakeRpc({ omni_delegation_read_tasks: { ok: true, tasks } });
    const r = await omniDelegatedReadTasks(
      req(`/api/omni/held-tasks?id=${TASK_BODY.idempotencyKey}`, {
        method: "GET",
        bearer: TOKEN,
      }),
      rpc,
    );
    expect(await r.json()).toEqual({ ok: true, tasks });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(calls[0]?.args).toEqual({
      _token_hash: await sha256Hex(TOKEN),
      _audience: "omni-mothership",
      _task_id: TASK_BODY.idempotencyKey,
    });
  });
  it("refuses metadata keys, browser requests and malformed query parameters before the database", async () => {
    const { rpc, calls } = fakeRpc({});
    for (const request of [
      req("/api/omni/held-tasks", { method: "GET", bearer: KEY }),
      req("/api/omni/held-tasks", {
        method: "GET",
        bearer: TOKEN,
        headers: { origin: DELEGATION_CLIENT.origin },
      }),
      req("/api/omni/held-tasks?id=x", { method: "GET", bearer: TOKEN }),
      req("/api/omni/held-tasks?id=x&id=y", { method: "GET", bearer: TOKEN }),
      req("/api/omni/held-tasks?other=x", { method: "GET", bearer: TOKEN }),
    ]) {
      expect((await omniDelegatedReadTasks(request, rpc)).status).toBeGreaterThanOrEqual(400);
    }
    expect(calls).toHaveLength(0);
  });
  it("fails closed for missing scope, invalid or revoked tokens and database failures", async () => {
    for (const [reason, status] of [
      ["scope_missing", 403],
      ["expired", 401],
      ["revoked", 401],
      ["wrong_audience", 401],
      ["owner_unverified", 401],
    ] as const) {
      const r = await omniDelegatedReadTasks(
        req("/api/omni/held-tasks", { method: "GET", bearer: TOKEN }),
        fakeRpc({ omni_delegation_read_tasks: { ok: false, reason } }).rpc,
      );
      expect(r.status).toBe(status);
    }
    for (const result of [new Error("down"), { ok: true, tasks: null }]) {
      const r = await omniDelegatedReadTasks(
        req("/api/omni/held-tasks", { method: "GET", bearer: TOKEN }),
        fakeRpc({ omni_delegation_read_tasks: result }).rpc,
      );
      expect(r.status).toBe(503);
    }
  });
});

describe("metadata API keys stay separate", () => {
  const verify = async (hash: string) =>
    hash === (await sha256Hex(KEY))
      ? ({ status: "valid", keyId: "k" } as const)
      : ({ status: "invalid" } as const);
  it("a valid key on a write gets 403 delegation_required; an invalid one 401", async () => {
    const r = await omniContractNeedsDelegation(
      req("/api/omni/tasks", { bearer: KEY }),
      "tasks:write",
      verify,
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({
      error: "delegation_required",
      needs: "tasks:write",
      authorize: "https://evoomni.tech/omni-authorize",
    });
    expect(
      (
        await omniContractNeedsDelegation(
          req("/x", { bearer: "omni_" + "d".repeat(48) }),
          "safety:emergency-stop",
          verify,
        )
      ).status,
    ).toBe(401);
  });
  it("delegation handlers never accept a metadata key", async () => {
    const { rpc, calls } = fakeRpc({
      omni_delegation_hold_task: HELD,
      omni_delegation_engage_stop: { ok: true },
    });
    expect(
      (await omniDelegatedHoldTask(req("/t", { bearer: KEY, body: TASK_BODY }), rpc)).status,
    ).toBe(401);
    expect((await omniDelegatedStop(req("/s", { bearer: KEY }), rpc, async () => {})).status).toBe(
      401,
    );
    expect(calls).toHaveLength(0);
  });
  it("manifest declares task writes and Stop as delegation-only, no chat or decisions", () => {
    const m = buildManifest("https://evoomni.tech");
    expect(m.capabilities.tasks).toEqual({ read: true, write: true });
    expect(m.capabilities.emergencyStop).toEqual({ read: false, write: true });
    expect(m.capabilities.chat).toEqual({ read: false, write: false });
    expect(m.capabilities.taskDecisions).toEqual({ read: false, write: false });
    expect(m.delegation.supportedScopes).toEqual([
      "tasks:read",
      "tasks:write",
      "safety:emergency-stop",
    ]);
    expect(m.delegation.tokenLifetimeSeconds).toBe(900);
    expect(m.autonomous).toBe(false);
  });
});
