# OMNI ↔ Jackboy secure link (omni.link/v2) — OMNI-side preparation

Canonical spec: Jackboy Dev Control `docs/OMNI-SECURE-LINK.md` (snapshot commit 6a79d487).
Status: PREPARATION ONLY. Live link, Node runner and `protocol.self-test` are NOT enabled or run.

## Settings (presence only — never record values here)
| Name | Kind | Source |
|---|---|---|
| OMNI_LINK_CLIENT_ID | non-secret | Owner chooses 1–64 `[A-Za-z0-9_-]`; must match on both hosts |
| OMNI_LINK_PROJECT_ID | non-secret UUID | Jackboy `owner_projects.id` (Jackboy database; owner supplies) |
| OMNI_LINK_OWNER_ID | non-secret UUID | Jackboy owner auth UUID (Jackboy database; owner supplies) |
| OMNI_LINK_APPROVAL_ID | non-secret UUID | New owner-reviewed grant UUID |
| OMNI_LINK_APPROVAL_EXPIRES_AT | non-secret ISO | ≤ 24h ahead; set only immediately before the approved test |
| OMNI_LINK_BOOTSTRAP_KEY | secret, 32-byte hex | New, independent; identical on OMNI and Jackboy hosts |
| OMNI_LINK_HMAC_SECRET | secret, 32-byte hex | New, independent of the bootstrap key and all other credentials |

Must NOT be set until explicit owner approval after readiness review:
`OMNI_LINK_ENABLED=true`, `OMNI_LINK_NODE_RUNNER_ENABLED=true` (Jackboy Node host only; never on Cloudflare).

## URL roles
- `OMNI_API_URL` (in Jackboy): where Jackboy reaches OMNI for the legacy outbound dispatch/callbacks.
- `JACKBOY_LINK_ORIGIN` (Jackboy Node host + OMNI client): HTTPS origin of Jackboy's Node listener that OMNI calls at `POST /api/public/omni/link`. No path/query/credentials.

## Runtime note
Two OMNI senders exist: the Go companion inbox client and the owner/MFA-gated in-app button. Both hold sessions in memory only. This web app never hosts the runner.

## Jackboy on Railway — owner decision 2026-11-06: option A
Served from Jackboy's existing public web route `/api/public/omni/link` with Railway's managed certificate.
No separate listener, no `OMNI_LINK_BIND_ADDRESS`, no `OMNI_LINK_TLS_CERT_FILE`/`OMNI_LINK_TLS_KEY_FILE`.
1. Pin Node ≥ 26 on the Railway service (tested 26.13.0); the fixed runner refuses older Node.
2. Apply Jackboy migration `drizzle/migrations/0030_omni_sessions.sql` via the approved process (earlier note "0044" was wrong).
3. Confirm `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` on that service.
4. Jackboy review: its handler requires the request URL to be `https:`; behind Railway's edge it may see HTTP. Needs a reviewed fix trusting only Railway's forwarded protocol.
5. Do not set `OMNI_LINK_ENABLED` / `OMNI_LINK_NODE_RUNNER_ENABLED` until the scoped test is approved.

## OMNI in-app button (Mothership)
Uses the platform's standard fetch with public certificate validation; no CA file (`JACKBOY_LINK_CA_FILE` retired).
Set only at approved activation: `JACKBOY_LINK_MOTHERSHIP_OWNER_ID`, `OMNI_LINK_APPROVAL_EXPIRES_AT`, `JACKBOY_LINK_ENABLED`, `JACKBOY_LINK_SELF_TEST_ENABLED`.

## Owner MFA (OMNI)
Sign in with the confirmed account → claim owner → enroll authenticator (TOTP) → sign in again to reach aal2.

## Emergency Stop (added 2026-11-07)
OMNI Terminal holds a server-side Emergency Stop that is engaged by default. While engaged (or if it cannot be read), the handshake/self-test, receipt grants and callbacks are refused. Before the step-8 self-test the owner releases it in OMNI Terminal with fresh two-factor and a reason; releasing turns nothing on. Engage it again afterwards.
