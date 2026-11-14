import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSafetyEvent, syncJackboySafety } from "./jackboy-safety.server";
import { JackboyLink } from "./jackboy-link.server";
import { FakeJackboy, fakeLinkConfig } from "@/test/support/fake-jackboy";
import { safetyEventMessage } from "./jackboy-safety";

const SECRET = "s".repeat(40);
const PROJECT = "4f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b";

function fakeAdmin(opts: { linkActive?: boolean; stop?: boolean | null; rpcError?: { code: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn.startsWith("jackboy_safety_record") && opts.rpcError) return { data: null, error: opts.rpcError };
      if (fn === "activation_effective") return { data: opts.linkActive ?? false, error: null };
      if (fn === "jackboy_permits_enforce") return { data: 0, error: null };
      if (fn.startsWith("jackboy_safety_record")) {
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

const snapshot = (o: Record<string, unknown> = {}) => ({
  contract: "omni.safety/v1" as const,
  checkedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 30_000).toISOString(),
  killSwitch: false,
  emergencyStop: true,
  codeEnabled: true,
  authorization: null,
  autonomousAllowed: false,
  blockedBy: "emergency_stop_engaged",
  manualDiagnosticsAllowed: true,
  activePermits: 0,
  proofDigest: "a".repeat(64),
  ...o,
});

describe("scheduled/owner safety sync", () => {
  it("sends nothing before the Step 9 live link is activated, but enforces permit lapse and freshness", async () => {
    const read = vi.fn();
    const { admin, calls } = fakeAdmin({ linkActive: false });
    const r = await syncJackboySafety(admin, { read });
    expect(r).toMatchObject({ checked: false, reason: "live_link_not_active" });
    expect(read).not.toHaveBeenCalled();
    expect(calls.map((c) => c.fn)).toEqual([
      "jackboy_permits_enforce",
      "jackboy_safety_enforce_freshness",
      "activation_effective",
    ]);
  });
  it("records unknown without sending while Mothership's Emergency Stop is engaged", async () => {
    const read = vi.fn();
    const { admin, calls } = fakeAdmin({ linkActive: true, stop: true });
    const r = await syncJackboySafety(admin, { read });
    expect(read).not.toHaveBeenCalled();
    expect(r.state).toBe("unknown");
    expect(calls.at(-1)?.args?.["_source"]).toBe("failure");
  });
  it("records a failed or refused read as unknown (fail closed)", async () => {
    const read = vi.fn().mockRejectedValue({ stage: "http", status: 503, code: "permit_service_unavailable" });
    const { admin, calls } = fakeAdmin({ linkActive: true });
    const r = await syncJackboySafety(admin, { read });
    expect(r.state).toBe("unknown");
    expect(r.reason).toBe("read_http_503_permit_service_unavailable");
    expect(calls.at(-1)?.args?.["_source"]).toBe("failure");
  });
  it("records a verified omni.safety/v1 snapshot with Jackboy's verdict", async () => {
    const read = vi.fn().mockResolvedValue(snapshot());
    const { admin, calls } = fakeAdmin({ linkActive: true });
    const r = await syncJackboySafety(admin, { read });
    expect(r).toMatchObject({ checked: true, state: "engaged", reason: "verified" });
    expect(calls.at(-1)).toMatchObject({
      fn: "jackboy_safety_record_v2",
      args: { _source: "poll", _code_stop: true, _autonomous_allowed: false, _blocked_by: "emergency_stop_engaged" },
    });
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

describe("session-signed safety snapshot (omni.safety/v1)", () => {
  const link = (fake: FakeJackboy) =>
    new JackboyLink(fakeLinkConfig(), async () => {}, { fetch: fake.fetch, timeoutMs: 200 });
  it("handshakes, then reads an exact signed snapshot with the session token", async () => {
    const fake = new FakeJackboy();
    const s = await link(fake).safety();
    expect(fake.calls).toEqual(["handshake", "safety"]);
    expect(s).toMatchObject({ killSwitch: false, emergencyStop: false, autonomousAllowed: true });
    expect(s.proofDigest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reports Jackboy's verdict when the CODE Emergency Stop is engaged", async () => {
    const fake = new FakeJackboy();
    fake.engageStop();
    const s = await link(fake).safety();
    expect(s).toMatchObject({ emergencyStop: true, autonomousAllowed: false, blockedBy: "emergency_stop_engaged" });
  });
  it("cannot read anything while Jackboy's Kill Switch is on (handshake refused)", async () => {
    const fake = new FakeJackboy();
    fake.killSwitch = true;
    await expect(link(fake).safety()).rejects.toMatchObject({ stage: "http", status: 403, code: "grant_unavailable" });
  });
  it("refuses an unsigned or tampered snapshot", async () => {
    const fake = new FakeJackboy();
    const inner = fake.fetch;
    fake.fetch = async (url, init) => {
      const res = await inner(url, init);
      if (!String(init.body).includes('"safety"')) return res;
      const text = (await res.text()).replace('"killSwitch":false', '"killSwitch":true');
      return new Response(text, { status: res.status, headers: res.headers });
    };
    await expect(link(fake).safety()).rejects.toMatchObject({ stage: "proof" });
  });
});
