# Jackboy–Mothership bridge: review and staging prerequisites

## Status: not connected

At Jackboy source commit `ae373d5cccc1964d51e8dbda26c5bfbaea7e045b`, this
review branch adds a disabled-by-default Mothership client for the reverse link
and scoped quarantine dispatch.
Mothership's
`GET /api/public/omni/health` and `GET /api/public/omni/jobs` use its own
owner-issued, scoped API keys; they are **not** Jackboy's `omni.link/v2` or
legacy `/jackboy/handshake` and `/jackboy/jobs` contracts. Its browser-local
gateway is not a trusted executor or an owner authorization mechanism.
The owner-MFA-gated `requestJackboyLink` server function and the owner-only
API credentials page are the explicit invocation surface; no background
process, scheduler or automatic job exists.
It requires the configured Mothership owner, Jackboy project and approval IDs
to match exactly. Submit/run additionally require a separate self-test flag.

Jackboy implements the opposite, OMNI-initiated direction at
`POST /api/public/omni/link`, disabled by default. It requires an HTTPS request,
scoped configuration, a fresh signed nonce, database-backed owner/project
approval and audit. Only `protocol.self-test` is executable, and only with the
separately enabled restricted Node 26 runner. The existing merged
`OMERTA-ROW/Omni` Go client implements the same reverse protocol independently.
The Mothership client uses the hosting platform's standard `fetch`, which
verifies the server certificate against public trust; it has no custom-CA or
insecure option, refuses redirects, caps replies at 32 KB and times out after
5 seconds. It verifies the response HMAC, and writes pre-request and result audit records to the existing
`razul_control_audit` table using the service role. Audit failures fail closed.
It has no access to CODE, repository writes or deployments.

Legacy Jackboy outbound dispatch must remain unverified and disabled: its
handshake expects `/jackboy/handshake` and signed callback credentials that
Mothership does not implement. A successful reverse handshake must not set
`omni_connection.verified` or authorize outbound work.

The local `0031_jackboy_dispatch_quarantine.sql` migration and disabled-by-default
`POST /api/public/jackboy/dispatch` route are a receive-only foundation. The
route requires HTTPS, a dedicated HMAC identity, a fresh nonce and a scoped
pre-provisioned grant. The storage binds a grant to owner, project, repository,
job and payload digest; it stores only quarantined/cancelled states and commits
nonce consumption, job state and audit together. Owner-authenticated grant
functions require verified MFA and record approval and revocation atomically.
The isolated two-database TLS test simulates those identity claims; both
repositories compute the same canonical digest over scope and instructions.
Both apps provide explicit owner review controls. Mothership can send a signed
callback for its stored quarantine/cancellation state; a local test exercises
it over verified TLS and isolated databases with simulated owner claims.
Cross-service revocation and hosted verification remain unbuilt.
Independent database grants cannot provide atomic distributed revocation:
revoking on one side does not automatically revoke the other, and a request
can race a revocation. Quarantine must remain non-executing.
Do not configure `JACKBOY_DISPATCH_ENABLED`, `JACKBOY_DISPATCH_CLIENT_ID` or
`JACKBOY_DISPATCH_HMAC_SECRET` until those pieces and their deployment
safeguards have been reviewed. No migration has been applied to a hosted database.

For an independently approved staging setup only, Mothership callback transport
uses `JACKBOY_CALLBACK_ENABLED`, `JACKBOY_CALLBACK_ORIGIN`,
`JACKBOY_CALLBACK_CA_FILE`, `JACKBOY_CALLBACK_CLIENT_ID` and
`JACKBOY_CALLBACK_HMAC_SECRET`. The corresponding Jackboy receiver uses the
separate `OMNI_DISPATCH_CALLBACK_*` identity and secret. Both TLS endpoints
must use verified certificates with matching DNS SANs. These variables are not
configured by this change; the supplied private HTTP endpoints are not TLS.

The cross-repository protocol suite exercises the actual Mothership client,
Jackboy migration and handler over certificate-verified loopback TLS and an
in-memory PGlite database. It injects an audit sink; it does not prove a
Mothership database audit write. A separate suite exercises the companion Go
client.
These checks do not prove Railway routing, deployed configuration, production
permissions, durable client-side audit, or connectivity between these two apps.

## Railway/TLS design for review — not applied

Railway documents private networking as an environment-scoped WireGuard mesh;
services must share the **same Railway project and environment**. Internal
names may resolve only to IPv6 in older environments. Private HTTP provides
neither an `https:` request nor TLS peer-certificate authentication required by
`omni.link/v2`; do not reinterpret a forwarded header or disable certificate
verification. See [Railway private networking](https://docs.railway.com/networking/private-networking/how-it-works).
The supplied `http://...railway.internal:8080` URLs are the existing application
listeners, not verified TLS bridge endpoints.

One possible staging design is a **separate** explicitly approved Jackboy
Node 26+ HTTPS bridge service running the existing
`scripts/omni-link-server.mjs`, with a service name and private port dedicated
to the link. Do not replace either app's existing `bun run start` or use the
application port 8080 for a second listener. Provision an internal certificate
whose DNS SAN exactly matches the new service's Railway internal hostname, and
distribute its issuing CA to the client through managed, access-controlled
configuration. The Go client must use that CA and normal hostname validation;
redirects, insecure TLS flags and public port exposure are not acceptable.
Test the actual private DNS/address family and certificate before any grant.

For that proposed service only, the reviewed settings are:

| Setting | Required value or purpose |
| --- | --- |
| `JACKBOY_LINK_ORIGIN` | `https://<approved-bridge-service>.railway.internal:<approved-private-port>`; its hostname must match the certificate SAN |
| `OMNI_LINK_BIND_ADDRESS` | A reviewed private-network-reachable bind address supporting the environment's IP family; default loopback cannot serve a different service |
| `OMNI_LINK_TLS_CERT_FILE`, `OMNI_LINK_TLS_KEY_FILE` | Managed certificate and protected key file paths |
| `OMNI_LINK_ENABLED`, `OMNI_LINK_NODE_RUNNER_ENABLED` | Both remain unset until the separate fixed-self-test approval |
| `OMNI_LINK_CLIENT_ID`, `OMNI_LINK_PROJECT_ID`, `OMNI_LINK_OWNER_ID`, `OMNI_LINK_APPROVAL_ID`, `OMNI_LINK_APPROVAL_EXPIRES_AT` | Explicitly approved identity and bounded owner/project scope; expiry at most 24 hours |
| `OMNI_LINK_BOOTSTRAP_KEY`, `OMNI_LINK_HMAC_SECRET` | Independent dedicated secrets in managed server-side storage; do not reuse metadata API keys or CODE/provider credentials |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing Jackboy backend access, only on the approved bridge service |

## Owner decision 2026-11-06: option A (public Railway route)

The owner chose to serve the link from Jackboy's existing public Railway web
route (`/api/public/omni/link`) using Railway's managed public certificate.
The separate `scripts/omni-link-server.mjs` listener, `OMNI_LINK_BIND_ADDRESS`
and `OMNI_LINK_TLS_CERT_FILE`/`OMNI_LINK_TLS_KEY_FILE` are **not used** for this
path. The private-network design above remains a reference only; nothing outside
Railway can reach `.railway.internal` names.

The Mothership client loads `JACKBOY_LINK_ORIGIN` only if it is a public HTTPS
DNS name on the default port (no IP literal, `localhost`, `.internal`, `.local`,
path, query or credentials). No CA file is read. Configure these
Mothership-only managed settings only at the separately approved activation:

| Setting | Purpose |
| --- | --- |
| `JACKBOY_LINK_ENABLED` | Exact `true` enables the owner-gated client; absent is disabled |
| `JACKBOY_LINK_SELF_TEST_ENABLED` | Exact `true` separately permits submit/run of the fixed test; absent blocks them |
| `JACKBOY_LINK_ORIGIN` | Public HTTPS origin of Jackboy's Railway web service |
| `JACKBOY_LINK_MOTHERSHIP_OWNER_ID` | Verified MFA Mothership owner's UUID |
| `OMNI_LINK_CLIENT_ID`, `OMNI_LINK_PROJECT_ID`, `OMNI_LINK_APPROVAL_ID`, `OMNI_LINK_APPROVAL_EXPIRES_AT` | Exact approved Jackboy scope; approval expiry at most 24 hours |
| `OMNI_LINK_BOOTSTRAP_KEY`, `OMNI_LINK_HMAC_SECRET` | Dedicated credentials matching Jackboy, server-only |

Open on Jackboy's side (not changed by Mothership work):
- The handler requires `new URL(request.url).protocol === "https:"`. Behind
  Railway's edge the app may see plain HTTP and return `https_post_required`;
  a reviewed Jackboy change must trust only Railway's forwarded protocol.
- Pin Node 26+ on the Railway service; the fixed runner refuses older Node.
- Confirm `drizzle/migrations/0030_omni_sessions.sql` and `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY` on that service.

Local evidence (2026-11-06): the cross-repository suite
(`JACKBOY_TEST_ROOT=<jackboy checkout> node --test tests/jackboy-link-integration.test.mjs`
on Node 26.13.0) passed 9/9 against Jackboy's real handler, migration and
runner over loopback TLS with a test-only transport; the default platform
transport rejected the self-signed test certificate. This proves neither
Railway routing nor production connectivity.

Each explicit request obtains a fresh session in memory. An invalid or expired
session fails the request; an owner may make a new explicit request with the
same job ID to reconcile, not rerun with a new ID. If the result audit fails
after a remote commit, the call reports uncertainty; reconcile via `status`.
No credentials, sessions or remote bodies are stored in the audit. Existing
`razul_control_audit` persistence is service-role controlled but not proven
append-only or operational in the deployed database.

The existing Node runner's permission model is not a sandbox for untrusted
code. Approval of this design must specify isolation for the fixed diagnostic;
it must never execute caller-provided code, shell commands or repository tests.
No process, new service, environment variable, secret, database migration or
network connection is created by this document.

## Required gates

1. Owner confirms Railway project/environment identity, deployment SHAs,
   startup configuration and an isolated staging environment; no production
   requests are authorized by this document.
2. Verify Jackboy's actual migration history and `0030_omni_sessions.sql`
   service-role grants without applying or rewriting existing migrations. There
   are two `0030_` filenames in the source; use the existing reviewed migration
   procedure and verify actual history, not filename assumptions.
3. Review a service identity and certificate lifecycle, private listener,
   runner isolation and deployed audit retention/integrity. Provision staging-only dedicated
   credentials and explicit expiring owner/project approval separately.
4. Review the Mothership caller and independently implement a compatible
   Jackboy-to-Mothership contract. The legacy outbound request does not carry
   the reverse link's owner/project/approval proof; do not accept it as an
   authorized job or mark the legacy handshake verified merely to unblock it.
   Do not treat metadata key scope or a browser checkbox as authorization.
5. In staging, verify private DNS/reachability, valid and invalid TLS,
   handshake/proofs, owner/project/expiry checks, replay, session renewal,
   cancellation, durable audit and explicitly approved fixed self-test.
6. Only a separately authorized live handshake can establish production
   connectivity. Keep unrestricted CODE, arbitrary execution, deployment,
   repository writes, paid providers and autonomous operation disabled.
