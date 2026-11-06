# Jackboy–Mothership bridge: review and staging prerequisites

## Status: not connected

At Jackboy source commit `f30f17903ac60380bb2485c9a34f02dbc1ea3e67` and
Mothership source commit `e5a90cf3c4f711846d5a0f624c3a43ba654704b6`, there is
no application-to-application bridge. Mothership's
`GET /api/public/omni/health` and `GET /api/public/omni/jobs` use its own
owner-issued, scoped API keys; they are **not** Jackboy's `omni.link/v2` or
legacy `/jackboy/handshake` and `/jackboy/jobs` contracts. Its browser-local
gateway is not a trusted executor or an owner authorization mechanism.
No reverse-client has been wired into the Mothership runtime.

Jackboy implements the opposite, OMNI-initiated direction at
`POST /api/public/omni/link`, disabled by default. It requires an HTTPS request,
scoped configuration, a fresh signed nonce, database-backed owner/project
approval and audit. Only `protocol.self-test` is executable, and only with the
separately enabled restricted Node 26 runner. The existing merged
`OMERTA-ROW/Omni` Go client implements this reverse protocol; it is a separate
application, **not** part of the Mothership Railway service. It requires an
audit sink and has no access to CODE, repository writes or deployments.

Legacy Jackboy outbound dispatch must remain unverified and disabled: its
handshake expects `/jackboy/handshake` and signed callback credentials that
Mothership does not implement. A successful reverse handshake must not set
`omni_connection.verified` or authorize outbound work.

The local protocol suite exercises the real migration, handler and companion Go
client over certificate-verified loopback TLS and an in-memory PGlite database.
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

The companion Go client requires the approved HTTPS origin, matching client and
project identifiers, dedicated bootstrap/HMAC secrets, and a private
`OMNI_LINK_AUDIT_DIR`. Its current CLI writes a local JSONL audit file: a
Railway container's ephemeral filesystem is **not** verified durable audit
storage. Before production use, design and test a durable, fail-closed audit
sink and an owner-bound Mothership invocation path; don't use the CLI as an
unreviewed background worker. `SSL_CERT_FILE` can identify the private CA to
Go's normal certificate verifier in a controlled staging process. Protect its
trust store and verify its effect on all other TLS calls in that process.

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
   runner isolation and durable audit sink. Provision staging-only dedicated
   credentials and explicit expiring owner/project approval separately.
4. Implement and review the Mothership caller and, independently, any
   compatible Jackboy-to-Mothership contract. Do not treat metadata key scope
   or a browser checkbox as owner authorization.
5. In staging, verify private DNS/reachability, valid and invalid TLS,
   handshake/proofs, owner/project/expiry checks, replay, session renewal,
   cancellation, durable audit and explicitly approved fixed self-test.
6. Only a separately authorized live handshake can establish production
   connectivity. Keep unrestricted CODE, arbitrary execution, deployment,
   repository writes, paid providers and autonomous operation disabled.
