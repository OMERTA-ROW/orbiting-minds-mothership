/**
 * Plain-language sign-in messages and the pending-invitation handoff.
 * Pure and browser-safe. Never echoes passwords, codes or tokens.
 */

type AuthErrorLike = {
  code?: string | null | undefined;
  status?: number | null | undefined;
  message?: string | null | undefined;
};

export const SIGN_IN_FALLBACK =
  "Sign-in didn't finish. Check your connection and try again, or use another sign-in option.";

const BY_CODE: Record<string, string> = {
  invalid_credentials:
    "Email or password is wrong. If you first signed in with Google, use “Continue with Google” instead.",
  email_not_confirmed:
    "Confirm your email first: open the link we emailed you, then sign in. Check spam if you can't find it.",
  user_already_exists:
    "An account with this email already exists. Sign in instead, or use “Forgot password”.",
  email_exists:
    "An account with this email already exists. Sign in instead, or use “Forgot password”.",
  weak_password:
    "Choose a stronger password: at least 12 characters, not one that has appeared in a data leak.",
  same_password: "Your new password must be different from the old one.",
  over_email_send_rate_limit: "Too many emails were sent recently. Wait a few minutes, then try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute, then try again.",
  signup_disabled: "New accounts are closed right now. Ask the owner for an invitation.",
  email_provider_disabled:
    "Email and password sign-in is turned off. Use “Continue with Google” instead.",
  provider_disabled: "This sign-in option is turned off. Use another option on this page.",
  email_address_invalid: "That email address doesn't look right. Check it and try again.",
  validation_failed: "Check the email and password, then try again.",
  session_not_found: "Your sign-in expired. Sign in again.",
  session_expired: "Your sign-in expired. Sign in again.",
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials!],
  [/email not confirmed/i, BY_CODE.email_not_confirmed!],
  [/already registered|already exists/i, BY_CODE.user_already_exists!],
  [/unsupported provider|provider is not enabled/i, BY_CODE.provider_disabled!],
  [/password should be|weak password|pwned/i, BY_CODE.weak_password!],
  [/rate limit/i, BY_CODE.over_request_rate_limit!],
];

/** Plain-language message for a recognised provider error, or null. */
export function knownAuthMessage(error: AuthErrorLike | null | undefined): string | null {
  if (!error) return null;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]!;
  const text = error.message ?? "";
  for (const [pattern, message] of BY_MESSAGE) if (pattern.test(text)) return message;
  if (error.status === 429) return BY_CODE.over_request_rate_limit!;
  return null;
}

/** Plain-language message for a sign-in, sign-up or password error. */
export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  return knownAuthMessage(error) ?? SIGN_IN_FALLBACK;
}

/** Invitation tokens are 64 lowercase hex characters (server-generated, single use). */
export const INVITE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const INVITE_KEY = "evo.pending-invite";

type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep a well-formed invitation token for this tab only, so sign-in can return to it. */
export function rememberPendingInvite(storage: TabStorage, token: string): boolean {
  if (!INVITE_TOKEN_PATTERN.test(token)) return false;
  storage.setItem(INVITE_KEY, token);
  return true;
}

/** Read and clear the pending invitation; anything malformed is dropped. */
export function takePendingInvite(storage: TabStorage): string | null {
  const value = storage.getItem(INVITE_KEY);
  storage.removeItem(INVITE_KEY);
  return value && INVITE_TOKEN_PATTERN.test(value) ? value : null;
}
