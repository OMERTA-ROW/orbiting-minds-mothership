# Mothership "not live yet" audit and lean go-live plan

## Part A — Audit (what is still not real)

General: 55 old demo areas are already retired (they show an honest "not connected" page, defined in `src/lib/retired-areas.ts`). No sample content is served. The open items for OMNI are below.

| # | Item | Where | What it shows now | What it needs | Live now? |
|---|---|---|---|---|---|
| 1 | OMNI chat route | `/api/omni/chat`, manifest `chat` | Installed (0066). Manifest says `delegation_required`. No real reply sent yet | Code: none. Owner: two-step sign-in, connect OMNI web with `chat:write`, approve AI use, Stop released for chat | Yes, waits only on the owner (one small paid reply) |
| 2 | Dread and Draco agents | manifest `agents`, `chat.agentIds`, `/api/omni/chat` | Built 2026-11-21 (source; live after publish): two chat-enrolled Mothership agents with their own personalities and browser-voice hints, same model, caps, Stop and approvals as OMNI. Not held-task agents | Publish; then owner `chat:write` consent. OMNI web also needs a fresh signed spend cap before it sends any paid chat | After publish |
| 3 | Provider/model discovery and add-provider | manifest `providers`, `capabilities.providers` | Read: lists Lovable AI and its one model when configured. Write: `false` (no add-provider API) | Discovery: already real. Add-provider: new owner-only, MFA-gated server endpoint storing keys as server secrets only, plus a migration for provider records | Discovery yes. Add-provider: buildable, not urgent (free path is Lovable AI) |
| 4 | Fusion planner `omni.fusion-plan/v1` | `/api/omni/fusion/plans`, 0067 + 0069 | Published and installed. Answers 401 without delegation. Rules-only plans, 10 per owner per day | Owner: connect with `fusion:plan`, make one held task, ask for one plan (free) | Yes, waits only on the owner |
| 5 | Migration 0064 and `tasks:read` | `drizzle/migrations/0064`, `GET /api/omni/tasks` | Installed. Key reads (jobs scope) and delegated reads both work | Owner: one live delegated read | Yes |
| 6 | Files, Knowledge Vault, Automations endpoints | manifest `capabilities.files/knowledge/automations` | All `read:false, write:false`. No endpoints exist | Read-only endpoints over existing owner records (Quantum Studio private media list, Daily Knowledge Brief entries) plus new `files:read`/`knowledge:read` scopes (one small migration). Automations: no real automation engine exists | Files and Knowledge read: buildable now. Automations: locked pending sandbox |
| 7 | `diagnostics:read` | none | Not offered. Only `/api/omni/health` (metadata) exists | New scope + read-only endpoint returning existing stored readiness evidence (Stop state, link check times, migration count). Small migration for the scope | Buildable now |
| 8 | OMNI–Jackboy link and activation checklist | `/activation-approvals`, Steps 1–10 | Real gated flow. Signed permit last seen 2026-11-19, so the spending cap shows Unverified. Executor is disabled | Owner: fresh MFA run of Step 8 self-test and Steps 9–10. Cap turns Verified only from a fresh signed Jackboy permit | Link and approvals: yes (owner). CODE execution: locked pending sandbox (PR #28) |
| 9 | Workspace and CODE execution | Agent Workspace on `/omni-terminal`, bounded executor | Off. Tasks stay `held` | Finished and merged PR #28 sandbox | Locked pending sandbox |
| 10 | Task retry / task decisions | manifest `taskRetry`, `taskDecisions` | `false` | Depends on executor | Locked pending sandbox |

## Part B — Plan (cheapest first)

Step 1 — Free owner live checks (no code). You sign in with two-step code, connect OMNI web with `tasks:read` and `fusion:plan`, create one held task, request one Fusion plan, then cancel the task. Proves items 4 and 5 live.

Step 2 — One paid chat reply (about one cent, inside the $0.50 per call cap). Add `chat:write`, approve AI use, send one message. Proves item 1.

Step 3 — Jackboy link refresh (free). Run Step 8 self-test and Steps 9–10 on Activation approvals. A fresh signed permit may turn the cap Verified. Jackboy can then receive held tasks through the signed owner handoff. No execution.

Step 4 — Small code batch (free, one migration). Add read-only `files:read`, `knowledge:read` and `diagnostics:read` scopes and endpoints over records that already exist, with owner isolation, Stop check, audit and tests. Manifest flips those `read` flags to true only when the migration is detected. Automations stays "locked pending sandbox".

Step 5 — Dread and Draco (owner confirmed 2026-11-21: planned agents, build on the Mothership): done in source as chat agents on the same model and limits as OMNI, browser voices only. Live after publish.

Step 6 — Add-provider API (optional, later). Owner-only, MFA-gated, keys kept as server secrets. Skip for now to save budget; Lovable AI is enough.

Step 7 — After PR #28 is merged: separate review to unlock workspace, CODE execution, retry/decisions and automations.

Unchanged throughout: $0.50 per call, $1 per job, $5 per day, one active job; approval gates, passkey checks and the Stop control. No new secrets exposed. Nothing is published without your approval.

## Questions for the owner
- ~~Are Dread and Draco real agents?~~ Answered: build them as Mothership chat agents (same provider, browser voices).
- Should Files cover Quantum Studio media only, or also Creator/Distro drafts?

## Technical details
- New migration (next number after 0069) adds the three scopes to the delegation scope check and service-only read functions; runtime detection like 0066/0069.
- New routes under `src/routes/api/omni/` (files, knowledge, diagnostics), delegated-bearer only, GET, bounded, metadata/no secrets.
- Update `omni-contract.ts` manifest, `docs/OMNI-FRONTEND-CONNECTION*.md`, register and roadmap; isolated SQL tests plus app tests and smoke.
