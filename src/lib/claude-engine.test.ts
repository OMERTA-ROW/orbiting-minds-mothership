import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLAUDE_CAPS,
  attributionLine,
  claudeEngineFor,
  estimateClaudeCents,
} from "./omni-engines";
import { resolveChatModel } from "./omni-delegated-chat";
import { omniDelegatedChat } from "./omni-delegated-chat.server";
import { parsePrReport } from "./jackboy-pr-report";
import { synthesizeSpeech } from "./ai/voice.server";

const TOKEN = `omnid_${"a".repeat(64)}`;
const RUN = "11111111-2222-4333-8444-555555555555";
const KEY = "sk-ant-test-" + "x".repeat(40);
function req(model: string) {
  return new Request("https://evoomni.tech/api/omni/chat", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "dread",
      model,
      messages: [{ role: "user", content: "Hello" }],
      autonomous: false,
      source: "omni-web",
    }),
  });
}
function fakeRpc(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const answers: Record<string, unknown> = {
    omni_delegation_begin_chat: { ok: true, run_id: RUN },
    omni_delegation_check_chat: { ok: true },
    omni_delegation_chat_memory: { ok: false, reason: "agent_without_memory" },
    omni_delegation_finish_chat: { ok: true, guard_released: true, paused: false },
    claude_reserve: { ok: true, estimate_cents: 3 },
    claude_settle: { ok: true, actual_cents: 2 },
    ...over,
  };
  const rpc = vi.fn(async (fn: string) => {
    calls.push(fn);
    return { data: answers[fn] ?? null, error: null };
  });
  return { rpc, calls };
}
const okFetch = () =>
  vi.fn(async () =>
    new Response(
      JSON.stringify({
        content: [{ type: "text", text: "Measured answer." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
      { status: 200 },
    ),
  ) as unknown as typeof fetch;

describe("Claude engine registry", () => {
  it("accepts only the two exact Claude IDs", () => {
    expect(claudeEngineFor("claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(claudeEngineFor("anthropic:claude-opus-5-5")).toBe("claude-opus-5-5");
    for (const bad of ["Claude-Sonnet-5-5", "claude-sonnet-5", "claude-sonnet-5-5 ", "claude-haiku-5-5"])
      expect(resolveChatModel(bad)).toBeNull();
  });
  it("labels results with engine and agent", () => {
    expect(attributionLine("claude-sonnet-5-5", "Dread")).toBe("Claude Sonnet 5.5 (Anthropic) via Dread");
  });
  it("estimates cost and refuses missing prices", () => {
    // 300 chars -> 100 + 200 tokens in; 1024 out; 300c/Mtok in, 1500c/Mtok out
    expect(estimateClaudeCents(300, 1024, 300, 1500)).toBe(Math.ceil((300 * 300 + 1024 * 1500) / 1e6));
    expect(estimateClaudeCents(300, 1024, 0, 1500)).toBeNull();
    expect(CLAUDE_CAPS).toEqual({ perCallCents: 50, perDayCents: 500 });
  });
});

describe("Claude chat path", () => {
  it("reserves before calling, settles after, and attributes the reply", async () => {
    const { rpc, calls } = fakeRpc();
    const f = okFetch();
    const res = await omniDelegatedChat(req("claude-sonnet-5-5"), {
      rpc, anthropicKey: () => KEY, claudeFetch: f, pollMs: 10_000,
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.attribution).toBe("Claude Sonnet 5.5 (Anthropic) via Dread");
    expect(body.cost).toEqual({ estimateCents: 3, actualCents: 2 });
    expect(calls.indexOf("claude_reserve")).toBeLessThan(calls.indexOf("claude_settle"));
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
  for (const reason of ["call_cap", "daily_cap", "engine_not_enabled", "price_not_confirmed", "emergency_stop_engaged"]) {
    it(`makes no Anthropic call when reserve refuses: ${reason}`, async () => {
      const { rpc, calls } = fakeRpc({ claude_reserve: { ok: false, reason } });
      const f = okFetch();
      const res = await omniDelegatedChat(req("claude-sonnet-5-5"), { rpc, anthropicKey: () => KEY, claudeFetch: f });
      expect(res.status).not.toBe(200);
      expect(f).not.toHaveBeenCalled();
      expect(calls).not.toContain("claude_settle");
    });
  }
  it("refuses when the ledger is missing", async () => {
    const { rpc } = fakeRpc({ claude_reserve: null });
    const f = okFetch();
    const res = await omniDelegatedChat(req("claude-sonnet-5-5"), { rpc, anthropicKey: () => KEY, claudeFetch: f });
    expect((await res.json()).error ?? "").not.toBe("");
    expect(f).not.toHaveBeenCalled();
  });
  it("refuses with no key and no database call", async () => {
    const { rpc } = fakeRpc();
    const res = await omniDelegatedChat(req("claude-sonnet-5-5"), { rpc, anthropicKey: () => undefined });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("Stop/revocation from begin means no reserve and no call", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_begin_chat: { ok: false, reason: "revoked" } });
    const f = okFetch();
    await omniDelegatedChat(req("claude-sonnet-5-5"), { rpc, anthropicKey: () => KEY, claudeFetch: f });
    expect(calls).not.toContain("claude_reserve");
    expect(f).not.toHaveBeenCalled();
  });
  it("mid-reply Stop aborts and still settles the reservation", async () => {
    const { rpc, calls } = fakeRpc({ omni_delegation_check_chat: { ok: false, reason: "emergency_stop_engaged" } });
    const f = vi.fn(
      (_u: unknown, init: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
    ) as unknown as typeof fetch;
    const res = await omniDelegatedChat(req("claude-sonnet-5-5"), {
      rpc, anthropicKey: () => KEY, claudeFetch: f, pollMs: 5,
    });
    expect(res.status).not.toBe(200);
    expect(calls).toContain("claude_settle");
  });
  it("Anthropic errors never echo the key", async () => {
    const { rpc } = fakeRpc();
    const f = vi.fn(async () => new Response(`bad key ${KEY}`, { status: 401 })) as unknown as typeof fetch;
    const res = await omniDelegatedChat(req("claude-sonnet-5-5"), { rpc, anthropicKey: () => KEY, claudeFetch: f });
    expect(await res.text()).not.toContain(KEY);
  });
});

describe("boundaries", () => {
  it("Claude code path imports no sandbox, deploy or execution module", () => {
    for (const f of ["src/lib/ai/anthropic.server.ts", "src/lib/omni-engines.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/omni-sandbox|vultr|deploy|child_process|jackboy-dispatch/i);
    }
  });
  it("PR reports only accept allowlisted GitHub pull links", () => {
    const t = "11111111-2222-4333-8444-555555555555";
    expect(parsePrReport({ taskId: t, prUrl: "https://github.com/o/r/pull/7", prStatus: "draft" }, "o/r").ok).toBe(true);
    expect(parsePrReport({ taskId: t, prUrl: "https://github.com/x/r/pull/7", prStatus: "draft" }, "o/r")).toEqual({ ok: false, reason: "repo_not_allowed" });
    expect(parsePrReport({ taskId: t, prUrl: "http://github.com/o/r/pull/7", prStatus: "draft" }, "o/r").ok).toBe(false);
    expect(parsePrReport({ taskId: t, prUrl: "https://evil.com/o/r/pull/7", prStatus: "open" }, "o/r").ok).toBe(false);
  });
  it("voice hook is not connected", async () => {
    expect(await synthesizeSpeech({ agentId: "jax", voiceId: "v", text: "hi" })).toEqual({ ok: false, reason: "not_connected" });
  });
});
