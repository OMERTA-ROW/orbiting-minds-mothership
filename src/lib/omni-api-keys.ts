/**
 * OMNI API credential provisioning — shared validation and helpers.
 * Secrets are generated in the server function, shown to the owner exactly
 * once, and never stored: only the SHA-256 hash and a short display prefix
 * reach the database. Keys authenticate only the /api/public/omni/health and
 * /api/public/omni/jobs endpoints; creating a key connects nothing external.
 */
import { z } from "zod";

export const OMNI_API_SCOPES = ["health", "jobs"] as const;
export type OmniApiScope = (typeof OMNI_API_SCOPES)[number];

export const OMNI_SCOPE_LABELS: Record<OmniApiScope, string> = {
  health: "Health status (GET /api/public/omni/health)",
  jobs: "Job/run metadata (GET /api/public/omni/jobs)",
};

/** Presented keys are omni_ plus 48 hex chars (24 random bytes). */
export const OMNI_KEY_PATTERN = /^omni_[0-9a-f]{48}$/;
export const OMNI_KEY_MAX_AGE_DAYS = 365;

export const omniKeyCreateInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    scopes: z.array(z.enum(OMNI_API_SCOPES)).min(1).max(OMNI_API_SCOPES.length),
    days: z.number().int().min(1).max(OMNI_KEY_MAX_AGE_DAYS),
    confirm: z.literal(true),
  })
  .strict();
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
  expires_at: string;
  last_used_at: string | null;
  created_at: string;
  rotated_at: string | null;
}

export function omniKeyStatus(
  key: Pick<OmniApiKeyRow, "status" | "expires_at">,
  now: number = Date.now(),
): "active" | "expired" | "revoked" {
  if (key.status === "revoked") return "revoked";
  return Date.parse(key.expires_at) <= now ? "expired" : "active";
}
