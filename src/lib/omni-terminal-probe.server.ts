import { assertPublicLinkOrigin } from "./jackboy-link.server";
import type { ProbeResult } from "./omni-terminal";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Owner-triggered reachability check of the existing Railway service root.
 * Sends no credentials, cookies or body, refuses redirects, reads no reply body
 * and times out after 5 seconds. A reply proves reachability only.
 */
export async function probeRailway(
  origin: string | undefined,
  options: { fetch?: Fetch; timeoutMs?: number; clock?: () => number } = {},
): Promise<ProbeResult> {
  if (!origin) return { state: "not_configured", status: null, ms: null };
  try {
    assertPublicLinkOrigin(origin);
  } catch {
    return { state: "invalid_origin", status: null, ms: null };
  }
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const clock = options.clock ?? Date.now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  const started = clock();
  try {
    const response = await doFetch(new URL("/", origin).toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { accept: "text/html" },
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => {});
    const ms = Math.max(0, Math.round(clock() - started));
    const status = response.status;
    if (response.type === "opaqueredirect" || (status >= 300 && status < 400))
      return { state: "redirect", status: status || null, ms };
    if (status >= 500) return { state: "server_error", status, ms };
    return { state: "reachable", status, ms };
  } catch {
    if (controller.signal.aborted) return { state: "timeout", status: null, ms: null };
    return { state: "unreachable", status: null, ms: null };
  } finally {
    clearTimeout(timer);
  }
}
