# Native OMNI CLI authorization — `omni.native-auth/v1`

This contract adds owner-approved browser enrollment for the native OMNI CLI. It does not reuse
the `omni-web` bearer delegation and issues no access or refresh token. The result is a device
record whose P-256 public key authenticates every subsequent `omni.dock/v1` request.

Authentication is implemented in `.lovable/pending/0076_omni_native_cli_authorization.sql`;
native text chat is added in `.lovable/pending/0077_omni_native_cli_chat.sql`. Both migrations are
**source-only until owner-approved and applied**. Chat permission is offered only when the 0077
readiness marker is available. The native CLI must implement the client side before these flows
can be used end to end.

## Browser authorization request

The CLI starts a loopback HTTP listener on `127.0.0.1` using an OS-assigned ephemeral port, then
opens the user's system browser at `/omni-native-authorize` with these query parameters:

| Parameter | Rule |
| --- | --- |
| `response_type` | Exactly `code` |
| `client_id` | Exactly `omni-native-cli` |
| `redirect_uri` | Exactly `http://127.0.0.1:<port>/callback`; decimal port 1024–65535; no credentials, query, fragment, or alternate host |
| `state` | Unpredictable 16–256 character base64url/unreserved value; the CLI must compare it on callback |
| `code_challenge` | Base64url SHA-256 digest of the verifier (43 characters) |
| `code_challenge_method` | Exactly `S256` |
| `label` | 1–60 characters; control characters rejected |
| `platform` | `macos`, `linux`, or `windows` |
| `public_key` | Base64url-encoded UTF-8 compact JWK with exactly `crv`, `kty`, `x`, `y` members; P-256 EC public key |
| `timestamp` | Unix milliseconds, within five minutes of server time |
| `nonce` | 16–64 base64url characters |
| `proof` | Base64url-encoded 64-byte P-256 ECDSA `r || s` signature |
| `rotation_device_id` | Optional UUID of an existing native device being rotated |

The device proof is ECDSA P-256 with SHA-256 over this exact newline-separated UTF-8 string:

```text
OMNI-NATIVE-AUTH-V1
GET
/omni-native-authorize
omni-native-cli
<redirect_uri>
<state>
<code_challenge>
S256
<timestamp>
<nonce>
<canonical_public_jwk>
<label>
<platform>
<rotation_device_id_or_dash>
```

`canonical_public_jwk` is compact JSON in this exact key order:
`{"crv":"P-256","kty":"EC","x":"<x>","y":"<y>"}`. The signature is raw fixed-width
`r || s`, not ASN.1 DER. The public key, label, platform, callback, state, PKCE challenge,
timestamp, nonce, and optional rotation target are all covered by the proof.

The signed request contains no private key, code verifier, password, MFA code, or reusable
credential. Changing its callback, state, PKCE challenge, request fields, or key fails proof
validation; the browser itself is not cryptographically attested. On approval the browser presents
the key fingerprint and six-digit safety code; the owner must
compare the fingerprint with the CLI, select permissions, and complete owner `aal2` plus a
TOTP check from the last 15 minutes. A rotation carries forward the existing device permissions
and does not offer a permission change.

### Callback

Approval redirects to:

```text
http://127.0.0.1:<port>/callback?code=omnicli_<64 lowercase hex>&state=<original state>
```

Decline returns `error=access_denied` and the same state. The authorization code is random,
stored only as a SHA-256 hash, valid for 60 seconds, and accepted once. The CLI must reject a
missing/mismatched state, a duplicate callback, or an unexpected callback path/host. The owner
approval endpoint revalidates the signed request and fresh MFA immediately before recording
consent. If the `omni_native_authorization_ready` database marker is absent, approval fails closed.

## Code exchange

The CLI, not the browser, sends a JSON `POST` to
`/api/public/omni/native/token`. Browser-originated requests carrying an `Origin` header are
refused. The route accepts JSON up to 16 KiB:

```json
{
  "grant_type": "authorization_code",
  "client_id": "omni-native-cli",
  "redirect_uri": "http://127.0.0.1:49152/callback",
  "code": "omnicli_<64 lowercase hex>",
  "code_verifier": "<43–128 base64url/unreserved characters>"
}
```

The verifier must produce the challenge approved by the owner. The database atomically consumes
the code, checks client/audience/callback/PKCE and the owner's verified status, then creates or
rotates the Dock device. The response has `protocol: "omni.native-auth/v1"`,
`credentialType: "device-signature"`, `bearerTokenIssued: false`, `deviceId`, `status`,
`permissions`, `keyFingerprint`, and `revision`. It contains no token or private credential.
Unknown, used, expired, wrong-client, wrong-callback, wrong-PKCE, owner-unverified, duplicate-key,
and stale-rotation cases have explicit non-success responses.

There is no bearer-token renewal endpoint: the CLI restores its approved connection by loading
its locally protected device key and device ID, then signing a new request. Each endpoint checks
the current database device status and permissions, request timestamp, and one-use nonce.
Device revocation takes effect on the next request. Rotation replaces the key and deletes the
device's prior nonces in the same transaction, increments its revision, and makes signatures
from the old key fail.

## Device status and interrupted rotation

Migration `.lovable/pending/0078_omni_native_device_status.sql` is source-only until owner
approval and application. It adds `POST /api/public/omni/dock/native-device-status`, a signed
`omni.dock/v1` request with body `{}`, the ordinary 8 KiB limit, a fresh nonce and a timestamp
within 60 seconds. The route requires a paired native CLI device and verified owner; it needs no
additional device permission and is available while Emergency Stop is engaged. It cannot grant,
rotate or revoke anything. A service-only transaction locks the device and checks that its current
fingerprint matches the key whose request signature was verified, rechecks timestamp and owner,
and consumes a replay nonce preserved across key rotations.

On success the response is:

```json
{
  "ok": true,
  "protocol": "omni.native-device-status/v1",
  "deviceId": "uuid",
  "status": "paired",
  "revision": 3,
  "keyFingerprint": "<64 lowercase hex>",
  "permissions": ["status.read"],
  "checkedAt": "<RFC 3339 timestamp>"
}
```

The client must validate the protocol, device ID and fingerprint against its candidate key and
treat the revision and permissions as a snapshot, not an exchange receipt or future authorization.
`409 replay` or `device_changed`, `401` invalid signature/clock, `403` not permitted and `503`
unavailable must not be interpreted as proof that an exchange failed. A lost response remains
ambiguous: keep candidate keys until an authenticated snapshot or an explicit owner recovery
resolves the state. Later rotation, revocation or permission change can invalidate the snapshot.
Every new request rechecks current authority.

For initial enrollment, a lost exchange response can also lose the device ID; the status endpoint
cannot find a device without it. No initial-enrollment recovery endpoint exists. An owner may
revoke the correctly identified device in Docking Bay and start a fresh enrollment with a new key
and consent, but the displayed abbreviated fingerprint/safety code alone is not a full identity
proof; do not revoke an ambiguous match. A future automated recovery flow would need fresh verified
owner/MFA consent, proof of possession of the original key, an exact key-bound one-use authorization
and callback/PKCE exchange, owner-scoped audited lookup, and fail-closed handling of revoked or
changed devices. A public fingerprint-only lookup is not a recovery contract.

## Signed Dock requests

After exchange, the client uses the existing `omni.dock/v1` headers and canonical request format
in [OMNI-DOCK-PROTOCOL.md](./OMNI-DOCK-PROTOCOL.md). The new
`POST /api/public/omni/dock/catalog` endpoint uses the same P-256 signature, 16–64 character
nonce, ±60-second timestamp, exact-body SHA-256, 8 KiB request-body limit, paired-device check,
and replay rejection as all other Dock requests. It additionally requires `cloud.read` and a
readable, released Emergency Stop. The request body is `{}`.

The response contains a `catalog` with `protocol: "omni.native-catalog/v2"` and a server
`checkedAt` timestamp:

- Catalog v2 versions the native-chat capability change. Catalog v1 always reported
  `chat.available: false`, `chat.streamingAvailable: false`, and `nativeChatAvailable: false`;
  clients must treat that version as no native-chat capability. V2 may report the chat endpoint as
  available when `chat.send`, migration 0077, and Anthropic configuration are present.
- `chat.streamingAvailable` remains `false`: the endpoint streams only already-settled NDJSON
  frames, not live model tokens. `chat.responseDelivery` is `settlement-gated-ndjson`.
- Catalog availability is capability discovery, not per-turn authorization or readiness. Every
  chat request still rechecks owner approval, Stop, project/session ownership, engine switch,
  current price confirmation, and spend limits.
- `providers` reports providers actually configured on the Mothership; configuration is not
  proof that inference succeeded.
- `models` identifies models and provider configuration. The OpenAI/Lovable web model is not
  available to native chat. Claude models report native availability only when the device has
  `chat.send`, migration 0077 is installed and the server Anthropic key is configured; each still
  requires owner AI approval, that agent's Claude switch and price confirmation within 30 days.
- `agents` lists real Mothership agent identities and separates `webChatConfigured` from native
  availability. Native inference is limited to OMNI, Dread and Draco and remains text-only.
- `tasks.proposal` reports whether this device can submit a task and the existing `/jobs` route;
  that route creates a **held** task only. `tasks.status` is bounded to this device's own tasks.
  Approval requests remain on the Mothership, and `tasks.execution` reports `executor: "none"`.
- `fusion` reports the server's real plan-marker state, but `orchestratorAvailable` and
  `nativePlanningAvailable` remain false.

The catalog does not grant capabilities. Current permissions may include `status.read`,
`jobs.propose`, `stop.engage`, `cloud.read`, `audit.read`, and `jobs.pause`. The client must use
the specific signed endpoint and owner-approved permission for each operation:

| Operation | Endpoint | Boundary |
| --- | --- | --- |
| Device and Stop status | `/heartbeat` | Status only; every autonomy switch is off |
| Submit a task proposal | `/jobs` | Stored as `held`; never dispatched or executed |
| Read this device's task status | `/jobs-status` | Metadata only; refused while Stop is engaged |
| Engage Emergency Stop | `/stop` | Engage only; a device cannot release Stop |
| Read cloud metadata / audit | `/cloud`, `/audit` | Permission-specific; Stop-gated |
| Pause an agent or stop a job | `/control` | Reductions only; never resume, approve, or start |
| Discover configuration and capabilities | `/catalog` | Requires `cloud.read`; Stop-gated |

## Native project discovery and chat

These are device-signed `omni.dock/v1` requests. Both require a paired native CLI device with the
separately consented `chat.send` permission and a readable, released Emergency Stop. The SQL
functions also check `native_client_id = "omni-native-cli"`; legacy Dock devices cannot use these
routes even if they hold the older reserved permission.

`POST /api/public/omni/dock/projects` takes `{}` and returns only the owner's project UUIDs and
names. It also requires verified owner status and current AI approval (approved and not paused).
Project briefs and records are not returned by discovery.

`POST /api/public/omni/dock/chat` requires JSON up to 128 KiB and this strict request shape:

```json
{
  "protocol": "omni.native-chat/v1",
  "requestId": "uuid",
  "sessionId": "uuid",
  "projectId": "uuid",
  "agentId": "omni",
  "model": "claude-sonnet-5-5",
  "messages": [{ "role": "user", "content": "..." }],
  "consent": true,
  "autonomous": false
}
```

`agentId` is `omni`, `dread` or `draco`; `model` is `claude-sonnet-5-5` or
`claude-opus-5-5`. The request may include up to 100 message records, but the server selects at
most the latest 20 and 12,000 UTF-16 code units; the last message must be from the user. Each
message is secret-screened. `requestId`, `sessionId` and `projectId` are UUIDs. The client must
set `consent: true` for each turn and `autonomous: false`; no tool, CODE or task execution path
exists.

Before calling Anthropic, the server verifies device ownership/revision and `chat.send`, current
owner verification and AI approval, Stop release, project ownership, and an open session bound to
that device revision, project, agent and model. A device revision change, revocation, project
deletion, AI pause or Stop engagement aborts the request. The session ID is reused for continuity;
the client keeps its own transcript and sends the bounded context each time. Start a new session
when switching project, agent or model. The Mothership stores only session/run metadata and never
stores message or reply text.

Only Anthropic Claude engines are available. Each agent/model needs its owner-enabled Claude
switch and a price confirmed within 30 days. A service-only reservation uses the shared Claude
ledger before inference, with a conservative UTF-8 input-byte upper bound, a maximum 1,024 output
tokens, the existing **$0.50 per-call** cap, and the shared **$5 rolling 24-hour** cap. Native chat
also limits an owner to 30 started native requests per rolling 24 hours. Every call settles once;
if settlement or outcome recording fails, reply text is withheld and the shared OMNI AI guard
stays blocked for owner review. Provider credit/permission refusals also preserve a service pause.

The route returns NDJSON. It first emits a `status: validating` frame. On success, the model call
and ledger settlement complete before a `status: settled` frame, `text` frames, and a final `done`
frame containing run ID, model, attribution, usage and actual/reserved cost. Errors are terminal
`error` frames with the HTTP-like status in the frame; clients must inspect the terminal frame and
must never automatically retry a failed or ambiguous request. This is settlement-gated chunked
delivery, not live token streaming.

`tasks` remain held proposals and status metadata; approvals remain Mothership-only and execution
reports `executor: "none"`. Native Fusion/CODE remains unavailable. No native route performs a
handoff, executes code, invokes a tool, changes Stop, or starts Autonomous Mode.

## Explicitly unavailable in this contract

Native Fusion plans, task approval, task execution and CODE dispatch are not implemented. Chat is
not the OMNI-web delegation: it authenticates each call with the native device signature and the
separate device permission. The native response is chunked only after settlement, not streamed
live. Tasks remain held and the executor remains `none`. Existing Stop, owner approval, audit,
and signed Jackboy handoff controls are not bypassed.

The server validates possession of the supplied P-256 private key but cannot attest Keychain,
Secure Enclave, hardware backing, or non-extractability. The native client must use a dedicated
platform-protected key where supported, convert macOS Security.framework DER signatures to
fixed-width raw `r || s`, and fail explicitly if its custody requirements are unavailable. The
backend must not claim hardware assurance based only on a valid signature.

## Verification

`src/lib/omni-native.test.ts`, `src/lib/omni-native.server.test.ts`,
`src/lib/omni-native-chat.server.test.ts`, and `src/lib/omni-dock.test.ts` cover browser
authorization proof/callback validation, PKCE exchange, no-bearer responses, catalog truthfulness,
signed permission/Stop gating, settlement ordering, reply withholding and refusal of duplicate
requests. `python3 src/test/test_omni_native_auth_sql.py` runs disposable PostgreSQL checks for
owner/MFA consent, one-use exchange, owner isolation, PKCE/expiry refusal, permission-preserving
rotation, native-only chat consent, project ownership, Claude reserve/settle, request replay and
rotation-stop enforcement. No hosted database, deployment, paid build, or Autonomous Mode
activation is needed for these tests.
