import { describe, expect, it } from "vitest";
import { featureInput, featurePath, featureRows } from "./repository-features";
import { readRepositoryFeature } from "./repository-features.server";
describe("GitHub feature boundary — synthetic fetch fixtures", () => {
  it("restricts GitHub reads to OMERTA-ROW", () =>
    expect(
      featurePath({ provider: "github", repo: "OTHER/repo", feature: "issues", page: 1 }),
    ).toBeNull());
  it("uses a fixed repository-scoped search", () =>
    expect(
      featurePath({
        provider: "github",
        repo: "OMERTA-ROW/repo",
        feature: "code-search",
        search: "hello",
        page: 1,
      }),
    ).toBe("/search/code?q=repo%3AOMERTA-ROW%2Frepo%20hello&page=1&per_page=50"));
  it.each(["repo:OTHER/repo", "hello&token=x", "user:someone", "hello/or", "hello\nrepo:other"])(
    "rejects query scope injection %s",
    (search) =>
      expect(
        featureInput.safeParse({
          provider: "github",
          repo: "OMERTA-ROW/repo",
          feature: "code-search",
          page: 1,
          search,
        }).success,
      ).toBe(false),
  );
  it("parses only actual environments", () =>
    expect(featureRows("environments", { environments: [{ id: 7, name: "staging" }] })).toEqual([
      { id: "7", name: "staging", status: "Not reported", updated: "Not reported" },
    ]));
  it("preserves real branch SHA and protection", () =>
    expect(
      featureRows("branches", [{ name: "main", commit: { sha: "abc123" }, protected: false }])[0],
    ).toEqual({ id: "abc123", name: "main", status: "Not protected", updated: "Not reported" }));
  it("uses only the linked GitHub gateway and never Forgejo credentials", async () => {
    const f = (async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://connector-gateway.lovable.dev/github/repos/OMERTA-ROW/repo/issues?page=1&per_page=50",
      );
      const h = new Headers(init?.headers);
      expect(h.get("Authorization")).toBe("Bearer fixture-lovable");
      expect(h.get("X-Connection-Api-Key")).toBe("fixture-github");
      expect(h.has("CF-Access-Client-Secret")).toBe(false);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      return new Response("[]");
    }) as typeof fetch;
    const result = await readRepositoryFeature(
      { provider: "github", repo: "OMERTA-ROW/repo", feature: "issues", page: 1 },
      { lovableKey: "fixture-lovable", githubKey: "fixture-github", token: "must-not-use" },
      f,
    );
    expect(result.state).toBe("read");
  });
});
