import { describe, expect, it } from "vitest";
import { dispatchHmac } from "./jackboy-dispatch.server";
import { handoffConfig, sendHandoff, sha256Hex } from "./jackboy-handoff.server";
import { HANDOFF_PATH, defaultKind, replySigningString, requestSigningString } from "./jackboy-handoff";

const secret = "s".repeat(40);
const config = { origin: "https://jackboy.example.com", clientId: "mothership", secret };
const job = {
  taskId: "11111111-1111-4111-8111-111111111111",
  project: "Evo",
  repository: "owner/repo",
  kind: "test" as const,
  instructions: "Run the tests",
};

function jackboy(reply: object, opts: { tamper?: boolean; status?: number } = {}) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    const h = new Headers(init.headers);
    const body = String(init.body);
    const expected = await dispatchHmac(
      secret,
      requestSigningString({
        clientId: h.get("x-omni-handoff-client")!,
        timestamp: h.get("x-omni-handoff-timestamp")!,
        nonce: h.get("x-omni-handoff-nonce")!,
        bodySha256: await sha256Hex(body),
      }),
    );
    if (expected !== h.get("x-omni-handoff-signature")) return new Response("bad", { status: 401 });
    const text = JSON.stringify(reply);
    const sig = await dispatchHmac(
      secret,
      replySigningString({ nonce: h.get("x-omni-handoff-nonce")!, bodySha256: await sha256Hex(text) }),
    );
    return new Response(opts.tamper ? text.replace("queued", "running") : text, {
      status: opts.status ?? 200,
      headers: { "x-omni-handoff-signature": sig },
    });
  }) as unknown as typeof fetch;
  return { f, seen };
}

const good = { contract: "omni.handoff/v1", taskId: job.taskId, jackboyJobId: "jb_1", status: "queued" };

describe("omni.handoff/v1 sender", () => {
  it("signs the request and accepts a correctly signed queued reply", async () => {
    const { f, seen } = jackboy(good);
    const r = await sendHandoff(config, "create", job, { fetch: f });
    expect(r).toEqual({ ok: true, jackboyJobId: "jb_1", status: "queued" });
    expect(seen[0]!.url).toBe(`https://jackboy.example.com${HANDOFF_PATH}`);
    expect(seen[0]!.init.redirect).toBe("manual");
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body).toMatchObject({ action: "create", repository: "owner/repo", kind: "test" });
  });

  it("rejects a tampered reply", async () => {
    const { f } = jackboy(good, { tamper: true });
    expect(await sendHandoff(config, "create", job, { fetch: f })).toEqual({
      ok: false,
      reason: "reply_unsigned",
    });
  });

  it("rejects a reply signed with the wrong secret", async () => {
    const { f } = jackboy(good);
    const r = await sendHandoff({ ...config, secret: "x".repeat(40) }, "create", job, { fetch: f });
    expect(r.ok).toBe(false);
  });

  it("rejects a reply for a different task", async () => {
    const { f } = jackboy({ ...good, taskId: "22222222-2222-4222-8222-222222222222" });
    expect(await sendHandoff(config, "create", job, { fetch: f })).toEqual({
      ok: false,
      reason: "reply_invalid",
    });
  });

  it("refuses redirects", async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: "https://x.example" } })) as unknown as typeof fetch;
    expect(await sendHandoff(config, "status", job, { fetch: f })).toEqual({
      ok: false,
      reason: "redirect_refused",
    });
  });

  it("the same task always produces the same fingerprint", async () => {
    const { f, seen } = jackboy(good);
    await sendHandoff(config, "create", job, { fetch: f });
    await sendHandoff(config, "create", job, { fetch: f });
    const d = seen.map((s) => JSON.parse(String(s.init.body)).payloadDigest);
    expect(d[0]).toBe(d[1]);
  });
});

describe("handoff config", () => {
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
  it("refuses non-public origins and short secrets", () => {
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_ORIGIN: "http://jackboy.example.com" })).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_ORIGIN: "https://localhost" })).toBeNull();
    expect(handoffConfig({ ...env, JACKBOY_HANDOFF_HMAC_SECRET: "short" })).toBeNull();
  });
  it("defaults test-like tasks to Test", () => {
    expect(defaultKind("code.test")).toBe("test");
    expect(defaultKind("code.generate")).toBe("build");
  });
});
