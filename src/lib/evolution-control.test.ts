import { describe, expect, it } from "vitest";
import {
  checkableWebsite,
  directoryInput,
  discoverRepos,
  suggestRepo,
  type GithubFetch,
} from "./evolution-control";

const repo = (id: number, name = `org/r${id}`) => ({
  id,
  full_name: name,
  owner: { login: "org" },
  private: false,
  html_url: `https://github.com/${name}`,
});

describe("GitHub discovery", () => {
  it("follows pages until a short page and dedupes by repo ID across sources", async () => {
    const calls: string[] = [];
    const fetchGh: GithubFetch = async (path) => {
      calls.push(path);
      if (path.startsWith("/user/orgs")) return { status: 200, body: [{ login: "OMERTA-ROW" }] };
      if (path.startsWith("/user/repos")) {
        if (path.endsWith("page=1"))
          return { status: 200, body: Array.from({ length: 100 }, (_, i) => repo(i + 1)) };
        return { status: 200, body: [repo(101), repo(102)] };
      }
      return { status: 200, body: [repo(5), repo(200)] };
    };
    const out = await discoverRepos(fetchGh, ["OMERTA-ROW"]);
    expect(out.repos).toHaveLength(103);
    expect(out.pages).toBe(3);
    expect(calls.filter((c) => c.startsWith("/orgs/OMERTA-ROW"))).toHaveLength(1);
  });
  it("records a GitHub error without inventing repos", async () => {
    const out = await discoverRepos(
      async (p) =>
        p.startsWith("/user/orgs") ? { status: 403, body: {} } : { status: 401, body: {} },
      [],
    );
    expect(out.repos).toHaveLength(0);
    expect(out.errors[0]).toContain("401");
  });
  it("ignores invalid organization names", async () => {
    const calls: string[] = [];
    await discoverRepos(async (p) => (calls.push(p), { status: 200, body: [] }), ["../evil"]);
    expect(calls.some((c) => c.includes("evil"))).toBe(false);
  });
});

describe("directory rules", () => {
  it("suggests a repo by normalized name only", () => {
    const repos = [{ github_repo_id: 9, full_name: "OMERTA-ROW/cyberlink-social" }];
    expect(suggestRepo("CyberLink Social", repos)?.github_repo_id).toBe(9);
    expect(suggestRepo("OMNI", repos)).toBeUndefined();
  });
  it("only allows public https websites", () => {
    expect(checkableWebsite("https://evoomni.tech")).not.toBeNull();
    for (const bad of [
      "http://evoomni.tech",
      "https://localhost",
      "https://10.0.0.1",
      "https://a.b:8443",
      "https://u:p@a.com",
    ])
      expect(checkableWebsite(bad)).toBeNull();
    expect(() => directoryInput.parse({ name: "X", websiteUrl: "http://x.com" })).toThrow();
  });
});
