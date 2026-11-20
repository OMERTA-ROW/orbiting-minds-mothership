# OMNI frontend ↔ Mothership connection checklist

Status 2026-11-20 (preview, not published). Owner delegation: `docs/OMNI-OWNER-DELEGATION.md`. Contract source: OMNI project
`docs/MOTHERSHIP_BACKEND.md` (`src/lib/mothership.functions.ts`). Mothership side:
`src/lib/omni-contract.ts`, `src/lib/omni-contract.server.ts`, `src/routes/api/omni/*`.

## What answers today

| OMNI frontend call                         | Mothership answer                                                                                                                                                                                                                                                                                                                                                                                                                                                | Key scope  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `GET /api/omni/health`                     | `{ ok: true, version, service, checkedAt }`                                                                                                                                                                                                                                                                                                                                                                                                                      | `health`   |
| `GET /api/omni/manifest`                   | Lovable AI provider with its one model when configured (configuration, not verification); OMNI `enrolled` only after 0066 is installed; no `orchestration` (Fusion doesn't exist; `orchestrationStatus` says so, with its `permission` state); `autonomous: false`; `checkedAt`; `spendingCap` evidence, and `spendingCapUsd` only while verified (below); owner links                                                                                           | `health`   |
| `POST /api/omni/chat`                      | Owner delegation `chat:write` (migration 0066 installed 2026-11-20; see `docs/OMNI-OWNER-DELEGATION.md`); 403 `not_available` only if the install can't be confirmed. Keys never chat                                                                                                                                                                                                                                                                            | delegation |
| `POST /api/omni/fusion/plans`              | Owner delegation `fusion:plan` (migration 0067 installed 2026-11-20; see `docs/OMNI-OWNER-DELEGATION.md`); 503 `not_available` only if the install can't be confirmed. Never starts, spends or touches the Stop; admitted requests 503 `planner_not_available` on the live build until the next publish (0069 installed 2026-11-20), then a rules-only `omni.fusion-plan/v1` proposal (`docs/OMNI-FUSION-PLAN-CONTRACT.md`). Keys: 401/403 `delegation_required` | delegation |
| `GET /api/omni/tasks`                      | Read-only: the 10 latest observatory runs (same data and audit as `/api/public/omni/jobs`), `requiresApproval: false`; held OMNI Terminal tasks not included                                                                                                                                                                                                                                                                                                     | `jobs`     |
| `POST /api/omni/tasks`                     | Owner delegation `tasks:write`: stores a **held** task (see `docs/OMNI-OWNER-DELEGATION.md`); API keys → 403 `delegation_required`                                                                                                                                                                                                                                                                                                                               | delegation |
| `POST /api/omni/tasks/:id/approve\|reject` | 403 `not_available` — decisions need owner two-step sign-in + passkey                                                                                                                                                                                                                                                                                                                                                                                            | any valid  |
| `POST /api/omni/emergency-stop`            | Owner delegation `safety:emergency-stop`: engage only, `ok:true` after remote cancellation is verified; API keys → 403 `delegation_required`                                                                                                                                                                                                                                                                                                                     | delegation |

Missing/unknown/expired/revoked key → 401. Valid key without the needed scope → 403 `scope_missing`.
When credential verification is unavailable, the contract returns 503
`credential_verification_unavailable`; this does not establish that the key is invalid.
Nothing is simulated; the existing `health`/`jobs` scopes never authorize chat, approvals or stop.
Each `/api/omni/tasks` read is recorded in the owner audit log (`use-jobs`); if recording fails the read is refused (503).
Unknown observatory counts are displayed as unknown, not zero.

## CODE spending cap (`spendingCap`, `spendingCapUsd`)

OMNI web shows "CODE spending cap verified" only when the manifest has a numeric `spendingCapUsd`.
The Mothership sends it (the daily cap in dollars) only while the newest Jackboy-signed `omni.permit/v1`
permit it recorded is at most 15 minutes old and every limit is above $0 and within the owner caps:
$0.50 per AI call, $1 per job, $5 per day, one active job (`src/lib/omni-spend-evidence.ts`). The
Mothership verifies each permit's signature and refuses permits above the caps before recording,
and the database refuses a second active permit. `spendingCap.state` is `verified`, `stale`,
`exceeds_caps`, `no_evidence` or `unknown`, with `lastSignedPermit` (limits, `recordedAt`,
`ageSeconds`, `matchesIntended`), `checkedAt` and a plain `reason`.

Live reading 2026-11-20 16:10 UTC (read-only): 9 signed permits recorded, all $0.50/$1/$5; newest
2026-11-19 01:57 UTC, so the state is `stale` and OMNI correctly shows **Unverified**. It turns
verified only when Jackboy next issues a signed permit for an owner-authorized job; nothing here
issues one.

## Connection matrix (preview, 2026-11-20, signed out, `scripts/smoke_site.py`)

| Check                                                                                                     | Result                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 76 page addresses (every route file)                                                                      | 200, no runtime errors, no in-page link to a missing page                                                                                                                                                                      |
| Source links, menu, placeholder links (`src/test/site-links.test.ts`)                                     | All resolve; menu lists no retired area; no `#`/`javascript:`/empty handlers                                                                                                                                                   |
| `/api/omni/health`, `/manifest`, `/tasks`, `/chat`, `/emergency-stop`, task decisions — no or invalid key | 401 JSON                                                                                                                                                                                                                       |
| `/api/omni/held-tasks`, delegation `status`/`revoke` — no token                                           | 401 `invalid_token`                                                                                                                                                                                                            |
| Delegation `token` — empty body                                                                           | 400 `unsupported_grant_type`                                                                                                                                                                                                   |
| `/api/public/approval-flow`                                                                               | 200 version marker                                                                                                                                                                                                             |
| Registered destinations                                                                                   | canonical `https://evoomni.tech`; OMNI web origin and exact `/mothership/callback`; Docking Bay allows only Honeycomb's published + preview sites                                                                              |
| Jackboy / runner / executor hosts                                                                         | from settings only (`JACKBOY_LINK_ORIGIN`, `JACKBOY_HANDOFF_ORIGIN` = same Jackboy site, `JACKBOY_LINK_RUNNER_ORIGIN` Railway, `OMNI_EXECUTOR_ORIGIN` separate staging host); all present, https, origin-only; none hard-coded |
| Jackboy dispatch / callback                                                                               | `JACKBOY_DISPATCH_*`, `JACKBOY_CALLBACK_*` not set, so both stay off (fail closed)                                                                                                                                             |
| Migration 0064 (task reads) + 0065 note                                                                   | applied; 66 migrations recorded (0000–0065)                                                                                                                                                                                    |
| Migrations 0066 (delegated chat), 0067 (Fusion plan permission), 0068 (notes)                             | installed 2026-11-20; 69 recorded (0000–0068); applied file hashes equal the reviewed files; preview reaches both gates (fake delegation → 401 `invalid`)                                                                      |

Not covered here: signed-in owner pages beyond their sign-in gate, live key/delegation use, and
anything on the published site (it still runs the earlier release until the owner publishes).

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

## Still missing for chat and approvals (not built)

- Held tasks and Stop engagement now use short-lived owner delegations (migration 0062,
  `docs/OMNI-OWNER-DELEGATION.md`), not API key scopes; verification after publishing is pending.
- Chat: the delegated adapter is built (`src/lib/omni-delegated-chat*.ts`) with its own `chat:write`
  consent, owner AI approval, Stop, daily limit and the shared AI guard; migration 0066 is installed
  (2026-11-20); it waits on publishing, OMNI requesting `chat:write`, and the owner's first paid reply.
- Fusion: no Fusion orchestrator or handshake exists on the Mothership, so the manifest never reports
  `orchestration`. OMNI's "Fusion · unverified" is the correct state until it is built and verified; requirements: `docs/OMNI-FUSION-REQUIREMENTS.md`; phase 1 proposal schema: `docs/OMNI-FUSION-PLAN-CONTRACT.md`.
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
