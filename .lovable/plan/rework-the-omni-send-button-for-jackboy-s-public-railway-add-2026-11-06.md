# Rework the OMNI send button for Jackboy's public Railway address (option A)

## Goal
The owner-only Jackboy link button in OMNI should reach Jackboy's existing public Railway route (`/api/public/omni/link`) and rely on Railway's managed public certificate. No certificate file, no bind address, no TLS key files. It must work on this app's hosting.

Live switches stay off, the self-test is not run, nothing is deployed, secrets are not changed, and no calls go to Railway or any paid service. All testing is local.

## What changes for the owner
- `JACKBOY_LINK_CA_FILE` is no longer needed and will never be asked for.
- The button's owner and two-factor checks, the matching owner/project/approval checks, and the separate self-test switch all stay exactly as they are.
- Still needed later, at activation time only: `JACKBOY_LINK_MOTHERSHIP_OWNER_ID` (your OMNI user ID, not secret), `OMNI_LINK_APPROVAL_EXPIRES_AT`, and the live switches `JACKBOY_LINK_ENABLED` / `JACKBOY_LINK_SELF_TEST_ENABLED`. None are set by this work.

## Steps
1. **Replace the connection method** in the server-side link client.
   - Swap the Node-only HTTPS request and file read for the hosting's standard web request, which checks public certificates automatically. No option exists to turn checking off or add a custom certificate.
   - Refuse any redirect instead of following it.
   - Keep the 5-second time limit and the 32 KB reply cap. Stop reading as soon as the cap is passed.
   - Keep request signing, reply proof checks, nonce/contract checks, session expiry rules and fail-closed audit unchanged.
2. **Tighten the address rules** when settings are loaded from the environment.
   - Require HTTPS on the default port (443).
   - Refuse IP addresses, `localhost` and private names such as `.railway.internal`.
   - Keep the existing rules: no path, query or credentials in the address.
3. **Tests (local only, no network)**
   - New unit tests with a fake network covering:
     - the exact address and path, plus the signed headers
     - redirects refused
     - oversized replies refused
     - timeouts
     - bad proof and wrong nonce rejected
     - missing switch, expired approval and approval more than 24 hours ahead all refused
     - bad addresses refused: HTTP, other ports, IP addresses, localhost, `.railway.internal`
     - no certificate file required
   - Update the cross-project integration test. It runs against a local copy of Jackboy's real handler on a local test database. A test-only transport will trust the local test certificate. A new case will check that the real default transport rejects an untrusted certificate.
   - Run the full test suite and the existing link and panel tests.
4. **Docs and rules**
   - Update the Jackboy bridge readiness notes and the OMNI setup guide for option A.
   - Remove the certificate-file setting from both.
   - Fix the migration name: Jackboy's `0030_omni_sessions.sql`, not 0044.
   - Record the Jackboy-side items still open (below).
   - Replace the matching rule in `AGENTS.md`.

## Still open on Jackboy's side (not changed here)
- Jackboy's handler requires the request to look like HTTPS. Behind Railway's proxy, the app may see plain HTTP and answer `https_post_required`. This needs a reviewed fix in Jackboy that trusts only Railway's forwarded protocol.
- Pin Node 26 on the Railway service.
- Confirm the `0030_omni_sessions.sql` migration and the two database settings are in place.
- Owner approval of public exposure for that route was given in this decision. The route stays disabled until the switches are set.

## What this cannot prove
Local tests and a clean build confirm the code. They don't prove a live connection to Railway. That needs the separately approved readiness check and self-test.

## Technical details
- Files: `src/lib/jackboy-link.server.ts`, new `src/lib/jackboy-link.server.test.ts`, `tests/jackboy-link-integration.test.mjs`, `docs/JACKBOY-BRIDGE-READINESS.md`, `.lovable/jackboy-omni-link-setup.md`, `AGENTS.md`.
- Transport uses `fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000) })`. Any 3xx/opaque redirect is an error. The body is read via a stream reader with the 32 KB cap. `x-omni-proof` is read from the response headers.
- `JackboyLink` accepts an optional transport parameter, used by tests only and never read from env. `Config.ca` is removed.
- `node:crypto` (HMAC/SHA-256/timing-safe compare) stays. `node:https` and `node:fs` are removed from this module.
- `jackboy-link.functions.ts` and `jackboy-link-scope.ts` are unchanged.
