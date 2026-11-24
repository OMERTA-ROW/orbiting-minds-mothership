import { describe, expect, it } from "vitest";
import { nativeChatBodySchema } from "./omni-native-chat";
import { runNativeChat, type NativeChatDeps } from "./omni-native-chat.server";

const DEVICE = "0f0e0d0c-0b0a-4908-8706-050403020100";
const IDENTITY = { fingerprint: "a".repeat(64), revision: 3 };
const INPUT = nativeChatBodySchema.parse({
  protocol: "omni.native-chat/v1",
  requestId: "a1b2c3d4-e5f6-4789-8abc-123456789012",
  sessionId: "b1b2c3d4-e5f6-4789-8abc-123456789012",
  projectId: "c1b2c3d4-e5f6-4789-8abc-123456789012",
  agentId: "omni",
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: "Summarize the project briefly." }],
  consent: true,
  autonomous: false,
});

function harness(
  over: {
    begin?: Record<string, unknown>;
    reserve?: Record<string, unknown>;
    check?: Record<string, unknown>;
    settlement?: Record<string, unknown>;
    finish?: Record<string, unknown>;
  } = {},
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc: NonNullable<NativeChatDeps["rpc"]> = async (fn, args) => {
    calls.push({ fn, args });
    const data =
      fn === "omni_native_bound_chat_begin"
        ? (over.begin ?? {
            ok: true,
            run_id: "d1b2c3d4-e5f6-4789-8abc-123456789012",
            project_name: "Orbiting Minds",
            project_brief: "A private owner project.",
          })
        : fn === "claude_reserve_native_chat"
          ? (over.reserve ?? { ok: true, estimate_cents: 2 })
          : fn === "omni_native_chat_check"
            ? (over.check ?? { ok: true })
            : fn === "claude_settle_source"
              ? (over.settlement ?? { ok: true, actual_cents: 1 })
              : fn === "omni_native_chat_finish_authorized"
                ? (over.finish ?? { ok: true, guard_released: true, final_status: "completed" })
                : { ok: false, reason: "unknown_rpc" };
    return { data, error: null };
  };
  let fetchCalls = 0;
  const claudeFetch: typeof fetch = async (_url, init) => {
    fetchCalls++;
    expect(init?.headers).toMatchObject({ "x-api-key": "test-key" });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body["tools"]).toBeUndefined();
    expect(body["max_tokens"]).toBe(1024);
    return Response.json({
      content: [{ type: "text", text: "A settled response." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 120, output_tokens: 12 },
    });
  };
  return { calls, fetchCalls: () => fetchCalls, deps: { rpc, claudeFetch } };
}

describe("native OMNI chat", () => {
  it("uses the owner project and Claude ledger, then returns only after settlement", async () => {
    const h = harness();
    const result = await runNativeChat(DEVICE, IDENTITY, INPUT, new AbortController().signal, {
      ...h.deps,
      anthropicKey: () => "test-key",
    });
    expect(result).toMatchObject({
      ok: true,
      protocol: "omni.native-chat/v1",
      reply: "A settled response.",
      transcriptStored: false,
      toolsAvailable: false,
      taskExecutionAvailable: false,
      streaming: "settlement-gated",
    });
    expect(h.fetchCalls()).toBe(1);
    const begin = h.calls.find((call) => call.fn === "omni_native_bound_chat_begin");
    expect(begin?.args).toMatchObject({
      _device: DEVICE,
      _fingerprint: IDENTITY.fingerprint,
      _revision: IDENTITY.revision,
      _request_id: INPUT.requestId,
      _session_id: INPUT.sessionId,
      _project_id: INPUT.projectId,
      _agent_id: "omni",
      _model: "claude-sonnet-5-5",
    });
    expect(begin?.args).not.toHaveProperty("_messages");
    const reserve = h.calls.find((call) => call.fn === "claude_reserve_native_chat");
    expect(reserve?.args["_input_chars"]).toBeGreaterThan(INPUT.messages[0]!.content.length);
    expect((reserve?.args["_input_chars"] as number) / 3).toBeGreaterThanOrEqual(
      new TextEncoder().encode(INPUT.messages[0]!.content).byteLength,
    );
    expect(h.calls.map((call) => call.fn)).toEqual([
      "omni_native_bound_chat_begin",
      "claude_reserve_native_chat",
      "omni_native_chat_check",
      "omni_native_chat_check",
      "claude_settle_source",
      "omni_native_chat_finish_authorized",
    ]);
    expect(h.calls.find((call) => call.fn === "claude_settle_source")?.args).toMatchObject({
      _source: "native",
      _status: "completed",
      _input_tokens: 120,
      _output_tokens: 12,
    });
  });

  it("does not call Anthropic when owner permission or Emergency Stop checks fail", async () => {
    const denied = harness({ begin: { ok: false, reason: "not_permitted" } });
    const deniedResult = await runNativeChat(
      DEVICE,
      IDENTITY,
      INPUT,
      new AbortController().signal,
      {
        ...denied.deps,
        anthropicKey: () => "test-key",
      },
    );
    expect(deniedResult).toMatchObject({ ok: false, reason: "not_permitted" });
    expect(denied.fetchCalls()).toBe(0);

    const stopped = harness({ check: { ok: false, reason: "emergency_stop_engaged" } });
    const stoppedResult = await runNativeChat(
      DEVICE,
      IDENTITY,
      INPUT,
      new AbortController().signal,
      {
        ...stopped.deps,
        anthropicKey: () => "test-key",
      },
    );
    expect(stoppedResult).toMatchObject({ ok: false, reason: "emergency_stop_engaged" });
    expect(stopped.fetchCalls()).toBe(0);
    expect(stopped.calls.find((call) => call.fn === "claude_settle_source")?.args).toMatchObject({
      _status: "failed",
    });
  });

  it("withholds the reply and preserves the guard if settlement is not recorded", async () => {
    const h = harness({
      settlement: { ok: false, reason: "not_reserved" },
      finish: { ok: true, guard_released: false, final_status: "completed" },
    });
    const result = await runNativeChat(DEVICE, IDENTITY, INPUT, new AbortController().signal, {
      ...h.deps,
      anthropicKey: () => "test-key",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "outcome_not_recorded",
      status: 503,
    });
    expect(result).not.toHaveProperty("reply");
    expect(
      h.calls.find((call) => call.fn === "omni_native_chat_finish_authorized")?.args,
    ).toMatchObject({
      _release_guard: false,
    });
  });

  it("withholds a settled reply when the device changes during finalization", async () => {
    const h = harness({
      finish: {
        ok: true,
        guard_released: true,
        final_status: "denied",
        authorization_reason: "device_rotated",
      },
    });
    const result = await runNativeChat(DEVICE, IDENTITY, INPUT, new AbortController().signal, {
      ...h.deps,
      anthropicKey: () => "test-key",
    });
    expect(result).toMatchObject({ ok: false, reason: "device_rotated", status: 409 });
    expect(result).not.toHaveProperty("reply");
    expect(h.calls.map((call) => call.fn)).toContain("claude_settle_source");
  });

  it("does not retry a duplicate request or exceed the per-call cap", async () => {
    const duplicate = harness({ begin: { ok: false, reason: "duplicate_request" } });
    expect(
      await runNativeChat(DEVICE, IDENTITY, INPUT, new AbortController().signal, {
        ...duplicate.deps,
        anthropicKey: () => "test-key",
      }),
    ).toMatchObject({ ok: false, reason: "duplicate_request", status: 409 });
    expect(duplicate.fetchCalls()).toBe(0);

    const overCap = harness({ reserve: { ok: true, estimate_cents: 51 } });
    const result = await runNativeChat(DEVICE, IDENTITY, INPUT, new AbortController().signal, {
      ...overCap.deps,
      anthropicKey: () => "test-key",
    });
    expect(result).toMatchObject({ ok: false, reason: "reservation_invalid" });
    expect(overCap.fetchCalls()).toBe(0);
    expect(
      overCap.calls.find((call) => call.fn === "omni_native_chat_finish_authorized")?.args,
    ).toMatchObject({
      _release_guard: true,
    });
  });
});
