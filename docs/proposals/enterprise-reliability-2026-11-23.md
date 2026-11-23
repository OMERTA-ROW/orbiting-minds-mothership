# OMNI Mothership Enterprise Infrastructure & Fusion Reliability Upgrade

## Objective
Audit and strengthen container execution, CI/CD, release rollback, observability and strict isolation for Fusion, agents and terminal jobs. This PR is an implementation brief only, not a completed infrastructure upgrade.

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
