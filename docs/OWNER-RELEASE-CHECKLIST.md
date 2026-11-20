# Owner release checklist — Mothership and OMNI

Updated 2026-11-20 17:15 UTC. Preview is at commit `d10fb1f`; the published site still runs
`3d841df` until you publish. Tick items yourself; nothing here is done by publishing alone.

## A. Already verified (no action needed)

Checked in preview, signed out, or read-only against the live database. "Verified" means the check
ran and passed; it does not mean the feature has been used live.

| What                                  | Result                                                                                         | How it was checked                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| All site pages                        | 76 pages open, no errors, no links to missing pages                                            | Browser check `scripts/smoke_site.py`        |
| Links and menu                        | Every internal link resolves; no placeholder links or do-nothing buttons; retired areas not in the menu | `src/test/site-links.test.ts`        |
| Main address                          | `https://evoomni.tech` is canonical                                                            | Destination test                             |
| OMNI web address and callback         | Match the registered OMNI web site and its exact `/mothership/callback`                       | Destination test                             |
| Docking Bay                           | Only Honeycomb's published and preview sites allowed                                           | Destination test                             |
| OMNI connections without a key/token  | Refused with 401; empty token exchange → 400; version marker answers                           | 13 endpoint checks                           |
| Jackboy, runner, executor addresses   | Come only from your settings; all four present and https                                       | Read-only settings check (no values shown)   |
| Jackboy dispatch and callback         | Not set, so both stay off                                                                      | Read-only settings check                     |
| Database                              | 0064 and 0065 applied; 66 migrations recorded                                                  | Read-only history check                      |
| Spending cap reading                  | Shows verified only from a signed Jackboy permit ≤ 15 minutes old within $0.50 / $1 / $5 / one job | Boundary and failure tests               |
| App checks                            | 1,296 tests, type check, style check and production build pass                                 | Test run on `d10fb1f`                        |

- [x] **Fusion plan permission** (built, not installed): separate "Ask Fusion for plans" consent;
      isolated tests prove it cannot start work, use paid AI or get past the Emergency Stop
      (285 database checks, 18 app tests). Installed; on this preview a fake permission is refused (401).

## B. Waiting on your approval

These need your decision. Each is separate; approving one does not approve another.

- [ ] **Publish the Mothership** (`d10fb1f` and earlier fixes). Rollback: republish `3d841df`.
- [x] **Install database change 0066** (delegated OMNI chat): installed 2026-11-20 with your approval.
- [ ] **OMNI web asks for chat permission separately** (`chat:write`), done in the OMNI project.
- [ ] **OMNI web project changes**: its migration 0002, callback page and server-side token storage.
- [ ] **PR #25** (repository Fusion intake, documents only): merge or close on GitHub.
- [x] **Fusion purpose**: answered 2026-11-20 (orchestration architecture, not an agent); brief
      rewritten in `docs/OMNI-FUSION-REQUIREMENTS.md`.
- [x] **Install database change 0067** (separate "Ask Fusion for plans" permission): installed
      2026-11-20 with your approval, plus a notes-only change (0068). It grants no work, spending or Stop control.
- [ ] **Approve Fusion phase 2** (planner records and owner plan review) per the brief, before it is built.

## C. Live checks you run after publishing

Each needs you signed in on the live site. Some cost money; those are marked.

- [ ] **API keys**: create one key with an expiry and one "Never expires" key; check
      `/api/public/omni/health` answers for both; revoke both; confirm both are refused.
- [ ] **OMNI web connection**: follow steps 2–5 in `docs/OMNI-FRONTEND-CONNECTION.md`
      (create key, add it to OMNI web, re-check, revoke, re-check shows "Not connected").
- [ ] **Owner delegation**: approve on `/omni-authorize`, let OMNI web exchange the code, create one
      held task, then revoke and confirm OMNI web is refused.
- [ ] **Chat** (after 0066 and `chat:write`) — *paid*: send one test message, confirm the reply,
      then check the daily count went up by one.
- [ ] **Spending cap shows verified**: authorize one job so Jackboy issues a fresh signed permit;
      the label turns verified for 15 minutes, then returns to Unverified.
- [ ] **Staging executor (Vultr)** before arming autonomy: edit the executor's env file on the
      Vultr server and restart `omni-executor.service`. Arming stays its own separate step.
- [ ] **Emergency Stop**: from OMNI web, engage only; confirm it shows engaged on the Mothership.
      Releasing stays on the Mothership with a fresh code.

## D. Not built yet (cannot be checked)

- Fusion planner, answer comparison, shared knowledge and maintenance coordination (see its brief;
  only the separate permission and its refusals exist); task approve/reject from OMNI web (owner-only on the Mothership by design);
  Jackboy dispatch and callback; Honeycomb's Mothership adapter.

## Never part of a release

Raising spending limits, releasing the Emergency Stop, turning off the Kill Switch, enabling CODE
or autonomy, or approving activation steps. Each stays its own owner action.
