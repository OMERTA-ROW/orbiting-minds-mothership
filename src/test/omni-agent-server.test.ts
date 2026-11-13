import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  role: vi.fn(),
  project: vi.fn(),
  prepare: vi.fn(),
  state: vi.fn(),
  guard: vi.fn(),
  runQuery: vi.fn(),
  update: vi.fn(),
  clear: vi.fn(),
  call: vi.fn(),
}));
const id = "fa4b071c-8c52-4b78-98eb-6321af2823dd",
  projectId = "cc276f60-142b-4d5d-83cf-b83fb53d5562";
const run = {
  id,
  project_id: projectId,
  status: "queued",
  message: "Omni connection test",
  result: "",
  model: "openai/gpt-6-astra",
};
function q(f: typeof m.project) {
  const chain = { eq: () => chain, select: () => chain, maybeSingle: f };
  return chain;
}
vi.mock("@/lib/beta-auth.server", () => ({
  authenticateBetaAi: m.auth,
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
  supabaseAdmin: {
    from: (table: string) =>
      table === "ai_gateway_state"
        ? {
            select: () => q(m.state),
            insert: m.guard,
            update: (v: unknown) => {
              m.update(v);
              return q(m.clear);
            },
            delete: () => q(m.clear),
          }
        : {
            select: () => q(m.runQuery),
            update: (v: unknown) => {
              m.update(v);
              return q(m.runQuery);
            },
          },
  },
}));
vi.mock("@/lib/ai/omni-responses.server.ts", () => ({ createOmniCall: m.call }));
import { handleOmniAgent } from "@/lib/ai/omni-agent.server";
const request = (patch = {}) =>
  new Request("http://localhost:8080/api/omni-agent", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:8080" },
    body: JSON.stringify({
      requestId: id,
      projectId,
      message: "Omni connection test",
      consent: true,
      ...patch,
    }),
  });
function call(parts: AsyncIterable<unknown>, failure?: { status: number; message: string }) {
  return {
    result: {
      fullStream: parts,
      finishReason: Promise.resolve("stop"),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
    },
    gateway: { waitForRunId: async () => "issued", getRunId: () => "issued" },
    getFailure: () => failure,
    getResponseHeaders: () => new Headers({ "X-Lovable-AIG-Run-ID": "issued" }),
  };
}
describe("Persisted OMNI agent request", () => {
  beforeEach(() => {
    vi.stubEnv("LOVABLE_API_KEY", "fixture-key");
    Object.values(m).forEach((fn) => fn.mockReset());
    m.auth.mockResolvedValue({
      userId: "owner",
      client: {
        rpc: (name: string) => (name === "caller_role" ? m.role() : m.prepare()),
        from: () => ({ select: () => q(m.project) }),
      },
    });
    m.role.mockResolvedValue({ data: "owner", error: null });
    m.project.mockResolvedValue({
      data: { id: projectId, name: "Owned sample", brief: "Safe context" },
      error: null,
    });
    m.prepare.mockResolvedValue({ data: run, error: null });
    m.state.mockResolvedValue({ data: null, error: null });
    m.guard.mockResolvedValue({ error: null });
    m.clear.mockResolvedValue({ data: { feature: "evolution-omni" }, error: null });
    m.runQuery.mockResolvedValue({ data: { ...run, status: "running" }, error: null });
    m.call.mockReturnValue(
      call(
        (async function* () {
          yield { type: "text-delta", text: "Omni connected" };
        })(),
      ),
    );
  });
  it("blocks missing membership before persistence or inference", async () => {
    m.role.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await handleOmniAgent(request())).status).toBe(503);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.call).not.toHaveBeenCalled();
  });
  it("blocks unassigned membership despite AI approval", async () => {
    m.role.mockResolvedValue({ data: null, error: null });
    expect((await handleOmniAgent(request())).status).toBe(403);
    expect(m.call).not.toHaveBeenCalled();
  });
  it("requires explicit consent before saving a request", async () => {
    expect((await handleOmniAgent(request({ consent: false }))).status).toBe(400);
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it("rejects a foreign project without inference", async () => {
    m.project.mockResolvedValue({ data: null, error: null });
    expect((await handleOmniAgent(request())).status).toBe(404);
    expect(m.call).not.toHaveBeenCalled();
  });
  it("fails closed if the run schema is absent", async () => {
    m.prepare.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await handleOmniAgent(request())).status).toBe(503);
    expect(m.call).not.toHaveBeenCalled();
  });
  it("never replays an existing running request", async () => {
    m.prepare.mockResolvedValue({ data: { ...run, status: "running" }, error: null });
    expect((await handleOmniAgent(request())).status).toBe(409);
    expect(m.call).not.toHaveBeenCalled();
  });
  it("never starts if durable pre-provider guard fails", async () => {
    m.guard.mockResolvedValue({ error: new Error("full") });
    expect((await handleOmniAgent(request())).status).toBe(503);
    expect(m.call).not.toHaveBeenCalled();
  });
  it("rechecks revoked approval just before model execution", async () => {
    m.auth
      .mockResolvedValueOnce({
        userId: "owner",
        client: {
          rpc: (name: string) => (name === "caller_role" ? m.role() : m.prepare()),
          from: () => ({ select: () => q(m.project) }),
        },
      })
      .mockRejectedValueOnce(new Error("Revoked"));
    await (await handleOmniAgent(request())).text();
    expect(m.call).not.toHaveBeenCalled();
  });
  it("sends earlier saved turns only when the owner chose them", async () => {
    const earlier = [
      { ...run, id: "11111111-1111-4111-8111-111111111111", status: "completed", message: "first", result: "reply one", created_at: "2026-11-01" },
    ];
    m.auth.mockResolvedValue({
      userId: "owner",
      client: {
        rpc: (name: string) =>
          name === "caller_role"
            ? m.role()
            : name === "list_omni_agent_runs"
              ? Promise.resolve({ data: earlier, error: null })
              : m.prepare(),
        from: () => ({ select: () => q(m.project) }),
      },
    });
    const text = await (await handleOmniAgent(request({ contextTurns: 2 }))).text();
    expect(text).toContain('"type":"context"');
    expect(m.call.mock.calls[0][5]).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply one" },
    ]);
  });
  it("sends no earlier turns by default", async () => {
    await (await handleOmniAgent(request())).text();
    expect(m.call.mock.calls[0][5]).toEqual([]);
  });
  it("fails closed when earlier turns cannot be read", async () => {
    m.auth.mockResolvedValue({
      userId: "owner",
      client: {
        rpc: (name: string) =>
          name === "caller_role"
            ? m.role()
            : name === "list_omni_agent_runs"
              ? Promise.resolve({ data: null, error: { message: "x" } })
              : m.prepare(),
        from: () => ({ select: () => q(m.project) }),
      },
    });
    expect((await handleOmniAgent(request({ contextTurns: 2 }))).status).toBe(503);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.call).not.toHaveBeenCalled();
  });
  it("persists bounded result and actual token counts", async () => {
    const response = await handleOmniAgent(request());
    const text = await response.text();
    expect(text).toContain("Omni connected");
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        result: "Omni connected",
        total_tokens: 15,
        gateway_run_id: "issued",
      }),
    );
    expect(response.headers.get("X-Lovable-AIG-Run-ID")).toBe("issued");
  });
  it("keeps the guard if saving the result fails", async () => {
    m.runQuery
      .mockResolvedValueOnce({ data: { id }, error: null })
      .mockResolvedValueOnce({ data: { status: "running" }, error: null })
      .mockResolvedValueOnce({ data: { status: "running" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write failed") })
      .mockResolvedValueOnce({ data: { ...run, status: "running" }, error: null });
    const text = await (await handleOmniAgent(request())).text();
    expect(text).toContain("Result could not be saved");
    expect(m.clear).not.toHaveBeenCalled();
  });
  it("preserves a provider 403 and persists denial without retry", async () => {
    m.call.mockReturnValue(
      call(
        (async function* () {
          yield { type: "error", error: new Error("denied") };
        })(),
        { status: 403, message: "Provider access denied" },
      ),
    );
    const response = await handleOmniAgent(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Provider access denied" });
    expect(m.update).toHaveBeenCalledWith({
      blocked_status: 403,
      message: "Provider access denied",
    });
    expect(m.call).toHaveBeenCalledTimes(1);
  });
  it("upstream Stop aborts model and never completes the run", async () => {
    let observed: AbortSignal | undefined;
    m.call.mockImplementation((_r, _k, _c, _m, signal: AbortSignal) => {
      observed = signal;
      return call(
        (async function* () {
          yield { type: "text-delta", text: "partial" };
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          yield* [];
        })(),
      );
    });
    const response = await handleOmniAgent(request());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing stream");
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(observed?.aborted).toBe(true));
    await vi.waitFor(() =>
      expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" })),
    );
    expect(m.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });
  it("account pause aborts before first model text and saves paused status", async () => {
    let signal: AbortSignal | undefined;
    m.call.mockImplementation((_r, _k, _c, _m, s: AbortSignal) => {
      signal = s;
      return call(
        (async function* () {
          yield* [];
          await new Promise<void>((resolve) =>
            s.addEventListener("abort", () => resolve(), { once: true }),
          );
        })(),
      );
    });
    const response = await handleOmniAgent(request());
    m.auth.mockRejectedValue(new Error("Account paused"));
    const text = await response.text();
    expect(signal?.aborted).toBe(true);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" }));
    expect(text).not.toContain('"type":"text"');
  });
  it("membership revocation cancels active inference without replay", async () => {
    m.call.mockImplementation((_r, _k, _c, _m, s: AbortSignal) =>
      call(
        (async function* () {
          yield* [];
          await new Promise<void>((resolve) =>
            s.addEventListener("abort", () => resolve(), { once: true }),
          );
        })(),
      ),
    );
    const response = await handleOmniAgent(request());
    m.role.mockResolvedValue({ data: null, error: null });
    await response.text();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "denied" }));
    expect(m.call).toHaveBeenCalledTimes(1);
  });
});
