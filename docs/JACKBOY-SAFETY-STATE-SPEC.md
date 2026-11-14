> **SUPERSEDED (2026-11-14):** Jackboy implemented `omni.permit/v1` instead (session-signed `safety`, `permit.request`, `permit.release`). Mothership follows `docs/OMNI-PERMIT-CONTRACT.md`. The stop-notice receiver below remains as an extra stop-only path.

# Jackboy side: signed safety state and stop notices for OMNI Mothership

Paste the section "Instruction for the Jackboy project" into the Jackboy Dev Control chat.
Mothership (this project) already verifies and enforces both contracts. Until Jackboy ships them,
Mothership records Jackboy's safety as **Unknown**, which keeps OMNI autonomy and CODE halted.

## Instruction for the Jackboy project

Add two additive, read-only safety features for OMNI Mothership. Do not change any switch, stop,
spending limit, CODE path, existing link action or existing secret. Never let a failure here
delay, undo or weaken a stop.

### 1. Signed `safety-state` link action (answerable while paused)

- Endpoint: the existing `POST /api/public/omni/link`, new `action: "safety-state"`.
  Request body is exactly `{"action":"safety-state","projectId":"<uuid>"}`.
- Authentication: the same as the `configuration` probe. Bearer = bootstrap key, plus
  `x-omni-client`, `x-omni-timestamp`, `x-omni-nonce` and `x-omni-signature` over
  `omni.link/v2\nPOST\n/api/public/omni/link\n{ts}\n{nonce}\n{sha256(token)}\n{body}`.
  Consume the nonce once, and check the owner and active project binding.
- **Do not** apply the paused / approval-window refusal to this action. It must answer while
  `automation_policy.paused` is true, because its purpose is to report that. Add a new
  service-role-only RPC; do not reuse `omni_link_configuration_authorize`.
- Read `automation_policy` (id 1) and `code_runtime_controls` (singleton) in one statement.
- Reply `200`, signed exactly like other link replies
  (`X-Omni-Proof = hex(HMAC-SHA256(OMNI_LINK_HMAC_SECRET, "omni.link/v2\nresponse\n" + requestNonce + "\n" + status + "\n" + rawBody))`):
  ```json
  {
    "contract": "omni.link/v2",
    "requestNonce": "<request nonce>",
    "projectId": "<uuid>",
    "execution": "none",
    "safety": {
      "paused": true,
      "codeStop": true,
      "codeEnabled": false,
      "cancellation": "not_needed",
      "observedAt": "<ISO time now>",
      "expiresAt": "<observedAt + 120 s>"
    }
  }
  ```
  - `paused` = `automation_policy.paused`. `codeStop` = `code_runtime_controls.kill_switch`.
    `codeEnabled` = `code_runtime_controls.enabled`. `cancellation` = `cancellation_status`,
    or `null`.
  - If a value can't be read, send `null` for it, never a guess. Mothership treats `null` as
    unknown and halts.
  - No other fields. Never include secrets, request IDs, run IDs or spend figures.

### 2. Signed stop notice to Mothership (`jackboy.safety-event/v1`)

- **When:** after the stop is saved, whenever the CODE Emergency Stop is engaged (manual
  `engageCodeKillSwitch` and every automatic trip from failure, usage spike or spend guards),
  and whenever the global pause is turned on. Never for a release.
- **Delivery:** write to a durable outbox first, then send. Retry with backoff for up to
  24 hours. A failed send never blocks, delays or rolls back the stop.
- **Request:** `POST https://evoomni.tech/api/public/jackboy/safety-event`. Mothership's
  address comes from a new non-secret setting, `OMNI_SAFETY_EVENT_URL`.
  - Headers: `x-jackboy-timestamp` (unix seconds, 10 digits), `x-jackboy-nonce` (32 lowercase
    hex, single use), `x-jackboy-signature` =
    `hex(HMAC-SHA256(JACKBOY_SAFETY_EVENT_HMAC_SECRET, "jackboy.safety-event/v1\nPOST\n/api/public/jackboy/safety-event\n{ts}\n{nonce}\n{rawBody}"))`.
  - Body (at most 4 KB, exactly these fields):
    ```json
    {
      "contract": "jackboy.safety-event/v1",
      "projectId": "<OMNI_LINK_PROJECT_ID>",
      "event": "code_stop_engaged",
      "paused": false,
      "codeStop": true,
      "codeEnabled": false,
      "cancellation": "requested",
      "observedAt": "<ISO time the stop was saved>"
    }
    ```
    `event` is `code_stop_engaged` (requires `codeStop: true`) or `global_pause_engaged`
    (requires `paused: true`).
- **Mothership's replies:**
  - `200 {"recorded":true}`: delivered.
  - `409 {"error":"replayed"}`: already delivered; treat as done.
  - `401`, `400` or `403`: do not retry with the same body; alert the owner.
  - `503 {"error":"not_configured"}`: retry later.
- **New secret** `JACKBOY_SAFETY_EVENT_HMAC_SECRET`: the same value in both projects, at least
  32 characters. Never reuse the link signing secret.

### Tests to add in Jackboy
- `safety-state` answers while paused, is signed, refuses a bad signature or replayed nonce,
  and reports `null` for anything unreadable.
- Engaging the CODE stop (manually and through each automatic trip) adds an outbox notice. The
  stop is saved even when sending fails. Releases send nothing.

## What Mothership does with these (already built)
- **Readings:** a scheduled check (every minute) and the owner's "Refresh safety state" button
  send one signed `safety-state` read, once Step 9 is in effect. Only a fresh, signed reading
  with `paused=false` and `codeStop=false` is stored as **Clear**. It expires after at most
  3 minutes.
- **Halting:** any engaged, paused, unknown or stale state makes the database do all of this:
  - end autonomy windows;
  - stop active CODE jobs and hold queued ones;
  - turn CODE always-on off;
  - stop agent-initiated workspace jobs;
  - refuse new autonomy windows and CODE jobs.

  Manual terminal commands and owner-initiated workspace jobs are not touched.
- **Notices:** a notice can only record a stop. Becoming clear again needs a fresh signed read,
  and starts nothing.
