/**
 * OMNI API credential provisioning — shared validation and helpers.
 * Secrets are generated in the server function, shown to the owner exactly
 * once, and never stored: only the SHA-256 hash and a short display prefix
 * reach the database. Keys authenticate only the read-only /api/public/omni/health and
 * /api/public/omni/jobs endpoints and the OMNI frontend's /api/omni/health, /manifest and
 * /tasks reads; creating a key connects nothing external.
 */
import { z } from "zod";

export const OMNI_API_SCOPES = ["health", "jobs"] as const;
export type OmniApiScope = (typeof OMNI_API_SCOPES)[number];

export const OMNI_SCOPE_LABELS: Record<OmniApiScope, string> = {
  health: "Health status (GET /api/public/omni/health)",
  jobs: "Job/run metadata (GET /api/public/omni/jobs)",
};

/** Plain-language scope choices for the create flow; the endpoint stays visible as detail. */
export const OMNI_SCOPE_CHOICES: Record<OmniApiScope, { title: string; help: string }> = {
  health: {
    title: "Check OMNI is online",
    help: "Read-only health status · GET /api/public/omni/health, /api/omni/health and /api/omni/manifest",
  },
  jobs: {
    title: "Read job history",
    help: "Read-only job and run details · GET /api/public/omni/jobs and /api/omni/tasks",
  },
};

/** Presented keys are omni_ plus 48 hex chars (24 random bytes). */
export const OMNI_KEY_PATTERN = /^omni_[0-9a-f]{48}$/;
export const OMNI_KEY_MAX_AGE_DAYS = 365;

/**
 * Expiry is an explicit choice: a whole number of days (1–365) or "never". "Never expires" is
 * owner-authorized; such a key works until it is revoked. There is no implicit default.
 */
export const omniKeyExpiry = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("days"), days: z.number().int().min(1).max(OMNI_KEY_MAX_AGE_DAYS) })
    .strict(),
  z.object({ kind: z.literal("never") }).strict(),
]);
export type OmniKeyExpiry = z.infer<typeof omniKeyExpiry>;

/** Preset choices shown in the create flow; "custom" opens a day count. */
export const OMNI_EXPIRY_PRESETS = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "365", label: "1 year", days: 365 },
  { id: "custom", label: "Custom number of days", days: null },
  { id: "never", label: "Never expires", days: null },
] as const;
export type OmniExpiryPresetId = (typeof OMNI_EXPIRY_PRESETS)[number]["id"];

/** Turn a create-form choice into the validated expiry, or null when the custom value is invalid. */
export function omniExpiryFromChoice(
  preset: OmniExpiryPresetId,
  customDays: number,
): OmniKeyExpiry | null {
  if (preset === "never") return { kind: "never" };
  const days =
    preset === "custom" ? customDays : OMNI_EXPIRY_PRESETS.find((p) => p.id === preset)?.days;
  const parsed = omniKeyExpiry.safeParse({ kind: "days", days });
  return parsed.success ? parsed.data : null;
}

/** RPC arguments for `omni_api_key_issue`: exactly one of a day count or never. */
export function omniExpiryRpcArgs(expiry: OmniKeyExpiry): {
  _expiry_days: number | null;
  _never_expires: boolean;
} {
  return expiry.kind === "never"
    ? { _expiry_days: null, _never_expires: true }
    : { _expiry_days: expiry.days, _never_expires: false };
}

export const omniKeyCreateInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    scopes: z.array(z.enum(OMNI_API_SCOPES)).min(1).max(OMNI_API_SCOPES.length),
    expiry: omniKeyExpiry,
    confirm: z.literal(true),
  })
  .strict()
  .refine((v) => new Set(v.scopes).size === v.scopes.length, { message: "Duplicate scope" });
export type OmniKeyCreateInput = z.infer<typeof omniKeyCreateInput>;

export const omniKeyIdInput = z
  .object({ id: z.string().uuid(), confirm: z.literal(true) })
  .strict();
export type OmniKeyIdInput = z.infer<typeof omniKeyIdInput>;

/** Extract and validate the bearer key from an Authorization header. */
export function parseOmniBearer(header: string | null): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const key = header.slice(7).trim();
  return OMNI_KEY_PATTERN.test(key) ? key : null;
}

/** Display prefix stored next to the hash so the owner can tell keys apart. */
export function omniKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

/** Generate a new key using Web Crypto (available in the worker runtime). */
export function generateOmniKey(getRandomValues?: (buf: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(24);
  (getRandomValues ?? ((b) => crypto.getRandomValues(b)))(bytes);
  return `omni_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface OmniApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: string;
  /** NULL only for keys created with "Never expires". */
  expires_at: string | null;
  /** Older records read before migration 0061 may lack the field; treated as finite. */
  never_expires?: boolean;
  last_used_at: string | null;
  created_at: string;
  rotated_at: string | null;
}

type ExpiryFields = Pick<OmniApiKeyRow, "status" | "expires_at" | "never_expires">;

/** Mirrors `omni_api_key_verify`: anything other than a clean shape reads as expired (fails closed). */
export function omniKeyStatus(
  key: ExpiryFields,
  now: number = Date.now(),
): "active" | "expired" | "revoked" {
  if (key.status === "revoked") return "revoked";
  if (key.status !== "active") return "expired";
  if (key.never_expires === true) return key.expires_at === null ? "active" : "expired";
  if (key.expires_at === null) return "expired";
  const at = Date.parse(key.expires_at);
  return Number.isFinite(at) && at > now ? "active" : "expired";
}

/** Plain expiry text for lists and details. */
export function omniKeyExpiryLabel(
  key: ExpiryFields,
  now: number = Date.now(),
  format: (iso: string) => string = (iso) => new Date(iso).toLocaleString(),
): string {
  if (key.never_expires === true && key.expires_at === null) return "Never expires";
  if (key.expires_at === null || !Number.isFinite(Date.parse(key.expires_at)))
    return "Expiry unreadable — treated as expired";
  return `${Date.parse(key.expires_at) > now ? "Expires" : "Expired"} ${format(key.expires_at)}`;
}

/** Owner-readable audit action names. */
export function omniKeyAuditLabel(action: string): string {
  switch (action) {
    case "create":
      return "Created (with expiry)";
    case "create_no_expiry":
      return "Created (never expires)";
    case "rotate":
      return "Rotated";
    case "revoke":
      return "Revoked";
    default:
      return action.replace(/_/g, " ");
  }
}
