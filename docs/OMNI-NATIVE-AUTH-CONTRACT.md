# Native OMNI CLI authorization — `omni.native-auth/v1`

This contract adds owner-approved browser enrollment for the native OMNI CLI. It does not reuse
the `omni-web` bearer delegation and issues no access or refresh token. The result is a device
record whose P-256 public key authenticates every subsequent `omni.dock/v1` request.

The backend implementation is `.lovable/pending/0076_omni_native_cli_authorization.sql` and is
**source-only until owner-approved and applied**. The native CLI must implement
the client side before this flow can be used end to end.

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

## Signed Dock requests

After exchange, the client uses the existing `omni.dock/v1` headers and canonical request format
in [OMNI-DOCK-PROTOCOL.md](./OMNI-DOCK-PROTOCOL.md). The new
`POST /api/public/omni/dock/catalog` endpoint uses the same P-256 signature, 16–64 character
nonce, ±60-second timestamp, exact-body SHA-256, 8 KiB request-body limit, paired-device check,
and replay rejection as all other Dock requests. It additionally requires `cloud.read` and a
readable, released Emergency Stop. The request body is `{}`.

The response contains a `catalog` with `protocol: "omni.native-catalog/v1"` and a server
`checkedAt` timestamp:

- `providers` reports providers actually configured on the Mothership; configuration is not
  proof that inference succeeded.
- `models` identifies the model the Mothership may configure, reports whether its provider is
  configured, and always reports `nativeChatAvailable: false`.
- `agents` lists real Mothership agent identities and separates `webChatConfigured` from native
  availability; every entry reports `nativeChatAvailable: false`.
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

## Explicitly unavailable in this contract

Native authenticated chat, streaming, conversation history, agent switching for inference,
provider calls, native Fusion plans, task approval, task execution, and CODE dispatch are not
implemented. The existing OMNI-web chat delegation is browser/web-specific and cannot be reused
as a native credential. Native model use also has no verified per-call `$0.50` settlement contract;
therefore no native chat endpoint is exposed. Tasks remain held and the executor remains `none`.
Existing Stop, owner approval, audit, and signed Jackboy handoff controls are not bypassed.

The server validates possession of the supplied P-256 private key but cannot attest Keychain,
Secure Enclave, hardware backing, or non-extractability. The native client must use a dedicated
platform-protected key where supported, convert macOS Security.framework DER signatures to
fixed-width raw `r || s`, and fail explicitly if its custody requirements are unavailable. The
backend must not claim hardware assurance based only on a valid signature.

## Verification

`src/lib/omni-native.test.ts`, `src/lib/omni-native.server.test.ts`, and
`src/lib/omni-dock.test.ts` cover browser authorization proof/callback validation, PKCE exchange,
no-bearer responses, catalog truthfulness, permission/Stop gating, and signed request behavior.
`python3 src/test/test_omni_native_auth_sql.py` runs disposable PostgreSQL checks for owner/MFA
consent, one-use exchange, owner isolation, PKCE/expiry refusal, rotation, stale-revision refusal,
and revocation. No hosted database, deployment, paid build, or Autonomous Mode activation is
needed for these tests.
