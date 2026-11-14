import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSafetyEvent, syncJackboySafety } from "./jackboy-safety.server";
import { readJackboySafetyState } from "./jackboy-link.server";
import { safetyEventMessage } from "./jackboy-safety";

const SECRET = "s".repeat(40);
const PROJECT = "4f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b";

function fakeAdmin(opts: {
  approvals?: Array<{ step: number; status: string; approval_expires_at: string | null }>;
  stop?: boolean | null;
  rpcError?: { code: string } | null;
}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "jackboy_safety_record" && opts.rpcError) return { data: null, error: opts.rpcError };
      if (fn === "jackboy_safety_record") {
        const a = args!;
        const state =
          a["_source"] === "failure" ? "unknown" : a["_code_stop"] ? "engaged" : a["_paused"] ? "paused" : "clear";
        return { data: state, error: null };
      }
      return { data: "unknown", error: null };
    }),
    from: vi.fn((table: string) => {
      const chain = {
        select: () => chain,
        lte: async () => ({ data: opts.approvals ?? [], error: null }),
        eq: () => chain,
        maybeSingle: async () =>
          table === "omni_terminal_controls"
            ? { data: opts.stop === null ? null : { emergency_stop: opts.stop ?? false }, error: null }
            : { data: null, error: null },
      };
      return chain;
    }),
  };
  return { admin: admin as never, calls };
}

const approved = (through: number, step7 = new Date(Date.now() + 3600_000).toISOString()) =>
  Array.from({ length: 9 }, (_, i) => ({
    step: i + 1,
    status: i + 1 <= through ? "approved" : "pending",
    approval_expires_at: i + 1 === 7 ? step7 : null,
  }));

describe("scheduled/owner safety sync", () => {
  it("sends nothing before Step 9 is in effect, but still enforces freshness", async () => {
    const read = vi.fn();
    const { admin, calls } = fakeAdmin({ approvals: approved(8) });
    const r = await syncJackboySafety(admin, { read });
    expect(r.checked).toBe(false);
    expect(r.reason).toBe("step9_not_in_effect");
    expect(read).not.toHaveBeenCalled();
    expect(calls.map((c) => c.fn)).toEqual(["jackboy_safety_enforce_freshness"]);
  });
  it("records unknown without sending while Mothership's Emergency Stop is engaged", async () => {
    const read = vi.fn();
    const { admin, calls } = fakeAdmin({ approvals: approved(9), stop: true });
    const r = await syncJackboySafety(admin, { read });
    expect(read).not.toHaveBeenCalled();
    expect(r.state).toBe("unknown");
    expect(calls.at(-1)?.args?.["_source"]).toBe("failure");
  });
  it("records a failed or unsupported read as unknown (fail closed)", async () => {
    const read = vi.fn().mockRejectedValue({ stage: "http", status: 400, code: "invalid_request" });
    const { admin, calls } = fakeAdmin({ approvals: approved(9) });
    const r = await syncJackboySafety(admin, { read });
    expect(r.state).toBe("unknown");
    expect(r.reason).toBe("read_http_400_invalid_request");
    expect(calls.at(-1)?.args?.["_source"]).toBe("failure");
  });
  it("records a verified engaged reading as a poll", async () => {
    const read = vi.fn().mockResolvedValue({
      paused: false,
      codeStop: true,
      codeEnabled: false,
      cancellation: "not_needed",
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      proofDigest: "a".repeat(64),
    });
    const { admin, calls } = fakeAdmin({ approvals: approved(9) });
    const r = await syncJackboySafety(admin, { read });
    expect(r).toMatchObject({ checked: true, state: "engaged", reason: "verified" });
    expect(calls.at(-1)?.args).toMatchObject({ _source: "poll", _code_stop: true });
  });
});

describe("signed stop notice receiver", () => {
  beforeEach(() => {
    vi.stubEnv("JACKBOY_SAFETY_EVENT_HMAC_SECRET", SECRET);
    vi.stubEnv("OMNI_LINK_PROJECT_ID", PROJECT);
  });
  afterEach(() => vi.unstubAllEnvs());
  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      contract: "jackboy.safety-event/v1",
      projectId: PROJECT,
      event: "code_stop_engaged",
      paused: false,
      codeStop: true,
      codeEnabled: false,
      cancellation: "requested",
      observedAt: new Date().toISOString(),
      ...extra,
    });
  const request = (b: string, o: { ts?: string; nonce?: string; secret?: string } = {}) => {
    const ts = o.ts ?? String(Math.floor(Date.now() / 1000));
    const nonce = o.nonce ?? "1".repeat(32);
    const sig = createHmac("sha256", o.secret ?? SECRET).update(safetyEventMessage(ts, nonce, b)).digest("hex");
    return new Request("https://evoomni.tech/api/public/jackboy/safety-event", {
      method: "POST",
      headers: { "x-jackboy-timestamp": ts, "x-jackboy-nonce": nonce, "x-jackboy-signature": sig },
      body: b,
    });
  };
  it("records a correctly signed CODE stop notice", async () => {
    const { admin, calls } = fakeAdmin({});
    const res = await handleSafetyEvent(request(body()), { admin: async () => admin });
    expect(res.status).toBe(200);
    expect(calls[0]?.args).toMatchObject({ _source: "event", _code_stop: true, _nonce: "1".repeat(32) });
  });
  it("refuses a wrong signature, stale clock or altered body without recording", async () => {
    const { admin, calls } = fakeAdmin({});
    expect((await handleSafetyEvent(request(body(), { secret: "x".repeat(40) }), { admin: async () => admin })).status).toBe(401);
    const old = String(Math.floor(Date.now() / 1000) - 120);
    expect((await handleSafetyEvent(request(body(), { ts: old }), { admin: async () => admin })).status).toBe(401);
    const signed = request(body());
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: body({ codeEnabled: true }) });
    expect((await handleSafetyEvent(tampered, { admin: async () => admin })).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  it("refuses another project and a notice that reports no stop", async () => {
    const { admin, calls } = fakeAdmin({});
    const other = body({ projectId: "0f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b" });
    expect((await handleSafetyEvent(request(other), { admin: async () => admin })).status).toBe(403);
    expect((await handleSafetyEvent(request(body({ codeStop: false })), { admin: async () => admin })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("reports a replayed nonce as 409", async () => {
    const { admin } = fakeAdmin({ rpcError: { code: "23505" } });
    expect((await handleSafetyEvent(request(body()), { admin: async () => admin })).status).toBe(409);
  });
  it("is unavailable until its signing secret is configured", async () => {
    vi.stubEnv("JACKBOY_SAFETY_EVENT_HMAC_SECRET", "");
    const { admin } = fakeAdmin({});
    expect((await handleSafetyEvent(request(body()), { admin: async () => admin })).status).toBe(503);
  });
});

describe("signed safety-state read", () => {
  const identity = {
    origin: "https://jackboy.example.com",
    clientId: "omni-mothership-client-01",
    projectId: PROJECT,
    bootstrap: "b".repeat(40),
    secret: "k".repeat(48),
  };
  const reply = (nonce: string, extra: Record<string, unknown> = {}, safety: Record<string, unknown> = {}) =>
    JSON.stringify({
      contract: "omni.link/v2",
      requestNonce: nonce,
      projectId: PROJECT,
      execution: "none",
      safety: {
        paused: false,
        codeStop: true,
        codeEnabled: false,
        cancellation: "not_needed",
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        ...safety,
      },
      ...extra,
    });
  const fetcher =
    (make: (nonce: string) => { status: number; body: string; sign?: boolean }) =>
    async (_url: string, init: RequestInit) => {
      const nonce = new Headers(init.headers).get("x-omni-nonce")!;
      const r = make(nonce);
      const proof = createHmac("sha256", identity.secret)
        .update(`omni.link/v2\nresponse\n${nonce}\n${r.status}\n${r.body}`)
        .digest("hex");
      return new Response(r.body, { status: r.status, headers: r.sign === false ? {} : { "x-omni-proof": proof } });
    };
  it("accepts an exact signed, project-bound, fresh reply", async () => {
    const r = await readJackboySafetyState(identity, {
      fetch: fetcher((n) => ({ status: 200, body: reply(n) })),
    });
    expect(r.codeStop).toBe(true);
    expect(r.proofDigest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("refuses an unsigned reply, a different project and an over-long expiry", async () => {
    await expect(
      readJackboySafetyState(identity, { fetch: fetcher((n) => ({ status: 200, body: reply(n), sign: false })) }),
    ).rejects.toMatchObject({ stage: "proof" });
    await expect(
      readJackboySafetyState(identity, {
        fetch: fetcher((n) => ({ status: 200, body: reply(n, { projectId: "0f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b" }) })),
      }),
    ).rejects.toMatchObject({ stage: "contract" });
    await expect(
      readJackboySafetyState(identity, {
        fetch: fetcher((n) => ({
          status: 200,
          body: reply(n, {}, { expiresAt: new Date(Date.now() + 600_000).toISOString() }),
        })),
      }),
    ).rejects.toMatchObject({ stage: "contract" });
  });
  it("treats Jackboy's unsigned paused refusal as an error, never as a state", async () => {
    await expect(
      readJackboySafetyState(identity, {
        fetch: fetcher(() => ({ status: 403, body: '{"error":"grant_unavailable"}', sign: false })),
      }),
    ).rejects.toMatchObject({ stage: "http", status: 403, code: "grant_unavailable" });
  });
});
