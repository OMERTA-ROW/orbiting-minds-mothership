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
| `GET /api/omni/tasks`                   | Read-only: the 10 latest observatory runs (same data and audit as `/api/public/omni/jobs`), `requiresApproval: false`; held OMNI Terminal tasks not included | `jobs`    |
| `POST /api/omni/tasks/:id/approve\|reject` | 403 `not_available` — decisions need owner two-step sign-in + passkey           | any valid |
| `POST /api/omni/emergency-stop`         | 403 `not_available` — no stop scope; use OMNI Terminal's Emergency Stop           | any valid |

Missing/unknown/expired/revoked key → 401. Valid key without the needed scope → 403 `scope_missing`.
Nothing is simulated; the existing `health`/`jobs` scopes never authorize chat, approvals or stop.
Each `/api/omni/tasks` read is recorded in the owner audit log (`use-jobs`); if recording fails the read is refused (503).

## Owner steps (no values in chat)

1. Publish the Mothership (the new routes exist only in preview until then).
2. Mothership → Owner dashboard & API keys → create a key named "OMNI frontend" with **Check OMNI is
   online** and, if OMNI should list observatory runs, **Read job history**; choose an expiry (or Never
   expires). Copy it once.
3. OMNI project → Project Settings → Secrets: `MOTHERSHIP_API_URL` = `https://evoomni.tech`
   (no trailing slash, no path) and `MOTHERSHIP_API_TOKEN` = the key from step 2.
4. OMNI → Setup → Re-check connection. Expected: health and manifest pass; "Manifest reports at least
   one agent" passes; tasks lists observatory runs (only with Read job history) with no approve/reject
   buttons; chat and stop show as unavailable.
5. Revoke the key on the Mothership and re-check: OMNI must show "Not connected" (401).

## Still missing for chat, tasks, approvals and stop (not built)

- New key scopes (`chat`, `stop:engage`, and a scope for held Terminal tasks) — database change + owner approval.
- A founder-verified chat adapter that routes to the private OMNI agent with its consent, spend and
  stop guards (today the agent needs the owner's signed-in session).
- Task decisions stay owner-only on the Mothership (two-step + passkey); a key should never decide.
- The OMNI frontend is unpublished, so the Mothership has no URL to link back to it yet.

## Merged GitHub plans this follows

- PR #24 (`743f833`, `docs/founder-omni-orb-integration.md`), step 2 "Mothership scoped API": health,
  manifest and read-only task status are implemented; chat, approvals and stop are not (see above).
  Steps 1 (OMNI founder sign-in gate), 3–5 live in the OMNI project and are pending there.
- PR #20 (`2959fb8`, `docs/integrations/honeycomb-omni-mobile-2026-11-17.md`): the Mothership side of
  device pairing/revocation/audit and signed metadata reads exists as the Docking Bay
  (`docs/OMNI-DOCK-PROTOCOL.md`). Honeycomb has no Mothership adapter yet; session streaming, job
  submit/cancel and per-job isolation evidence are pending implementation.
- PR #25 (open, `dec03f2`): intake plan only (`docs/OMNI-REPOSITORY-FUSION-INTAKE.md` on its branch);
  not installed here. Reference for follow-up CLI reconciliation.
