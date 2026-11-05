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
OMNI's client for v2 is the Go companion inbox client (sessions held in memory only). This web app (Cloudflare Workers) does not host the v2 client or the runner.

## Jackboy Node 26+ host (owner, external)
1. Provision Node ≥ 26 host (tested 26.13.0) with valid TLS cert/key at managed paths (`OMNI_LINK_TLS_CERT_FILE`, `OMNI_LINK_TLS_KEY_FILE`).
2. Apply Jackboy migration `0044_omni_sessions.sql` via the approved migration process.
3. Add managed config: the seven OMNI_LINK_* values, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JACKBOY_LINK_ORIGIN`, `OMNI_LINK_BIND_ADDRESS` (default 127.0.0.1; widening needs approval). Firewall to the OMNI host.
4. Do not start `node scripts/omni-link-server.mjs` or set the two opt-in flags until the scoped test is approved.

## Owner MFA (OMNI)
Sign in with the confirmed account → claim owner → enroll authenticator (TOTP) → sign in again to reach aal2.
