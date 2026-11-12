# Authentication — audited 2026-11-12

Provider: Lovable Cloud Auth (one account system for preview and the published site).

| Method | Who | Status (evidence) |
| --- | --- | --- |
| Google (`lovable.auth.signInWithOAuth("google")`) | Everyone | Enabled in auth settings; the only existing account uses it. |
| Email + password (`signUp` / `signInWithPassword`) | Everyone | Enabled; email confirmation required (auto-confirm off). Min 12 characters in the form. |
| Password reset email → `/reset-password` | Password accounts | Implemented; needs a recovery session from the email link. |
| "Continue with Lovable" | Everyone | Button implemented; server-side availability not verified (no account has used it). |
| Two-step sign-in: authenticator app (provider TOTP, RFC 6238) | Everyone, optional | Off until the account confirms a code on `/account-security`. Accounts with it on are asked for a code on `/auth` after sign-in. Required (aal2) for owner pages: OMNI Terminal, Docking Bay, API keys, Activation Approvals. Member data is not yet aal2-gated server-side. |
| Recovery codes | Every account with two-step on | 10 per batch, SHA-256 hash-only, single use; replace ≤5×/hour after a code from the last 15 min; recovery needs a verified email + sign-in from the last 10 min; 5 wrong codes/hour pause recovery. |
| Turn off two-step | Every account | Needs aal2 + code from the last 15 min; server removes TOTP factors and deletes recovery codes; logged. |
| Passkey (app WebAuthn, `omni_passkeys`) | Owner only | Only for OMNI Workspace actions on `/omni-terminal`; added after a fresh TOTP code. Not a sign-in method. 0 registered. |

Not implemented: phone/SMS, magic links, Apple, Microsoft, SSO, passkey-only sign-in.

## Steps
- Member: `/auth` → Google, Lovable, or email/password (confirm email first).
- Invitation: owner/admin creates a 72-hour single-use link on `/members` (nothing is emailed) → invitee opens `/invite?token=…` → "Sign in to accept" → returns to `/invite` → "Accept invitation". The server checks the confirmed email matches.
- Owner claim: one time on `/members`; only the configured, confirmed owner email can claim.
- Two-step sign-in (anyone, optional): account menu → Security (`/account-security`) → "Set up authenticator" → scan QR or type key → confirm a code (only then is it enabled) → create recovery codes.
- Lost authenticator: recovery code + fresh sign-in on `/account-security#recovery`; without codes, the project administrator must remove the factor. No bypass.
- Administrator removal (no codes): only on the owner's explicit request in the Lovable editor, after Lovable confirms server-side that the requesting editor account's verified email matches the app account. Then the provider admin API deletes the TOTP factor, every sign-in is ended (global sign-out), and an `admin_factor_removed` row is written to the account's authenticator history. Owner-only pages stay locked until a new authenticator is confirmed with a code. Done once, 2026-11-12, for the owner account.
