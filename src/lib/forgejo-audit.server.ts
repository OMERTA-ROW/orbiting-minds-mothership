import type { AuditRead } from "./forgejo-audit";
import { forgejoOrigin } from "./forgejo";

export function auditReader(
  provider: "forgejo" | "github",
  env: {
    base?: string | undefined;
    token?: string | undefined;
    accessId?: string | undefined;
    accessSecret?: string | undefined;
    lovableKey?: string | undefined;
    githubKey?: string | undefined;
  },
  fetcher: typeof fetch = fetch,
): AuditRead {
  return async (path) => {
    const permitted =
      provider === "forgejo"
        ? /^\/api\/v1\/(?:user\/repos|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:branches|tags))?)(?:\?page=\d+&limit=50)?$/
        : /^\/(?:orgs\/OMERTA-ROW\/repos|repos\/OMERTA-ROW\/[A-Za-z0-9_.-]+(?:\/(?:branches|tags))?)(?:\?page=\d+&per_page=100)?$/i;
    if (!permitted.test(path) || path.split(/[/?]/).some((p) => p === "." || p === ".."))
      return { status: 400, body: null };
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": "Evolution-OMNI-Gateway/1.0",
    });
    let url: string;
    if (provider === "forgejo") {
      const origin = forgejoOrigin(env.base);
      if (!origin || !env.token || !env.accessId || !env.accessSecret)
        return { status: 503, body: null };
      url = origin + path;
      headers.set("Authorization", `Bearer ${env.token}`);
      headers.set("CF-Access-Client-Id", env.accessId);
      headers.set("CF-Access-Client-Secret", env.accessSecret);
    } else {
      if (!env.lovableKey || !env.githubKey) return { status: 503, body: null };
      url = "https://connector-gateway.lovable.dev/github" + path;
      headers.set("Authorization", `Bearer ${env.lovableKey}`);
      headers.set("X-Connection-Api-Key", env.githubKey);
    }
    try {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers,
      });
      if (response.status !== 200) return { status: response.status, body: null };
      // Bound metadata replies; raw provider bodies never become diagnostic errors.
      const reader = response.body?.getReader();
      if (!reader) return { status: 502, body: null };
      let text = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4_000_000) {
          await reader.cancel();
          return { status: 502, body: null };
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { status: 200, body: JSON.parse(text) as unknown };
    } catch {
      return { status: 502, body: null };
    }
  };
}
