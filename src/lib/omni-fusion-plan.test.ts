import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FUSION_PLAN_CONTEXT_RPC,
  FUSION_PLAN_GATE_RPC,
  FUSION_PLAN_READY_RPC,
  FUSION_PLANNER_READY_RPC,
} from "./omni-fusion";
import {
  FUSION_PLAN_SCHEMA,
  buildFusionPlan,
  canonicalPlanInput,
  planContextSchema,
  type FusionPlan,
  type PlanContext,
} from "./omni-fusion-plan";
import { omniFusionPlanRequest, type Rpc } from "./omni-fusion.server";

const TOKEN = `omnid_${"b".repeat(64)}`;
const TASK = "11111111-2222-4333-8444-555555555555";
const DIGEST = "a".repeat(64);
const TEXT_MARKER = "SECRET-TASK-TEXT-should-never-appear";

function context(over: Record<string, unknown> = {}, task: Record<string, unknown> = {}) {
  return {
    ok: true,
    delegation_id: "99999999-2222-4333-8444-555555555555",
    scopes: ["fusion:plan"],
    task: {
      id: TASK,
      agentId: "sabrina",
      kind: "agent.handoff",
      state: "held",
      hasRepository: false,
      createdAt: "2026-11-20T18:00:00.123456+00:00",
      inputDigest: DIGEST,
      ...task,
    },
    stopCheckedAt: "2026-11-20T18:59:00.5+00:00",
    plansUsed: 1,
    dailyLimit: 10,
    ...over,
  };
}

function req(body: unknown = { taskId: TASK }) {
  return new Request("https://evoomni.tech/api/omni/fusion/plans", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Database stand-in with both installs (0067 + 0069) and a scripted context answer. */
function db(answer: { data: unknown; error: unknown } | "throw") {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (fn === FUSION_PLAN_READY_RPC || fn === FUSION_PLANNER_READY_RPC)
      return { data: true, error: null };
    if (fn === FUSION_PLAN_CONTEXT_RPC) {
      if (answer === "throw") throw new Error("down");
      return answer;
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc, calls };
}

const ok = (over?: Record<string, unknown>, task?: Record<string, unknown>) =>
  db({ data: context(over, task), error: null });

async function plan(d = ok()): Promise<FusionPlan> {
  const res = await omniFusionPlanRequest(req(), d.rpc);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; plan: FusionPlan };
  expect(body.ok).toBe(true);
  return body.plan;
}

const parsed = (over?: Record<string, unknown>, task?: Record<string, unknown>) =>
  planContextSchema.parse(context(over, task)) as PlanContext;

afterEach(() => vi.restoreAllMocks());

describe("Fusion rules-only plan (0069 installed)", () => {
  it("returns an omni.fusion-plan/v1 proposal from one database call, with no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const d = ok();
    const p = await plan(d);
    expect(p).toMatchObject({
      schema: FUSION_PLAN_SCHEMA,
      rulesVersion: 1,
      mode: "rules_only",
      status: "proposed",
      persisted: false,
      task: { id: TASK, agentId: "sabrina", agentName: "Sabrina", state: "held" },
      emergencyStop: { state: "released", checkedAt: "2026-11-20T18:59:00.500Z" },
    });
    expect(d.calls.map((c) => c.fn)).toEqual([
      FUSION_PLAN_READY_RPC,
      FUSION_PLANNER_READY_RPC,
      FUSION_PLAN_CONTEXT_RPC,
    ]);
    expect(d.calls[2]?.args).toMatchObject({ _task_id: TASK, _audience: "omni-mothership" });
    expect(d.calls[2]?.args["_token_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(d.calls.map((c) => c.fn)).not.toContain(FUSION_PLAN_GATE_RPC);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("orders responsibilities, dependencies and checkpoints; Fusion runs no step", async () => {
    const p = await plan();
    expect(p.steps.map((s) => s.id)).toEqual([
      "owner_review",
      "owner_handover",
      "jackboy_admission",
      "agent_work",
      "owner_result_review",
    ]);
    expect(p.steps.map((s) => s.dependsOn)).toEqual([
      [],
      ["owner_review"],
      ["owner_handover"],
      ["jackboy_admission"],
      ["agent_work"],
    ]);
    expect(p.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(p.steps.every((s) => s.fusionCanRun === false)).toBe(true);
    expect(p.steps.map((s) => s.state)).toEqual([
      "waiting_on_owner",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
    // The assigned agent keeps its identity; Jackboy admits; the owner decides.
    expect(p.steps[3]?.responsible).toEqual({ kind: "agent", agentId: "sabrina", name: "Sabrina" });
    expect(p.steps[2]?.responsible).toMatchObject({ kind: "agent", agentId: "jackboy" });
    expect(p.steps[0]?.responsible.kind).toBe("owner");
    const kinds = p.steps.flatMap((s) => s.checkpoints.map((c) => c.kind));
    for (const k of [
      "owner_review",
      "owner_fresh_code",
      "emergency_stop",
      "owner_passkey",
      "spend_caps",
    ])
      expect(kinds).toContain(k);
    expect(
      p.steps.flatMap((s) => s.checkpoints).every((c) => c.decidedBy !== ("fusion" as never)),
    ).toBe(true);
  });

  it("claims no consulted agents or models, no cost and lists unbuilt capabilities as planned", async () => {
    const p = await plan();
    expect(p.consulted).toEqual({ agents: [], models: [], knowledgeSources: [] });
    expect(p.cost).toEqual({
      fusionUsd: 0,
      modelCalls: 0,
      jobCaps: { perAiCallUsd: 0.5, reservedPerJobUsd: 1, perDayUsd: 5, maxActiveJobs: 1 },
    });
    expect(p.limits).toEqual({
      plansPerDay: 10,
      plansUsedToday: 1,
      canStartWork: false,
      canSpend: false,
      canApprove: false,
      canChangeEmergencyStop: false,
      callsModels: false,
      consultsAgents: false,
    });
    expect(p.unavailable.map((u) => u.capability)).toEqual([
      "compare_responses",
      "shared_knowledge",
      "maintenance_coordination",
      "plan_records",
      "owner_plan_acceptance",
    ]);
    expect(p.unavailable.every((u) => u.state === "planned")).toBe(true);
    for (const key of ["runId", "jobId", "permit", "approved", "started"])
      expect(JSON.stringify(p)).not.toContain(`"${key}"`);
  });

  it("is deterministic: same facts give the same planId; any planner input changes it", () => {
    const base = parsed();
    const hash = (c: PlanContext) =>
      createHash("sha256").update(canonicalPlanInput(c)).digest("hex");
    const a = buildFusionPlan(base, hash(base), 1_000);
    const b = buildFusionPlan(base, hash(base), 9_999_999);
    expect({ ...a, generatedAt: "" }).toEqual({ ...b, generatedAt: "" });
    expect(a.planId).toBe(`fp_${hash(base).slice(0, 32)}`);
    const variants = [
      parsed({}, { agentId: "hercules" }),
      parsed({}, { inputDigest: "b".repeat(64) }),
      parsed({}, { kind: "code.test", agentId: "jackboy" }),
      parsed({}, { hasRepository: true }),
      parsed({ scopes: ["fusion:plan", "tasks:read"] }),
    ];
    for (const v of variants) expect(hash(v)).not.toBe(hash(base));
    // Daily usage and Stop time are reported but do not change the proposal's identity.
    expect(hash(parsed({ plansUsed: 7, stopCheckedAt: "2026-11-21T00:00:00Z" }))).toBe(hash(base));
  });

  it("reflects the delegation's permissions for status visibility", async () => {
    expect((await plan()).statusVisibility).toEqual({
      omniWebCanReadStatus: false,
      path: null,
      reason: expect.stringContaining("lacks tasks:read"),
    });
    expect(
      (await plan(ok({ scopes: ["fusion:plan", "tasks:read"] }))).statusVisibility,
    ).toMatchObject({
      omniWebCanReadStatus: true,
      path: "/api/omni/held-tasks",
    });
  });

  it("CODE tasks are Jackboy's own work and mention repository authorization only when set", async () => {
    const p = await plan(ok({}, { agentId: "jackboy", kind: "code.debug", hasRepository: true }));
    expect(p.steps[3]?.responsible).toMatchObject({ agentId: "jackboy", name: "Jackboy" });
    expect(p.steps[3]?.action).toMatch(/debug work/);
    expect(p.steps[3]?.action).toMatch(/repository access/);
    const q = await plan(ok({}, { agentId: "jackboy", kind: "code.test" }));
    expect(q.steps[3]?.action).not.toMatch(/repository/);
  });

  it("never echoes task text; only the digest", async () => {
    const res = await omniFusionPlanRequest(req(), ok().rpc);
    const text = await res.text();
    expect(text).not.toContain(TEXT_MARKER);
    expect(text).toContain(DIGEST);
    expect(text).not.toMatch(/"(title|instruction|instructions)"/);
  });

  it.each([
    ["task_not_found", 404],
    ["task_not_held", 409],
    ["task_already_handed_off", 409],
    ["daily_limit", 429],
    ["emergency_stop_engaged", 423],
    ["scope_missing", 403],
    ["invalid_request", 400],
    ["invalid", 401],
    ["revoked", 401],
    ["expired", 401],
    ["wrong_audience", 401],
    ["owner_unverified", 401],
  ])("database refusal %s answers %i with no plan", async (reason, status) => {
    const res = await omniFusionPlanRequest(
      req(),
      db({ data: { ok: false, reason }, error: null }).rpc,
    );
    expect(res.status).toBe(status);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect(body).not.toHaveProperty("plan");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["another task", context({}, { id: "22222222-2222-4333-8444-555555555555" })],
    ["an unregistered agent", context({}, { agentId: "omni-x" })],
    ["a cancelled task", context({}, { state: "cancelled" })],
    ["task text", context({}, { instructions: TEXT_MARKER })],
    ["injected steps", context({ steps: [{ id: "run" }] })],
    ["no fusion:plan scope", context({ scopes: ["tasks:read"] })],
    ["an unknown scope", context({ scopes: ["fusion:plan", "admin"] })],
    ["usage over the limit", context({ plansUsed: 11 })],
    ["a different limit", context({ dailyLimit: 1000 })],
    ["a bad digest", context({}, { inputDigest: "xyz" })],
    ["a bad Stop time", context({ stopCheckedAt: "later" })],
  ])("a tampered database answer (%s) never becomes a plan", async (_label, data) => {
    const res = await omniFusionPlanRequest(req(), db({ data, error: null }).rpc);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "fusion_unavailable" });
  });

  it("fails closed when the context check errors or is unreachable", async () => {
    expect((await omniFusionPlanRequest(req(), db("throw").rpc)).status).toBe(503);
    expect(
      (await omniFusionPlanRequest(req(), db({ data: null, error: { message: "x" } }).rpc)).status,
    ).toBe(503);
  });

  it("rejects bad bodies before any task check", async () => {
    for (const body of [
      {},
      { taskId: "x" },
      { taskId: TASK, steps: [] },
      { taskId: TASK, agent: "jax" },
    ]) {
      const d = ok();
      expect((await omniFusionPlanRequest(req(body), d.rpc)).status).toBe(400);
      expect(d.calls.map((c) => c.fn)).not.toContain(FUSION_PLAN_CONTEXT_RPC);
    }
  });

  it("refuses an invalid digest at build time", () => {
    expect(() => buildFusionPlan(parsed(), "nope", 0)).toThrow();
  });
});
