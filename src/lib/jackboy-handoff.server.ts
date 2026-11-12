/**
 * Signed server-to-server sender for jackboy.omni-handoff/v1. Platform fetch with
 * public-certificate validation, refused redirects, 5 s timeout and capped reply.
 * A reply is trusted only with a valid X-Jackboy-Proof over its exact bytes and
 * HTTP status, the right contract and our request nonce echoed back. Secrets are
 * read from server env inside the call and never returned or logged.
 */
import { dispatchHmac } from "./jackboy-dispatch.server";
import { assertPublicLinkOrigin, readCapped } from "./jackboy-link.server";
import {
  HANDOFF_CONTRACT,
  HANDOFF_MAX_BODY_BYTES,
  HANDOFF_MIN_SECRET_LENGTH,
  HANDOFF_PATH,
  createBody,
  replyErrorSchema,
  replyOkSchema,
  requestSigningString,
  responseSigningString,
  statusBody,
  type HandoffJob,
  type JackboyStatus,
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
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.clientId) || c.secret.length < HANDOFF_MIN_SECRET_LENGTH)
    return null;
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

/** 16 random bytes as 32 lowercase hex characters. */
export function newNonce() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Unix seconds, exactly 10 digits. */
export function unixSeconds(nowMs: number) {
  return String(Math.floor(nowMs / 1000));
}

export type HandoffReply =
  | { ok: true; jackboyJobId: string; status: JackboyStatus; httpStatus: number }
  /** verified: Jackboy's signed refusal. Otherwise the reply was discarded. */
  | { ok: false; reason: string; verified: boolean; hint?: string | undefined };

const UNSIGNED_HINTS = new Set([
  "authentication_failed",
  "handoff_disabled",
  "handoff_unavailable",
  "body_too_large",
  "https_post_required",
]);

export async function sendHandoff(
  config: HandoffConfig,
  action: "create" | "status",
  job: HandoffJob,
  opts: { fetch?: Fetch; now?: number; nonce?: string; timeoutMs?: number } = {},
): Promise<HandoffReply> {
  const body =
    action === "create" ? createBody(job, await sha256Hex(job.instructions)) : statusBody(job.taskId);
  if (new TextEncoder().encode(body).byteLength > HANDOFF_MAX_BODY_BYTES)
    return { ok: false, reason: "request_too_large", verified: false };
  const timestamp = unixSeconds(opts.now ?? Date.now());
  const nonce = opts.nonce ?? newNonce();
  if (!/^[0-9]{10}$/.test(timestamp) || !/^[a-f0-9]{32}$/.test(nonce))
    return { ok: false, reason: "invalid_request", verified: false };
  const signature = await dispatchHmac(
    config.secret,
    requestSigningString(config.clientId, timestamp, nonce, body),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  let res: Response;
  let text: string;
  try {
    const url = new URL(HANDOFF_PATH, config.origin);
    if (url.protocol !== "https:" || url.search || url.pathname !== HANDOFF_PATH)
      return { ok: false, reason: "invalid_request", verified: false };
    res = await (opts.fetch ?? fetch)(url.toString(), {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-jackboy-contract": HANDOFF_CONTRACT,
        "x-jackboy-client": config.clientId,
        "x-jackboy-timestamp": timestamp,
        "x-jackboy-nonce": nonce,
        "x-jackboy-signature": signature,
      },
      body,
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: "redirect_refused", verified: false };
    }
    text = await readCapped(res);
  } catch {
    return { ok: false, reason: "unreachable", verified: false };
  } finally {
    clearTimeout(timer);
  }

  const expected = await dispatchHmac(config.secret, responseSigningString(nonce, res.status, text));
  if (!safeEqual(res.headers.get("x-jackboy-proof") ?? "", expected)) {
    // Unsigned replies are never trusted; a known plain reason is shown only as a hint.
    let hint: string | undefined;
    try {
      const e = (JSON.parse(text) as { error?: unknown }).error;
      if (typeof e === "string" && UNSIGNED_HINTS.has(e)) hint = e;
    } catch {
      /* plain text */
    }
    return { ok: false, reason: "reply_unsigned", verified: false, hint };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "reply_invalid", verified: false };
  }
  const okReply = replyOkSchema.safeParse(parsed);
  if (okReply.success) {
    if (!safeEqual(okReply.data.requestNonce, nonce))
      return { ok: false, reason: "reply_invalid", verified: false };
    const allowed = action === "create" ? [200, 201] : [200];
    if (!allowed.includes(res.status)) return { ok: false, reason: "reply_invalid", verified: false };
    return {
      ok: true,
      jackboyJobId: okReply.data.jackboyJobId,
      status: okReply.data.status,
      httpStatus: res.status,
    };
  }
  const errReply = replyErrorSchema.safeParse(parsed);
  if (errReply.success && safeEqual(errReply.data.requestNonce, nonce) && res.status >= 400)
    return { ok: false, reason: errReply.data.error, verified: true };
  return { ok: false, reason: "reply_invalid", verified: false };
}
