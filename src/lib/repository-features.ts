import { z } from "zod";

export const repositoryFeatures = [
  "pull-requests",
  "issues",
  "branches",
  "commits",
  "actions",
  "releases",
  "environments",
  "packages",
  "code-search",
  "wiki",
] as const;
export type RepositoryFeature = (typeof repositoryFeatures)[number];
export const featureInput = z.object({
  repo: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    .refine((s) => s.split("/").every((p) => p !== "." && p !== "..")),
  feature: z.enum(repositoryFeatures),
  page: z.number().int().min(1).max(20),
  provider: z.enum(["forgejo", "github"]).optional(),
  search: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_.\- ]*$/)
    .optional(),
});
export const featureLabels: Record<RepositoryFeature, string> = {
  "pull-requests": "Pull Requests",
  issues: "Issues",
  branches: "Branches",
  commits: "Commits",
  actions: "Actions",
  releases: "Releases",
  environments: "Environments",
  packages: "Packages",
  "code-search": "Code Search",
  wiki: "Wiki",
};
export const featureBlockers: Partial<Record<RepositoryFeature, string>> = {
  environments:
    "No reviewed environment inventory endpoint is available through the read-only Forgejo gateway. Deployment controls remain in Cloud Services.",
  packages:
    "Package registry owner scope and read endpoints have not been reviewed for this gateway. No registry grant is inferred from repository access.",
  "code-search":
    "Repository contents are not indexed and a gateway code-search endpoint has not been verified. No content is uploaded to an external index.",
  wiki: "A scoped wiki read endpoint has not been verified for this gateway. Repository access does not grant a separate wiki clone or write operation.",
};
export function featurePath(input: z.infer<typeof featureInput>): string | null {
  const data = featureInput.parse(input);
  if (data.provider === "github") {
    if (!data.repo.startsWith("OMERTA-ROW/")) return null;
    if (data.feature === "code-search")
      return data.search
        ? `/search/code?q=${encodeURIComponent(`repo:${data.repo} ${data.search}`)}&page=${data.page}&per_page=50`
        : null;
    const endpoint: Partial<Record<RepositoryFeature, string>> = {
      "pull-requests": "pulls",
      issues: "issues",
      branches: "branches",
      commits: "commits",
      actions: "actions/runs",
      releases: "releases",
      environments: "environments",
    };
    const suffix = endpoint[data.feature];
    return suffix ? `/repos/${data.repo}/${suffix}?page=${data.page}&per_page=50` : null;
  }
  const suffix: Partial<Record<RepositoryFeature, string>> = {
    "pull-requests": "pulls",
    issues: "issues",
    branches: "branches",
    commits: "commits",
    actions: "actions/runs",
    releases: "releases",
  };
  const endpoint = suffix[data.feature];
  return endpoint ? `/api/v1/repos/${data.repo}/${endpoint}?page=${data.page}&limit=50` : null;
}
export type FeatureRow = { id: string; name: string; status: string; updated: string };
const record = z.record(z.string(), z.unknown());
const text = (r: Record<string, unknown>, key: string) =>
  typeof r[key] === "string"
    ? String(r[key]).slice(0, 500)
    : typeof r[key] === "number"
      ? String(r[key])
      : "";
export function featureRows(feature: RepositoryFeature, body: unknown): FeatureRow[] {
  const payload =
    feature === "actions"
      ? record.parse(body)["workflow_runs"]
      : feature === "environments"
        ? record.parse(body)["environments"]
        : feature === "code-search"
          ? record.parse(body)["items"]
          : body;
  const rows = z.array(record).max(50).parse(payload);
  return rows.map((r, i) => {
    const commit = r["commit"] && typeof r["commit"] === "object" ? record.parse(r["commit"]) : {};
    return {
      id:
        text(r, "sha") ||
        text(commit, "sha") ||
        text(commit, "id") ||
        text(r, "id") ||
        text(r, "name") ||
        String(i),
      name:
        text(r, "title") ||
        text(r, "name") ||
        text(r, "tag_name") ||
        text(r, "path") ||
        text(commit, "message") ||
        text(r, "sha") ||
        "Provider omitted name",
      status:
        text(r, "state") ||
        text(r, "status") ||
        text(r, "conclusion") ||
        (feature === "branches"
          ? r["protected"] === true
            ? "Protected"
            : r["protected"] === false
              ? "Not protected"
              : "Protection not reported"
          : "Not reported"),
      updated:
        text(r, "updated_at") ||
        text(r, "created_at") ||
        text(commit, "timestamp") ||
        "Not reported",
    };
  });
}
