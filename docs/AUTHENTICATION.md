# Authentication — audited 2026-11-12

Provider: Lovable Cloud Auth (one account system for preview and the published site).

| Method | Who | Status (evidence) |
| --- | --- | --- |
| Google (`lovable.auth.signInWithOAuth("google")`) | Everyone | Enabled in auth settings; the only existing account uses it. |
| Email + password (`signUp` / `signInWithPassword`) | Everyone | Enabled; email confirmation required (auto-confirm off). Min 12 characters in the form. |
| Password reset email → `/reset-password` | Password accounts | Implemented; needs a recovery session from the email link. |
| "Continue with Lovable" | Everyone | Button implemented; server-side availability not verified (no account has used it). |
| Authenticator app (TOTP, Cloud MFA) | Owner only | Required (aal2) for owner pages: OMNI Terminal, Docking Bay, API keys, Activation Approvals, Members admin actions. One verified factor exists. |
| Owner recovery codes | Owner only | Hash-only, single use, need a sign-in from the last 10 minutes. 0 unused codes exist. |
| Passkey (app WebAuthn, `omni_passkeys`) | Owner only | Only for OMNI Workspace actions on `/omni-terminal`; added after a fresh TOTP code. Not a sign-in method. 0 registered. |

Not implemented: phone/SMS, magic links, Apple, Microsoft, SSO, passkey-only sign-in.

## Steps
- Member: `/auth` → Google, Lovable, or email/password (confirm email first).
- Invitation: owner/admin creates a 72-hour single-use link on `/members` (nothing is emailed) → invitee opens `/invite?token=…` → "Sign in to accept" → returns to `/invite` → "Accept invitation". The server checks the confirmed email matches.
- Owner claim: one time on `/members`; only the configured, confirmed owner email can claim.
- Owner two-factor: `/account-security` → scan QR → confirm a code (only then is it enabled) → create recovery codes.
- Lost authenticator: recovery code + fresh sign-in on `/account-security#recovery`; without codes, the project administrator must remove the factor. No bypass.
