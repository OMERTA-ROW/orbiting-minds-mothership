import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  FUSION_DUO_LIMITS,
  boundReply,
  fusionSessionInput,
  fusionTurnInstructions,
  fusionTurnMessage,
  speakerFor,
} from "./fusion-duo";
import { runDuoTurn, type DuoInference, type DuoRpc } from "./fusion-duo.server";

const SESSION = "11111111-2222-4333-8444-555555555555";
const TURN = "aaaaaaaa-2222-4333-8444-555555555555";

function rpcs(over: Record<string, unknown> = {}) {
  const calls: { who: "owner" | "service"; fn: string; args: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown> = {
    omni_fusion_turn_begin: {
      ok: true,
      turn_id: TURN,
      turn_no: 2,
      max_replies: 4,
      agent_id: "dread",
      topic: "Ship the task view",
      transcript: [{ agent_id: "draco", reply: "Plan: ship behind a flag." }],
    },
    omni_fusion_turn_check: { ok: true },
    omni_fusion_turn_finish: { ok: true, guard_released: true, session_finished: false },
    ...over,
  };
  const make =
    (who: "owner" | "service"): DuoRpc =>
    async (fn, args) => {
      calls.push({ who, fn, args });
      const a = answers[fn];
      return { data: typeof a === "function" ? (a as () => unknown)() : a, error: null };
    };
  return { ownerRpc: make("owner"), serviceRpc: make("service"), calls };
}
const ok = (text = "Risk: the flag may leak.") =>
  vi.fn<DuoInference>(async () => ({
    text,
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    gatewayRunId: "gw",
    failure: undefined,
    threw: false,
  }));
const finish = (calls: ReturnType<typeof rpcs>["calls"]) =>
  calls.find((c) => c.fn === "omni_fusion_turn_finish");

describe("Fusion Dread & Draco limits", () => {
  it("allows 2 to 4 replies per session and a 2,000-character topic", () => {
    const base = { topic: "Plan the rollout", firstAgent: "draco" };
    expect(fusionSessionInput.safeParse({ ...base, maxReplies: 1 }).success).toBe(false);
    expect(fusionSessionInput.safeParse({ ...base, maxReplies: 2 }).success).toBe(true);
    expect(fusionSessionInput.safeParse({ ...base, maxReplies: 4 }).success).toBe(true);
    expect(fusionSessionInput.safeParse({ ...base, maxReplies: 5 }).success).toBe(false);
    expect(
      fusionSessionInput.safeParse({ ...base, topic: "a ".repeat(1001), maxReplies: 2 }).success,
    ).toBe(false);
    expect(
      fusionSessionInput.safeParse({ ...base, firstAgent: "omni", maxReplies: 2 }).success,
    ).toBe(false);
    expect(
      fusionSessionInput.safeParse({
        ...base,
        topic: "use sk-proj-abcdefghijklmnopqrstu",
        maxReplies: 2,
      }).success,
    ).toBe(false);
  });
  it("matches the database limits", () => {
    const sql = readFileSync(
      "drizzle/migrations/0072_omni_fusion_dread_draco_sessions.sql",
      "utf8",
    );
    expect(sql).toContain("max_replies BETWEEN 2 AND 4");
    expect(sql).toContain("length(reply) BETWEEN 1 AND 6000");
    expect(sql).toContain(">= 5 THEN");
    expect(sql).toContain(">= 20 THEN");
    expect(sql).toContain("_s.max_replies + 2");
    expect(FUSION_DUO_LIMITS).toMatchObject({
      maxReplies: 4,
      replyChars: 6000,
      sessionsPerDay: 5,
      repliesPerDay: 20,
      extraAttempts: 2,
    });
  });
  it("alternates speakers from the owner's choice", () => {
    expect([1, 2, 3, 4].map((n) => speakerFor("draco", n))).toEqual([
      "draco",
      "dread",
      "draco",
      "dread",
    ]);
    expect(speakerFor("dread", 1)).toBe("dread");
  });
  it("tells each agent its role, the reply count and that it cannot act", () => {
    const first = fusionTurnInstructions("draco", 1, 4);
    expect(first).toContain("reply 1 of 4");
    expect(first).toContain("propose");
    const last = fusionTurnInstructions("dread", 4, 4);
    expect(last).toContain("final reply");
    expect(last).toContain("agreed and disagreed");
    expect(last).toContain("only the owner can act");
    expect(fusionTurnMessage("Topic", [{ agent_id: "draco", reply: "Idea" }])).toContain(
      "[1. Draco]\nIdea",
    );
  });
  it("trims overlong replies to 6,000 characters", () => {
    expect(boundReply("x ".repeat(5000)).length).toBeLessThanOrEqual(6000);
    expect(boundReply(" short ")).toBe("short");
  });
});

describe("one owner-clicked reply", () => {
  it("runs the agent the database chose, with the session so far, and records the reply", async () => {
    const r = rpcs();
    const infer = ok();
    const out = await runDuoTurn(SESSION, { ...r, infer, apiKey: "k", pollMs: 5 });
    expect(out).toMatchObject({
      ok: true,
      agentId: "dread",
      turnNo: 2,
      reply: "Risk: the flag may leak.",
    });
    const args = infer.mock.calls[0]![0];
    expect(args.persona).toContain("You are Dread");
    expect(args.persona).toContain("reply 2 of 4");
    expect(args.message).toContain("Plan: ship behind a flag.");
    const f = finish(r.calls)!;
    expect(f.who).toBe("service");
    expect(f.args).toMatchObject({
      _turn_id: TURN,
      _status: "completed",
      _reply: "Risk: the flag may leak.",
    });
    // Begin and checks run as the owner, never the service role.
    expect(
      r.calls.filter((c) => c.fn !== "omni_fusion_turn_finish").every((c) => c.who === "owner"),
    ).toBe(true);
  });
  it("refusals (Emergency Stop, limits, busy) mean no model call and nothing recorded", async () => {
    for (const reason of [
      "emergency_stop_engaged",
      "reply_limit",
      "daily_limit",
      "ai_busy_or_paused",
      "attempt_limit",
    ]) {
      const r = rpcs({ omni_fusion_turn_begin: { ok: false, reason } });
      const infer = ok();
      expect(await runDuoTurn(SESSION, { ...r, infer, apiKey: "k" })).toEqual({
        ok: false,
        reason,
      });
      expect(infer).not.toHaveBeenCalled();
      expect(finish(r.calls)).toBeUndefined();
    }
  });
  it("no provider key means nothing starts", async () => {
    const r = rpcs();
    expect(await runDuoTurn(SESSION, { ...r, infer: ok(), apiKey: undefined })).toEqual({
      ok: false,
      reason: "provider_not_configured",
    });
    expect(r.calls).toHaveLength(0);
  });
  it("Emergency Stop during the reply stops it and the text is not kept", async () => {
    let n = 0;
    const r = rpcs({
      omni_fusion_turn_check: () =>
        ++n > 1 ? { ok: false, reason: "emergency_stop_engaged" } : { ok: true },
    });
    const infer = vi.fn<DuoInference>(async ({ signal }) => {
      await new Promise((res) => setTimeout(res, 60));
      return {
        text: signal.aborted ? "partial" : "full",
        finishReason: "stop",
        usage: undefined,
        gatewayRunId: null,
        failure: undefined,
        threw: false,
      };
    });
    const out = await runDuoTurn(SESSION, { ...r, infer, apiKey: "k", pollMs: 5 });
    expect(out).toMatchObject({ ok: false, reason: "emergency_stop_engaged" });
    expect(finish(r.calls)!.args).toMatchObject({ _status: "denied", _reply: null });
  });
  it("a stopped session cancels the reply", async () => {
    const r = rpcs({ omni_fusion_turn_check: { ok: false, reason: "session_stopped" } });
    const out = await runDuoTurn(SESSION, { ...r, infer: ok(), apiKey: "k", pollMs: 5 });
    expect(out).toMatchObject({ ok: false, reason: "session_stopped" });
    expect(finish(r.calls)!.args["_status"]).toBe("cancelled");
  });
  it("credit/permission refusals keep AI paused for owner review", async () => {
    const r = rpcs();
    const infer = vi.fn<DuoInference>(async () => ({
      text: "",
      finishReason: undefined,
      usage: undefined,
      gatewayRunId: null,
      failure: { status: 402, message: "Credits exhausted." },
      threw: true,
    }));
    await runDuoTurn(SESSION, { ...r, infer, apiKey: "k" });
    expect(finish(r.calls)!.args).toMatchObject({ _status: "denied", _pause_status: 402 });
  });
  it("if the outcome can't be recorded, the reply is not shown", async () => {
    const r = rpcs({ omni_fusion_turn_finish: { ok: false, reason: "turn_not_running" } });
    expect(await runDuoTurn(SESSION, { ...r, infer: ok(), apiKey: "k" })).toMatchObject({
      ok: false,
      reason: "outcome_not_recorded",
    });
  });
  it("a malformed database answer releases the guard without calling the model", async () => {
    const r = rpcs({ omni_fusion_turn_begin: { ok: true, turn_id: TURN, agent_id: "omni" } });
    const infer = ok();
    expect(await runDuoTurn(SESSION, { ...r, infer, apiKey: "k" })).toEqual({
      ok: false,
      reason: "check_unavailable",
    });
    expect(infer).not.toHaveBeenCalled();
    expect(finish(r.calls)!.args["_status"]).toBe("failed");
  });
  it("this module has no task, handoff, permit or Stop-changing path", () => {
    const src = readFileSync("src/lib/fusion-duo.server.ts", "utf8");
    const fns = [...src.matchAll(/"(omni_[a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(fns)).toEqual(
      new Set(["omni_fusion_turn_begin", "omni_fusion_turn_check", "omni_fusion_turn_finish"]),
    );
    expect(src).not.toMatch(/jackboy|permit|handoff|emergency_stop\s*=/i);
  });
});
