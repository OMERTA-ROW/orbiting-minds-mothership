import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildManifest } from "./omni-contract";
import {
  DELEGATION_SCOPE_INFO,
  GRANTABLE_SCOPE_CANDIDATES,
  grantableScopes,
  parseAuthorizeRequest,
} from "./omni-delegation";
import { FUSION_PLAN_GATE_RPC, FUSION_PLAN_READY_RPC } from "./omni-fusion";
import { omniFusionPlanRequest, type Rpc } from "./omni-fusion.server";

const TOKEN = `omnid_${"b".repeat(64)}`;
const TASK = "11111111-2222-4333-8444-555555555555";

function req(body: unknown = { taskId: TASK }, headers: Record<string, string> = {}) {
  return new Request("https://evoomni.tech/api/omni/fusion/plans", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Database stand-in: install marker plus a scripted gate answer; records every call. */
function db(gate: { data: unknown; error: unknown } | "throw", installed = true) {
  const calls: string[] = [];
  const rpc: Rpc = async (fn) => {
    calls.push(fn);
    if (fn === FUSION_PLAN_READY_RPC) return { data: installed, error: null };
    if (fn === FUSION_PLAN_GATE_RPC) {
      if (gate === "throw") throw new Error("down");
      return gate;
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc, calls };
}

const authorize = {
  response_type: "code",
  client_id: "omni-web",
  redirect_uri: "https://omni-orbit-command-companion.lovable.app/mothership/callback",
  state: "state-value-1234567890",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
};

afterEach(() => vi.restoreAllMocks());

describe("fusion:plan consent", () => {
  it("is grantable only after its own install, never through chat:write", () => {
    expect(grantableScopes(false)).not.toContain("fusion:plan");
    expect(grantableScopes(true)).not.toContain("fusion:plan");
    expect(grantableScopes(false, true)).toContain("fusion:plan");
    expect(grantableScopes(false, true)).not.toContain("chat:write");
    expect(GRANTABLE_SCOPE_CANDIDATES).toContain("fusion:plan");
  });

  it("is a separate checkbox: asking for it grants nothing else", () => {
    const before = parseAuthorizeRequest(
      { ...authorize, scope: "fusion:plan" },
      grantableScopes(false),
    );
    expect(before.ok && before.supported).toEqual([]);
    const after = parseAuthorizeRequest(
      { ...authorize, scope: "fusion:plan tasks:approve" },
      grantableScopes(false, true),
    );
    expect(after.ok && after.supported).toEqual(["fusion:plan"]);
    expect(after.ok && after.unsupported).toEqual(["tasks:approve"]);
  });

  it("tells the owner what it cannot do", () => {
    const info = DELEGATION_SCOPE_INFO["fusion:plan"];
    expect(info.effect).toMatch(/can't start or hand off work/);
    expect(info.effect).toMatch(/paid AI/);
    expect(info.effect).toMatch(/Emergency Stop/);
    expect(info.needsInstall).toMatch(/0067/);
  });
});

describe("POST /api/omni/fusion/plans", () => {
  it("never starts work or spends: an admitted request is 503 planner_not_available", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const d = db({ data: { ok: true, planner: "not_available", delegation_id: "x" }, error: null });
    const res = await omniFusionPlanRequest(req(), d.rpc);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: "planner_not_available" });
    for (const key of ["plan", "steps", "runId", "jobId", "costUsd", "permit"])
      expect(body).not.toHaveProperty(key);
    expect(d.calls).toEqual([FUSION_PLAN_READY_RPC, FUSION_PLAN_GATE_RPC]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("still claims no plan if the database ever answers with an unknown planner state", async () => {
    const d = db({ data: { ok: true, planner: "ready", steps: [1] }, error: null });
    const res = await omniFusionPlanRequest(req(), d.rpc);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "planner_not_available" });
  });

  it("refuses while the Emergency Stop is engaged or unreadable (423)", async () => {
    const d = db({ data: { ok: false, reason: "emergency_stop_engaged" }, error: null });
    const res = await omniFusionPlanRequest(req(), d.rpc);
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ error: "emergency_stop_engaged" });
  });

  it("refuses a delegation without fusion:plan (403)", async () => {
    const res = await omniFusionPlanRequest(
      req(),
      db({ data: { ok: false, reason: "scope_missing" }, error: null }).rpc,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "scope_missing" });
  });

  it.each(["invalid", "revoked", "expired", "wrong_audience", "owner_unverified"])(
    "refuses a %s delegation (401)",
    async (reason) => {
      const res = await omniFusionPlanRequest(
        req(),
        db({ data: { ok: false, reason }, error: null }).rpc,
      );
      expect(res.status).toBe(401);
    },
  );

  it("fails closed when the gate is unreachable or errors (503)", async () => {
    expect((await omniFusionPlanRequest(req(), db("throw").rpc)).status).toBe(503);
    expect(
      (await omniFusionPlanRequest(req(), db({ data: null, error: { message: "x" } }).rpc)).status,
    ).toBe(503);
  });

  it("answers not_available before 0067 and never calls the gate", async () => {
    const d = db({ data: { ok: true }, error: null }, false);
    const res = await omniFusionPlanRequest(req(), d.rpc);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "not_available" });
    expect(d.calls).toEqual([FUSION_PLAN_READY_RPC]);
  });

  it("refuses browsers, missing tokens, metadata keys and bad bodies without calling the gate", async () => {
    const cases: [Request, number][] = [
      [req(undefined, { origin: "https://example.com" }), 403],
      [req(undefined, { authorization: "" }), 401],
      [req(undefined, { authorization: `Bearer omni_${"c".repeat(40)}` }), 401],
      [req({ taskId: "not-a-uuid" }), 400],
      [req({ taskId: TASK, run: true }), 400],
      [req("{"), 400],
      [req(JSON.stringify({ taskId: TASK, pad: "x".repeat(3000) })), 413],
    ];
    for (const [request, status] of cases) {
      const d = db({ data: { ok: true }, error: null });
      expect((await omniFusionPlanRequest(request, d.rpc)).status).toBe(status);
      expect(d.calls).not.toContain(FUSION_PLAN_GATE_RPC);
    }
  });
});

describe("no execution path", () => {
  const code = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  const imports = (src: string) =>
    [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);

  it("Fusion modules import only the delegation check, hashing and the database client", () => {
    expect(imports(code("./omni-fusion.ts")).sort()).toEqual(["zod"]);
    expect(imports(code("./omni-fusion.server.ts")).sort()).toEqual([
      "./omni-api-keys",
      "./omni-delegation",
      "./omni-fusion",
      "@/integrations/supabase/client.server",
    ]);
    expect(imports(code("../routes/api/omni/fusion/plans.ts")).sort()).toEqual([
      "@/lib/omni-contract.server",
      "@/lib/omni-delegation",
      "@/lib/omni-fusion.server",
      "@tanstack/react-router",
    ]);
  });

  it("calls no network, model, task, handoff, permit or Stop function", () => {
    const src = code("./omni-fusion.server.ts") + code("./omni-fusion.ts");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(
      /jackboy|executor|handoff|permit|hold_task|engage_stop|begin_chat|stop_release|createOmniCall|ai-gateway/i,
    );
    const rpcNames = [...src.matchAll(/"(omni_[a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(rpcNames)).toEqual(new Set([FUSION_PLAN_GATE_RPC, FUSION_PLAN_READY_RPC]));
  });
});

describe("manifest", () => {
  it("offers fusion:plan only after 0067 and never claims orchestration", () => {
    const before = buildManifest("https://evoomni.tech", {
      aiConfigured: true,
      chatInstalled: false,
    });
    expect(before.delegation.supportedScopes).not.toContain("fusion:plan");
    expect(before.orchestrationStatus.permission.state).toBe("not_installed");
    const after = buildManifest("https://evoomni.tech", {
      aiConfigured: true,
      chatInstalled: false,
      fusionPlanInstalled: true,
    });
    expect(after.delegation.supportedScopes).toContain("fusion:plan");
    expect(after.orchestrationStatus).toMatchObject({
      state: "not_available",
      permission: {
        scope: "fusion:plan",
        path: "/api/omni/fusion/plans",
        state: "planner_not_available",
        canStartWork: false,
        canSpend: false,
        canChangeEmergencyStop: false,
        canApprove: false,
        plannerBuilt: false,
      },
    });
    expect(after).not.toHaveProperty("orchestration");
    expect(after.autonomous).toBe(false);
  });
});
