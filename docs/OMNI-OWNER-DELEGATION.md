# OMNI owner delegation (Mothership side)

Status 2026-11-20: delegation implemented; migrations `0062_omni_owner_delegation` and `0063_omni_delegation_privileges` (owner reads metadata columns only; codes service-only) applied according to Lovable's deployment check. Migration `0064_omni_delegated_task_reads` (plus the comment-only `0065_omni_delegated_task_reads_note`) applied to the shared database on 2026-11-20 08:22 UTC with the owner's authorization; the `tasks:read` endpoint is live in the database but needs the matching app revision published. The end-to-end owner flow remains unverified. Contract source: OMNI project `docs/MOTHERSHIP_BACKEND.md` (commit `30fe28a`),
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

| Scope                           | Granted?   | Effect                                                                                                                                                                                       |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks:read`                    | Yes        | Read this owner's tasks created through OMNI web delegations and their recorded handoff status.                                                                                              |
| `tasks:write`                   | Yes        | `POST /api/omni/tasks` stores a **held** OMNI Terminal task. Nothing runs or is dispatched.                                                                                                  |
| `safety:emergency-stop`         | Yes        | `POST /api/omni/emergency-stop` **engages** the Stop. It can never release it.                                                                                                               |
| `chat:write`                    | Yes (0066) | **Installed 2026-11-20, not yet used live.** Separate opt-in to chat with the OMNI text agent (paid Lovable AI). If the install marker can't be read: refused at approval; `/api/omni/chat` answers 403 `not_available`. |
| `fusion:plan`                   | Yes (0067) | **Installed 2026-11-20, not yet used live.** Separate opt-in to ask Fusion for a plan proposal for a held task. Cannot add/read/start/hand off tasks, chat or use paid AI, touch permits or caps, or engage/release the Stop; refused while the Stop is engaged. Until the proposed rules planner (0069) is installed, admitted requests get 503 `planner_not_available`; after it, a rules-only proposal (`docs/OMNI-FUSION-PLAN-CONTRACT.md`). |
| `providers:write`               | No         | Refused; no endpoint.                                                                                                                                                                        |
| `tasks:retry`                   | No         | Refused; held tasks never run.                                                                                                                                                               |
| `tasks:approve`, `tasks:reject` | No         | Refused; decisions stay owner-only on the Mothership (two-step + passkey).                                                                                                                   |

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

### GET /api/omni/held-tasks — `tasks:read` (migration 0064 applied; app revision not yet published)

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

### POST /api/omni/chat — `chat:write` (migration 0066, installed 2026-11-20)

Installed as `drizzle/migrations/0066_omni_delegated_chat.sql` (detected per request through
`omni_delegated_chat_ready()`; missing or unreadable = not installed, fails closed). Server-to-server only (requests with `Origin`/`Sec-Fetch-*` → 403).

Request (OMNI's existing body; extra fields ignored; at most 512 KB):

```json
{
  "agentId": "omni",
  "model": "lovable-ai:openai/gpt-6-astra",
  "messages": [{ "role": "user", "content": "…" }],
  "autonomous": false,
  "source": "omni-web"
}
```

- `agentId` must be exactly `omni`, `dread` or `draco` (403 `agent_not_enrolled` otherwise; no
  names, case changes or `both`). Dread (calm, disciplined protector who investigates and weighs risk) and Draco (bold, creative visionary builder who turns strategy into plans) are Mothership
  chat agents with their own identity and personality prompt; they use the same model, admission,
  re-checks, limits and guard below as OMNI — one shared daily limit and one request at a time
  across all three. Context is the conversation OMNI web sends with each request plus, for Dread and Draco only, owner-controlled memory (migrations 0070–0071): two per-agent owner switches on the OMNI Terminal memory tab, both off until the owner turns them on. "Use in chat replies" lets that agent read only its own entries for the delegation's owner, once per reply, inside `omni_delegation_chat_memory` (same delegation/AI-approval/Stop checks as the re-check; a refusal stops the reply before any model call), newest first, at most 40 entries / 6,000 characters, labelled as context that grants no authority. "Save every chat" stores each completed exchange (owner's latest message + reply) once via `omni_delegation_chat_save`, refusing failed runs, key/token-like text and the 500-entry cap. The owner reviews, deletes one or deletes all; audit rows hold counts only. Success replies add `memory: { status: "not_available"|"off"|"unavailable"|"used", entries?, omitted?, chatSaved: "saved"|"off"|"not_saved"|"not_available" }` (OMNI web ignores unknown fields). They do not talk to each other or collaborate through Fusion yet (Fusion phase 1 is rules-only plans). The success reply echoes the requested `agentId`/`agentName`. The run record
  does not store which of the three answered (0066 has no agent column). `model` is optional; only
  `lovable-ai:openai/gpt-6-astra` (or the bare model ID) is accepted (422 `model_not_available`).
- The most recent messages that fit **20 messages / 24,000 characters** are used (reported as
  `contextMessages` / `omittedMessages`); the last must be a non-empty user message (422 `invalid_request`).
  Messages that look like keys, passwords, tokens or email addresses → 422 `secret_like` before anything is sent.
- One database transaction admits the request: valid delegation with `chat:write` (401
  `invalid_token` with `reason`, 403 `scope_missing`), verified owner, owner AI approval not paused
  (403 `ai_not_approved`), Emergency Stop released (423 `emergency_stop_engaged`), at most **30**
  started requests per owner per 24 h (429 `daily_limit`), and the same durable `evolution-omni`
  AI guard as the private OMNI agent — one request at a time, and any existing pause blocks it
  (503 `ai_busy_or_paused`). No Lovable AI key → 503 `provider_not_configured`.
- While the reply is generated, the delegation, Stop and AI approval are re-checked every second
  and once more before replying; any change stops the reply (same status as above, `stopped`) and
  no text is returned. An unreadable re-check fails closed (409 `check_unavailable`).
- Deadline 17 s (below OMNI web's 20 s call timeout) → 504 `timeout`. Declined → 422
  `model_declined`; output budget → 422 `output_limit`; empty → 502 `empty_reply`. Provider
  credit/permission refusals (402/403/404) keep AI paused for owner review; others (e.g. 429) are failures only.
- The outcome is recorded with metadata only (counts, tokens, status, gateway run ID — never message
  or reply text) in `omni_delegated_chat_runs`, and the guard is released in the same transaction.
  If recording fails: 503 `outcome_not_recorded`, no reply, AI stays paused. Never retried automatically.

Success 200:

```json
{
  "ok": true,
  "reply": "…",
  "agentId": "omni",
  "agentName": "OMNI",
  "model": "lovable-ai:openai/gpt-6-astra",
  "runId": "<uuid>",
  "contextMessages": 1,
  "omittedMessages": 0,
  "usage": { "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 }
}
```

Metadata API keys on `/api/omni/chat`: 403 `delegation_required` (`needs: "chat:write"`) once 0066 is
installed, 403 `not_available` before. Keys never chat.

### POST /api/omni/fusion/plans — `fusion:plan` (migration 0067, installed 2026-11-20)

Body `{"taskId": "<uuid>"}` (≤ 2 KB, nothing else). Server-to-server only. If 0067's marker can't be read: 503
`not_available` and the gate is never called. After 0067, one service-only database call
(`omni_delegation_fusion_plan_gate`) checks the delegation (401 invalid/revoked/expired/wrong
audience/owner unverified; 403 `scope_missing`), then the Emergency Stop (423
`emergency_stop_engaged`, also when the Stop row is missing), and writes one
`fusion_plan_requested` audit row. It then answers 503 `planner_not_available`: no plan, step, run,
job, permit or cost is ever returned. Metadata API keys: 401 without a valid key, 403
`delegation_required` (`needs: "fusion:plan"`) with one. Tests:
`src/lib/omni-fusion.test.ts` (refusals, no network/model/task/permit/Stop calls, import
allowlist) and `src/test/test_omni_fusion_plan_sql.py` (285 isolated checks, both install orders
with 0066).

### Everything else

`POST /api/omni/tasks/:id/approve|reject` (and chat before 0066): 403 `not_available` for an
active delegation (401 otherwise). Metadata API keys on `/api/omni/tasks` (POST) or
`/api/omni/emergency-stop`: 403 `delegation_required` with `needs` and `authorize` link. API keys
keep working unchanged for health, manifest and job history; delegations do not authenticate those reads.

## Manifest additions

`capabilities` now uses `{read, write}` objects (`tasks {read:true, write:true}`,
`emergencyStop {read:false, write:true}`, everything else false), plus `taskAgents` (also listed, never chat-enrolled, in `agents`) and
`delegation { clientId, audience, supportedScopes, tokenLifetimeSeconds, heldTasksPath,
authorizeUrl, tokenUrl, statusUrl, revokeUrl }`. Migration 0064 is applied; `heldTasksPath`
and `tasks:read` reach production once the matching application revision is published.

Live manifest facts (read server-side per request): `providers` lists
`{ id: "lovable-ai", label: "Lovable AI", models: ["openai/gpt-6-astra"] }` and
`capabilities.providers.read: true` only when the Lovable AI key is present — that is
configuration, not a verified reply. OMNI is `enrolled: true` (and `capabilities.chat.write: true`,
`supportedScopes` gains `chat:write`) only when 0066 is installed **and** the key is present. A `chat`
descriptor gives the path, scope, model, limits and `verified: false`. `orchestration` is
deliberately absent; `orchestrationStatus: { state: "not_available", reason }` explains that the
Mothership has no Fusion orchestrator or handshake.

## Chat (0066) — what the owner decides

1. Done 2026-11-20 (owner approval "approve all installs"): `0066_omni_delegated_chat` installed;
   the applied file's SHA-256 `72b80ded…f9ea07` equals the reviewed file and the database's
   recorded hash. Tested in a throwaway database (`src/test/test_omni_delegated_chat_sql.py`).
2. Publish the Mothership revision containing this code.
3. In OMNI: request `chat:write` as a separate opt-in (today `startMothershipDelegation` asks only
   for `tasks:write` + Stop), and treat 423/429/503 refusals as states, not route failures.
4. Owner ticks "Chat with OMNI" on `/omni-authorize`; each reply uses paid Lovable AI credits.
   The first live reply (for example OMNI's "Test route") is the only thing that verifies the route.

Rollback: republish the previous revision; it answers chat with 403 `not_available` on either
schema. To switch chat off without a release, the owner cancels the OMNI connection or engages the
Stop; a forward migration could revoke the chat functions from `service_role` — never edit 0066.

## Fusion plan permission (0067) — what the owner decides

1. Done 2026-11-20: `0067_omni_fusion_plan_scope` installed (SHA-256 `551df990…9d9f68`, equal to
   the reviewed file and the database's recorded hash), then comment-only
   `0068_omni_chat_fusion_install_notes` describing each new function. Both changes share one
   consent function that offers each gated scope only while that change's marker exists.
2. Publish the Mothership revision containing this code.
3. In OMNI: request `fusion:plan` as its own opt-in and show 503 `planner_not_available` as a
   state ("Fusion planner not built"), never as a plan.
4. Owner ticks "Ask Fusion for plans" on `/omni-authorize`. Nothing is charged.

Rollback: republish the previous revision (it answers `/api/omni/fusion/plans` with 404), cancel
the OMNI connection, or a forward migration revoking the gate from `service_role`.

## Verification still required (not done)

1. Done: migrations 0064 + 0065 applied (2026-11-20). Remaining: publish the Mothership app revision with owner approval.
2. In OMNI: build the callback route and server-side state/verifier/token storage; switch
   `cfg("delegated")` to the stored delegation; use `taskAgents` for task creation, and request
   `tasks:read` separately when the owner wants task history.
3. Live test with the real owner account: approve, exchange, status, one held task, read it, revoke, then
   confirm the revoked token gets 401. Test the Stop only when the owner chooses to.
4. Both sides confirm results before anyone relies on it.

## Release and rollback (prepared, not executed)

Release: publish the current `main` revision (contains PR #27 `3bbcb17`, manifest fix `8b756f5` and
the 0065 note). Database: nothing further to apply. After publishing, read-only checks:
`GET /api/omni/held-tasks` with a fake `omnid_` + 64-hex token → 401 `invalid_token` (not 503),
manifest without key → 401, token request with an `Origin` header → 403.

Rollback (app): republish the previous revision `3d841df`. It never calls
`omni_delegation_read_tasks` and its consent page only offers `tasks:write` and
`safety:emergency-stop`, so it works unchanged on the 0064 schema (the wider 1–3 scope limit only
permits, never requires, a third scope). Database rollback is not needed; if ever required, a new
forward migration would revoke `omni_delegation_read_tasks` from `service_role` — never edit or delete
0064/0065. Revoking all active connections: owner cancel on `/omni-api-keys`, or the Stop.
