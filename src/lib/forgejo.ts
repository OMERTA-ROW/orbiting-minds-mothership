import { z } from "zod";

/** Read-only Evolution Git gateway: listing only, never writes. */
export const FORGEJO_GATEWAY_ORIGIN = "https://git-api.evoomni.tech";
export const FORGEJO_PAGE_LIMIT = 50;
export const FORGEJO_MAX_PAGES = 20;

/** Planned read-only consumers; none is granted access until a reviewed scoped route exists. */
export const FORGEJO_READ_SCOPES = [
  { agent: "OMNI", scope: "evolution-git:read", granted: false },
  { agent: "Jackboy", scope: "evolution-git:read", granted: false },
  { agent: "Razul", scope: "evolution-git:read", granted: false },
] as const;

/** Credentials may be sent only to the owner's exact approved gateway origin. */
export function forgejoOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    return null;
  if (url.origin !== FORGEJO_GATEWAY_ORIGIN || url.pathname !== "/") return null;
  return FORGEJO_GATEWAY_ORIGIN;
}

const repoSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  private: z.boolean(),
  empty: z.boolean().optional(),
  mirror: z.boolean().optional(),
  default_branch: z.string().optional(),
  updated_at: z.string().optional(),
  mirror_updated: z.string().optional(),
});

export type ForgejoRepo = {
  id: number;
  name: string;
  private: boolean;
  empty: boolean;
  branch: string;
  updatedAt: string | null;
  sync: { kind: "mirror"; at: string | null } | { kind: "not_reported" };
};

export function parseForgejoRepos(body: unknown): ForgejoRepo[] {
  const list = z.array(repoSchema).parse(body);
  return list.map((r) => ({
    id: r.id,
    name: r.full_name,
    private: r.private,
    empty: r.empty ?? false,
    branch: r.default_branch ?? "",
    updatedAt: r.updated_at ?? null,
    sync: r.mirror
      ? {
          kind: "mirror",
          at: r.mirror_updated && !r.mirror_updated.startsWith("0001") ? r.mirror_updated : null,
        }
      : { kind: "not_reported" },
  }));
}

export type ForgejoResult =
  | { state: "not_configured"; missing: string[] }
  | { state: "invalid_origin" }
  | { state: "unreachable"; message: string }
  | { state: "connected"; checkedAt: string; repos: ForgejoRepo[]; truncated: boolean };

/** Paginated read-only listing; dedupes by immutable repository id. */
export async function listForgejoRepos(
  env: {
    base?: string | undefined;
    token?: string | undefined;
    accessClientId?: string | undefined;
    accessClientSecret?: string | undefined;
  },
  fetcher: typeof fetch = fetch,
  now = () => new Date().toISOString(),
): Promise<ForgejoResult> {
  const missing = [
    ...(env.base ? [] : ["FORGEJO_BASE_URL"]),
    ...(env.token ? [] : ["FORGEJO_API_TOKEN"]),
    ...(env.accessClientId ? [] : ["CF_ACCESS_CLIENT_ID"]),
    ...(env.accessClientSecret ? [] : ["CF_ACCESS_CLIENT_SECRET"]),
  ];
  if (missing.length) return { state: "not_configured", missing };
  const origin = forgejoOrigin(env.base);
  if (!origin) return { state: "invalid_origin" };
  const seen = new Map<number, ForgejoRepo>();
  let truncated = true;
  for (let page = 1; page <= FORGEJO_MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetcher(`${origin}/api/v1/user/repos?page=${page}&limit=${FORGEJO_PAGE_LIMIT}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${env.token}`,
          "CF-Access-Client-Id": env.accessClientId ?? "",
          "CF-Access-Client-Secret": env.accessClientSecret ?? "",
          "User-Agent": "Evolution-OMNI-Gateway/1.0",
          Accept: "application/json",
        },
      });
    } catch {
      return { state: "unreachable", message: "The Evolution Git gateway did not answer." };
    }
    if (res.status === 401 || res.status === 403)
      return {
        state: "unreachable",
        message:
          "The gateway refused authentication. Check the Cloudflare Access service-token policy and gateway Bearer key in Project Settings → Secrets.",
      };
    if (!res.ok)
      return { state: "unreachable", message: `The gateway answered HTTP ${res.status}.` };
    let repos: ForgejoRepo[];
    try {
      repos = parseForgejoRepos(await res.json());
    } catch {
      return {
        state: "unreachable",
        message: "The gateway reply was not a Forgejo repository list.",
      };
    }
    for (const r of repos) seen.set(r.id, r);
    if (repos.length < FORGEJO_PAGE_LIMIT) {
      truncated = false;
      break;
    }
  }
  const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { state: "connected", checkedAt: now(), repos: list, truncated };
}
