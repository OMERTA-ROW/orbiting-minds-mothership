# OMNI Mothership — autonomy transition and troubleshooting ledger

Status: design and acceptance checklist; production activation not authorized by this document.

## System architecture
- OMNI coordinator, agent intelligence foundation, RAZUL handoff gate, scoped specialist agents and historical code/Genesis reference knowledge.
- Owner-approved tool routing for coding, creative production, game development, tax/legal research, analytics and security.
- Jackboy as policy/permit authority; separate execution hosts, web UI and local Mac helper.
- Durable session reuse, audit history, credential isolation, job provenance, safe cancellation and emergency stop.

## Previously reported findings — require fresh validation
- Vultr was reported as active executor; Railway staging service remained present with misleading labeling.
- Capabilities field compatibility reportedly fixed in mothership commit 46794ec.
- Isolation diagnostic was unverified; draft PR #14 reportedly held launcher/diagnostic changes not on main.
- Jackboy migration 0077 reportedly added session reuse.
- Earlier checks included activation steps 7–9, passkey authorization, signed handshake, budget limits and kill-switch enforcement.
- Agent foundation had simulated tests; live tool routing and complete end-to-end acceptance were not established by those simulations.
These are historical reports, not current live verification.

## Independent stage gates
1. Baseline: reconcile repo heads, deployed SHAs, open PRs, running hosts and config.
2. Security: verify MFA/passkey, owner approvals, signed short-lived permits, scope, spend caps, stop behavior.
3. Executor: isolated real command run, denied network/secrets, logs, cleanup, timeout, reuse and recovery.
4. Agent intelligence: live evals, provenance, uncertainty, tool permissions, handoffs, domain-specific workspaces.
5. Integration: terminal-to-mothership-to-Jackboy-to-executor trace with error and rollback drills.
6. Production: change review, deploy approval, canary, monitoring, incident response, measured autonomy limits.

## Required troubleshooting artifact per stage
Environment, branch/commit, exact command, expected/actual, timestamped logs (redacted), diagnosis, change, passing regression, owner sign-off and rollback. Tests reported as passed by the owner must be linked to verifiable run IDs before production claims.

## Safety boundary
No automatic merging, deployment, spending-limit removal, emergency-stop release or autonomous production execution is authorized by this documentation PR.
