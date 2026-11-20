# OMNI frontend ↔ Mothership connection checklist

Status 2026-11-20 (preview, not published). Contract source: OMNI project
`docs/MOTHERSHIP_BACKEND.md` (`src/lib/mothership.functions.ts`). Mothership side:
`src/lib/omni-contract.ts`, `src/lib/omni-contract.server.ts`, `src/routes/api/omni/*`.

## What answers today

| OMNI frontend call                      | Mothership answer                                                                 | Key scope |
| --------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| `GET /api/omni/health`                  | `{ ok: true, version }`                                                           | `health`  |
| `GET /api/omni/manifest`                | OMNI listed, `enrolled: false`; no providers; `autonomous: false`; owner links      | `health`  |
| `POST /api/omni/chat`                   | 403 `not_available` — no chat scope or founder-verified chat adapter exists        | any valid |
| `GET /api/omni/tasks`                   | 403 `not_available` — no task-read scope; held tasks stay in OMNI Terminal         | any valid |
| `POST /api/omni/tasks/:id/approve\|reject` | 403 `not_available` — decisions need owner two-step sign-in + passkey           | any valid |
| `POST /api/omni/emergency-stop`         | 403 `not_available` — no stop scope; use OMNI Terminal's Emergency Stop           | any valid |

Missing/unknown/expired/revoked key → 401. Valid key without the needed scope → 403 `scope_missing`.
Nothing is simulated; the existing `health`/`jobs` scopes never authorize chat, approvals or stop.

## Owner steps (no values in chat)

1. Publish the Mothership (the new routes exist only in preview until then).
2. Mothership → Owner dashboard & API keys → create a key named "OMNI frontend", access **Health check**
   only, with an expiry (or Never expires). Copy it once.
3. OMNI project → Project Settings → Secrets: `MOTHERSHIP_API_URL` = `https://evoomni.tech`
   (no trailing slash, no path) and `MOTHERSHIP_API_TOKEN` = the key from step 2.
4. OMNI → Setup → Re-check connection. Expected: health and manifest pass; "Manifest reports at least
   one agent" passes; chat, tasks and stop show as unavailable.
5. Revoke the key on the Mothership and re-check: OMNI must show "Not connected" (401).

## Still missing for chat, tasks, approvals and stop (not built)

- New key scopes (`chat`, `tasks:read`, `stop:engage`) — database change + owner approval.
- A founder-verified chat adapter that routes to the private OMNI agent with its consent, spend and
  stop guards (today the agent needs the owner's signed-in session).
- Task decisions stay owner-only on the Mothership (two-step + passkey); a key should never decide.
- The OMNI frontend is unpublished, so the Mothership has no URL to link back to it yet.
