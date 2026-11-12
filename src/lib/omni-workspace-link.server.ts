import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readCapped } from "./jackboy-link.server";
import type { SandboxLinkConfig } from "./omni-sandbox-config.server";
import { WORKSPACE_CONTRACT, remoteReply, type RemoteReply } from "./omni-workspace";

/**
 * Signed relay to the separate OMNI cloud sandbox service on Railway (its own
 * origin and secret, never the Jackboy host). Platform fetch (public certificate checks), redirects
 * refused, 5 s timeout, 32 KB reply cap, HMAC response proof required.
 * Only the server holds the link secret.
 */
export const WORKSPACE_PATH = "/api/public/omni/workspace";
export type WorkspaceAction =
  | "session.start"
  | "session.end"
  | "chat.send"
  | "command.run"
  | "events.poll"
  | "job.stop"
  | "agent.stop"
  | "step.decide"
  | "health.check"
  | "repo.checkout"
  | "pr.propose";
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const hmac = (k: string, t: string) => createHmac("sha256", k).update(t).digest("hex");

export async function workspaceRequest(
  config: SandboxLinkConfig,
  action: WorkspaceAction,
  payload: Record<string, unknown>,
  opts: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<RemoteReply> {
  const nonce = randomBytes(16).toString("hex");
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ action, projectId: config.projectId, ...payload });
  const message = `${WORKSPACE_CONTRACT}\nPOST\n${WORKSPACE_PATH}\n${ts}\n${nonce}\n${sha256(body)}`;
  const send: Fetch = opts.fetch ?? ((i, init) => fetch(i, init));
  let res: Response;
  try {
    res = await send(new URL(WORKSPACE_PATH, config.origin).href, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      headers: {
        "content-type": "application/json",
        "x-omni-client": config.clientId,
        "x-omni-timestamp": ts,
        "x-omni-nonce": nonce,
        "x-omni-signature": hmac(config.secret, message),
      },
      body,
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new Error("OMNI did not answer in time.");
    throw new Error("Could not reach OMNI.");
  }
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    await res.body?.cancel().catch(() => {});
    throw new Error("OMNI link refused a redirect.");
  }
  const text = await readCapped(res);
  if (res.status === 401 || res.status === 403) throw new Error("OMNI rejected the signature.");
  if (res.status === 404) throw new Error("OMNI has no workspace endpoint yet.");
  if (res.status !== 200 && res.status !== 202 && res.status !== 409) throw new Error(`OMNI error (HTTP ${res.status}).`);
  const expected = hmac(config.secret, `${WORKSPACE_CONTRACT}\nresponse\n${nonce}\n${res.status}\n${text}`);
  const got = Buffer.from(res.headers.get("x-omni-proof") || "", "utf8");
  const want = Buffer.from(expected, "utf8");
  if (got.length !== want.length || !timingSafeEqual(got, want))
    throw new Error("OMNI reply proof is invalid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OMNI reply is not valid.");
  }
  const reply = remoteReply.safeParse(parsed);
  if (!reply.success || reply.data.requestNonce !== nonce) throw new Error("OMNI reply is not valid.");
  // 409 is a signed refusal: its reason is shown, nothing ran.
  if (res.status === 409) throw new Error(`OMNI refused: ${(reply.data.error ?? "no reason given").replace(/[^\x20-\x7E]/g, " ")}`);
  return reply.data;
}
