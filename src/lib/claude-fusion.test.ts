/** Claude for Dread/Draco Fusion turns (migration 0075): engine bound at approval, reserve → call → settle once. */
import { describe, expect, it, vi } from "vitest";
import { fusionClaudeWorstCaseCents, fusionReasonText, fusionSessionInput } from "./fusion-duo";
import { runDuoTurn, type DuoInference, type DuoRpc } from "./fusion-duo.server";

const SESSION = "11111111-2222-4333-8444-555555555555";
const TURN = "aaaaaaaa-2222-4333-8444-555555555555";
const KEY = "sk-ant-test-" + "f".repeat(40);
const DEFAULT = "openai/gpt-6-astra";
const SONNET = "claude-sonnet-5-5";

/** `model: null` = a turn from before 0075 (no engine field). */
function rpcs(over: Record<string, unknown> = {}, model: string | null = SONNET) {
  const calls: { who: "owner" | "service"; fn: string; args: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown> = {
    omni_fusion_turn_begin: {
      ok: true,
      turn_id: TURN,
      turn_no: 2,
      max_replies: 4,
      agent_id: "dread",
      ...(model === null ? {} : { model }),
      topic: "Ship the task view",
      transcript: [{ agent_id: "draco", reply: "Plan: ship behind a flag." }],
    },
    omni_fusion_turn_check: { ok: true },
    omni_fusion_turn_finish: { ok: true, guard_released: true, session_finished: false },
    claude_reserve_fusion_turn: { ok: true, estimate_cents: 3 },
    claude_settle_source: { ok: true, actual_cents: 2 },
    ...over,
  };
  const make =
    (who: "owner" | "service"): DuoRpc =>
    async (fn, args) => {
      calls.push({ who, fn, args });
      const a = answers[fn];
      if (a === undefined) return { data: null, error: { message: "missing" } };
      return { data: typeof a === "function" ? (a as () => unknown)() : a, error: null };
    };
  return { ownerRpc: make("owner"), serviceRpc: make("service"), calls };
}
const claudeOk = () =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Dread: the flag needs a rollback owner." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 40, output_tokens: 12 },
        }),
        { status: 200 },
      ),
  );
const finishOf = (calls: ReturnType<typeof rpcs>["calls"]) =>
  calls.find((c) => c.fn === "omni_fusion_turn_finish")!.args;

describe("Fusion approval with engines", () => {
  it("accepts exact engine IDs only", () => {
    const base = { topic: "Plan", firstAgent: "draco", maxReplies: 4 };
    expect(fusionSessionInput.safeParse({ ...base, dreadEngine: SONNET }).success).toBe(true);
    expect(fusionSessionInput.safeParse({ ...base, dreadEngine: "claude-haiku-5-5" }).success).toBe(
      false,
    );
    expect(
      fusionSessionInput.safeParse({ ...base, dracoEngine: "Claude-Sonnet-5-5" }).success,
    ).toBe(false);
  });
  it("shows the most a session can cost on Claude", () => {
    // Draco starts, 4 replies: Dread speaks replies 2 and 4, plus 2 possible retries, at 50 cents each.
    expect(fusionClaudeWorstCaseCents("draco", 4, { dread: SONNET, draco: DEFAULT })).toBe(200);
    expect(fusionClaudeWorstCaseCents("draco", 4, { dread: SONNET, draco: SONNET })).toBe(300);
    expect(fusionClaudeWorstCaseCents("dread", 3, { dread: SONNET, draco: DEFAULT })).toBe(200);
    expect(fusionClaudeWorstCaseCents("draco", 4, { dread: DEFAULT, draco: DEFAULT })).toBe(0);
  });
  it("explains Claude refusals in plain words", () => {
    expect(fusionReasonText("daily_cap")).toContain("$5");
    expect(fusionReasonText("engine_not_enabled")).toContain("not turned on");
  });
});

describe("Claude-bound Fusion turn", () => {
  it("reserves, calls once, settles once and attributes the reply", async () => {
    const r = rpcs();
    const f = claudeOk();
    const infer = vi.fn();
    const out = await runDuoTurn(SESSION, {
      ...r,
      apiKey: "lovable",
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
      infer: infer as unknown as DuoInference,
    });
    expect(out).toMatchObject({
      ok: true,
      reply: "Dread: the flag needs a rollback owner.",
      engine: SONNET,
      attribution: "Claude Sonnet 5.5 (Anthropic) via Dread",
      cost: { estimateCents: 3, actualCents: 2 },
    });
    expect(infer).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
    const order = r.calls.map((c) => `${c.who}:${c.fn}`);
    expect(order.indexOf("service:claude_reserve_fusion_turn")).toBeLessThan(
      order.indexOf("service:claude_settle_source"),
    );
    expect(order.indexOf("service:claude_settle_source")).toBeLessThan(
      order.indexOf("service:omni_fusion_turn_finish"),
    );
    expect(order.filter((x) => x === "service:claude_settle_source")).toHaveLength(1);
    expect(r.calls.find((c) => c.fn === "claude_settle_source")!.args).toMatchObject({
      _source: "fusion",
      _run_id: TURN,
      _status: "completed",
      _input_tokens: 40,
      _output_tokens: 12,
    });
    expect(finishOf(r.calls)["_status"]).toBe("completed");
    expect(JSON.stringify(r.calls)).not.toContain(KEY);
  });

  it("never calls Anthropic when the reservation is refused", async () => {
    const r = rpcs({
      claude_reserve_fusion_turn: { ok: false, reason: "daily_cap", estimate_cents: 3 },
    });
    const f = claudeOk();
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "daily_cap" });
    expect(f).not.toHaveBeenCalled();
    expect(r.calls.some((c) => c.fn === "claude_settle_source")).toBe(false);
    expect(finishOf(r.calls)).toMatchObject({
      _status: "denied",
      _error_reason: "daily_cap",
      _reply: null,
    });
  });

  it("fails closed when the reservation function isn't installed", async () => {
    const r = rpcs({ claude_reserve_fusion_turn: undefined });
    const f = claudeOk();
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "claude_not_installed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("records the turn as not configured when the Anthropic key is missing", async () => {
    const r = rpcs();
    const f = claudeOk();
    const out = await runDuoTurn(SESSION, {
      ...r,
      apiKey: "lovable",
      claudeFetch: f as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "provider_not_configured" });
    expect(f).not.toHaveBeenCalled();
    expect(r.calls.some((c) => c.fn === "claude_reserve_fusion_turn")).toBe(false);
  });

  it("stops within a second when the Emergency Stop is engaged and charges the estimate", async () => {
    let checks = 0;
    const r = rpcs({
      omni_fusion_turn_check: () =>
        ++checks >= 1 ? { ok: false, reason: "emergency_stop_engaged" } : { ok: true },
    });
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Stopped", "AbortError")),
          );
        }),
    );
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
      pollMs: 20,
    });
    expect(out).toMatchObject({ ok: false, reason: "emergency_stop_engaged" });
    expect(r.calls.find((c) => c.fn === "claude_settle_source")!.args).toMatchObject({
      _status: "failed",
      _input_tokens: null,
    });
    expect(finishOf(r.calls)).toMatchObject({ _status: "denied", _reply: null });
  });

  it("settles a stopped session as cancelled", async () => {
    const r = rpcs({ omni_fusion_turn_check: { ok: false, reason: "session_stopped" } });
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Stopped", "AbortError")),
          );
        }),
    );
    await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
      pollMs: 20,
    });
    expect(r.calls.find((c) => c.fn === "claude_settle_source")!.args["_status"]).toBe("cancelled");
    expect(finishOf(r.calls)["_status"]).toBe("cancelled");
  });

  it("settles provider errors as failed and never retries", async () => {
    const r = rpcs();
    const f = vi.fn(async () => new Response("{}", { status: 529 }));
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "provider_error" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.calls.find((c) => c.fn === "claude_settle_source")!.args["_status"]).toBe("failed");
    expect(finishOf(r.calls)["_status"]).toBe("failed");
  });

  it("withholds the reply when its cost can't be recorded", async () => {
    const r = rpcs({ claude_settle_source: { ok: false, reason: "not_reserved" } });
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: claudeOk() as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "outcome_not_recorded" });
    expect(finishOf(r.calls)).toMatchObject({
      _status: "failed",
      _reply: null,
      _error_reason: "outcome_not_recorded",
    });
  });

  it("keeps the current engine for turns without a bound Claude model (before 0075)", async () => {
    const r = rpcs({}, null);
    const f = claudeOk();
    const infer = vi.fn(async () => ({
      text: "Default reply.",
      finishReason: "stop",
      usage: undefined,
      gatewayRunId: "gw",
      failure: undefined,
      threw: false,
    }));
    const out = await runDuoTurn(SESSION, {
      ...r,
      apiKey: "lovable",
      anthropicKey: KEY,
      claudeFetch: f as unknown as typeof fetch,
      infer: infer as unknown as DuoInference,
    });
    expect(out).toMatchObject({
      ok: true,
      engine: DEFAULT,
      attribution: "OMNI model (Lovable AI) via Dread",
    });
    expect(f).not.toHaveBeenCalled();
    expect(r.calls.some((c) => c.fn.startsWith("claude_"))).toBe(false);
  });

  it("refuses an unknown engine name from the database", async () => {
    const r = rpcs({}, "claude-haiku-5-5");
    const out = await runDuoTurn(SESSION, {
      ...r,
      anthropicKey: KEY,
      claudeFetch: claudeOk() as unknown as typeof fetch,
    });
    expect(out).toMatchObject({ ok: false, reason: "check_unavailable" });
    expect(r.calls.some((c) => c.fn.startsWith("claude_"))).toBe(false);
  });
});
