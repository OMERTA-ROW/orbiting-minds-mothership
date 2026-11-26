import { z } from "zod";

/** Pure, browser-safe rules for the Evolution project control center. */

export const GITHUB_PAGE_SIZE = 100;
export const GITHUB_MAX_PAGES_PER_SOURCE = 50;
export const CLOUD_PROVIDERS = {
  railway: {
    name: "Railway",
    secret: "RAILWAY_API_TOKEN",
    docs: "https://docs.railway.com/reference/public-api",
  },
  vultr: {
    name: "Vultr",
    secret: "VULTR_API_KEY",
    docs: "https://docs.vultr.com/platform/other/api-keys",
  },
} as const;
export type CloudProvider = keyof typeof CLOUD_PROVIDERS;

/** Clone execution stays locked until a verified executor and durable storage exist. */
export const CLONE_BLOCKER =
  "Locked pending sandbox: no verified executor or durable isolated storage is connected (Mothership PR #28 must be finished, merged and reviewed). Nothing is cloned and no repository code runs.";

export interface GithubRepo {
  id: number;
  full_name: string;
  owner: { login: string };
  private: boolean;
  archived?: boolean;
  default_branch?: string | null;
  html_url: string;
  pushed_at?: string | null;
  size?: number | null;
}

export type GithubFetch = (path: string) => Promise<{ status: number; body: unknown }>;

export interface DiscoveryResult {
  repos: GithubRepo[];
  pages: number;
  sources: string[];
  errors: string[];
}

const orgName = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Reads every page of each authorized source; dedupes by GitHub's immutable repo ID. */
export async function discoverRepos(
  fetchGh: GithubFetch,
  extraOrgs: string[],
): Promise<DiscoveryResult> {
  const byId = new Map<number, GithubRepo>();
  const errors: string[] = [];
  let pages = 0;
  const orgs = new Set(extraOrgs.filter((o) => orgName.test(o)));
  const orgList = await fetchGh(`/user/orgs?per_page=${GITHUB_PAGE_SIZE}`);
  if (orgList.status === 200 && Array.isArray(orgList.body))
    for (const o of orgList.body as { login?: unknown }[])
      if (typeof o.login === "string" && orgName.test(o.login)) orgs.add(o.login);
  const sources = [
    "/user/repos?affiliation=owner,collaborator,organization_member&sort=full_name",
    ...[...orgs].map((o) => `/orgs/${encodeURIComponent(o)}/repos?type=all&sort=full_name`),
  ];
  for (const source of sources) {
    for (let page = 1; page <= GITHUB_MAX_PAGES_PER_SOURCE; page++) {
      const res = await fetchGh(`${source}&per_page=${GITHUB_PAGE_SIZE}&page=${page}`);
      pages++;
      if (res.status !== 200 || !Array.isArray(res.body)) {
        errors.push(`${source.split("?")[0]} page ${page}: GitHub returned ${res.status}`);
        break;
      }
      for (const r of res.body as GithubRepo[])
        if (typeof r?.id === "number" && typeof r.full_name === "string") byId.set(r.id, r);
      if (res.body.length < GITHUB_PAGE_SIZE) break;
    }
  }
  return {
    repos: [...byId.values()],
    pages,
    sources: sources.map((s) => s.split("?")[0]!),
    errors,
  };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Suggests a repo for a directory card by normalized name; never applied automatically. */
export function suggestRepo<T extends { github_repo_id: number; full_name: string }>(
  name: string,
  repos: T[],
) {
  const n = normalize(name);
  if (n.length < 3) return undefined;
  return repos.find((r) => normalize(r.full_name.split("/")[1] ?? "") === n);
}

/** Only public https hosts may be checked; blocks local/private targets. */
export function checkableWebsite(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const h = url.hostname.toLowerCase();
  if (
    !h.includes(".") ||
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  )
    return null;
  if (/^[0-9.]+$/.test(h) || h.includes(":")) return null;
  return url;
}

const uuid = z.string().uuid();
export const directoryInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  lovableProjectId: z.union([uuid, z.literal("")]).default(""),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || checkableWebsite(v) !== null, "Use a public https:// address")
    .default(""),
  githubRepoId: z.number().int().positive().nullable().default(null),
  cloudConnectionId: z.union([uuid, z.literal("")]).default(""),
  notes: z.string().max(2000).default(""),
});
export const settingsInput = z.object({
  cloneAllOptIn: z.boolean(),
  githubOrgs: z.array(z.string().regex(orgName)).max(20),
});
export const cloudInput = z.object({
  provider: z.enum(["railway", "vultr"]),
  label: z.string().trim().min(1).max(80),
});
export const idInput = z.object({ id: uuid });
