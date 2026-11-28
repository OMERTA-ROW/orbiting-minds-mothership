import { describe, expect, it } from "vitest";
import { featureInput, featurePath, featureRows } from "./repository-features";
import { readRepositoryFeature } from "./repository-features.server";
const env = {
  base: "https://git-api.evoomni.tech",
  token: "fixture-token",
  accessId: "fixture-id",
  accessSecret: "fixture-secret",
};
describe("Repository feature reads — synthetic transport fixtures", () => {
  it.each([
    "../repo",
    "owner/..",
    "https://evil.test/repo",
    "owner/repo?next=x",
    "owner/repo/extra",
  ])("rejects unsafe repository %s", (repo) => {
    expect(featureInput.safeParse({ repo, feature: "issues", page: 1 }).success).toBe(false);
  });
  it.each([0, 21, 1.5])("rejects page %s", (page) =>
    expect(featureInput.safeParse({ repo: "owner/repo", feature: "branches", page }).success).toBe(
      false,
    ),
  );
  it("constructs only the requested GET path", () =>
    expect(featurePath({ repo: "owner/repo", feature: "commits", page: 2 })).toBe(
      "/api/v1/repos/owner/repo/commits?page=2&limit=50",
    ));
  it("reads action runs without inventing records", () =>
    expect(
      featureRows("actions", {
        workflow_runs: [{ id: 7, name: "actual response name", status: "completed" }],
      }),
    ).toEqual([
      { id: "7", name: "actual response name", status: "completed", updated: "Not reported" },
    ]));
  it("rejects invalid response shapes", () =>
    expect(() => featureRows("issues", { issues: [] })).toThrow());
  it("preserves exact origin, GET, headers and redirect refusal", async () => {
    const fetcher = (async (url: string, init?: RequestInit) => {
      expect(url).toBe(env.base + "/api/v1/repos/owner/repo/branches?page=1&limit=50");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe("manual");
      const h = new Headers(init?.headers);
      expect(h.get("Authorization")).toBe("Bearer fixture-token");
      expect(h.get("CF-Access-Client-Id")).toBe(env.accessId);
      expect(h.get("CF-Access-Client-Secret")).toBe(env.accessSecret);
      expect(h.get("User-Agent")).toBe("Evolution-OMNI-Gateway/1.0");
      expect(h.get("Accept")).toBe("application/json");
      return new Response('[{"name":"main","protected":true}]');
    }) as typeof fetch;
    const r = await readRepositoryFeature(
      { repo: "owner/repo", feature: "branches", page: 1 },
      env,
      fetcher,
    );
    expect(r.state).toBe("read");
    expect(r.rows[0]?.status).toBe("Protected");
  });
  it.each(["environments", "packages", "code-search", "wiki"] as const)(
    "never probes unreviewed %s",
    async (feature) => {
      let calls = 0;
      const fetcher = (async () => {
        calls++;
        return new Response("[]");
      }) as typeof fetch;
      expect(
        (await readRepositoryFeature({ repo: "owner/repo", feature, page: 1 }, env, fetcher)).state,
      ).toBe("blocked");
      expect(calls).toBe(0);
    },
  );
  it.each([302, 401, 403, 404, 429, 500])(
    "never treats HTTP %s as successful or exposes response text",
    async (status) => {
      const r = await readRepositoryFeature(
        { repo: "owner/repo", feature: "issues", page: 1 },
        env,
        (async () => new Response("secret-provider-text", { status })) as typeof fetch,
      );
      expect(r.state).toBe("blocked");
      expect(JSON.stringify(r)).not.toContain("secret-provider-text");
    },
  );
  it("does not send credentials to other origins", async () => {
    let calls = 0;
    const r = await readRepositoryFeature(
      { repo: "owner/repo", feature: "issues", page: 1 },
      { ...env, base: "https://evil.test" },
      (async () => {
        calls++;
        return new Response("[]");
      }) as typeof fetch,
    );
    expect(r.state).toBe("blocked");
    expect(calls).toBe(0);
  });
  it("redacts network exceptions", async () => {
    const r = await readRepositoryFeature(
      { repo: "owner/repo", feature: "issues", page: 1 },
      env,
      (async () => {
        throw new Error("private-key");
      }) as typeof fetch,
    );
    expect(r.state).toBe("blocked");
    expect(JSON.stringify(r)).not.toContain("private-key");
  });
  it("bounds response bytes", async () => {
    expect(
      (
        await readRepositoryFeature(
          { repo: "owner/repo", feature: "issues", page: 1 },
          env,
          (async () => new Response("x".repeat(2000001))) as typeof fetch,
        )
      ).state,
    ).toBe("blocked");
  });
});
