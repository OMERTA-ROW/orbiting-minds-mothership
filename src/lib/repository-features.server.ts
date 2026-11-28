import { forgejoOrigin, parseForgejoRepos, type ForgejoResult } from "./forgejo";
import {
  featureInput,
  featurePath,
  featureRows,
  featureBlockers,
  forgejoEnabledRoutes,
  FORGEJO_GATEWAY_ROUTE_ALLOWLIST,
} from "./repository-features";
import type { z } from "zod";

export async function readRepositoryFeature(
  input: z.infer<typeof featureInput>,
  env: {
    base?: string | undefined;
    token?: string | undefined;
    accessId?: string | undefined;
    accessSecret?: string | undefined;
    lovableKey?: string | undefined;
    githubKey?: string | undefined;
    forgejoRoutes?: string | undefined;
  },
  fetcher: typeof fetch = fetch,
) {
  const data = featureInput.parse(input);
  const path = featurePath(data);
  if (!path)
    return {
      state: "blocked" as const,
      message: featureBlockers[data.feature] ?? "No reviewed endpoint.",
      rows: [],
    };
  const github = data.provider === "github";
  if (!github && !forgejoEnabledRoutes(env.forgejoRoutes).has(data.feature))
    return {
      state: "blocked" as const,
      message: `Gateway route not deployed: the Omni-Staging gateway currently allows only GET /api/v1/user/repos. Owner step: add ${FORGEJO_GATEWAY_ROUTE_ALLOWLIST[data.feature] ?? "this route"} to the gateway allowlist, then add "${data.feature}" to FORGEJO_GATEWAY_READ_ROUTES. No request was sent. Use the GitHub · OMERTA-ROW provider for upstream reads meanwhile.`,
      rows: [],
    };
  const origin = github ? "https://connector-gateway.lovable.dev/github" : forgejoOrigin(env.base);
  if (
    !origin ||
    (github ? !env.lovableKey || !env.githubKey : !env.token || !env.accessId || !env.accessSecret)
  )
    return {
      state: "blocked" as const,
      message: github
        ? "The existing GitHub connector requires its linked GITHUB_API_KEY and LOVABLE_API_KEY. No provider credential is accepted in the browser."
        : "Configure FORGEJO_BASE_URL, FORGEJO_API_TOKEN, CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET for the exact approved HTTPS gateway.",
      rows: [],
    };
  try {
    const res = await fetcher(origin + path, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: github
        ? {
            Authorization: `Bearer ${env.lovableKey}`,
            "X-Connection-Api-Key": env.githubKey ?? "",
            Accept: "application/vnd.github+json",
            "User-Agent": "Evolution-OMNI-Gateway/1.0",
          }
        : {
            Authorization: `Bearer ${env.token}`,
            "CF-Access-Client-Id": env.accessId ?? "",
            "CF-Access-Client-Secret": env.accessSecret ?? "",
            "User-Agent": "Evolution-OMNI-Gateway/1.0",
            Accept: "application/json",
          },
    });
    if (res.status !== 200)
      return {
        state: "blocked" as const,
        message: `Gateway HTTP ${res.status}. ${res.status === 401 || res.status === 403 ? "Check existing service authentication and endpoint read scope; repository listing does not prove this endpoint is permitted." : res.status === 404 ? "The gateway or provider does not expose this route for this repository (check the gateway allowlist and canonical repository name)." : "No successful read was recorded; redirects are refused."}`,
        rows: [],
      };
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2000000) {
        await reader.cancel();
        throw new Error("Reply too large");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    const rows = featureRows(data.feature, JSON.parse(body));
    return {
      state: "read" as const,
      checkedAt: new Date().toISOString(),
      rows,
      hasNext: rows.length === 50,
    };
  } catch {
    return {
      state: "blocked" as const,
      message:
        "Gateway read timed out, exceeded the bounded reply size or returned an invalid feature response. No raw error or credential is exposed.",
      rows: [],
    };
  }
}

export async function githubFeatureInventory(env: {
  lovableKey?: string | undefined;
  githubKey?: string | undefined;
}): Promise<ForgejoResult> {
  const { auditReader } = await import("./forgejo-audit.server");
  const read = auditReader("github", env);
  const repos = new Map<number, ReturnType<typeof parseForgejoRepos>[number]>();
  for (let page = 1; page <= 20; page++) {
    const result = await read(`/orgs/OMERTA-ROW/repos?page=${page}&per_page=100`);
    if (result.status !== 200)
      return {
        state: "unreachable",
        message: `GitHub inventory HTTP ${result.status}. Check the existing organization authorization and connector scope; no direct API fallback is used.`,
      };
    try {
      const rows = parseForgejoRepos(result.body);
      for (const row of rows) if (row.name.startsWith("OMERTA-ROW/")) repos.set(row.id, row);
      if (rows.length < 100)
        return {
          state: "connected",
          repos: [...repos.values()],
          checkedAt: new Date().toISOString(),
          truncated: false,
        };
    } catch {
      return { state: "unreachable", message: "GitHub returned an invalid repository inventory." };
    }
  }
  return {
    state: "connected",
    repos: [...repos.values()],
    checkedAt: new Date().toISOString(),
    truncated: true,
  };
}
