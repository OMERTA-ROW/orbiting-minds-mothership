import { describe, expect, it } from "vitest";
import { forgejoOrigin, listForgejoRepos } from "./forgejo";

// Synthetic unit fixtures only; live acceptance must use the owner's real gateway.
const env = {
  base: "https://git-api.evoomni.tech",
  token: "unit-gateway-key",
  accessClientId: "unit-access-id",
  accessClientSecret: "unit-access-secret",
};

const repo = (id: number) => ({
  id,
  full_name: `OMERTA-ROW/r${id}`,
  private: true,
  default_branch: "main",
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("forgejo read-only provider", () => {
  it("reports all four missing settings", async () => {
    expect(await listForgejoRepos({})).toEqual({
      state: "not_configured",
      missing: [
        "FORGEJO_BASE_URL",
        "FORGEJO_API_TOKEN",
        "CF_ACCESS_CLIENT_ID",
        "CF_ACCESS_CLIENT_SECRET",
      ],
    });
  });
  it.each([
    "http://localhost:3000",
    "https://127.0.0.1:3000",
    "http://git-api.evoomni.tech",
    "https://git.example.com",
    "https://git-api.evoomni.tech.attacker.test",
    "https://git-api.evoomni.tech:8443",
    "https://git-api.evoomni.tech/api/v1",
    "https://user:password@git-api.evoomni.tech",
    "https://git-api.evoomni.tech/?next=x",
    "https://git-api.evoomni.tech/#fragment",
  ])("refuses non-allowlisted URL %s", (url) => {
    expect(forgejoOrigin(url)).toBeNull();
  });
  it("accepts only the approved gateway root", () => {
    expect(forgejoOrigin(env.base + "/")).toBe(env.base);
  });
  it("does not request anything with missing Access credentials or an invalid origin", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return ok([]);
    }) as typeof fetch;
    expect(await listForgejoRepos({ base: env.base, token: env.token }, f)).toEqual({
      state: "not_configured",
      missing: ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"],
    });
    expect(await listForgejoRepos({ ...env, base: "https://other.test" }, f)).toEqual({
      state: "invalid_origin",
    });
    expect(calls).toBe(0);
  });
  it("paginates, dedupes and uses GET only", async () => {
    const methods: string[] = [];
    const pages = [Array.from({ length: 50 }, (_, i) => repo(i)), [repo(1), repo(60)]];
    const f = (async (u: string, init?: RequestInit) => {
      expect(u).toBe(`${env.base}/api/v1/user/repos?page=${methods.length + 1}&limit=50`);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${env.token}`);
      expect(headers.get("CF-Access-Client-Id")).toBe(env.accessClientId);
      expect(headers.get("CF-Access-Client-Secret")).toBe(env.accessClientSecret);
      expect(headers.get("User-Agent")).toBe("Evolution-OMNI-Gateway/1.0");
      expect(headers.get("Accept")).toBe("application/json");
      expect(init?.redirect).toBe("manual");
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      methods.push(init?.method ?? "");
      return ok(pages.shift() ?? []);
    }) as typeof fetch;
    const r = await listForgejoRepos(env, f);
    expect(r.state === "connected" && r.repos.length).toBe(51);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  });
  it("never reports success on a refused token", async () => {
    const f = (async () => new Response("", { status: 401 })) as typeof fetch;
    expect((await listForgejoRepos(env, f)).state).toBe("unreachable");
  });
  it("returns every one of 38 private repository fixtures without truncation", async () => {
    const f = (async () => ok(Array.from({ length: 38 }, (_, i) => repo(i + 1)))) as typeof fetch;
    const r = await listForgejoRepos(env, f);
    expect(r.state === "connected" && r.repos.length).toBe(38);
    expect(r.state === "connected" && r.repos.every((x) => x.private)).toBe(true);
    expect(r.state === "connected" && r.truncated).toBe(false);
  });
  it("refuses redirects without a second request or credential forwarding", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: { Location: "https://other.test" } });
    }) as typeof fetch;
    expect((await listForgejoRepos(env, f)).state).toBe("unreachable");
    expect(calls).toBe(1);
  });
  it.each([403, 500])("does not report HTTP %s as connected", async (status) => {
    const f = (async () => new Response("", { status })) as typeof fetch;
    expect((await listForgejoRepos(env, f)).state).toBe("unreachable");
  });
  it("rejects HTTP 200 with a login page or an invalid repository shape", async () => {
    for (const body of ["<html>Login</html>", { repositories: [] }, [{ id: 1 }]]) {
      const f = (async () => ok(body)) as typeof fetch;
      expect((await listForgejoRepos(env, f)).state).toBe("unreachable");
    }
  });
  it("redacts network exceptions instead of returning their contents", async () => {
    const f = (async () => {
      throw new Error("unit-sensitive-network-detail");
    }) as typeof fetch;
    expect(await listForgejoRepos(env, f)).toEqual({
      state: "unreachable",
      message: "The Evolution Git gateway did not answer.",
    });
  });
});
