import { describe, it, expect } from "vitest";
import { auditReader } from "./forgejo-audit.server";
const env = {
  base: "https://git-api.evoomni.tech",
  token: "unit-key",
  accessId: "unit-id",
  accessSecret: "unit-secret",
  lovableKey: "unit-lovable",
  githubKey: "unit-github",
};
describe("audit HTTP boundary (mock fetch)", () => {
  it.each([
    "https://evil.test",
    "/api/v1/repos/o/r/issues",
    "/api/v1/repos/../r",
    "/api/v1/admin/users",
    "/repos/OTHER/r",
    "/api/v1/user/repos?redirect=evil",
  ])("refuses path %s", async (path) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response("[]");
    }) as typeof fetch;
    await auditReader(path.startsWith("/repos") ? "github" : "forgejo", env, f)(path);
    expect(calls).toBe(0);
  });
  it("preserves fixed origin, GET and required authentication", async () => {
    const f = (async (u: string, init?: RequestInit) => {
      expect(u).toBe(env.base + "/api/v1/repos/local/r/branches?page=1&limit=50");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(init?.body).toBeUndefined();
      const h = new Headers(init?.headers);
      expect(h.get("Authorization")).toBe("Bearer unit-key");
      expect(h.get("CF-Access-Client-Id")).toBe("unit-id");
      expect(h.get("CF-Access-Client-Secret")).toBe("unit-secret");
      expect(h.get("User-Agent")).toBe("Evolution-OMNI-Gateway/1.0");
      return new Response("[]");
    }) as typeof fetch;
    expect(
      (await auditReader("forgejo", env, f)("/api/v1/repos/local/r/branches?page=1&limit=50"))
        .status,
    ).toBe(200);
  });
  it("never forwards error text or follows redirects", async () => {
    let count = 0;
    const f = (async () => {
      count++;
      return new Response("sensitive", { status: 302, headers: { Location: "https://evil.test" } });
    }) as typeof fetch;
    expect(await auditReader("forgejo", env, f)("/api/v1/user/repos")).toEqual({
      status: 302,
      body: null,
    });
    expect(count).toBe(1);
  });
  it("redacts exceptions and malformed JSON", async () => {
    for (const f of [
      (async () => {
        throw new Error("sensitive");
      }) as typeof fetch,
      (async () => new Response("sensitive")) as typeof fetch,
    ])
      expect(await auditReader("forgejo", env, f)("/api/v1/user/repos")).toEqual({
        status: 502,
        body: null,
      });
  });
  it("refuses missing Access settings and unapproved origin before fetch", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response("[]");
    }) as typeof fetch;
    for (const config of [
      { ...env, accessSecret: "" },
      { ...env, base: "https://other.test" },
    ])
      expect((await auditReader("forgejo", config, f)("/api/v1/user/repos")).status).toBe(503);
    expect(calls).toBe(0);
  });
  it("bounds response bytes", async () => {
    const f = (async () => new Response("x".repeat(4_000_001))) as typeof fetch;
    expect(await auditReader("forgejo", env, f)("/api/v1/user/repos")).toEqual({
      status: 502,
      body: null,
    });
  });
});
