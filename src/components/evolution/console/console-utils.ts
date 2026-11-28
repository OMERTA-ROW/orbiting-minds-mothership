import type { ForgejoRepo } from "@/lib/forgejo";

/** Browser-only filtering over the real gateway result; no records are invented. */
export function filterForgejoRepos(repos: readonly ForgejoRepo[], query: string): ForgejoRepo[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...repos];
  return repos.filter((repo) =>
    [repo.name, repo.branch, repo.private ? "private" : "public"].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    ),
  );
}

export function consoleDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not reported";
}
