import { describe, expect, it } from "vitest";
import { dispatchHmac } from "./jackboy-dispatch.server";
import {
  handoffConfig,
  newNonce,
  sendHandoff,
  sha256Hex,
  unixSeconds,
} from "./jackboy-handoff.server";
import {
  HANDOFF_PATH,
  STORED_STATUS,
  canonicalJob,
  defaultKind,
  handoffBadge,
  requestSigningString,
  responseSigningString,
  sendInput,
} from "./jackboy-handoff";

// Fixed vectors computed independently (Python hmac/hashlib) from Jackboy's
// src/lib/omni-handoff-v1.ts rules, not from this code.
const secret = "jackboy-handoff-test-secret-0123456789abcdef";
const config = { origin: "https://jackboy.example.com", clientId: "mothership", secret };
const NOW_MS = 1762921920_000;
const TS = "1762921920";
const NONCE = "00112233445566778899aabbccddeeff";
const job = {
  taskId: "11111111-1111-4111-8111-111111111111",
  projectId: "6e320e65-08ec-450b-8a26-61206b604513",
  repo: "OMERTA-ROW/jackboy-dev-control",
  kind: "test" as const,
  instructions: "Run the unit tests",
};
const CREATE_BODY =
  '{"action":"create","taskId":"11111111-1111-4111-8111-111111111111","projectId":"6e320e65-08ec-450b-8a26-61206b604513","repo":"OMERTA-ROW/jackboy-dev-control","kind":"test","instructions":"Run the unit tests","digest":"60890b3aaf341a67529e35b45922f2f0a2f6ba94dc6592cecd4438a4408e8865"}';
const CREATE_SIG = "5941bb07c85350a7931d7581fb44122914c123106e397502a1bfcfddf620b5e4";
const STATUS_BODY = '{"action":"status","taskId":"11111111-1111-4111-8111-111111111111"}';
const STATUS_SIG = "d8357e9934b439544da051ed562497c32eeb58e3604294c05d7d002b6714beae";
const OK_BODY =
  '{"contract":"jackboy.omni-handoff/v1","requestNonce":"00112233445566778899aabbccddeeff","jackboyJobId":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","status":"queued"}';
const OK_PROOF_201 = "efadae8e674d22b660c759fc314b2b0929b8e20119ed8751b0f6288b9959326f";
const CONFLICT_BODY =
  '{"contract":"jackboy.omni-handoff/v1","requestNonce":"00112233445566778899aabbccddeeff","error":"task_conflict"}';
const CONFLICT_PROOF_409 = "ea01121f2a5c5dff5f1737f6743d7f423d626e121c4e655411bd7c2b3586747b";

type Seen = { url: string; init: RequestInit };
function replying(body: string, status: number, proof?: string) {
  const seen: Seen[] = [];
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(body, {
      status,
      headers: proof === undefined ? {} : { "X-Jackboy-Proof": proof },
    });
  }) as unknown as typeof fetch;
  return { f, seen };
}
const fixed = { now: NOW_MS, nonce: NONCE };

/** A Jackboy stand-in that signs replies with the real rules for any nonce. */
function liveJackboy(payload: Record<string, unknown>, status = 200) {
  return (async (_url: string, init: RequestInit) => {
    const nonce = new Headers(init.headers).get("x-jackboy-nonce")!;
    const body = JSON.stringify({
      contract: "jackboy.omni-handoff/v1",
      requestNonce: nonce,
      ...payload,
    });
    const proof = await dispatchHmac(secret, responseSigningString(nonce, status, body));
    return new Response(body, { status, headers: { "X-Jackboy-Proof": proof } });
  }) as unknown as typeof fetch;
}

describe("jackboy.omni-handoff/v1 request", () => {
  it("matches the fixed create vector: path, headers, exact body and signature", async () => {
    const { f, seen } = replying(OK_BODY, 201, OK_PROOF_201);
    await sendHandoff(config, "create", job, { ...fixed, fetch: f });
    const { url, init } = seen[0]!;
    expect(url).toBe(`https://jackboy.example.com${HANDOFF_PATH}`);
    expect(new URL(url).search).toBe("");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.body).toBe(CREATE_BODY);
    const h = new Headers(init.headers);
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("x-jackboy-contract")).toBe("jackboy.omni-handoff/v1");
    expect(h.get("x-jackboy-client")).toBe("mothership");
    expect(h.get("x-jackboy-timestamp")).toBe(TS);
    expect(h.get("x-jackboy-nonce")).toBe(NONCE);
    expect(h.get("x-jackboy-signature")).toBe(CREATE_SIG);
  });

  it("matches the fixed status vector (taskId only)", async () => {
    const { f, seen } = replying("{}", 200, "0".repeat(64));
    await sendHandoff(config, "status", job, { ...fixed, fetch: f });
    expect(seen[0]!.init.body).toBe(STATUS_BODY);
    expect(new Headers(seen[0]!.init.headers).get("x-jackboy-signature")).toBe(STATUS_SIG);
  });

  it("signing input is contract, POST, path, client, timestamp, nonce, raw body", async () => {
    expect(
      await dispatchHmac(secret, requestSigningString("mothership", TS, NONCE, CREATE_BODY)),
    ).toBe(CREATE_SIG);
  });

  it("digest is sha256 of the instructions only", async () => {
    expect(JSON.parse(CREATE_BODY).digest).toBe(await sha256Hex("Run the unit tests"));
  });

  it("maps Build to Jackboy's code kind", async () => {
    const { f, seen } = replying(OK_BODY, 201, OK_PROOF_201);
    await sendHandoff(config, "create", { ...job, kind: "build" }, { ...fixed, fetch: f });
    expect(JSON.parse(String(seen[0]!.init.body)).kind).toBe("code");
  });

  it("timestamp is Unix seconds with exactly 10 digits; nonce is 32 lowercase hex", () => {
    expect(unixSeconds(NOW_MS)).toBe("1762921920");
    expect(unixSeconds(1762921920_999)).toBe("1762921920");
    expect(unixSeconds(Date.now())).toMatch(/^[0-9]{10}$/);
    expect(newNonce()).toMatch(/^[a-f0-9]{32}$/);
    expect(newNonce()).not.toBe(newNonce());
  });

  it("refuses to send a body over 8192 bytes", async () => {
    const { f, seen } = replying(OK_BODY, 201, OK_PROOF_201);
    const big = { ...job, instructions: "é".repeat(4000) };
    expect(await sendHandoff(config, "create", big, { ...fixed, fetch: f })).toMatchObject({
      ok: false,
      reason: "request_too_large",
    });
    expect(seen).toHaveLength(0);
  });
});

describe("jackboy.omni-handoff/v1 response proof", () => {
  it("accepts the fixed 201 vector", async () => {
    expect(OK_PROOF_201).toBe(
      await dispatchHmac(secret, responseSigningString(NONCE, 201, OK_BODY)),
    );
    const { f } = replying(OK_BODY, 201, OK_PROOF_201);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toEqual({
      ok: true,
      jackboyJobId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      status: "queued",
      httpStatus: 201,
    });
  });

  it("binds the proof to the HTTP status (201 proof on a 200 reply fails)", async () => {
    const { f } = replying(OK_BODY, 200, OK_PROOF_201);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toMatchObject({
      ok: false,
      reason: "reply_unsigned",
    });
  });

  it("rejects a tampered body", async () => {
    const { f } = replying(OK_BODY.replace("queued", "running"), 201, OK_PROOF_201);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toMatchObject({
      ok: false,
      reason: "reply_unsigned",
      verified: false,
    });
  });

  it("rejects a tampered proof", async () => {
    const bad = OK_PROOF_201.slice(0, -1) + (OK_PROOF_201.endsWith("f") ? "e" : "f");
    const { f } = replying(OK_BODY, 201, bad);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toMatchObject({
      reason: "reply_unsigned",
    });
  });

  it("rejects a missing proof and a wrong secret", async () => {
    const { f } = replying(OK_BODY, 201);
    expect((await sendHandoff(config, "create", job, { ...fixed, fetch: f })).ok).toBe(false);
    const { f: f2 } = replying(OK_BODY, 201, OK_PROOF_201);
    const other = { ...config, secret: "x".repeat(40) };
    expect((await sendHandoff(other, "create", job, { ...fixed, fetch: f2 })).ok).toBe(false);
  });

  it("rejects a correctly signed reply that echoes a different nonce", async () => {
    const otherNonce = "ffeeddccbbaa99887766554433221100";
    const body = OK_BODY.replace(NONCE, otherNonce);
    const proof = await dispatchHmac(secret, responseSigningString(NONCE, 201, body));
    const { f } = replying(body, 201, proof);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toMatchObject({
      ok: false,
      reason: "reply_invalid",
    });
  });

  it("rejects a correctly signed reply with the wrong contract", async () => {
    const body = OK_BODY.replace("jackboy.omni-handoff/v1", "omni.handoff/v1");
    const proof = await dispatchHmac(secret, responseSigningString(NONCE, 201, body));
    const { f } = replying(body, 201, proof);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toMatchObject({
      ok: false,
      reason: "reply_invalid",
    });
  });

  it("returns Jackboy's signed refusal (fixed 409 task_conflict vector)", async () => {
    const { f } = replying(CONFLICT_BODY, 409, CONFLICT_PROOF_409);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toEqual({
      ok: false,
      reason: "task_conflict",
      verified: true,
    });
  });

  it("treats an unsigned 503 handoff_disabled or plain text as not confirmed", async () => {
    const { f } = replying('{"error":"handoff_disabled"}', 503);
    expect(await sendHandoff(config, "create", job, { ...fixed, fetch: f })).toEqual({
      ok: false,
      reason: "reply_unsigned",
      verified: false,
      hint: "handoff_disabled",
    });
    const { f: f2 } = replying("Service Unavailable", 503);
    expect(await sendHandoff(config, "status", job, { ...fixed, fetch: f2 })).toEqual({
      ok: false,
      reason: "reply_unsigned",
      verified: false,
      hint: undefined,
    });
  });

  it("works end to end with random nonces and real-time seconds", async () => {
    const r = await sendHandoff(config, "status", job, {
      fetch: liveJackboy({
        jackboyJobId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        status: "prepared",
      }),
    });
    expect(r).toMatchObject({ ok: true, status: "prepared" });
  });

  it("reports unrecognised statuses as unknown", async () => {
    const r = await sendHandoff(config, "status", job, {
      fetch: liveJackboy({
        jackboyJobId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        status: "warp_speed",
      }),
    });
    expect(r).toMatchObject({ ok: true, status: "unknown" });
  });

  it("refuses redirects", async () => {
    const f = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://x.example" },
      })) as unknown as typeof fetch;
    expect(await sendHandoff(config, "status", job, { fetch: f })).toMatchObject({
      ok: false,
      reason: "redirect_refused",
    });
  });
});

describe("handoff inputs, statuses and config", () => {
  const env = {
    JACKBOY_HANDOFF_ENABLED: "true",
    JACKBOY_HANDOFF_ORIGIN: "https://jackboy.example.com",
    JACKBOY_HANDOFF_CLIENT_ID: "mothership",
    JACKBOY_HANDOFF_HMAC_SECRET: secret,
  };
  it("is off unless explicitly enabled", () => {
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_ENABLED: undefined })).toBeNull();
    expect(handoffConfig(env)).not.toBeNull();
  });
  it("refuses non-public origins, bad client ids and secrets under 32 characters", () => {
    expect(
      handoffConfig({ ...env, JACKBOY_HANDOFF_ORIGIN: "http://jackboy.example.com" }),
    ).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_ORIGIN: "https://localhost" })).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_HMAC_SECRET: "a".repeat(31) })).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_HMAC_SECRET: "a".repeat(32) })).not.toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_CLIENT_ID: "bad id" })).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_CLIENT_ID: "a".repeat(65) })).toBeNull();
  });
  it("requires an explicit uuid Jackboy project id to send", () => {
    const base = { taskId: job.taskId, kind: "test" };
    expect(sendInput.safeParse(base).success).toBe(false);
    expect(sendInput.safeParse({ ...base, jackboyProjectId: "jackboy-dev-control" }).success).toBe(
      false,
    );
    expect(sendInput.safeParse({ ...base, jackboyProjectId: job.projectId }).success).toBe(true);
  });
  it("a different Jackboy project id changes the idempotency fingerprint", () => {
    expect(canonicalJob(job)).not.toBe(
      canonicalJob({ ...job, projectId: "22222222-2222-4222-8222-222222222222" }),
    );
    expect(canonicalJob(job)).toBe(canonicalJob({ ...job }));
  });
  it("keeps the exact Jackboy status for the badge", () => {
    expect(STORED_STATUS.prepared).toBe("queued");
    expect(STORED_STATUS.cancel_requested).toBe("running");
    expect(handoffBadge("queued", "jackboy:prepared")).toBe("Prepared in Jackboy");
    expect(handoffBadge("refused", "jackboy:cancelled")).toBe("Cancelled in Jackboy");
    expect(handoffBadge("error", "unreachable")).toBe("Not confirmed · retry");
  });
  it("defaults test-like tasks to Test", () => {
    expect(defaultKind("code.test")).toBe("test");
    expect(defaultKind("code.generate")).toBe("build");
  });
});
