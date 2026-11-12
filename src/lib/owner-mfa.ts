/**
 * Owner authenticator (TOTP) enrollment, challenge and recovery helpers.
 * Pure and browser-safe. Recovery codes are only ever hashed here; the
 * plaintext is shown once to the owner and never stored or logged.
 */

/** Name new authenticator entries show in the owner's app. */
export const TOTP_ISSUER = "OMNI Mothership";
/** Older entries were named after the site address by the sign-in provider. */
export const LEGACY_TOTP_ISSUER = "orbiting-minds-mothership.lovable.app";
/** A displayed setup QR/key is hidden after this long; the owner starts again. */
export const SETUP_WINDOW_MS = 10 * 60 * 1000;
/** Recovery needs a sign-in (Google, password, link) from the last 10 minutes. */
export const RECOVERY_FRESH_SIGNIN_SECONDS = 10 * 60;
export const RECOVERY_CODE_COUNT = 10;
/** Local pause after repeated wrong codes; the provider also rate-limits. */
export const CLIENT_MAX_ATTEMPTS = 5;
export const CLIENT_COOLDOWN_MS = 30 * 1000;

export type OwnerMfaState = "signed_out" | "needs_setup" | "needs_code" | "verified";

export function ownerMfaState(input: {
  signedIn: boolean;
  verifiedFactors: number;
  aal: string | null | undefined;
}): OwnerMfaState {
  if (!input.signedIn) return "signed_out";
  if (input.verifiedFactors < 1) return "needs_setup";
  return input.aal === "aal2" ? "verified" : "needs_code";
}

export function totpFriendlyName(now: Date): string {
  return `${TOTP_ISSUER} ${now.toISOString().slice(0, 16).replace("T", " ")}`;
}

export const isSixDigitCode = (value: string) => /^\d{6}$/.test(value);

type ProviderError = { code?: string | null; status?: number | null; message?: string | null };

/** Plain-language message for a provider MFA error. Never echoes codes or secrets. */
export function mfaErrorMessage(error: ProviderError | null | undefined): string | null {
  if (!error) return null;
  switch (error.code) {
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
      return "That code didn't match. Codes change every 30 seconds: wait for a new one and make sure your phone sets its time automatically.";
    case "mfa_challenge_expired":
      return "That code request expired. Enter the newest code from your app.";
    case "mfa_factor_not_found":
      return "This authenticator is no longer on your account. Refresh the page and set one up again.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute, then try the newest code.";
    case "insufficient_aal":
      return "Verify with your current authenticator first.";
    case "mfa_factor_name_conflict":
      return "An authenticator with this name already exists. Cancel and start again.";
    case "too_many_enrolled_mfa_factors":
      return "Too many unfinished setups. Refresh the page and start again.";
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_verify_not_enabled":
      return "Authenticator apps are turned off for this site. Two-factor cannot be set up right now.";
    case "session_not_found":
    case "session_expired":
      return "Your sign-in expired. Sign in again, then retry.";
  }
  if (error.status === 429) return "Too many attempts. Wait a minute, then try the newest code.";
  return "The code could not be checked. Check your connection and try again.";
}

const PRIMARY_METHODS = new Set(["oauth", "password", "otp", "magiclink", "sso/saml"]);

/** Seconds since the newest first-step sign-in in the session's amr claim. */
export function primarySignInAgeSeconds(amr: unknown, nowSeconds: number): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !PRIMARY_METHODS.has(method)) continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  if (latest === null || latest > nowSeconds + 60) return null;
  return Math.max(0, nowSeconds - latest);
}

/** Why recovery cannot start, or null when the identity checks pass. */
export function recoveryBlocker(input: {
  emailVerified: boolean;
  isOwner: boolean;
  signInAgeSeconds: number | null;
}): string | null {
  if (!input.emailVerified) return "Recovery needs a verified email address on this account.";
  if (!input.isOwner) return "Only the owner account can use owner recovery.";
  if (input.signInAgeSeconds === null || input.signInAgeSeconds > RECOVERY_FRESH_SIGNIN_SECONDS)
    return "Sign in again (within the last 10 minutes) before using a recovery code.";
  return null;
}

// Crockford base32 without I, L, O, U: easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 12 characters (60 random bits) shown as XXXX-XXXX-XXXX. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length < 12) throw new Error("12 random bytes are required.");
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[bytes[i]! & 31];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Normalizes typed input (case, spaces, dashes, look-alike letters); null if malformed. */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(cleaned) ? cleaned : null;
}

/** SHA-256 hex bound to the user so a code is useless for any other account. */
export async function recoveryCodeHash(userId: string, normalized: string): Promise<string> {
  const input = `omni.owner-recovery/v1\n${userId.toLowerCase()}\n${normalized}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type RecoveryOutcome = "accepted" | "invalid" | "locked" | "not_owner";

export function recoveryOutcomeMessage(outcome: string): string {
  switch (outcome) {
    case "accepted":
      return "Recovery code accepted.";
    case "locked":
      return "Too many wrong recovery codes. Recovery is paused for an hour.";
    case "not_owner":
      return "Only the owner account can use owner recovery.";
    default:
      return "That recovery code wasn't recognised or was already used.";
  }
}

/** Pages a fresh sign-in may return to (same-origin, fixed list). */
export const SIGNIN_RETURN_PATHS = ["/account-security", "/omni-dock"] as const;
const RETURN_KEY = "omni.signin-return";

export function rememberSignInReturn(path: (typeof SIGNIN_RETURN_PATHS)[number]) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(RETURN_KEY, path);
}

/** Reads and clears the remembered page; anything not on the fixed list is ignored. */
export function takeSignInReturn(): (typeof SIGNIN_RETURN_PATHS)[number] | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(RETURN_KEY);
  window.sessionStorage.removeItem(RETURN_KEY);
  return (SIGNIN_RETURN_PATHS as readonly string[]).includes(value ?? "")
    ? (value as (typeof SIGNIN_RETURN_PATHS)[number])
    : null;
}
