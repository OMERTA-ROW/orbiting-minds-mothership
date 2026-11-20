# `omni.fusion-plan/v1` — Fusion plan proposals for OMNI web

Status 2026-11-20: **rules and 10-per-owner limit approved by the owner; database change 0069
(`drizzle/migrations/0069_omni_fusion_rules_planner.sql`, SHA-256 `e4b7b872…118bd6`) installed
19:30 UTC. The source that uses it is not published yet:** the live site (`5e50faa`) does not read
the planner marker and keeps answering `503 planner_not_available` until the next publish; the
preview already returns proposals. Types live in `src/lib/omni-fusion-plan.ts`; refusals in `src/lib/omni-fusion.ts`.

Fusion is the Mothership's orchestration architecture, not an agent. Phase 1 is a **rules-only
proposal** for one held task: who is responsible for each step, what it depends on, and which
owner/Jackboy checkpoint guards it. It consults no agent, no model and no knowledge source, never
reads the task text, and never starts, hands over, approves, retries or pays for anything.

## Request

```
POST /api/omni/fusion/plans
Authorization: Bearer omnid_<64 hex>        # owner delegation that includes fusion:plan
Content-Type: application/json

{"taskId": "<uuid of a held task OMNI web created for this owner>"}
```

- Server-to-server only (requests with `Origin`/browser fetch metadata are refused, 403).
- Body is strict: exactly `taskId` (UUID), at most 2,048 bytes. Anything else → 400 / 413.
- Metadata API keys (`omni_…`) never reach Fusion (401 / 403 `delegation_required`).

## Checks (one database transaction, migration 0069)

1. Delegation valid: not expired, not revoked, audience `omni-mothership`, owner still verified;
   scope `fusion:plan` present (no other scope implies it, and it implies no other scope).
2. Emergency Stop released (missing or unreadable row = engaged).
3. Task is this owner's, created by OMNI web through a delegation, still `held`, and not yet sent
   to Jackboy. Unknown ids, other owners' tasks and terminal-made tasks all answer `task_not_found`.
4. At most **10 proposals per owner per rolling 24 hours** (owner-approved), counted across every
   delegation and server process. Refusals and rolled-back calls don't count.
5. One `fusion_plan_proposed` audit row (owner, task id; no text). Nothing else is written or changed.

**Concurrency.** Locks follow the order existing writers use — delegation row (FOR UPDATE) →
Emergency Stop row (FOR SHARE) → task row (FOR SHARE) → per-owner advisory lock for the quota —
so a concurrent revoke, Stop engage, cancel or Jackboy handover either committed first (and is
seen, so the request is refused) or waits until the proposal commits. A success therefore never
coexists with a change that committed before it. Engaging the Stop can wait at most as long as
one proposal transaction (no network inside it).

The database returns task metadata only, plus a SHA-256 digest of title + instructions.

## 200 response

```ts
type FusionPlanResponse = { ok: true; plan: FusionPlan };

type FusionPlan = {
  schema: "omni.fusion-plan/v1";
  rulesVersion: 1;
  planId: string; // "fp_" + 32 hex; deterministic for the same task facts, rules and scopes
  digest: string; // SHA-256 of the canonical planner input
  mode: "rules_only";
  status: "proposed";
  persisted: false; // phase 1 stores no plan; only the audit row exists
  generatedAt: string; // ISO time of this reply (not part of planId)
  task: {
    id: string;
    agentId: "jackboy" | "jax" | "razul" | "sabrina" | "guardian" | "hercules";
    agentName: string; // verified name, e.g. "Razul Central Intelligence"
    kind: "code.generate" | "code.edit" | "code.test" | "code.debug" | "agent.handoff";
    state: "held";
    hasRepository: boolean;
    createdAt: string;
    inputDigest: string; // SHA-256 of title + "\n" + instructions; the text is never returned
  };
  emergencyStop: { state: "released"; checkedAt: string };
  steps: FusionPlanStep[]; // always the five steps below, in order
  consulted: { agents: []; models: []; knowledgeSources: [] }; // always empty in phase 1
  cost: {
    fusionUsd: 0;
    modelCalls: 0;
    // The owner's REQUIRED policy limits for any job — not verified enforcement. The planner
    // reads no permit; only the manifest's spendingCap (fresh signed permit) shows enforcement.
    requiredJobLimits: {
      perAiCallUsd: 0.5;
      reservedPerJobUsd: 1;
      perDayUsd: 5;
      maxActiveJobs: 1;
      basis: "owner_policy";
      enforcementVerified: false;
      note: string;
    };
  };
  statusVisibility: {
    omniWebCanReadStatus: boolean; // true only if the delegation also has tasks:read
    path: "/api/omni/held-tasks" | null;
    reason: string;
  };
  limits: {
    plansPerDay: 10;
    plansUsedToday: number;
    canStartWork: false;
    canSpend: false;
    canApprove: false;
    canChangeEmergencyStop: false;
    callsModels: false;
    consultsAgents: false;
  };
  unavailable: {
    // always listed, state "planned"
    capability:
      | "compare_responses"
      | "shared_knowledge"
      | "maintenance_coordination"
      | "plan_records"
      | "owner_plan_acceptance";
    state: "planned";
    reason: string;
  }[];
};

type FusionPlanStep = {
  id:
    "owner_review" | "owner_handover" | "jackboy_admission" | "agent_work" | "owner_result_review";
  order: 1 | 2 | 3 | 4 | 5;
  responsible: { kind: "owner"; name: "Owner" } | { kind: "agent"; agentId: string; name: string };
  action: string;
  dependsOn: FusionPlanStep["id"][]; // each step depends on the previous one
  checkpoints: {
    kind: "owner_review" | "owner_fresh_code" | "owner_passkey" | "spend_caps" | "emergency_stop";
    decidedBy: "owner" | "jackboy" | "mothership"; // never Fusion
    where: string;
    detail: string;
  }[];
  state: "waiting_on_owner" | "not_started"; // step 1 waits on the owner; the rest not started
  fusionCanRun: false;
};
```

| #   | Step                  | Responsible                      | Checkpoints                                         |
| --- | --------------------- | -------------------------------- | --------------------------------------------------- |
| 1   | `owner_review`        | Owner                            | owner review (two-step sign-in), `/omni-terminal`   |
| 2   | `owner_handover`      | Owner                            | fresh two-step code; Emergency Stop released        |
| 3   | `jackboy_admission`   | Jackboy                          | owner passkey in Jackboy; signed permit within caps |
| 4   | `agent_work`          | The task's own agent (unchanged) | — (Fusion has no evidence it will run)              |
| 5   | `owner_result_review` | Owner                            | owner review of Jackboy's signed status             |

OMNI web should show the plan as a **proposal**: no step is ever marked running or done by Fusion.

## Refusals (`{ ok: false, error, message? }`, always `Cache-Control: no-store`)

| Status  | `error`                                                                                        | When                                                            |
| ------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 400     | `invalid_request`                                                                              | Body not exactly `{"taskId": "<uuid>"}`                         |
| 401     | `invalid_token` (+`reason`: `invalid`/`revoked`/`expired`/`wrong_audience`/`owner_unverified`) | Delegation not valid                                            |
| 401/403 | `invalid_token` / `delegation_required`                                                        | No delegation, or a metadata API key                            |
| 403     | `scope_missing`                                                                                | Delegation lacks `fusion:plan`                                  |
| 403     | `server_to_server_only`                                                                        | Browser request                                                 |
| 404     | `task_not_found`                                                                               | Not this owner's OMNI-created task                              |
| 409     | `task_not_held`                                                                                | Task was cancelled                                              |
| 409     | `task_already_handed_off`                                                                      | Owner already sent it to Jackboy                                |
| 413     | `invalid_request`                                                                              | Body over 2,048 bytes                                           |
| 423     | `emergency_stop_engaged`                                                                       | Stop engaged or unreadable                                      |
| 429     | `daily_limit`                                                                                  | 10 proposals in 24 h                                            |
| 503     | `planner_not_available`                                                                        | 0067 installed, 0069 not installed (current state)              |
| 503     | `not_available`                                                                                | 0067 not confirmed installed                                    |
| 503     | `fusion_unavailable`                                                                           | Database unreachable, or an answer that fails strict validation |

## Manifest

`orchestrationStatus.permission.state` is `not_installed` → `planner_not_available` → `rules_only`
(the last adds `schema: "omni.fusion-plan/v1"` and `plansPerDay: 10`). `plannerBuilt` is true only
in `rules_only`; `verified` stays `false` and `orchestration` is never sent, so OMNI web's
"Fusion · unverified" label stays correct until the live owner check and handshake pass.

## Evidence

- `src/test/test_omni_fusion_planner_sql.py` — 395 isolated SQL checks plus 9 real
  concurrent-session races on a throwaway PostgreSQL 17 database: cancel, handover (the real
  `omni_task_handoff_begin`), Stop engage (`omni_terminal_engage_stop`) and revoke in both orders;
  six parallel requests over two valid delegations with 8 used → exactly 2 admitted; 10th ok,
  11th 429, refusals/rollbacks free, rolling cutoff, other owners' proposals not counted. The same
  races fail against the earlier draft (it admitted a task while its cancel was committing).
- `src/lib/omni-fusion-plan.test.ts` + `src/lib/omni-fusion.test.ts` — refusals with exact
  statuses, tampered database answers never become plans, determinism, no network/model calls,
  import allowlist (plan rules import only agent names, intended caps and validation).
