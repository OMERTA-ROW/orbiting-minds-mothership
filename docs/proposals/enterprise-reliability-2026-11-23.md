# OMNI Mothership Enterprise Infrastructure & Fusion Reliability Upgrade

## Objective
Audit and strengthen container execution, CI/CD, release rollback, observability and strict isolation for Fusion, agents and terminal jobs. This PR combines a proposal with limited reference-image, CI and test hardening; it is not a completed infrastructure upgrade. The [execution architecture and deployment gates](../OMNI-EXECUTION-ARCHITECTURE.md) supersede older Railway sandbox instructions.

## Work plan
1. Audit GitHub Actions, Railway, Vultr, sandbox supervisor, Fusion routing, agent permissions and existing owner authorization. Reconcile live vs code state, including quarantined workspace execution.
2. Reproducible pinned Docker builds; non-root, read-only, limited resources, controlled egress and stronger sandboxing for untrusted code.
3. Isolate agents, sessions, personal/public terminals, and dev/test/staging/production secrets and network permissions.
4. CI checks for security, unit/integration, isolated executor, Fusion routing, emergency stop, cancellation and session authorization.
5. Owner-approved releases, post-deploy health checks, immutable known-good releases, safe automatic application rollback, and quarantine of affected jobs. No unsafe replay of non-idempotent actions or automatic database downgrade.
6. Owner-only observability for dispatches, model routing, terminal/sandbox health, tool outcomes, budgets, permission denials, deploys and rollback history. Redact secrets.
7. Failure-injection tests for executor crashes, denied cross-boundary access, failed deployments, interrupted jobs and Fusion dispatch failures.

## Acceptance evidence
Verified isolation, reproducible builds, staging tests, rollback simulation, failure diagnostics, security assessment and release-readiness checklist.

## Non-negotiable controls
Do not lift quarantine, enable Autonomous Mode, disable Emergency Stop, alter production secrets, merge or deploy without explicit owner authorization. Containerization alone is not proof of isolation.

## Advanced capabilities — Phase 2 (proposed, gated)
1. Fusion orchestration: agent registry, role/capability discovery, multi-agent dispatch, result provenance, conflict resolution, cost-aware model routing and traceable tool invocation.
2. Agent intelligence: isolated project memory, searchable task history, explicit memory retention controls and permission-scoped retrieval.
3. Durable task workflows: plan/preview/approve/execute/checkpoint/resume/cancel, dependency tracking, schedules and deadlines; prevent replay of irreversible actions.
4. Owner terminal: secure command preview, scoped approvals, live output, searchable execution history, agent switching and distinct personal/public permissions.
5. Voice experience: speech input/output interface with agent attribution and safe confirmation for consequential commands; graceful fallback when providers unavailable.
6. Jackboy delegation: signed scoped software-engineering jobs, PR links, test evidence, status synchronization, bounded retries and explicit owner merge/deploy authorization.
7. Connected task capabilities: modular adapters for publishing, business documents, forms and administrative workflows, with provider permissions, human review and legal/compliance gates where applicable.
8. Resilience and intelligence: failure classification, safe retries, agent health metrics, spending telemetry, recovery controls and an owner-only operations dashboard.
9. Evaluation: Fusion dispatch tests, prompt-injection resistance, cross-agent data isolation, tool permission denials, cost ceilings, session recovery and emergency stop.

Implement incrementally only after executor isolation and approval gates are verified. Do not activate quarantined execution or claim live integrations without end-to-end proof.
