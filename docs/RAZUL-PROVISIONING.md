# Razul intelligence provisioning (`razul.manifest/v1`)

Status on 2026-11-12: **Mothership records, rules and screens are built; no evaluator, agent runtime or
Razul auto-proposer is connected.** Approval is therefore refused by the database for every proposal.

## Roles (owner-defined architecture)

| Part | Role | Autonomy |
|---|---|---|
| OMNI | Engine / orchestrator | — |
| CODE | Command execution and autonomous task runtime (OMNI CODE queue, cloud sandbox) | Off; gated by `autonomyGates` and the CODE service |
| Jackboy | Builds and repairs software | **Off** (separate switch; never changed here) |
| Razul (Razool) | Intelligence Director: proposes the specialist agent(s) each Jackboy-built app needs | Proposes only |
| Honeycomb | Mobile companion / device security | Separate device-care permissions |

## Pipeline

```text
Jackboy builds app ──► Razul (or owner) drafts manifest v1.0.0 ──► static checks (built)
      ──► sandbox evaluation on OMNI cloud sandbox (SPECIFIED, not connected)
      ──► owner approves (fresh two-step code, acknowledges every escalation)
      ──► staged rollout 10% → 50% → 100%, health-checked each stage
      ──► owner promotes ──► active release      (rollback at any time)
```

## Built in this project

- `src/lib/razul-provisioning.ts` — manifest schema, lint (forbidden tools, $1/$5/$10 caps, own
  namespace `app/<appId>/<agentId>`, setting **names** only, secret-like text refused), diff with
  escalations, proposal state machine, namespace-isolated retrieval with provenance, health checks.
- Migration `0050` — immutable manifests (database-computed SHA-256), proposals, append-only
  evaluations and history, trigger-only releases, owner knowledge store, owner RPCs.
  Database refuses: approval without a proof-verified passing **sandbox** evaluation of the exact
  digest from the last 24 h; approval/widening/promotion without owner + fresh TOTP (≤15 min), so the
  service role (and therefore any Razul process) can never approve or promote; unacknowledged
  escalations; skipped or unhealthy stages; widening/promotion during Emergency Stop or with the
  terminal kill switch off; staging when the active version changed since proposing; more than one
  open proposal per agent; non-increasing versions. Rollback is always allowed (also during Stop).
- `/omni-razul` → **Intelligence provisioning · owner**: built/specified legend, manifest form with live
  checks, proposals with health, evaluation state and reasons for every disabled action, per-agent
  knowledge add/delete/search with sources, provisioning history.
- Tests: `src/lib/razul-provisioning.test.ts` (22), `src/test/test_razul_provisioning_sql.py` (71 isolated SQL checks).

## Hard limits

- Razul never grants tools or permissions; requesting ≠ granting. Shell, deploy, publish, merge,
  secrets, permission and self-modification tools cannot be requested at all.
- Razul never installs secrets. Manifests list setting names; the owner adds values in the right place.
- No self-modification of production and no continuous updates: `RAZUL_AUTO_PROMOTE = false`, and the
  database needs the owner's fresh second factor for approval, every widening and promotion.
- `code.propose` only puts a task into the OMNI CODE queue, where all CODE gates still apply.
- Knowledge and memory are per agent; retrieval never falls back to another namespace.

## Specified, not built (OMNI GitHub repo / Railway)

1. **Sandbox evaluation** (`omni.workspace/v1` extension `evaluate`): Mothership sends manifest +
   digest + owner-reviewed eval cases; sandbox runs them with the agent's model/budget caps and no
   production keys, returns pass/fail per case, cost, and a signed proof over the digest. Mothership
   verifies the proof and inserts `razul_evaluations(kind='sandbox', proof_verified=true)`.
2. **Agent runtime**: loads only the *active release* manifest, its namespace and its memory scope;
   enforces tools/budgets per call; reports per-stage health (error rate, cost, refusals) that the
   service writes to `stage_healthy`; rolls back automatically on failure (rollback is a reduction).
3. **Razul auto-proposer**: service-role inserts with `proposed_by='razul'`; it can draft but the
   database still refuses any approval or promotion it attempts.
4. **Memory link**: map manifest memory scope onto per-agent memory once app agents can enrol
   (today's per-agent memory covers the built-in agent list only).
