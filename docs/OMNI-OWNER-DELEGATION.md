# OMNI owner delegation (Mothership side)

Status 2026-11-20: delegation implemented; migrations `0062_omni_owner_delegation` and `0063_omni_delegation_privileges` (owner reads metadata columns only; codes service-only) applied according to Lovable's deployment check. Migration `0064_omni_delegated_task_reads` and the `tasks:read` endpoint below require separate deployment and verification; the end-to-end owner flow remains unverified. Contract source: OMNI project `docs/MOTHERSHIP_BACKEND.md` (commit `30fe28a`),
section "Selected owner sign-in + short-lived delegation integration".

Code: `src/lib/omni-delegation.ts` (rules), `src/lib/omni-delegation.server.ts` (handlers),
`src/lib/omni-delegation.functions.ts` (owner page), `src/routes/omni-authorize.tsx`,
`src/routes/api/public/omni/delegation/*`, `src/routes/api/omni/{tasks,emergency-stop}.ts`.
Tests: `src/lib/omni-delegation.test.ts`, `src/test/test_omni_delegation_sql.py` (disposable PostgreSQL).

## Registered client (exact match, also enforced in the database)

| Field        | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| client_id    | `omni-web`                                                             |
| redirect_uri | `https://omni-orbit-command-companion.lovable.app/mothership/callback` |
| audience     | `omni-mothership`                                                      |
| Base URL     | `https://evoomni.tech` (the OMNI secret `MOTHERSHIP_API_URL`)          |

No other origin, path, query or trailing slash is accepted. OMNI must create that callback route.

## Scopes

| Scope                           | Granted?        | Effect                                                                                          |
| ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `tasks:read`                    | Yes, after 0064 | Read this owner's tasks created through OMNI web delegations and their recorded handoff status. |
| `tasks:write`                   | Yes             | `POST /api/omni/tasks` stores a **held** OMNI Terminal task. Nothing runs or is dispatched.     |
| `safety:emergency-stop`         | Yes             | `POST /api/omni/emergency-stop` **engages** the Stop. It can never release it.                  |
| `chat:write`                    | No              | Refused at approval; `/api/omni/chat` answers 403 `not_available`.                              |
| `providers:write`               | No              | Refused; no endpoint.                                                                           |
| `tasks:retry`                   | No              | Refused; held tasks never run.                                                                  |
| `tasks:approve`, `tasks:reject` | No              | Refused; decisions stay owner-only on the Mothership (two-step + passkey).                      |

A scope never bypasses the Mothership's own rules: held tasks stay held (owner hand-off with a fresh
code is still required), the Stop release still needs the owner, spend caps/permits/autonomy are untouched.

## 1. Owner sign-in initiation (browser redirect)

OMNI's **server** creates `state` (16–256 chars `[A-Za-z0-9._~-]`) and a `code_verifier`
(43–128 chars, RFC 7636), stores both server-side bound to the founder session, then sends the
founder's browser to:

```
GET https://evoomni.tech/omni-authorize
  ?response_type=code
  &client_id=omni-web
  &redirect_uri=https%3A%2F%2Fomni-orbit-command-companion.lovable.app%2Fmothership%2Fcallback
  &scope=tasks%3Aread%20tasks%3Awrite%20safety%3Aemergency-stop
  &state=<state>
  &code_challenge=<BASE64URL(SHA256(code_verifier)), 43 chars>
  &code_challenge_method=S256
```

The Mothership page requires the verified owner (`owner` role, confirmed email, aal2) and an
authenticator code entered within 15 minutes. The owner ticks each permission explicitly (nothing
is pre-selected). Invalid requests are shown on the Mothership and never redirected.

Return (browser): `302`-style navigation to the exact callback with only
`?code=omnic_<64 hex>&state=<state>` (approved) or `?error=access_denied&state=<state>` (declined).
The code is single-use, valid 60 seconds, stored only as a SHA-256 hash, bound to the PKCE challenge,
client and callback. OMNI must compare `state` before exchanging. Consent is limited to 10 per 10 minutes.

## 2. Delegation issuance (server-to-server)

```
POST https://evoomni.tech/api/public/omni/delegation/token
Content-Type: application/json   (application/x-www-form-urlencoded also accepted)

{ "grant_type": "authorization_code", "code": "omnic_…", "code_verifier": "…",
  "client_id": "omni-web",
  "redirect_uri": "https://omni-orbit-command-companion.lovable.app/mothership/callback" }
```

200 (`Cache-Control: no-store`):

```json
{
  "access_token": "omnid_<64 hex>",
  "token_type": "Bearer",
  "expires_in": 900,
  "issued_at": "ISO",
  "expires_at": "ISO",
  "scope": "safety:emergency-stop tasks:write",
  "scopes": ["safety:emergency-stop", "tasks:write"],
  "delegation_id": "uuid",
  "audience": "omni-mothership",
  "client_id": "omni-web"
}
```

Errors: 400 `{error:"invalid_grant", error_description}` (unknown, expired, already used, wrong
verifier, wrong client/callback, owner no longer verified), 400 `unsupported_grant_type` /
`invalid_request`, 401 `invalid_client`, 403 `server_to_server_only` (any `Origin`/`Sec-Fetch-*`
header), 413, 503 `temporarily_unavailable` (nothing issued).

Rules: every exchange attempt burns the code; presenting a used code again **revokes** the
delegation it issued (also when two exchanges race). A new delegation **replaces** the owner's
previous one for `omni-web`. Lifetime is exactly 15 minutes from issue, server clock; there is
no refresh. OMNI keeps `access_token` server-side only (never in URLs, browser storage, logs or
responses) and should treat it as expired at `expires_in − 30 s` to absorb clock and network skew.

## 3. Delegation status

```
GET https://evoomni.tech/api/public/omni/delegation/status
Authorization: Bearer omnid_…
```

200: `{ ok, state: "active"|"expired"|"delegation_required"|"owner_sign_in_required", ownerVerified,
scopes, verifiedAt?, expiresAt?, expiresIn, issuedAt, expiresAtRecorded, revokedAt, delegationId,
clientId, audience, reason }`. `verifiedAt`/`expiresAt` are present only when `state` is `active`
(`verifiedAt` = this check's server time). Unknown/malformed bearer or an API key → 401
`{error:"invalid_token", state:"delegation_required"}`. 503 when status can't be read. Never
returns the bearer, its hash or any owner secret. OMNI's existing `DelegationStatus` gate reads it directly.

## 4. Revocation

```
POST https://evoomni.tech/api/public/omni/delegation/revoke
Authorization: Bearer omnid_…
```

200 `{ ok: true, revoked: true, alreadyRevoked, revokedAt, delegationId }` only after the database
records it; idempotent (repeat → `alreadyRevoked: true`); audited once (`delegation_revoke`).
Takes effect on the next request (each use locks and re-checks the row). Unknown → 401; outage → 503
`ok:false`. The owner can also cancel any connection in Owner dashboard → API keys → "OMNI web
connections". If the owner loses the owner role, any use is refused and the delegation is revoked
for good (`owner_changed`).

## 5. Delegated operations

All are server-to-server only (403 for browser-labelled requests) and check the delegation
(not revoked, not expired, audience `omni-mothership`, owner still verified, exact scope) **in the
same database transaction** as the action.

### GET /api/omni/held-tasks — `tasks:read` (migration 0064; not yet deployed)

Send the delegation in `Authorization: Bearer …`. An optional single `id` query parameter
must be a UUID. The response is `200 { "ok": true, "tasks": [...] }`; an unknown or
other-owner ID returns an empty list. Without `id`, at most the 50 newest tasks are returned.
Only tasks created by this owner through OMNI web delegations are included, including those
created under an earlier delegation. Ordinary Terminal tasks and observatory history are excluded.
This permission is independent of `tasks:write` and must be requested and explicitly approved.

Each task contains `id`, `title`, `instruction`, `agentId`, `repository` (string or null),
`status` (`held` or `cancelled`), `createdAt`, `cancelledAt` (timestamp or null), and
`handoff` (null or `{ status, jobId, updatedAt, lastCheckedAt }`; job ID and last check may
be null). Handoff is the last stored record, not a live check or proof of execution; `sending`
and `error` are not confirmed dispatch. No result, cost, progress or remote logs are invented.
For owner handoff use the manifest's `links.terminal`; the owner must still satisfy Mothership
and Jackboy gates.

Malformed or duplicate parameters return 400 `invalid_request`; invalid, expired or revoked
delegations return 401 `invalid_token`; missing scope returns 403 `scope_missing`; browser
requests return 403 `server_to_server_only`; database errors return 503 `tasks_unavailable`.
Metadata keys do not authorize this endpoint. Responses are `no-store` and each successful
read is audited. Existing `GET /api/omni/tasks` remains the separate metadata-key history API.

### POST /api/omni/tasks — `tasks:write`

Body (OMNI's `createRemoteTask`):
`{ task: { title (1–120), instruction (3–4000), agentId, github?: { repository "owner/repo", reference? } },
idempotencyKey: uuid, timeoutMs: 1000–120000, ownerApproved: true, autonomous: false, source: "omni-web" }`

`agentId` must be one of the manifest's `taskAgents`: `jackboy, jax, razul, sabrina, guardian, hercules`.
The task is stored as an `agent.handoff` task in state `held`, owned by the delegation owner.

201 (new) / 200 (same idempotencyKey and same content):
`{ ok: true, duplicate, task: { id, title, status: "held", requiresApproval: false, agentId, updatedAt,
ownerActionRequired: true, ownerPage, repository?, logs: [{at, message}] }, ignored: [...] }`.
`timeoutMs` and `github.reference` are validated but not stored (listed in `ignored`).

Errors: 401 `invalid_token` (`reason`: invalid/expired/revoked/wrong_audience/owner_unverified),
403 `scope_missing` / `autonomous_refused` / `server_to_server_only`, 409 `idempotency_conflict`,
422 `invalid_request` / `agent_not_accepted` / `secret_like`, 429 `daily_limit` (20 per day),
503 `not_stored` (retry with the same idempotencyKey).

OMNI web (6df27e6) checks `manifest.taskAgents` here, not chat enrollment. Its task picker offers
only agents present in **both** `manifest.agents` and `manifest.taskAgents`, so the manifest lists each
held-task agent in `agents` with its verified name, `kind: "external"`, `enrolled: false` (chat stays
off) and no live status. Before that listing, `agents` held only OMNI and the picker showed no agents.

### POST /api/omni/emergency-stop — `safety:emergency-stop`

Body optional (`{source:"omni-web"}`). Engages the same Stop as OMNI Terminal (database triggers end
autonomy windows, halt CODE, revoke permits and queue remote cancellation), then verifies remote
cancellation exactly like the owner's button.

200 `{ ok: true, localStopEngaged: true, revision }` only after that verification. 502
`{ ok: false, error: "remote_cancellation_unverified", localStopEngaged: true }` when the local Stop
is engaged but remote cancellation is not confirmed. 401/403 as above, 503 `stop_not_recorded`.

### Everything else

`POST /api/omni/chat` and `POST /api/omni/tasks/:id/approve|reject`: 403 `not_available` for an
active delegation (401 otherwise). Metadata API keys on `/api/omni/tasks` (POST) or
`/api/omni/emergency-stop`: 403 `delegation_required` with `needs` and `authorize` link. API keys
keep working unchanged for health, manifest and job history; delegations do not authenticate those reads.

## Manifest additions

`capabilities` now uses `{read, write}` objects (`tasks {read:true, write:true}`,
`emergencyStop {read:false, write:true}`, everything else false), plus `taskAgents` (also listed, never chat-enrolled, in `agents`) and
`delegation { clientId, audience, supportedScopes, tokenLifetimeSeconds, heldTasksPath,
authorizeUrl, tokenUrl, statusUrl, revokeUrl }`. The `heldTasksPath` and `tasks:read` are
available only after migration 0064 and the matching application revision are deployed.

## Verification still required (not done)

1. Apply migration 0064, then deploy the corresponding Mothership app revision with owner approval.
2. In OMNI: build the callback route and server-side state/verifier/token storage; switch
   `cfg("delegated")` to the stored delegation; use `taskAgents` for task creation, and request
   `tasks:read` separately when the owner wants task history.
3. Live test with the real owner account: approve, exchange, status, one held task, read it, revoke, then
   confirm the revoked token gets 401. Test the Stop only when the owner chooses to.
4. Both sides confirm results before anyone relies on it.
