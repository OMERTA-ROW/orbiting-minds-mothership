import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JackboyLink,
  assertPublicLinkOrigin,
  configuredJackboyLink,
  configuredJackboyConfiguration,
  checkJackboyRunnerConfiguration,
  type JackboyLinkConfig,
} from "./jackboy-link.server";

const ORIGIN = "https://jackboy-example.up.railway.app";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const JOB = "44444444-4444-4444-8444-444444444444";
const SECRET = "s".repeat(64);
const BOOTSTRAP = "b".repeat(64);
const SESSION = "a".repeat(64);
const SCOPES = ["jobs.cancel", "jobs.read", "protocol.self-test"];
const hmac = (text: string) => createHmac("sha256", SECRET).update(text).digest("hex");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const config = (): JackboyLinkConfig => ({
  origin: ORIGIN,
  clientId: "mothership-test",
  projectId: PROJECT,
  bootstrap: BOOTSTRAP,
  secret: SECRET,
  approvalExpiresAt: Date.now() + 3600_000,
});

type Seen = { url: string; init: RequestInit };

/** Fake Jackboy that checks the request signature and signs its replies. */
function fakeJackboy(
  seen: Seen[],
  tweak: (reply: Record<string, unknown>, nonce: string) => Record<string, unknown> = (r) => r,
  proofOverride?: string,
) {
  return async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    const h = init.headers as Record<string, string>;
    const body = String(init.body);
    const token = h["authorization"]!.replace(/^Bearer /, "");
    const message = `omni.link/v2\nPOST\n/api/public/omni/link\n${h["x-omni-timestamp"]}\n${h["x-omni-nonce"]}\n${sha(token)}\n${body}`;
    if (h["x-omni-signature"] !== hmac(message)) return new Response("{}", { status: 401 });
    const request = JSON.parse(body);
    const nonce = h["x-omni-nonce"]!;
    const base =
      request.action === "handshake"
        ? {
            sessionToken: SESSION,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            capabilities: SCOPES,
            ready: true,
          }
        : {
            job: {
              id: request.jobId,
              status: request.action === "submit" ? "queued" : "completed",
              result: null,
            },
          };
    const text = JSON.stringify(
      tweak({ contract: "omni.link/v2", requestNonce: nonce, ...base }, nonce),
    );
    const status = request.action === "submit" ? 202 : 200;
    return new Response(text, {
      status,
      headers: {
        "x-omni-proof":
          proofOverride ?? hmac(`omni.link/v2\nresponse\n${nonce}\n${status}\n${text}`),
      },
    });
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Jackboy link transport (public certificate, no CA file)", () => {
  it("verifies a signed remote configuration using link credentials, never a local runner secret or execution grant", async () => {
    vi.stubEnv("OMNI_LINK_RUNNER_MODE", "");
    vi.stubEnv("OMNI_LINK_NODE_RUNNER_ENABLED", "");
    vi.stubEnv("OMNI_LINK_REMOTE_RUNNER_SECRET", "");
    vi.stubEnv("JACKBOY_LINK_ENABLED", "");
    vi.stubEnv("OMNI_LINK_APPROVAL_EXPIRES_AT", "");
    vi.stubEnv("JACKBOY_LINK_ORIGIN", ORIGIN);
    vi.stubEnv("JACKBOY_LINK_RUNNER_ORIGIN", "https://runner.up.railway.app");
    vi.stubEnv("OMNI_LINK_CLIENT_ID", "mothership-test");
    vi.stubEnv("OMNI_LINK_PROJECT_ID", PROJECT);
    vi.stubEnv("OMNI_LINK_BOOTSTRAP_KEY", BOOTSTRAP);
    vi.stubEnv("OMNI_LINK_HMAC_SECRET", SECRET);
    const seen: Seen[] = [];
    const audit = vi.fn(async () => {});
    const configuration = {
      runnerOrigin: "https://runner.up.railway.app",
      runnerMode: true,
      nodeRunnerEnabled: true,
      remoteRunnerSecretConfigured: true,
      runtimeAvailable: true,
    };
    const result = await checkJackboyRunnerConfiguration(configuredJackboyConfiguration(), audit, {
      fetch: fakeJackboy(seen, (reply) => ({
        ...reply,
        projectId: PROJECT,
        execution: "none",
        configuration,
      })),
    });
    expect(result).toEqual(configuration);
    expect(seen).toHaveLength(1);
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({
      action: "configuration",
      projectId: PROJECT,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(audit).toHaveBeenCalledWith("configuration_verified");
  });

  it.each(["proof", "origin", "shape", "execution", "project"])(
    "refuses a configuration response with invalid %s",
    async (problem) => {
      const configuration = {
        runnerOrigin:
          problem === "origin" ? "https://other.example" : "https://runner.up.railway.app",
        runnerMode: true,
        nodeRunnerEnabled: problem === "shape" ? "true" : true,
        remoteRunnerSecretConfigured: true,
        runtimeAvailable: true,
      };
      await expect(
        checkJackboyRunnerConfiguration(
          { ...config(), runnerOrigin: "https://runner.up.railway.app" },
          async () => {},
          {
            fetch: fakeJackboy(
              [],
              (reply) => ({
                ...reply,
                projectId: problem === "project" ? JOB : PROJECT,
                execution: problem === "execution" ? "self-test" : "none",
                configuration,
              }),
              problem === "proof" ? "0".repeat(64) : undefined,
            ),
          },
        ),
      ).rejects.toThrow();
    },
  );

  it("treats signed unavailable configuration as unresolved and fails closed on audit errors", async () => {
    const c = { ...config(), runnerOrigin: "https://runner.up.railway.app" };
    const fetch = fakeJackboy([], (reply) => ({
      ...reply,
      projectId: PROJECT,
      execution: "none",
      configuration: null,
    }));
    expect(await checkJackboyRunnerConfiguration(c, async () => {}, { fetch })).toBeNull();
    const noAudit = vi.fn(async () => {
      throw new Error("audit unavailable");
    });
    const send = vi.fn(fetch);
    await expect(checkJackboyRunnerConfiguration(c, noAudit, { fetch: send })).rejects.toThrow(
      "audit unavailable",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("posts a signed request to the exact public route with redirects refused and a timeout", async () => {
    const seen: Seen[] = [];
    const link = new JackboyLink(config(), async () => {}, { fetch: fakeJackboy(seen) });
    await link.connect();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${ORIGIN}/api/public/omni/link`);
    expect(seen[0]!.init.method).toBe("POST");
    expect(seen[0]!.init.redirect).toBe("manual");
    expect(seen[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(seen[0]!.init).sort()).toEqual(
      ["body", "headers", "method", "redirect", "signal"].sort(),
    );
    expect((seen[0]!.init.headers as Record<string, string>)["authorization"]).toBe(
      `Bearer ${BOOTSTRAP}`,
    );
  });

  it("submits only the fixed self-test kind and returns the queued job", async () => {
    const seen: Seen[] = [];
    const link = new JackboyLink(config(), async () => {}, { fetch: fakeJackboy(seen) });
    const job = await link.execute("submit", JOB);
    expect(job).toEqual({ id: JOB, status: "queued", result: null });
    expect(JSON.parse(String(seen[1]!.init.body))).toEqual({
      action: "submit",
      projectId: PROJECT,
      jobId: JOB,
      kind: "protocol.self-test",
    });
    expect((seen[1]!.init.headers as Record<string, string>)["authorization"]).toBe(
      `Bearer ${SESSION}`,
    );
  });

  it("refuses a redirect response", async () => {
    const link = new JackboyLink(config(), async () => {}, {
      fetch: async () =>
        new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }),
    });
    await expect(link.connect()).rejects.toThrow("Jackboy link refused a redirect.");
  });

  it("refuses an opaque redirect response", async () => {
    const opaque = { type: "opaqueredirect", status: 0, headers: new Headers(), body: null };
    const link = new JackboyLink(config(), async () => {}, {
      fetch: async () => opaque as unknown as Response,
    });
    await expect(link.connect()).rejects.toThrow("Jackboy link refused a redirect.");
  });

  it("refuses a reply larger than 32 KB, declared or streamed", async () => {
    const declared = new JackboyLink(config(), async () => {}, {
      fetch: async () =>
        new Response("{}", { status: 200, headers: { "content-length": "32769" } }),
    });
    await expect(declared.connect()).rejects.toThrow("Jackboy response too large.");
    const streamed = new JackboyLink(config(), async () => {}, {
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(20000));
              controller.enqueue(new Uint8Array(20000));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    });
    await expect(streamed.connect()).rejects.toThrow("Jackboy response too large.");
  });

  it("times out a request that does not answer", async () => {
    const link = new JackboyLink(config(), async () => {}, {
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
        ),
    });
    await expect(link.connect()).rejects.toThrow("Jackboy link timeout.");
  });

  it("reports a failed connection, such as an untrusted certificate, without details", async () => {
    const link = new JackboyLink(config(), async () => {}, {
      fetch: async () => {
        throw new TypeError("fetch failed: self-signed certificate");
      },
    });
    await expect(link.connect()).rejects.toThrow("Jackboy link connection failed.");
  });

  it("rejects an invalid reply proof and a mismatched nonce", async () => {
    const badProof = new JackboyLink(config(), async () => {}, {
      fetch: fakeJackboy([], undefined, "0".repeat(64)),
    });
    await expect(badProof.connect()).rejects.toThrow("Jackboy response proof is invalid.");
    const badNonce = new JackboyLink(config(), async () => {}, {
      fetch: fakeJackboy([], (reply) => ({ ...reply, requestNonce: "f".repeat(32) })),
    });
    await expect(badNonce.connect()).rejects.toThrow("Jackboy response contract is invalid.");
  });

  it("does not send when the pre-request audit fails", async () => {
    const seen: Seen[] = [];
    const link = new JackboyLink(
      config(),
      async () => {
        throw new Error("audit unavailable");
      },
      { fetch: fakeJackboy(seen) },
    );
    await expect(link.connect()).rejects.toThrow("audit unavailable");
    expect(seen).toHaveLength(0);
  });
});

describe("Jackboy link settings", () => {
  const stubValid = (expiresAt = new Date(Date.now() + 3600_000).toISOString()) => {
    vi.stubEnv("JACKBOY_LINK_ENABLED", "true");
    vi.stubEnv("JACKBOY_LINK_ORIGIN", ORIGIN);
    vi.stubEnv("JACKBOY_LINK_CA_FILE", "");
    vi.stubEnv("OMNI_LINK_CLIENT_ID", "mothership-test");
    vi.stubEnv("OMNI_LINK_PROJECT_ID", PROJECT);
    vi.stubEnv("OMNI_LINK_BOOTSTRAP_KEY", BOOTSTRAP);
    vi.stubEnv("OMNI_LINK_HMAC_SECRET", SECRET);
    vi.stubEnv("OMNI_LINK_APPROVAL_EXPIRES_AT", expiresAt);
  };

  it("loads valid settings without any certificate file", async () => {
    stubValid();
    await expect(configuredJackboyLink()).resolves.toMatchObject({
      origin: ORIGIN,
      projectId: PROJECT,
    });
  });

  it("stays disabled unless the switch is exactly true", async () => {
    stubValid();
    vi.stubEnv("JACKBOY_LINK_ENABLED", "");
    await expect(configuredJackboyLink()).rejects.toThrow("Jackboy link is disabled.");
    vi.stubEnv("JACKBOY_LINK_ENABLED", "TRUE");
    await expect(configuredJackboyLink()).rejects.toThrow("Jackboy link is disabled.");
  });

  it("refuses an expired approval and one more than 24 hours ahead", async () => {
    stubValid(new Date(Date.now() - 1000).toISOString());
    await expect(configuredJackboyLink()).rejects.toThrow(/invalid or expired/);
    stubValid(new Date(Date.now() + 25 * 3600_000).toISOString());
    await expect(configuredJackboyLink()).rejects.toThrow(/invalid or expired/);
    stubValid("");
    await expect(configuredJackboyLink()).rejects.toThrow(/invalid or expired/);
  });

  it.each([
    "http://jackboy-example.up.railway.app",
    "https://jackboy-example.up.railway.app:8443",
    "https://jackboy-example.up.railway.app/api",
    "https://jackboy-example.up.railway.app/?x=1",
    "https://user:pass@jackboy-example.up.railway.app",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://jackboy.railway.internal",
    "https://printer.local",
    "https://intranet",
    "not a url",
  ])("refuses the address %s", (origin) => {
    expect(() => assertPublicLinkOrigin(origin)).toThrow(
      "Jackboy link address must be a public HTTPS address.",
    );
  });

  it("accepts a public Railway or custom HTTPS address", () => {
    expect(() => assertPublicLinkOrigin(ORIGIN)).not.toThrow();
    expect(() => assertPublicLinkOrigin("https://jackboy.example.com/")).not.toThrow();
  });

  it("has no custom certificate, insecure TLS or Node-only HTTPS path", () => {
    const source = readFileSync("src/lib/jackboy-link.server.ts", "utf8");
    expect(source).not.toMatch(/node:https|node:fs|rejectUnauthorized|JACKBOY_LINK_CA_FILE|\bca:/);
  });
});
