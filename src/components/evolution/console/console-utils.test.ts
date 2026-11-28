import { describe, expect, it } from "vitest";
import type { ForgejoRepo } from "@/lib/forgejo";
import { filterForgejoRepos } from "./console-utils";

const repos: ForgejoRepo[] = [
  {
    id: 1,
    name: "OMERTA-ROW/Neuro-Intelligence",
    private: true,
    empty: false,
    branch: "main",
    updatedAt: null,
    sync: { kind: "not_reported" },
  },
  {
    id: 2,
    name: "OMERTA-ROW/Public-Site",
    private: false,
    empty: false,
    branch: "develop",
    updatedAt: null,
    sync: { kind: "not_reported" },
  },
];

describe("Developer Center repository filtering", () => {
  it("keeps every real repository when search is empty", () => {
    expect(filterForgejoRepos(repos, "  ")).toEqual(repos);
  });

  it("matches repository names without changing their records", () => {
    expect(filterForgejoRepos(repos, "neuro").map((repo) => repo.id)).toEqual([1]);
  });

  it("matches reported branch and privacy metadata", () => {
    expect(filterForgejoRepos(repos, "DEVELOP").map((repo) => repo.id)).toEqual([2]);
    expect(filterForgejoRepos(repos, "private").map((repo) => repo.id)).toEqual([1]);
  });

  it("returns an honest empty result for an unmatched search", () => {
    expect(filterForgejoRepos(repos, "not-a-repository")).toEqual([]);
  });
});
