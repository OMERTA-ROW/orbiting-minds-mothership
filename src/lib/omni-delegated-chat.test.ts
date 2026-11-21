import { describe, expect, it, vi } from "vitest";
import { buildManifest } from "./omni-contract";
import { grantableScopes, parseAuthorizeRequest } from "./omni-delegation";
import {
  CHAT_MODEL_REF,
  DELEGATED_CHAT_LIMITS,
  resolveChatModel,
  selectChatContext,
} from "./omni-delegated-chat";
import {
  omniDelegatedChat,
  type ChatInference,
  type InferenceResult,
} from "./omni-delegated-chat.server";

const TOKEN = `omnid_${"a".repeat(64)}`;
const RUN = "11111111-2222-4333-8444-555555555555";
const body = (over: Record<string, unknown> = {}) => ({
  agentId: "omni",
  messages: [{ role: "user", content: "Hello OMNI" }],
  autonomous: false,
  source: "omni-web",
  ...over,
});
function req(b: unknown, headers: Record<string, string> = {}) {
  return new Request("https://evoomni.tech/api/omni/chat", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });
}
const reply = (over: Partial<InferenceResult> = {}): InferenceResult => ({
  text: "Hi, owner.",
  finishReason: "stop",
  usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
  gatewayRunId: "run-1",
  failure: undefined,
  threw: false,
  ...over,
});
function fakeRpc(over: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown> = {
    omni_delegation_begin_chat: { ok: true, run_id: RUN },
    omni_delegation_check_chat: { ok: true },
    omni_delegation_finish_chat: { ok: true, guard_released: true, paused: false },
    ...over,
  };
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const a = answers[fn];
    if (a instanceof Error) return { data: null, error: a };
    return { data: typeof a === "function" ? (a as () => unknown)() : a, error: null };
  });
  return { rpc, calls };
}
const deps = (
  rpc: ReturnType<typeof fakeRpc>["rpc"],
  infer: ChatInference = vi.fn(async () => reply()),
) => ({
  rpc,
  infer,
  apiKey: () => "test-key",
  pollMs: 5,
  timeoutMs: 2_000,
});
const finishArgs = (calls: { fn: string; args: Record<string, unknown> }[]) =>
  calls.find((c) => c.fn === "omni_delegation_finish_chat")?.args;

describe("delegated chat rules", () => {
  it("accepts only the configured model, in either form", () => {
    expect(resolveChatModel(undefined)).toBe("openai/gpt-6-astra");
    expect(resolveChatModel(CHAT_MODEL_REF)).toBe("openai/gpt-6-astra");
    expect(resolveChatModel("openai/gpt-6-astra")).toBe("openai/gpt-6-astra");
    expect(resolveChatModel("lovable-ai:google/gemini-3-pro")).toBeNull();
    expect(resolveChatModel("other:openai/gpt-6-astra")).toBeNull();
  });
  it("uses at most 20 recent messages and 24,000 characters, ending with the owner", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
      content: `m${i}`,
    }));
    many.push({ role: "user", content: "last" });
    const c = selectChatContext(many);
    expect(c.ok && c.messages.length).toBe(20);
    expect(c.ok && c.messages.at(-1)?.content).toBe("last");
    expect(c.ok && c.omitted).toBe(11);
    const big = [
      { role: "user" as const, content: "x".repeat(15_000) },
      { role: "assistant" as const, content: "y".repeat(15_000) },
      { role: "user" as const, content: "z".repeat(9_000) },
    ];
    const b = selectChatContext(big);
    expect(b.ok && b.messages.length).toBe(2);
    expect(b.ok && b.inputChars).toBeLessThanOrEqual(DELEGATED_CHAT_LIMITS.maxInputChars);
    expect(selectChatContext([{ role: "assistant", content: "hi" }]).ok).toBe(false);
    expect(
      selectChatContext([
        { role: "user", content: " " },
        { role: "user", content: "hi" },
      ]).ok,
    ).toBe(false);
  });
});

describe("POST /api/omni/chat with an owner delegation", () => {
  it("answers through the configured model and records metadata only", async () => {
    const { rpc, calls } = fakeRpc();
    const r = await omniDelegatedChat(req(body({ model: CHAT_MODEL_REF })), deps(rpc));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({
      ok: true,
      reply: "Hi, owner.",
      agentId: "omni",
      agentName: "OMNI",
      model: CHAT_MODEL_REF,
      runId: RUN,
    });
    const begin = calls[0]!;
    expect(begin.fn).toBe("omni_delegation_begin_chat");
    expect(begin.args).toMatchObject({
      _audience: "omni-mothership",
      _model: "openai/gpt-6-astra",
      _message_count: 1,
      _input_chars: 10,
    });
    expect(begin.args["_token_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(calls)).not.toContain("Hello OMNI");
    expect(JSON.stringify(calls)).not.toContain("Hi, owner.");
    expect(finishArgs(calls)).toMatchObject({ _status: "completed", _pause_status: null });
    expect(calls.some((c) => c.fn === "omni_delegation_check_chat")).toBe(true);
  });
  it("Dread and Draco answer as themselves through the same model, guard and limits", async () => {
    for (const [id, name] of [
      ["dread", "Dread"],
      ["draco", "Draco"],
    ] as const) {
      const { rpc, calls } = fakeRpc();
      const infer = vi.fn<ChatInference>(async () => reply());
      const r = await omniDelegatedChat(
        req(body({ agentId: id, model: CHAT_MODEL_REF })),
        deps(rpc, infer),
      );
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({
        ok: true,
        agentId: id,
        agentName: name,
        model: CHAT_MODEL_REF,
      });
      const agent = infer.mock.calls[0]![0].agent;
      expect(agent.id).toBe(id);
      expect(agent.persona).toContain(`You are ${name}`);
      // Same admission (scope, AI approval, Stop, daily limit, one-at-a-time guard) as OMNI.
      expect(calls.map((c) => c.fn)[0]).toBe("omni_delegation_begin_chat");
      expect(calls[0]!.args["_model"]).toBe("openai/gpt-6-astra");
      expect(finishArgs(calls)).toMatchObject({ _status: "completed" });
    }
  });
  it("Dread and Draco are refused like OMNI when the database refuses (Stop, limit)", async () => {
    for (const [reason, status] of [
      ["emergency_stop_engaged", 423],
      ["daily_limit", 429],
      ["ai_not_approved", 403],
    ] as const) {
      const { rpc } = fakeRpc({ omni_delegation_begin_chat: { ok: false, reason } });
      const infer = vi.fn(async () => reply());
      const r = await omniDelegatedChat(req(body({ agentId: "draco" })), deps(rpc, infer));
      expect(r.status).toBe(status);
      expect(infer).not.toHaveBeenCalled();
    }
  });
  it("refuses before any database or model call: browser, no delegation, other agent, model, secrets", async () => {
    const { rpc, calls } = fakeRpc();
    const infer = vi.fn(async () => reply());
    const cases: [Request, number, string?][] = [
      [req(body(), { origin: "https://evil.example" }), 403, "server_to_server_only"],
      [req(body(), { authorization: "Bearer omni_metadata" }), 401],
      [req(body({ agentId: "jackboy" })), 403, "agent_not_enrolled"],
      [req(body({ agentId: "Dread" })), 403, "agent_not_enrolled"],
      [req(body({ agentId: "both" })), 403, "agent_not_enrolled"],
      [req(body({ model: "lovable-ai:other" })), 422, "model_not_available"],
      [req(body({ autonomous: true })), 422, "invalid_request"],
      [req("{nope"), 422, "invalid_request"],
      [
        req(body({ messages: [{ role: "user", content: "my api_key=abc123secret" }] })),
        422,
        "secret_like",
      ],
    ];
    for (const [request, status, error] of cases) {
      const r = await omniDelegatedChat(request, deps(rpc, infer));
      expect(r.status).toBe(status);
      if (error) expect((await r.json()).error).toBe(error);
    }
    const tooBig = await omniDelegatedChat(
      req(body({ messages: [{ role: "user", content: "x".repeat(600_000) }] })),
      deps(rpc, infer),
    );
    expect(tooBig.status).toBe(413);
    const noKey = await omniDelegatedChat(req(body()), { ...deps(rpc, infer), apiKey: () => "" });
    expect(noKey.status).toBe(503);
    expect(calls).toHaveLength(0);
    expect(infer).not.toHaveBeenCalled();
  });
  it("maps database refusals and never calls the model", async () => {
    const infer = vi.fn(async () => reply());
    for (const [reason, status] of [
      ["scope_missing", 403],
      ["revoked", 401],
      ["expired", 401],
      ["owner_unverified", 401],
      ["wrong_audience", 401],
      ["ai_not_approved", 403],
      ["emergency_stop_engaged", 423],
      ["daily_limit", 429],
      ["ai_busy_or_paused", 503],
    ] as const) {
      const { rpc } = fakeRpc({ omni_delegation_begin_chat: { ok: false, reason } });
      const r = await omniDelegatedChat(req(body()), deps(rpc, infer));
      expect(r.status, reason).toBe(status);
    }
    const missing = fakeRpc({ omni_delegation_begin_chat: new Error("function does not exist") });
    const r = await omniDelegatedChat(req(body()), deps(missing.rpc, infer));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("chat_not_installed");
    expect(infer).not.toHaveBeenCalled();
  });
  it("revocation while answering stops the reply and returns no text", async () => {
    let checks = 0;
    const { rpc, calls } = fakeRpc({
      omni_delegation_check_chat: () =>
        ++checks >= 2 ? { ok: false, reason: "revoked" } : { ok: true },
    });
    const infer = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<InferenceResult>((resolve) => {
          signal.addEventListener("abort", () => resolve(reply({ text: "partial", threw: true })));
        }),
    );
    const r = await omniDelegatedChat(req(body()), deps(rpc, infer));
    expect(r.status).toBe(401);
    const j = await r.json();
    expect(j.reply).toBeUndefined();
    expect(j.stopped).toBe("denied");
    expect(finishArgs(calls)).toMatchObject({ _status: "denied", _error_reason: "revoked" });
  });
  it("an Emergency Stop engaged during the reply blocks it (final re-check)", async () => {
    let checks = 0;
    const { rpc, calls } = fakeRpc({
      omni_delegation_check_chat: () =>
        ++checks > 0 ? { ok: false, reason: "emergency_stop_engaged" } : { ok: true },
    });
    const r = await omniDelegatedChat(req(body()), { ...deps(rpc), pollMs: 60_000 });
    expect(r.status).toBe(423);
    expect((await r.json()).reply).toBeUndefined();
    expect(finishArgs(calls)?.["_status"]).toBe("denied");
  });
  it("an unreadable re-check fails closed", async () => {
    const { rpc } = fakeRpc({ omni_delegation_check_chat: new Error("db down") });
    const r = await omniDelegatedChat(req(body()), { ...deps(rpc), pollMs: 60_000 });
    expect(r.status).toBe(409);
    expect((await r.json()).reply).toBeUndefined();
  });
  it("provider credit or permission refusals keep AI paused for owner review", async () => {
    const { rpc, calls } = fakeRpc();
    const infer = vi.fn(async () =>
      reply({ text: "", threw: true, failure: { status: 402, message: "Credits exhausted." } }),
    );
    const r = await omniDelegatedChat(req(body()), deps(rpc, infer));
    expect(r.status).toBe(402);
    expect(finishArgs(calls)).toMatchObject({
      _status: "denied",
      _pause_status: 402,
      _pause_message: "Credits exhausted.",
    });
    const rate = fakeRpc();
    const limited = await omniDelegatedChat(
      req(body()),
      deps(
        rate.rpc,
        vi.fn(async () =>
          reply({ text: "", threw: true, failure: { status: 429, message: "Slow down" } }),
        ),
      ),
    );
    expect(limited.status).toBe(429);
    expect(finishArgs(rate.calls)).toMatchObject({ _status: "failed", _pause_status: null });
  });
  it("a timeout, a declined or empty reply is a failure with no text", async () => {
    const slow = fakeRpc();
    const t = await omniDelegatedChat(req(body()), {
      ...deps(
        slow.rpc,
        vi.fn(
          ({ signal }: { signal: AbortSignal }) =>
            new Promise<InferenceResult>((resolve) =>
              signal.addEventListener("abort", () => resolve(reply({ text: "", threw: true }))),
            ),
        ),
      ),
      timeoutMs: 30,
      pollMs: 60_000,
    });
    expect(t.status).toBe(504);
    expect(finishArgs(slow.calls)?.["_error_reason"]).toBe("timeout");
    for (const [over, status, why] of [
      [{ finishReason: "content-filter" }, 422, "model_declined"],
      [{ finishReason: "length" }, 422, "output_limit"],
      [{ text: "  " }, 502, "empty_reply"],
    ] as const) {
      const f = fakeRpc();
      const r = await omniDelegatedChat(
        req(body()),
        deps(
          f.rpc,
          vi.fn(async () => reply(over)),
        ),
      );
      expect(r.status).toBe(status);
      expect((await r.json()).reply).toBeUndefined();
      expect(finishArgs(f.calls)?.["_error_reason"]).toBe(why);
    }
  });
  it("if the outcome can't be recorded, no reply is returned", async () => {
    for (const finish of [new Error("db"), { ok: false, reason: "run_not_running" }]) {
      const { rpc } = fakeRpc({ omni_delegation_finish_chat: finish });
      const r = await omniDelegatedChat(req(body()), deps(rpc));
      expect(r.status).toBe(503);
      const j = await r.json();
      expect(j.error).toBe("outcome_not_recorded");
      expect(j.reply).toBeUndefined();
    }
  });
});

describe("manifest and consent reflect only what is installed and configured", () => {
  it("lists the configured Lovable AI model without enrolling chat before 0066", () => {
    const m = buildManifest("https://evoomni.tech", { aiConfigured: true, chatInstalled: false });
    expect(m.providers).toEqual([
      { id: "lovable-ai", label: "Lovable AI", models: ["openai/gpt-6-astra"] },
    ]);
    expect(m.capabilities.providers).toEqual({ read: true, write: false });
    expect(m.agents.some((a) => a.enrolled)).toBe(false);
    expect(m.capabilities.chat.write).toBe(false);
    expect(m.delegation.supportedScopes).not.toContain("chat:write");
    expect(m.chat.state).toBe("not_available");
  });
  it("enrolls OMNI, Dread and Draco (never held-task agents) once 0066 is installed and AI is configured", () => {
    const m = buildManifest("https://evoomni.tech", { aiConfigured: true, chatInstalled: true });
    expect(m.agents.filter((a) => a.enrolled).map((a) => a.id)).toEqual(["omni", "dread", "draco"]);
    // OMNI web refuses every other agent when the chat block names one agentId.
    expect("agentId" in m.chat).toBe(false);
    expect(m.chat.agentIds).toEqual(["omni", "dread", "draco"]);
    const names = Object.fromEntries(m.agents.map((a) => [a.id, a.name]));
    expect(names).toMatchObject({ dread: "Dread", draco: "Draco" });
    // OMNI web's resolveTerminalRoute: exactly one manifest identity per @dread / @draco.
    for (const id of ["dread", "draco"])
      expect(m.agents.filter((a) => a.id === id || a.name.toLowerCase() === id)).toHaveLength(1);
    const voices = m.agents
      .filter((a) => "voice" in a)
      .map((a) => (a as { voice: { engine: string; pitch: number } }).voice);
    expect(voices.every((v) => v.engine === "browser")).toBe(true);
    expect(new Set(voices.map((v) => v.pitch)).size).toBe(3);
    expect(m.capabilities.chat).toEqual({ read: false, write: true });
    expect(m.delegation.supportedScopes).toContain("chat:write");
    expect(m.chat).toMatchObject({ state: "delegation_required", verified: false, dailyLimit: 30 });
    const noAi = buildManifest("https://evoomni.tech", {
      aiConfigured: false,
      chatInstalled: true,
    });
    expect(noAi.providers).toEqual([]);
    expect(noAi.agents.some((a) => a.enrolled)).toBe(false);
  });
  it("never claims Fusion orchestration", () => {
    for (const live of [
      { aiConfigured: false, chatInstalled: false },
      { aiConfigured: true, chatInstalled: true },
    ]) {
      const m = buildManifest("https://evoomni.tech", live);
      expect("orchestration" in m).toBe(false);
      expect(m.orchestrationStatus.state).toBe("not_available");
      expect(m.autonomous).toBe(false);
    }
  });
  it("chat:write is grantable only when installed; held-task scopes never imply it", () => {
    const a = {
      response_type: "code",
      client_id: "omni-web",
      redirect_uri: "https://omni-orbit-command-companion.lovable.app/mothership/callback",
      scope: "chat:write tasks:write",
      state: "s".repeat(32),
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
    };
    const before = parseAuthorizeRequest(a, grantableScopes(false));
    expect(before.ok && before.supported).toEqual(["tasks:write"]);
    expect(before.ok && before.unsupported).toEqual(["chat:write"]);
    const after = parseAuthorizeRequest(a, grantableScopes(true));
    expect(after.ok && after.supported).toEqual(["chat:write", "tasks:write"]);
    expect(grantableScopes(true)).not.toContain("providers:write");
  });
});
