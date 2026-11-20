# OMNI Fusion — requirements brief

Status 2026-11-20. **Phase 0 (a separate permission and its refusals) is built, installed (0067)
and published, but not used live yet. Phase 1's rules-only plan proposals are built and tested in
source; their database change (0069) is proposed, not installed, and not published** (contract:
`docs/OMNI-FUSION-PLAN-CONTRACT.md`). Phases 2–4 are a specification. The manifest keeps
`orchestrationStatus.state: "not_available"` and never sends `orchestration` until a phase passes
its verification criteria. OMNI web's "Fusion · unverified" stays correct until then.

## Definition (owner, 2026-11-20)

Fusion is the OMNI Mothership's **unified multi-agent orchestration architecture — not another
agent.** It combines four capabilities:

1. **Plan and route** complex tasks across OMNI, Jackboy/CODE, Razul and the other authorized
   agents, with clear responsibilities, dependencies and approval checkpoints.
2. **Compare and combine** responses from several AI models and agents: compare their reasoning,
   identify disagreements, and produce one evidence-based recommendation.
3. **Shared knowledge**: integrate approved project knowledge, repositories, technical
   documentation, historical code, troubleshooting records, security updates and feature
   intelligence into one permission-aware knowledge system.
4. **Maintenance coordination**: diagnostics, repair proposals, testing, backups, recovery planning
   and verified update packages.

Rules that apply to every capability:

- **Agents keep their identities and capabilities.** Fusion never speaks as an agent, renames one,
  merges two, or gives one another's abilities. The roster is the verified one already on the
  Mothership: OMNI (text agent) and the held-task agents Jackboy, JAX, Razul Central Intelligence,
  Sabrina, Guardian and Hercules (`HELD_TASK_AGENTS`). An agent not on it does not exist for Fusion.
- **Real services, authenticated permissions only.** No simulated success, scripted replies or
  sample results. A step that did not run is shown as not run.
- **Never bypasses** owner approvals (two-step sign-in + passkey), spending controls ($0.50 per AI
  call, $1 reserved per job, $5 per day, one active job — enforced by Jackboy's signed permits),
  Guardian's default-deny or the Emergency Stop (missing or unreadable = engaged).
- **Proposes; does not execute.** Running anything stays with the existing owner-triggered Jackboy
  handoff and its permit. Fusion adds no new way to start work.
- **Incremental, behind the existing OMNI interface.** Each phase is its own owner approval,
  migration and permission; every status label says _planned_, _built (not installed)_,
  _installed (unverified)_ or _verified_, with evidence.

## Status by capability

| Capability                                     | State                                        | Evidence / blocker                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 — `fusion:plan` permission and consent | **Installed and published, unverified live** | 285 isolated SQL checks + app tests; 0067 installed and published 2026-11-20; needs OMNI web requesting the scope                                                                                        |
| 1. Plan and route (rules-only proposals)       | **Built, not installed**                     | 295 isolated SQL checks for proposed 0069 + app tests (`omni-fusion-plan.test.ts`); needs owner review, 0069 install, then publishing. Plan records and an owner accept/discard screen are still planned |
| 2. Compare and combine                         | Planned                                      | Needs phase 2 approval; every model call is paid and goes through the spend guard                                                                                                                        |
| 3. Shared knowledge                            | Planned                                      | Needs phase 3 approval; PR #25 (repository intake) is related and still open                                                                                                                             |
| 4. Maintenance coordination                    | Planned                                      | Needs phase 4 approval; backups/updates also need the existing trusted-release rules                                                                                                                     |

## 1. Data sources

Fusion may read only server-side, owner-scoped records the Mothership already owns. Anything it
reads is data, never instructions. Never allowed: browser storage, URL values, other owners'
records, the caller's claims about itself, secrets, and live device contents.

| Capability       | Sources (all owner-scoped)                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All              | Emergency Stop and account pause; owner AI approval; delegation scopes, expiry and revocation; agent roster; signed spend evidence (`omni-spend-evidence.ts`)                     |
| Plan and route   | Held OMNI Terminal tasks (0062–0064); existing Jackboy handoff records (read only); Guardian decisions                                                                            |
| Compare/combine  | Replies from agents/models the owner selects, each through its existing guarded route, with model id, time and cost recorded                                                      |
| Shared knowledge | Only sources the owner approved one by one: project records, a selected repository (review-only), docs, troubleshooting and security records, with provenance, version and expiry |
| Maintenance      | Test results, diagnostics, backup and release records the Mothership already stores; never live shells or devices                                                                 |

## 2. User permissions

Each capability gets its **own** delegated scope, consented separately on `/omni-authorize` by the
verified owner (aal2 + fresh code). No scope implies another; metadata API keys never reach Fusion.

| Scope (OMNI web)        | Grants                                                    | State            |
| ----------------------- | --------------------------------------------------------- | ---------------- |
| `fusion:plan`           | Ask for a plan proposal for one held task                 | Installed (0067) |
| `fusion:compare`        | Ask for a comparison of answers the owner selected (paid) | Planned          |
| `fusion:knowledge:read` | Search approved knowledge with sources shown              | Planned          |
| `fusion:maintain`       | Ask for a diagnostic or repair/backup/update _proposal_   | Planned          |

Owner-only, on the Mothership, never through any scope: accepting a plan or recommendation,
approving knowledge sources, starting a handoff, restoring a backup, installing an update, changing
caps, releasing the Stop.

**What `fusion:plan` can never do** (enforced in the database and tested): add, read, start, hand
off, approve or retry tasks; call a model or provider; read or issue permits; change caps; engage or
release the Emergency Stop. Every request is refused while the Stop is engaged or unreadable.

## 3. Expected outputs

**Phase 0 (built):** `POST /api/omni/fusion/plans` with `{"taskId": "<uuid>"}`. One service-only
database call checks the delegation and Stop and writes one `fusion_plan_requested` audit row, then
answers 503 `planner_not_available`. Refusals: 401 invalid/revoked/expired/wrong audience/owner
unverified, 403 `scope_missing`, 423 `emergency_stop_engaged`, 400/413 bad body, 503 not installed
or gate unavailable. The manifest's `orchestrationStatus.permission` reports `scope`, `path`,
`state` (`not_installed` → `planner_not_available`) and `canStartWork/canSpend/canChangeEmergencyStop/canApprove/plannerBuilt: false`.

**Phase 1 — built as rules-only proposals** (`docs/OMNI-FUSION-PLAN-CONTRACT.md`): five fixed
steps (owner review → owner handover → Jackboy admission → the task's own agent → owner result
review) with responsibilities, dependencies and checkpoints; deterministic `planId`; no consulted
agents/models; 10 per owner per day; not stored. Still planned for phase 1, as originally specified —
**plan record** (`omni.fusion-plan/v1`, metadata only): plan id, task id, owner, created
and expiry (24 h), input digest (not the text), ordered steps (agent id + verified name,
responsibility, depends-on, approval checkpoint, labelled cost estimate), status
`proposed → accepted | discarded | expired | refused`. No `running`/`done` state in Fusion. Plans
whose estimate passes $1 are refused, not trimmed.

**Phase 2 — comparison record:** the question digest, each source (agent/model, time, cost, reply
digest), points of agreement and disagreement with the evidence each cites, and one recommendation
labelled with its confidence and what would change it. A source that failed is listed as failed.

**Phase 3 — knowledge answers:** results with source, version, approval date and expiry; owner can
see, edit, revoke and export every approved source; nothing is used for model training.

**Phase 4 — maintenance proposals:** diagnostic findings, a repair proposal with the tests that
prove it, a backup/recovery plan and an update package digest — each waiting for the owner.

## 4. Verification criteria

A phase may be reported as verified only when **all** pass, each with saved evidence (commit, test
output, date):

1. **Isolated database tests**: owner isolation, scope separation both ways, expiry/revocation,
   Stop engaged or missing → refused, no rows written outside the phase's own records and audit.
2. **App tests**: every refusal with its exact status; metadata keys refused; tampered database
   answers never turn into a claimed result.
3. **No execution path**: an import/call allowlist check that Fusion modules cannot reach Jackboy,
   executors, task handoffs, permits, the Stop or any network besides the approved provider.
4. **Spend**: any model call goes through the shared `evolution-omni` guard and daily caps; phases
   without model calls are tested to make none.
5. **Live owner check after publishing** (owner-run; paid only where the phase uses a model).
6. **Handshake**: OMNI web shows the phase's state from the manifest; only `orchestration.verified:
true` with `verifiedAt` may turn its label green.

Phase 0 evidence: criteria 1–4 pass (`src/test/test_omni_fusion_plan_sql.py`, 285 checks, both
install orders with 0066; `src/lib/omni-fusion.test.ts`, 18 tests). 0067 is installed;
criteria 5–6 wait on publishing and OMNI web requesting `fusion:plan`.

## 5. Never in scope

Autonomous execution, automatic acceptance, agent-to-agent commands without the owner, raising or
bypassing caps, releasing the Stop, posting or publishing anywhere, training on owner data, and
presenting a planned capability as working.

## 6. Needed next

1. Done: 0067 installed and published 2026-11-20.
2. OMNI web requests `fusion:plan` as its own opt-in and shows `planner_not_available` as a state.
3. Done in source (owner chose deterministic rules, no model calls): phase 1 proposals. Next: owner
   reviews them and the proposed 10-per-day limit, approves installing 0069, then publishing.
4. Later, separately approved: plan records and the owner accept/discard screen.
