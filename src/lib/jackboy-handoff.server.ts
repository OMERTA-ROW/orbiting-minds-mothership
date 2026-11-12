/**
 * Signed server-to-server sender for omni.handoff/v1. Platform fetch with
 * public-certificate validation, refused redirects, 5 s timeout and capped
 * reply. The reply must carry a valid HMAC over its exact bytes or it is
 * rejected. Secrets are read from server env inside the call and never returned.
 */
import { dispatchHmac } from "./jackboy-dispatch.server";
import { assertPublicLinkOrigin, readCapped } from "./jackboy-link.server";
import {
  HANDOFF_CONTRACT,
  HANDOFF_PATH,
  canonicalJob,
  replySchema,
  replySigningString,
  requestSigningString,
  type HandoffJob,
} from "./jackboy-handoff";

export type HandoffConfig = { origin: string; clientId: string; secret: string };
type Fetch = typeof fetch;

export function handoffConfig(env: Record<string, string | undefined>): HandoffConfig | null {
  if (env["JACKBOY_HANDOFF_ENABLED"] !== "true") return null;
  const c = {
    origin: env["JACKBOY_HANDOFF_ORIGIN"] || "",
    clientId: env["JACKBOY_HANDOFF_CLIENT_ID"] || "",
    secret: env["JACKBOY_HANDOFF_HMAC_SECRET"] || "",
  };
  try {
    assertPublicLinkOrigin(c.origin);
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.clientId) || c.secret.length < 32) return null;
  return c;
}

/** Which handoff setting names are present (never values). */
export function handoffSettingNames(env: Record<string, string | undefined>) {
  return [
    "JACKBOY_HANDOFF_ENABLED",
    "JACKBOY_HANDOFF_ORIGIN",
    "JACKBOY_HANDOFF_CLIENT_ID",
    "JACKBOY_HANDOFF_HMAC_SECRET",
  ].map((name) => ({ name, present: Boolean(env[name]) }));
}

export async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type HandoffReply =
  | { ok: true; jackboyJobId: string; status: (typeof replySchema)["_output"]["status"] }
  | { ok: false; reason: string };

export async function sendHandoff(
  config: HandoffConfig,
  action: "create" | "status",
  job: HandoffJob,
  opts: { fetch?: Fetch; now?: number; nonce?: string; timeoutMs?: number } = {},
): Promise<HandoffReply> {
  const digest = await sha256Hex(canonicalJob(job));
  const body = JSON.stringify(
    action === "create"
      ? { contract: HANDOFF_CONTRACT, action, ...JSON.parse(canonicalJob(job)), payloadDigest: digest }
      : { contract: HANDOFF_CONTRACT, action, taskId: job.taskId, payloadDigest: digest },
  );
  const timestamp = String(opts.now ?? Date.now());
  const nonce = opts.nonce ?? crypto.randomUUID();
  const signature = await dispatchHmac(
    config.secret,
    requestSigningString({ clientId: config.clientId, timestamp, nonce, bodySha256: await sha256Hex(body) }),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  let res: Response;
  let text: string;
  try {
    res = await (opts.fetch ?? fetch)(new URL(HANDOFF_PATH, config.origin).toString(), {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-omni-handoff-client": config.clientId,
        "x-omni-handoff-timestamp": timestamp,
        "x-omni-handoff-nonce": nonce,
        "x-omni-handoff-signature": signature,
      },
      body,
    });
    if (res.status >= 300 && res.status < 400) return { ok: false, reason: "redirect_refused" };
    text = await readCapped(res);
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
  const expected = await dispatchHmac(
    config.secret,
    replySigningString({ nonce, bodySha256: await sha256Hex(text) }),
  );
  if (!safeEqual(res.headers.get("x-omni-handoff-signature") ?? "", expected))
    return { ok: false, reason: "reply_unsigned" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "reply_invalid" };
  }
  const r = replySchema.safeParse(parsed);
  if (!r.success || r.data.taskId !== job.taskId) return { ok: false, reason: "reply_invalid" };
  return { ok: true, jackboyJobId: r.data.jackboyJobId, status: r.data.status };
}
