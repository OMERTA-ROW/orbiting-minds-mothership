# OMNI Docking Bay — protocol `omni.dock/v1`

Status (2026-11-07): Mothership side implemented and tested; **no branch has docked**. Honeycomb Terminal's dock
screen is not built yet. Nothing in this protocol executes commands, dispatches jobs or enables autonomy.

## Roles

- **OMNI core** — the Mothership's OMNI Terminal and its server records (Emergency Stop, held task queue, logs).
  The existing Railway Jackboy service stays the only CODE backend; docking does not touch it.
- **Branches** — `honeycomb_mobile` (Honeycomb Terminal on phone/tablet), `omni_desktop`, `omni_cli`. A branch is a
  client of OMNI, not a second backend.
- **Owner** — verified email, owner role, aal2. Codes, approvals and permission changes need two-factor from the
  last 15 minutes. Revoking and engaging the Emergency Stop need only the verified owner.

## Switches (all separate, all OFF)

| Switch | Where it lives | State |
| --- | --- | --- |
| OMNI core autonomy | OMNI Terminal | Off; "On" refused (no executor) |
| Jackboy CODE | Railway + Activation Approvals | Off |
| Honeycomb mobile autonomy | Docking Bay, per device | Off; "On" refused and logged |

When a future reviewed change adds mobile autonomy, it may only let a paired device **submit scoped jobs to OMNI**
without per-job owner confirmation. It must never run commands on the device. Required first: a registered
executor, dispatcher, per-job scope, cost cap, Guardian approval and a fresh owner decision.

## Pairing

1. Owner creates a code in the Docking Bay: 10 Crockford base32 characters shown as `XXXXX-XXXXX` (50 bits),
   lifetime 2–15 minutes, single use, at most 3 open. Only `sha256("omni.dock/v1:code:" + normalized)` is stored.
   Normalization: uppercase, drop spaces/dashes, `I`/`L`→`1`, `O`→`0`.
2. Device generates an ECDSA P-256 key **dedicated to docking** (non-extractable private key; do not reuse the
   Honeycomb transfer identity key) and POSTs a signed request to `/api/public/omni/dock/pair` with device header
   `pair`:
   ```json
   { "protocol": "omni.dock/v1", "code": "XXXXX-XXXXX", "label": "Goochi iPhone", "platform": "ios",
     "publicKey": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
     "appVersion": "1.4.0", "capabilities": ["camera.qr", "files.pick"] }
   ```
   `platform`: ios, ipados, android, web, macos, windows, linux, unknown. Capabilities: up to 16 lowercase ids; they
   describe what the device can do and grant nothing.
3. Reply `201` `{ deviceId, status: "awaiting_approval", safetyCode }`. Safety code = first 8 hex chars of the key
   fingerprint (SHA-256 of RFC 7638 `{"crv","kty","x","y"}` JSON) as an integer mod 1,000,000, shown `123 456`.
4. Both screens show the safety code. The owner approves only if they match, choosing permissions from those the
   code requested. Unapproved devices expire after 30 minutes. Fifty failed pair attempts in ten minutes pause
   pairing for everyone (a deliberate trade-off: an attacker can delay pairing but cannot guess codes).

## Signed requests

Headers on every request (including pair):

- `x-omni-dock-device`: device id, or `pair`
- `x-omni-dock-timestamp`: Unix milliseconds, within ±60 s of server time
- `x-omni-dock-nonce`: 16–64 base64url characters, single use per device (15-minute window)
- `x-omni-dock-signature`: base64url raw P-256 signature (r‖s, 64 bytes — WebCrypto's native format) over

```
OMNI-DOCK-V1
POST
/api/public/omni/dock/<endpoint>
<device id or "pair">
<timestamp>
<nonce>
<sha256 hex of the exact request body>
```

Bodies are limited to 8 KB. The path is part of the signature, so a request cannot be replayed on another endpoint.
Reference client: `src/lib/omni-dock-client.ts` (copy it; it only signs).

## Endpoints

| Path | Body | Needs | Result |
| --- | --- | --- | --- |
| `/heartbeat` | `{ appVersion?, capabilities? }` | any non-revoked device | status, permissions; with `status.read`: Emergency Stop, all autonomy `off`, `executor: "none"` |
| `/jobs` | `{ id (uuid), kind, agent, project, repository?, instructions, autonomous? }` | paired + `jobs.propose` | `202` held in OMNI Terminal (never dispatched); `autonomous: true` → `409 autonomy_off` with blockers, nothing stored |
| `/stop` | `{}` | paired + `stop.engage` | engages the Emergency Stop (cannot release) |

`kind`: code.generate, code.edit, code.test, code.debug (agent must be `jackboy`), agent.handoff (jackboy, jax,
razul, sabrina, guardian, hercules). 20 proposals per device per 24 h. Text that looks like a key is refused.

Errors return `{ ok: false, reason, message }`: `code_invalid`, `key_in_use`, `throttled`, `unknown_device`,
`revoked`, `replay`, `stale_request`, `bad_signature`, `not_permitted`, `secret_like`, `id_conflict`,
`daily_limit`, `autonomy_off`, `invalid_body`, `too_large`.

**Connected** = a signed contact in the last 120 s (heartbeat every 30 s while open). Revoking refuses the key at
once, clears permissions and cancels the device's held tasks.

## Browser access

Responses allow CORS only for `https://honeycomb-terminal-companion.lovable.app` and Honeycomb's preview origin.
Native apps send no Origin. The preview server answers browser preflight checks itself, so a browser-based Honeycomb
test may need the published Mothership; alternatively Honeycomb's server can relay the device-signed request
unchanged (the signature, not the caller, is what is trusted). The published Mothership does not have these
endpoints until the owner approves publishing.

## Permissions

`status.read`, `log.read` (reserved), `jobs.propose`, `stop.engage`, `files.transfer` (reserved for Honeycomb's own
transfer feature; no effect in the Mothership).

## Honeycomb-side work (must be done in the Honeycomb project)

1. "Dock to OMNI" screen: Mothership address + code entry (QR later: `omni-dock:v1?bay=<origin>&code=<code>`),
   label, platform, dedicated docking key in IndexedDB (non-extractable), signed pair request, safety-code display,
   "waiting for owner approval" polling via heartbeat.
2. Mobile terminal view backed by heartbeat: paired/connected/disconnected/revoked, granted permissions, Emergency
   Stop state, three autonomy switches shown separately (all Off), and "nothing runs on this device".
3. Task proposal form → `/jobs` (held only); a large "Engage Emergency Stop" button → `/stop` when permitted.
4. Replace the browser-stored autonomy switches and the always-failing Docking Bay test with dock state from the
   heartbeat. Keep local-mode autonomy separate and off; never let a dock reply enable the LAN PTY companion.
5. On `revoked`, delete the docking key and stop calling the dock.

## Handed-off task status (`POST /api/public/omni/dock/jobs-status`)

Signed exactly like the other dock calls; body `{}`. Needs `status.read`. Returns
only the signing device's own tasks as `{ taskId, state, handoff, updatedAt }`
(no instructions or output). Refused with 423 `stop_engaged` while Emergency
Stop is engaged. `POST /jobs` proposals are also refused (423) while Stop is on.

## Mothership → Jackboy handoff (`jackboy.omni-handoff/v1`)

Mirrors Jackboy's `src/lib/omni-handoff-v1.ts` (OMERTA-ROW/jackboy-dev-control, branch
`jackboy/omni-handoff-v1`) exactly. Mothership never dispatches to OMNI. The owner (aal2 + TOTP
within 15 min, Emergency Stop released) clicks **Send to Jackboy** on a held Jackboy task with a
repository, choosing Test/Build and entering the **Jackboy agent project id** (a uuid from
Jackboy, not a Mothership id; prefilled only for `OMERTA-ROW/jackboy-dev-control` →
`6e320e65-08ec-450b-8a26-61206b604513`). Mothership then calls Jackboy:

- `POST https://{JACKBOY_HANDOFF_ORIGIN}/api/public/omni-handoff/v1`, no query string, body ≤ 8192 bytes,
  redirects refused, 5 s timeout, reply capped at 32 KB.
- Headers:
  - `x-jackboy-contract: jackboy.omni-handoff/v1`
  - `x-jackboy-client: {JACKBOY_HANDOFF_CLIENT_ID}` (`^[A-Za-z0-9_-]{1,64}$`)
  - `x-jackboy-timestamp`: Unix **seconds**, exactly 10 digits (Jackboy allows ±60 s)
  - `x-jackboy-nonce`: 32 lowercase hex (16 random bytes), single use
  - `x-jackboy-signature`: 64 lowercase hex = HMAC-SHA256(`JACKBOY_HANDOFF_HMAC_SECRET`, signingInput)
  - `content-type: application/json`
- signingInput = `jackboy.omni-handoff/v1\nPOST\n/api/public/omni-handoff/v1\n{client}\n{timestamp}\n{nonce}\n{exact raw body}`
- Bodies (strict, exact key order as sent):
  - `{"action":"create","taskId":uuid,"projectId":uuid,"repo":"OWNER/REPO","kind":"test"|"code","instructions":"3–4000 chars","digest":sha256hex(instructions only)}`
    — Mothership Test → `test`, Build → `code`.
  - `{"action":"status","taskId":uuid}`
- Reply JSON always starts `{contract:"jackboy.omni-handoff/v1", requestNonce:<our nonce>, …}` with either
  `{jackboyJobId, status}` (201 new, 200 existing/status) or `{error}`. Header `X-Jackboy-Proof` =
  HMAC-SHA256(secret, `jackboy.omni-handoff/v1\nresponse\n{nonce}\n{httpStatus}\n{exact raw reply body}`),
  compared in constant time. Contract and `requestNonce` must match. A missing/wrong proof, a 503
  or a plain-text reply is discarded and shown as **Not confirmed · retry**; an unsigned
  `authentication_failed`/`handoff_disabled` is shown only as an unconfirmed hint.
- Signed refusals shown in plain words: `kill_switch_on`, `digest_mismatch`, `project_not_authorized`,
  `task_conflict` (409, same taskId with different content), `owner_unavailable`, `invalid_request`,
  `task_not_found`, `handoff_unavailable`.
- Status badges: `queued`, `sent`, `prepared`, `approved`, `quarantined`, `running`, `completed`, `failed`,
  `expired`, `cancel_requested`, `cancelled`, `unknown` (any other value is shown as `unknown`).
  The saved handoff row keeps the exact value as `jackboy:<status>` in its detail; its status column
  holds a coarse value (sent/prepared → queued, cancel_requested → running, expired/cancelled →
  refused, unknown → error) because that column's allowed list was not changed. Docked devices'
  status list reports the coarse value.
- Idempotency: Mothership fingerprints task, Jackboy project id, repo, kind and instructions; a resend
  with any different detail is refused locally. Jackboy itself returns the existing job for an
  identical create and `task_conflict` otherwise.

Mothership settings (names only): `JACKBOY_HANDOFF_ENABLED` (must be `true`), `JACKBOY_HANDOFF_ORIGIN`,
`JACKBOY_HANDOFF_CLIENT_ID`, `JACKBOY_HANDOFF_HMAC_SECRET` (≥ 32 chars, same value as Jackboy's).
