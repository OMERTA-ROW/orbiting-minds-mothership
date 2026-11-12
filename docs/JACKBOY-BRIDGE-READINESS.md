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

## Runner-only activation target (not production-verified)

The current activation target is runner-only: Jackboy's Lovable deployment owns
the database, and Railway runs the fixed protocol self-test. The Railway runner
is a separate endpoint, not the Jackboy link origin. The separate
`scripts/omni-link-server.mjs` listener, `OMNI_LINK_BIND_ADDRESS` and
`OMNI_LINK_TLS_CERT_FILE`/`OMNI_LINK_TLS_KEY_FILE` remain unused.

The Mothership client loads `JACKBOY_LINK_ORIGIN` only if it is a public HTTPS
DNS name on the default port (no IP literal, `localhost`, `.internal`, `.local`,
path, query or credentials). No CA file is read. Configure these
Mothership-only managed settings only at the separately approved activation:

| Setting | Purpose |
| --- | --- |
| `JACKBOY_LINK_ENABLED` | Exact `true` enables the owner-gated client; absent is disabled |
| `JACKBOY_LINK_SELF_TEST_ENABLED` | Exact `true` separately permits submit/run of the fixed test; absent blocks them |
| `JACKBOY_LINK_ORIGIN` | Public HTTPS origin of Jackboy on Lovable in runner-only mode; not the Railway runner |
| `JACKBOY_LINK_RUNNER_ORIGIN` | Nonsecret expected Railway runner HTTPS origin; binds Step 2 evidence to the intended service |
| `JACKBOY_LINK_MOTHERSHIP_OWNER_ID` | Verified MFA Mothership owner's UUID |
| `OMNI_LINK_CLIENT_ID`, `OMNI_LINK_PROJECT_ID`, `OMNI_LINK_APPROVAL_ID`, `OMNI_LINK_APPROVAL_EXPIRES_AT` | Exact approved Jackboy scope; approval expiry at most 24 hours |
| `OMNI_LINK_BOOTSTRAP_KEY`, `OMNI_LINK_HMAC_SECRET` | Dedicated credentials matching Jackboy, server-only |

Step 2 does **not** read runner flags or the runner secret from Mothership.
It sends signed `action: "configuration"` through the existing link transport
to Jackboy on Lovable. Jackboy verifies the bootstrap identity, scoped project,
owner role, pause state and single-use nonce in its database, then sends signed
`kind: "runner.configuration"` to its configured Railway runner. Both hops
verify nonce-bound response HMACs, refuse redirects and use verified HTTPS.
Only effective boolean configuration metadata is returned, with the runner
origin bound to Mothership's nonsecret `JACKBOY_LINK_RUNNER_ORIGIN`.
No session, job or execution approval is issued; metadata reads do not require
execution switches or approval expiry. Actual handshake/submit/run retain
their existing switch and grant gates.

Missing metadata is **unverified**, not evidence that Railway variables are
missing. The existing variables belong on
`Evolution / production / jackboy-dev-control`: `OMNI_LINK_RUNNER_MODE=true`,
`OMNI_LINK_NODE_RUNNER_ENABLED=true`, and managed
`OMNI_LINK_REMOTE_RUNNER_SECRET`. Do not repeat completed setup or copy the
runner secret into Mothership or the Go `Omni` service. Jackboy on Lovable is
the authenticated caller and already requires
`OMNI_LINK_REMOTE_RUNNER_ENABLED`, `OMNI_LINK_REMOTE_RUNNER_URL` and the
matching managed runner secret; inspect existing caller configuration before
changing it. Railway must not receive `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY`; the database remains on Lovable.

The owner confirms Node 26 on the Railway runner and verifies Jackboy's actual
migration history in the Lovable-owned database. Step 4 verifies a signed HTTPS
configuration exchange through the same `JACKBOY_LINK_ORIGIN` client,
including public certificate validation, redirect refusal and response proofs.
It does not create an execution session before the Step 7 approval window.
Step 8 only verifies a
fresh, proof-checked self-test result from the separately gated protocol flow:
configuration or an active deployment alone is not proof.

### Read-only Railway audit, 2026-11-12

Railway's authenticated CLI confirmed both flags are `true` and the runner
secret is configured on the above service. Mothership and `Omni` do not have
these runner variables, correctly. The deployed Jackboy SHA was
`bfa68f9fef7a863a185e1858a3cc28cc7005c134`, with Node 26.13.0 resolved in
deployment metadata. GET of the runner endpoint returned 405; an unsigned
POST with `{}` returned 401 `authentication_failed`. In that deployed source,
401 is reachable only after runner-mode, valid-secret and Node-availability
checks. This confirms existing configuration is effective, **not** a self-test
pass. No self-test, secret change, restart or deployment was requested.
Direct SSH inspection was blocked by Railway's SSH-key admission.

The Railway services share the Evolution project/production environment, but
the Lovable caller is outside Railway's private mesh. The intended hop uses
public HTTPS: Jackboy on Lovable → the Railway runner. Private `.internal`
HTTP must not replace it. The Go `Omni` service points at Jackboy on Lovable,
not the runner. Lovable's caller configuration and end-to-end authenticated
connectivity were not inspected.

Production Mothership SHA `7ea35c7cf515190d11fb50ae1602f585ffbc1088`
has the old recorded-decision checklist; it does not automatically inspect
Railway variables. A failed Step 2 can be an old decision, not a fresh
configuration observation. The earlier unshipped revamp also incorrectly read
Mothership's process environment; this branch replaces that assumption with
remote attestation. Version 1 evidence cannot approve version 2 steps.
Production owner records were not inspected.

Runtime readers in Jackboy:

| File / function | Configuration read |
| --- | --- |
| `src/lib/omni-remote-runner.ts` / `runnerModeDecision` | `OMNI_LINK_RUNNER_MODE`; rejects site/Lovable hosts for runner-only routing |
| `src/lib/omni-session-runner.server.ts` / `protocolRunnerAvailable` | `OMNI_LINK_NODE_RUNNER_ENABLED`; Node version and permission support |
| `src/lib/omni-remote-runner.server.ts` / `handleRunnerRequest` | `OMNI_LINK_REMOTE_RUNNER_SECRET`; the new metadata reply also reads the Node flag |
| `src/lib/omni-remote-runner.ts` / `remoteRunnerConfig`, `remoteRunnerDiagnostic`, `runnerConfigProblem` | Live Jackboy caller's runner secret, enabled flag and URL |
| `src/lib/omni-link.functions.ts` / `probeOmniConnection` | Caller-side secret presence/configuration diagnostics; not remote verification |
| `src/server.ts`, `src/lib/omni-runner-mode.server.ts` | Invoke the mode/availability readers to choose routing and local/remote execution |

The Go `OMERTA-ROW/Omni` source does not read the three runner settings.
"Evolution" is the Railway project and Mothership application context, not an
additional runner implementation. Mothership's `currentDeployment` now selects
nonsecret target references; `evaluateCheck` calls the new signed client probe.
It stores check evidence and its audit atomically through the service-only
`activation_approval_record_check` RPC, before any owner approval RPC.

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

1. Owner verifies the Railway runner's effective settings, Node 26 runtime,
   deployed SHA and isolated test scope. No production settings or deployments
   are changed by this checklist update.
2. Verify Jackboy's actual migration history and `0030_omni_sessions.sql` in
   Lovable's database; do not apply or rewrite migrations from Railway.
3. Keep the runner restricted to the fixed self-test. It must not receive
   Supabase credentials, execute caller-provided code, shell commands or
   repository tests.
4. Confirm the Step 4 origin is Jackboy on Lovable and preserve TLS,
   redirect-refusal, scope and signature checks.
5. Run the existing separately gated protocol self-test and verify its fresh
   signed result; a configuration check or active service is not a substitute.
6. Production publishing and activation require a separate owner decision.
   Keep unrestricted CODE, arbitrary execution, repository writes, paid
   providers and autonomous operation disabled.
