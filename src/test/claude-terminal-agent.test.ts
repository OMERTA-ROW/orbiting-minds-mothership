/** Claude on the private OMNI text agent (migration 0075): owner-only, reserve before the call, settle once. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "cc276f60-142b-4d5d-83cf-b83fb53d5562";
const KEY = "sk-ant-test-" + "k".repeat(40);

const mocks = vi.hoisted(() => ({
  db: new Map<string, Row[]>(),
  userRpc: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  adminRpc: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  calls: [] as { who: string; fn: string; args: Record<string, unknown> }[],
  omniCall: vi.fn(),
}));

function from(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "update" | "delete" = "select";
  let payload: Row = {};
  const rows = () =>
    (mocks.db.get(table) ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const exec = () => {
    const hit = rows();
    if (op === "update") hit.forEach((r) => Object.assign(r, payload));
    if (op === "delete")
      mocks.db.set(
        table,
        (mocks.db.get(table) ?? []).filter((r) => !hit.includes(r)),
      );
    return { data: hit[0] ?? null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push([k, v]), b),
    update: (p: Row) => ((op = "update"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    insert: async (p: Row) => {
      const list = mocks.db.get(table) ?? [];
      if (table === "ai_gateway_state" && list.some((r) => r["feature"] === p["feature"]))
        return { error: { message: "duplicate" } };
      mocks.db.set(table, [...list, { ...p }]);
      return { error: null };
    },
    maybeSingle: async () => exec(),
    then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve(exec()).then(ok, bad),
  };
  return b;
}
const rpcOf =
  (who: "user" | "admin") =>
  async (fn: string, args: Record<string, unknown> = {}) => {
    mocks.calls.push({ who, fn, args });
    const answer = (who === "user" ? mocks.userRpc : mocks.adminRpc)[fn];
    if (!answer) return { data: null, error: { message: "missing" } };
    return { data: answer(args), error: null };
  };
const client = { from, rpc: rpcOf("user") };

vi.mock("@/lib/beta-auth.server", () => ({
  authenticateBetaAi: async () => ({ client, userId: OWNER }),
  readBoundedJson: (r: Request) => r.json(),
  BetaHttpError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from, rpc: rpcOf("admin") },
}));
vi.mock("@/lib/ai/omni-responses.server.ts", () => ({
  createOmniCall: mocks.omniCall,
  omniSystemPrompt: (persona: string, context: string) => `${persona}\n${context}`,
  OMNI_AGENT_PERSONA: "You are OMNI.",
}));

import { handleOmniAgent } from "@/lib/ai/omni-agent.server";

const RUN = "fa4b071c-8c52-4b78-98eb-6321af2823dd";
function request(engine?: string) {
  return new Request("http://localhost:8080/api/omni-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: RUN,
      projectId: PROJECT,
      message: "Review the rollout plan",
      consent: true,
      ...(engine ? { engine } : {}),
    }),
  });
}
const claudeReply = () =>
  new Response(
    JSON.stringify({
      content: [{ type: "text", text: "Measured answer." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 20, output_tokens: 5 },
    }),
    { status: 200 },
  );
async function events(res: Response) {
  const text = await res.text();
  return {
    raw: text,
    list: text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}
const fn = (who: string) => mocks.calls.filter((c) => c.who === who).map((c) => c.fn);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("LOVABLE_API_KEY", "lovable-test-only");
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  mocks.calls.length = 0;
  mocks.omniCall.mockReset();
  mocks.db.clear();
  mocks.db.set("beta_projects", [{ id: PROJECT, owner_id: OWNER, name: "Fixture", brief: "Safe" }]);
  mocks.db.set("omni_agent_runs", []);
  mocks.db.set("ai_gateway_state", []);
  mocks.db.set("omni_terminal_controls", [{ id: 1, emergency_stop: false }]);
  mocks.db.set("beta_access", [{ user_id: OWNER, ai_approved: true, paused: false }]);
  mocks.userRpc = {
    caller_role: () => "owner",
    is_razul_owner: () => true,
    start_omni_agent_run: (a) => {
      const row = {
        id: a["_id"],
        owner_id: OWNER,
        project_id: PROJECT,
        status: "queued",
        model: "openai/gpt-6-astra",
        message: a["_message"],
        result: "",
      };
      mocks.db.get("omni_agent_runs")!.push(row);
      return row;
    },
  };
  mocks.adminRpc = {
    claude_reserve_agent_run: (a) => {
      const run = mocks.db.get("omni_agent_runs")!.find((r) => r["id"] === a["_run_id"]);
      if (run) run["model"] = a["_model"];
      return { ok: true, estimate_cents: 2 };
    },
    claude_settle_source: () => ({ ok: true, actual_cents: 1 }),
  };
  fetchMock = vi.fn(async () => claudeReply());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Claude on the terminal agent", () => {
  it("refuses a member (not the verified owner) before any run or call", async () => {
    mocks.userRpc["is_razul_owner"] = () => false;
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    expect(res.status).toBe(403);
    expect(fn("user")).not.toContain("start_omni_agent_run");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses without the Anthropic key before any run, reservation or call", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    expect(res.status).toBe(503);
    expect(fn("user")).not.toContain("start_omni_agent_run");
    expect(fn("admin")).not.toContain("claude_reserve_agent_run");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls Anthropic when the reservation is refused (daily cap)", async () => {
    mocks.adminRpc["claude_reserve_agent_run"] = () => ({
      ok: false,
      reason: "daily_cap",
      estimate_cents: 2,
    });
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    expect(res.status).toBe(402);
    expect((await res.json()).message).toContain("$5");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fn("admin")).not.toContain("claude_settle_source");
    expect(mocks.db.get("omni_agent_runs")![0]!["status"]).toBe("denied");
    expect(mocks.db.get("ai_gateway_state")).toEqual([]); // guard released
  });

  it("fails closed when the reservation function isn't installed", async () => {
    delete mocks.adminRpc["claude_reserve_agent_run"];
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.db.get("ai_gateway_state")).toHaveLength(1);
  });

  it("reserves, calls once, settles once and attributes the reply", async () => {
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    expect(res.status).toBe(200);
    const { raw, list } = await events(res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
    expect(JSON.parse(String(init.body))["max_tokens"]).toBe(1024);
    const admin = fn("admin");
    expect(admin.indexOf("claude_reserve_agent_run")).toBeGreaterThanOrEqual(0);
    expect(admin.filter((f) => f === "claude_settle_source")).toHaveLength(1);
    const settle = mocks.calls.find((c) => c.fn === "claude_settle_source")!.args;
    expect(settle).toMatchObject({
      _source: "agent",
      _run_id: RUN,
      _status: "completed",
      _input_tokens: 20,
      _output_tokens: 5,
    });
    expect(list.find((e) => e["type"] === "text")?.["text"]).toBe("Measured answer.");
    expect(list.find((e) => e["type"] === "engine")).toEqual({
      type: "engine",
      engine: "claude-sonnet-5-5",
      attribution: "Claude Sonnet 5.5 (Anthropic) via OMNI",
      cost: { estimateCents: 2, actualCents: 1 },
    });
    const result = list.find((e) => e["type"] === "result")?.["run"] as Row;
    expect(result["status"]).toBe("completed");
    expect(result["model"]).toBe("claude-sonnet-5-5");
    expect(raw).not.toContain(KEY);
    expect(mocks.omniCall).not.toHaveBeenCalled();
  });

  it("withholds the reply when its cost can't be recorded", async () => {
    mocks.adminRpc["claude_settle_source"] = () => ({ ok: false, reason: "not_reserved" });
    const { list } = await events(await handleOmniAgent(request("claude-sonnet-5-5")));
    expect(list.some((e) => e["type"] === "text")).toBe(false);
    const result = list.find((e) => e["type"] === "result")?.["run"] as Row;
    expect(result["status"]).toBe("failed");
    expect(String(result["error_message"])).toContain("withheld");
    expect(fn("admin").filter((f) => f === "claude_settle_source")).toHaveLength(1);
    expect(mocks.db.get("ai_gateway_state")).toHaveLength(1);
  });

  it("settles a provider failure as failed without retrying", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    const { list } = await events(await handleOmniAgent(request("claude-sonnet-5-5")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const settle = mocks.calls.find((c) => c.fn === "claude_settle_source")!.args;
    expect(settle["_status"]).toBe("failed");
    expect((list.find((e) => e["type"] === "result")?.["run"] as Row)["status"]).toBe("failed");
  });

  it("stops within the poll when the Emergency Stop is engaged mid-reply", async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Stopped", "AbortError")),
          );
        }),
    );
    const res = await handleOmniAgent(request("claude-sonnet-5-5"));
    mocks.db.get("omni_terminal_controls")![0]!["emergency_stop"] = true;
    const { list } = await events(res);
    const result = list.find((e) => e["type"] === "result")?.["run"] as Row;
    expect(result["status"]).toBe("denied");
    expect(String(result["error_message"])).toContain("Emergency Stop");
    const settles = mocks.calls.filter((c) => c.fn === "claude_settle_source");
    expect(settles).toHaveLength(1);
    expect(settles[0]!.args).toMatchObject({ _status: "failed", _input_tokens: null }); // charged at the estimate
  }, 10_000);

  it("leaves the current engine path untouched when no engine is chosen", async () => {
    mocks.omniCall.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield { type: "text-delta", text: "Default answer." };
        })(),
        finishReason: Promise.resolve("stop"),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      },
      gateway: { waitForRunId: async () => "gw", getRunId: () => "gw" },
      getFailure: () => undefined,
      getResponseHeaders: () => new Headers(),
    });
    const { list } = await events(await handleOmniAgent(request()));
    expect(mocks.omniCall).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fn("admin")).not.toContain("claude_reserve_agent_run");
    expect(fn("user")).not.toContain("is_razul_owner");
    expect(list.find((e) => e["type"] === "engine")).toMatchObject({
      engine: "openai/gpt-6-astra",
      cost: null,
    });
  });
});
