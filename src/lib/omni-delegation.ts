/**
 * OMNI owner delegation — shared, browser-safe rules (no network, no secrets).
 *
 * The OMNI web frontend (client "omni-web") asks the Mothership owner to approve a short-lived,
 * scoped delegation. Flow (authorization code + PKCE S256, see docs/OMNI-OWNER-DELEGATION.md):
 *   1. OMNI's server sends the owner's browser to /omni-authorize with state + code_challenge.
 *   2. The verified owner (aal2, authenticator code within 15 minutes) ticks scopes and approves.
 *   3. The browser returns to the one allowlisted callback with a single-use 60-second code.
 *   4. OMNI's server exchanges code + code_verifier server-to-server for a 15-minute bearer.
 * Only "tasks:read", "tasks:write" and "safety:emergency-stop" can be granted, plus "chat:write"
 * once database change 0066 is installed (checked server-side per request).
 * The database enforces the same client, callback, scopes and lifetimes (migration 0062).
 */
import { z } from "zod";

export const DELEGATION_CLIENT = {
  id: "omni-web",
  name: "OMNI (web)",
  origin: "https://omni-orbit-command-companion.lovable.app",
  redirectUri: "https://omni-orbit-command-companion.lovable.app/mothership/callback",
} as const;
export const DELEGATION_AUDIENCE = "omni-mothership";
export const DELEGATION_CODE_SECONDS = 60;
export const DELEGATION_TOKEN_SECONDS = 15 * 60;

/** Every scope the OMNI frontend knows about (OMNI docs/MOTHERSHIP_BACKEND.md). */
export const DELEGATION_SCOPES = [
  "chat:write",
  "providers:write",
  "tasks:read",
  "tasks:write",
  "tasks:retry",
  "tasks:approve",
  "tasks:reject",
  "safety:emergency-stop",
] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

/** Scopes this Mothership can actually honour today; the others are refused, never faked. */
export const SUPPORTED_DELEGATION_SCOPES = [
  "tasks:read",
  "tasks:write",
  "safety:emergency-stop",
] as const;
export type SupportedDelegationScope = (typeof SUPPORTED_DELEGATION_SCOPES)[number];

export function isSupportedScope(scope: string): scope is SupportedDelegationScope {
  return (SUPPORTED_DELEGATION_SCOPES as readonly string[]).includes(scope);
}

/** Scopes that become grantable only after their database change is installed. */
export const INSTALL_GATED_SCOPES = ["chat:write"] as const;
/** Every scope that can ever be granted (the approval page validates against the live list). */
export const GRANTABLE_SCOPE_CANDIDATES = [
  ...SUPPORTED_DELEGATION_SCOPES,
  ...INSTALL_GATED_SCOPES,
] as const;
export type GrantableDelegationScope = (typeof GRANTABLE_SCOPE_CANDIDATES)[number];

/** Grantable scopes right now: the always-supported ones plus installed gated ones. */
export function grantableScopes(chatInstalled: boolean): GrantableDelegationScope[] {
  return chatInstalled
    ? [...SUPPORTED_DELEGATION_SCOPES, "chat:write"]
    : [...SUPPORTED_DELEGATION_SCOPES];
}

export const DELEGATION_SCOPE_INFO: Record<
  DelegationScope,
  { title: string; effect: string; supported: boolean; needsInstall?: string }
> = {
  "tasks:read": {
    title: "Read OMNI web tasks",
    effect:
      "OMNI can read tasks previously created through your OMNI web delegations, including instructions and recorded handoff status.",
    supported: true,
  },
  "tasks:write": {
    title: "Add held tasks",
    effect:
      "OMNI can add a task to OMNI Terminal as held. Nothing runs; you hand it off yourself on the Mothership.",
    supported: true,
  },
  "safety:emergency-stop": {
    title: "Press the Emergency Stop",
    effect:
      "OMNI can engage the Emergency Stop. It can never release it; releasing still needs you and a fresh code.",
    supported: true,
  },
  "chat:write": {
    title: "Chat with OMNI",
    effect:
      "OMNI web can send your messages to the Mothership's OMNI text agent and show its replies. Each reply uses paid Lovable AI credits (at most 30 a day, one at a time). Messages and replies aren't saved on the Mothership. OMNI has no tools and can't run tasks or code.",
    supported: false,
    needsInstall:
      "Not available yet: the Mothership's database change for chat (0066) hasn't been approved and installed.",
  },
  "providers:write": {
    title: "Change AI providers",
    effect: "Not available: providers are configured only on the Mothership.",
    supported: false,
  },
  "tasks:retry": {
    title: "Retry tasks",
    effect: "Not available: held tasks never run, so there is nothing to retry.",
    supported: false,
  },
  "tasks:approve": {
    title: "Approve tasks",
    effect: "Not available: approvals need your two-step sign-in and passkey on the Mothership.",
    supported: false,
  },
  "tasks:reject": {
    title: "Reject tasks",
    effect: "Not available: decisions stay on the Mothership.",
    supported: false,
  },
};

/** Agents a held task may name (the OMNI Terminal task rule). OMNI itself is not one. */
export const HELD_TASK_AGENTS = [
  "jackboy",
  "jax",
  "razul",
  "sabrina",
  "guardian",
  "hercules",
] as const;

/** Verified display names for held-task agents (same names as the OMNI Terminal). */
export const HELD_TASK_AGENT_NAMES: Record<(typeof HELD_TASK_AGENTS)[number], string> = {
  jackboy: "Jackboy",
  jax: "JAX",
  razul: "Razul Central Intelligence",
  sabrina: "Sabrina",
  guardian: "Guardian",
  hercules: "Hercules",
};

export const DELEGATION_TOKEN_PATTERN = /^omnid_[0-9a-f]{64}$/;
export const AUTH_CODE_PATTERN = /^omnic_[0-9a-f]{64}$/;
/** RFC 7636 code_verifier: 43–128 unreserved characters. */
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/;

export const authorizeParamsSchema = z
  .object({
    response_type: z.string().max(40).optional(),
    client_id: z.string().max(100).optional(),
    redirect_uri: z.string().max(500).optional(),
    scope: z.string().max(500).optional(),
    state: z.string().max(300).optional(),
    code_challenge: z.string().max(200).optional(),
    code_challenge_method: z.string().max(20).optional(),
  })
  .strict();
export type AuthorizeParams = z.infer<typeof authorizeParamsSchema>;

export type ParsedAuthorize =
  | {
      ok: true;
      state: string;
      codeChallenge: string;
      requested: DelegationScope[];
      supported: GrantableDelegationScope[];
      unsupported: DelegationScope[];
    }
  | { ok: false; error: string };

/**
 * Validates an authorize request. Any failure is shown on the Mothership and never redirected:
 * the callback is only ever the exact allowlisted URL.
 */
export function parseAuthorizeRequest(
  p: AuthorizeParams,
  grantable: readonly GrantableDelegationScope[] = SUPPORTED_DELEGATION_SCOPES,
): ParsedAuthorize {
  if (p.client_id !== DELEGATION_CLIENT.id) return { ok: false, error: "Unknown app." };
  if (p.redirect_uri !== DELEGATION_CLIENT.redirectUri)
    return { ok: false, error: "The return address isn't the approved OMNI address." };
  if (p.response_type !== "code") return { ok: false, error: "Unsupported request type." };
  if (p.code_challenge_method !== "S256" || !CHALLENGE_PATTERN.test(p.code_challenge ?? ""))
    return { ok: false, error: "The request is missing its one-time proof (PKCE S256)." };
  if (!STATE_PATTERN.test(p.state ?? ""))
    return { ok: false, error: "The request is missing its one-time state value." };
  const words = (p.scope ?? "").split(" ").filter(Boolean);
  if (words.length === 0) return { ok: false, error: "No permissions were requested." };
  if (new Set(words).size !== words.length)
    return { ok: false, error: "A permission was requested twice." };
  const unknown = words.filter((w) => !(DELEGATION_SCOPES as readonly string[]).includes(w));
  if (unknown.length) return { ok: false, error: "An unknown permission was requested." };
  const requested = words as DelegationScope[];
  return {
    ok: true,
    state: p.state!,
    codeChallenge: p.code_challenge!,
    requested,
    supported: requested.filter((s): s is GrantableDelegationScope =>
      (grantable as readonly string[]).includes(s),
    ),
    unsupported: requested.filter((s) => !(grantable as readonly string[]).includes(s)),
  };
}

/** Where the owner's browser goes next. Only ever the exact allowlisted callback. */
export function callbackUrl(result: { code: string } | { error: "access_denied" }, state: string) {
  const url = new URL(DELEGATION_CLIENT.redirectUri);
  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);
  url.searchParams.set("state", state);
  return url.toString();
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes as "<prefix>_<64 hex>". Generated server-side only. */
export function generateDelegationSecret(
  prefix: "omnid" | "omnic",
  getRandomValues?: (buf: Uint8Array<ArrayBuffer>) => void,
) {
  const bytes = new Uint8Array(32);
  (getRandomValues ?? ((b) => crypto.getRandomValues(b)))(bytes);
  return `${prefix}_${hex(bytes)}`;
}

export function delegationTokenPrefix(token: string) {
  return token.slice(0, 12);
}

/** RFC 7636 S256: BASE64URL(SHA-256(ASCII(code_verifier))), no padding. */
export async function s256Challenge(verifier: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  let binary = "";
  for (const b of digest) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type BearerKind =
  { kind: "delegation"; token: string } | { kind: "metadata" } | { kind: "none" };

/** Tells an owner delegation apart from a metadata API key without trusting either. */
export function classifyBearer(header: string | null): BearerKind {
  if (!header || !header.startsWith("Bearer ")) return { kind: "none" };
  const value = header.slice(7).trim();
  if (DELEGATION_TOKEN_PATTERN.test(value)) return { kind: "delegation", token: value };
  if (value.startsWith("omni_")) return { kind: "metadata" };
  return { kind: "none" };
}

/**
 * Delegation endpoints are server-to-server only. Browsers always label cross-site requests
 * with Origin or Sec-Fetch-* headers; OMNI's server fetch sends neither.
 */
export function isBrowserRequest(headers: Headers) {
  return headers.has("origin") || headers.has("sec-fetch-site") || headers.has("sec-fetch-mode");
}

/** Body OMNI sends to POST /api/omni/tasks (OMNI docs/MOTHERSHIP_BACKEND.md). */
export const delegatedTaskBody = z.object({
  task: z.object({
    title: z.string().trim().min(1).max(120),
    instruction: z.string().trim().min(3).max(4000),
    agentId: z.string().min(1).max(100),
    github: z
      .object({
        repository: z
          .string()
          .max(200)
          .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
        reference: z.unknown().optional(),
      })
      .optional(),
  }),
  idempotencyKey: z.string().uuid(),
  timeoutMs: z.number().int().min(1000).max(120000),
  ownerApproved: z.literal(true),
  autonomous: z.boolean(),
  source: z.literal("omni-web"),
});

/** Stored delegation metadata as returned by `omni_delegation_status`. */
export type DelegationRecord = {
  delegation_id: string;
  client_id: string;
  audience: string;
  scopes: string[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  owner_verified: boolean;
  server_time: string;
};

/** OMNI's safe status shape, plus identifiers. Never includes any secret. */
export function delegationStatusBody(r: DelegationRecord) {
  const now = Date.parse(r.server_time);
  const expires = Date.parse(r.expires_at);
  const active = !r.revoked_at && r.owner_verified && Number.isFinite(expires) && expires > now;
  const state = active
    ? "active"
    : r.revoked_at
      ? "delegation_required"
      : !r.owner_verified
        ? "owner_sign_in_required"
        : "expired";
  const reason = active
    ? "Owner delegation is active."
    : r.revoked_at
      ? `Revoked (${r.revoked_reason ?? "revoked"}). The owner must approve a new connection.`
      : !r.owner_verified
        ? "The Mothership owner is no longer verified. The owner must sign in and approve again."
        : "Expired. The owner must approve a new connection.";
  return {
    state,
    ownerVerified: r.owner_verified,
    scopes: r.scopes,
    ...(active ? { verifiedAt: r.server_time, expiresAt: r.expires_at } : {}),
    issuedAt: r.issued_at,
    expiresAtRecorded: r.expires_at,
    expiresIn: active ? Math.max(0, Math.floor((expires - now) / 1000)) : 0,
    revokedAt: r.revoked_at,
    delegationId: r.delegation_id,
    clientId: r.client_id,
    audience: r.audience,
    reason,
  };
}

const PENDING_KEY = "omni.authorize-request";
const PENDING_MAX_MS = 10 * 60 * 1000;

/** Keeps the (non-secret) request across the sign-in page, which drops URL parameters. */
export function savePendingAuthorize(storage: Storage, params: AuthorizeParams, now = Date.now()) {
  storage.setItem(PENDING_KEY, JSON.stringify({ at: now, params }));
}

export function clearPendingAuthorize(storage: Storage) {
  storage.removeItem(PENDING_KEY);
}

/**
 * Reads it (the page may mount more than once while sign-in settles, so it is cleared only on
 * approve/decline); anything stale, malformed or not for the allowlisted app is dropped.
 */
export function readPendingAuthorize(storage: Storage, now = Date.now()): AuthorizeParams | null {
  const raw = storage.getItem(PENDING_KEY);
  if (!raw) return null;
  const valid = parsePending(raw, now);
  if (!valid) storage.removeItem(PENDING_KEY);
  return valid;
}

function parsePending(raw: string, now: number): AuthorizeParams | null {
  try {
    const v = JSON.parse(raw) as { at?: unknown; params?: unknown };
    if (typeof v.at !== "number" || now - v.at > PENDING_MAX_MS || v.at > now + 60_000) return null;
    const parsed = authorizeParamsSchema.safeParse(v.params);
    if (!parsed.success || !parseAuthorizeRequest(parsed.data).ok) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
