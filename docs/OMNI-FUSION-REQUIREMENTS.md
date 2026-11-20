# OMNI Fusion — requirements brief

Status 2026-11-20: **specification only. Nothing here is built, connected or verified.** The manifest
keeps `orchestrationStatus: { state: "not_available" }` and never sends `orchestration` until every
verification criterion below passes. OMNI web's "Fusion · unverified" stays correct until then.

Working definition (pending the owner's answer to "What should Fusion actually do?"): **Fusion is
OMNI's planner. It takes one held task, proposes an ordered plan of steps, names which verified agent
would handle each step, and waits. It never starts, dispatches, spends or approves anything.** If the
owner chooses a different purpose (combining agent answers, or merging knowledge sources), sections
1–4 are rewritten for that purpose before any code is written.

## 1. Data sources

Fusion may read only server-side records the Mothership already owns. Every read is owner-scoped
(the delegation's owner, or the signed-in owner), and anything it reads is treated as data, never
as instructions.

| Source                            | What Fusion uses                                         | Where it lives today                                         | Rule                                                                 |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Held task                         | Title, description, requested agent, created time        | Held OMNI tasks (migrations 0062–0064)                       | Only `held` tasks of the same owner; one task per plan               |
| Agent roster                      | The six held-task agents and their verified names        | `HELD_TASK_AGENTS` (`src/lib/omni-delegation.ts`)            | Never invent an agent or a capability; unknown agent = refuse        |
| Model configuration               | Configured Lovable AI model                              | Manifest provider read (`src/lib/ai/omni-model.ts`)          | Configured is not verified; one inference per plan, inside the guard |
| Emergency Stop and account pause  | Engaged / released, read time                            | OMNI Terminal stop state                                     | Missing or unreadable = engaged = no plan                            |
| Spending evidence                 | Newest signed Jackboy permit limits and age              | `src/lib/omni-spend-evidence.ts`                             | Cost estimates are labelled estimates; never shown as a permit       |
| Owner approvals                   | Whether AI use is approved for the owner                 | Owner AI approval records                                    | Not approved = refuse (403 `ai_not_approved`)                        |
| Delegation (if called from OMNI)  | Scopes, expiry, revocation                               | `src/lib/omni-delegation*.ts`                                | Checked in the same database transaction as the plan write           |

Not allowed as sources: browser storage, URL values, other owners' records, live repository or
device contents, the public internet, and anything the caller claims about itself.

## 2. User permissions

| Action                       | Who                                                         | Requirement                                                                                     |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ask for a plan (Mothership)  | Verified owner                                              | Two-step sign-in (aal2), AI approval, Stop released                                             |
| Ask for a plan (OMNI web)    | OMNI web on the owner's behalf                              | New separate delegated scope `fusion:plan`, consented on its own screen; not implied by `tasks:write` or `chat:write` |
| Read plans                   | Owner; OMNI web with `tasks:read`                           | Owner-scoped, audited reads                                                                     |
| Discard a plan               | Owner; OMNI web with `fusion:plan`                          | Idempotent                                                                                      |
| Accept a plan                | Owner only, on the Mothership                               | Two-step sign-in + passkey, same as task decisions; no key or delegation can accept             |
| Run any step                 | Nobody through Fusion                                       | Accepting a plan only records the decision. Running stays with the existing Jackboy handoff, its signed permit, caps and Stop |

Metadata API keys (`health`, `jobs`) never reach Fusion. Guardian's default-deny stays in force: a
plan step that Guardian refuses is shown as refused, not removed.

## 3. Expected outputs

**Plan record** (`omni.fusion-plan/v1`, metadata only, stored per owner):

- `planId`, `taskId`, `ownerId`, `createdAt`, `expiresAt` (24 hours), `model`, `inputDigest`
  (SHA-256 of the task text it read; the text itself is not copied).
- `steps[]`: `order`, `agentId` (one of the six), `agentName` (verified name), `summary` (≤ 280
  characters), `needsApproval` (always `true` for anything consequential), `estimatedCostUsd`
  (labelled estimate, capped at $1 per job and $0.50 per AI call; a plan whose total would pass $1
  is refused, not trimmed).
- `status`: `proposed` → `accepted` | `discarded` | `expired` | `refused` (with a plain reason).
  There is no `running` or `done` state in Fusion.

**API** (behind the existing contract):

- `POST /api/omni/fusion/plans` — create a plan for one held task (`fusion:plan`).
- `GET /api/omni/fusion/plans?taskId=` — read plans (`tasks:read`).
- `POST /api/omni/fusion/plans/:id/discard` — discard (`fusion:plan`).
- Manifest `orchestration` (only after verification): `{ name: "Fusion", version, mode: "plan_only",
  verified: true, verifiedAt, checkedAt }`. Without it, `orchestrationStatus` explains why.

**Refusals** use the existing JSON style: 401 no/invalid token, 403 `scope_missing`,
403 `ai_not_approved`, 423 `emergency_stop_engaged`, 429 daily limit (proposed: 10 plans/day, inside
the existing $5/day), 503 when verification or the guard is unavailable. Refusals never cost money.

**Owner page:** plans appear next to the held task on OMNI Terminal with step list, agents,
estimate label, status and an Accept button that asks for the passkey.

## 4. Verification criteria

Fusion may be reported in the manifest only when **all** of these pass, each with saved evidence
(commit, test output, date):

1. **Isolated database tests:** owner isolation (another owner's task → refused), only `held` tasks,
   expiry, idempotent discard, accept refused without passkey, one plan write per request under
   concurrency, delegation revoked mid-request → no plan.
2. **App tests:** each refusal above with exact status codes; `fusion:plan` absent → 403; metadata
   key → 401/403; Stop engaged or unreadable → 423; unknown agent in model output → plan refused;
   total estimate over $1 → refused; model output that tries to add tools, URLs or new agents →
   refused.
3. **No execution path:** a code check that Fusion modules import nothing that dispatches to Jackboy,
   the executor, the terminal or any outbound network besides the AI provider.
4. **Spend:** each plan uses at most one inference through the shared `evolution-omni` guard; the
   daily plan limit is enforced on the server.
5. **Live owner check (after publishing, owner-run, paid):** one plan for one real held task,
   read back on OMNI web and on the Mothership, then discarded; audit shows create, read and
   discard; nothing was dispatched.
6. **Handshake:** OMNI web reads `orchestration.verified: true` from the manifest and shows
   "Fusion · plan only". Nothing else may turn the label green.

## 5. Out of scope

Running steps, automatic acceptance, autonomy, agent-to-agent messaging, merging answers from
several models, repository or knowledge merging (PR #25 stays a separate CLI intake), and any
change to spend caps, Stop or approvals.

## 6. What is needed to start building

1. Owner confirms the purpose (the working definition at the top).
2. Owner approves the new `fusion:plan` scope and the plan table (one additive migration, reviewed
   before install).
3. Owner agrees the daily plan limit (proposed 10) and the 24-hour plan expiry.
