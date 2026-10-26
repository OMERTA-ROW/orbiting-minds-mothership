# Owner accounts and tester invitations — status

Blocker: this project has ONE backend shared by preview and the live site. Per owner rule, no schema,
auth-setting or user-access change is made without an isolated dev backend. The schema is staged at
`.lovable/pending/owner-invitations.sql` and NOT applied.

Implemented + tested: `src/lib/invitations.ts` (role-grant/escalation rules, single-use/expiry/revocation,
hashed tokens, verified-email match, no identity merging) — `src/test/invitations.test.ts`.
Existing and unchanged: real email/Google/Lovable sign-in, recovery, sign-out, per-owner RLS on beta tables.

Blocked until activation: role table, invitation table, admin UI, server functions, sending invitation emails.
Other Jax apps were not touched (separate projects).

Limits/costs: no app-level invitation cap. Real limits are the backend's hourly auth-email rate limit and
plan usage; no purchase made.

Owner activation: 1) approve applying the pending SQL (or create an isolated draft); 2) sign up with your
real email and confirm it; 3) provide your account's user ID through the approval step so the one-line
owner bootstrap can be run — never a first-visitor rule; 4) then the admin page and server functions get wired.
