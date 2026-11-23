# OMNI Enterprise/Fusion Merge Readiness

Date: 2026-11-23
Pull request: https://github.com/OMERTA-ROW/orbiting-minds-mothership/pull/32
Head: `docs/enterprise-fusion-reliability-plan-20261123`

## Recommendation

**Not ready for production merge/release.** The proposal and implementation
hardening in this branch are independently reviewable, but live serving-runtime
isolation, owner-approval evidence and deployment verification remain blocked.

## Controls preserved

- MFA/fresh two-factor gates remain in place.
- Emergency Stop remains the default fail-closed control.
- Spending/task/daily/total caps remain unchanged.
- Owner approvals and permit checks remain unchanged.
- Workspace execution remains quarantined; no Autonomous Mode state was enabled.
- No deployment, merge, secret change, branch-protection change or production
  publish was performed.

## Implemented in this update

- Fixed the Mothership sandbox gate test's repository-relative import.
- Digest-pinned the sandbox and autonomous reference images to explicit Node
  patch tags and immutable manifest digests.
- Added container labels, stop signals and health checks.
- Added minimal Docker build contexts that exclude secret and build artifacts.
- Added CI container builds plus synthetic read-only/no-network startup checks
  with memory, CPU and PID ceilings.
- Identified the dedicated Linux workspace architecture and the separate bounded
  executor; removed superseded Railway workspace deployment instructions.
- Included portable executor, decision and worker-lease lifecycle tests in the
  normal Vitest suite while preserving standalone Node test execution. Vitest
  also discovers the systemd lifecycle cases; the disposable Linux CI job
  explicitly provisions their fixture and executes them.
- Added signed-plan and cancellation coverage through the actual bounded executor
  launcher on the disposable Linux host, with synthetic authorization only.
- Repaired the isolated cross-system Stop/no-op integration fixture's missing
  migrations and included it in the existing interop CI job.

The [architecture and deployment gates](OMNI-EXECUTION-ARCHITECTURE.md) are
authoritative for the distinction between Railway web hosting, the selected
dedicated Linux workspace host and the separate bounded executor.

These container checks improve supply-chain and runtime evidence; they do not
prove filesystem/PID/network isolation or certify a production host.
The sandbox smoke test retains only CHOWN, SETUID, SETGID and SETPCAP for its
root-starting entrypoint and checks that a child drops its IDs and capabilities.
The autonomous smoke test still drops all capabilities. Sandbox health alone
does not establish that its network-isolation probe succeeded or permit sessions.

## Verification

Before this update, the latest branch CI was green for:

- `Railway startup verification`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45234836572
- `Bounded OMNI Linux isolation`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45234836576

The implementation commit `37296e0` passed:

- `Railway startup verification`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45238261235
- `Bounded OMNI Linux isolation`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45238261022

The earlier head `fed8156` passed:

- `Railway startup verification`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45238817003
- `Bounded OMNI Linux isolation`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45238816903

An earlier synchronization/merge run for `2351922` reported
`action_required`; it was superseded by the passing final-head runs above.

The parent head `c4e6a96` passed its automatically triggered checks:

- `Railway startup verification`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45239289174
- `Bounded OMNI Linux isolation`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45239289138

These are historical parent-head results, not evidence for later commits. Check
the current PR head's runs before any review or release decision. Opt-in image,
namespace and cgroup diagnostics skipped in the normal PR run are not host
passes.

Local verification after each commit should include:

```sh
bun install --frozen-lockfile
node --test tests/omni-sandbox-mothership-gate.test.mjs
bunx tsc --noEmit
bun run test
bun run test:railway
docker build --pull --tag omni-sandbox:pr services/omni-sandbox
docker build --pull --tag omni-autonomous:pr services/omni-autonomous
```

Local results for this update:

- Current isolated worktree, Node 26: the normal Vitest suite passed **1,420**
  tests; **23 skipped** (nine Linux/systemd lifecycle cases and 14 historical
  host-only containment/supervisor cases). The Linux PR workflow is responsible
  for executing those host fixtures.
- The portable executor/decision/lease suites also passed **27** tests under
  standalone `node --test`. Additional security/isolation suites passed **22**
  and skipped **27** Linux-only cases on macOS.
- Disposable local SQL passed **164 activation**, **36 safety** and
  **47 approval** checks. The local fixture used a private Unix socket, not a
  hosted database.
- Cross-repository tests using the CI-pinned Jackboy and OMNI sources passed
  **20** TLS/dispatch, **27** protocol/Go interop and **1** cross-system Stop
  test, with synthetic credentials and isolated databases.
- Type-check, changed-file lint, the default build and Railway startup build
  plus its **2** listener tests passed. Local runs excluded the tracked `.env`
  and inherited no production credentials.
- Repository-wide lint passed with **14 warnings** after excluding only local
  validation fixtures from the isolated worktree.
- `node --test tests/omni-sandbox-mothership-gate.test.mjs tests/omni-sandbox-coordinator-gate.test.mjs`: passed 11 tests.
- `bunx tsc --noEmit`: passed.
- `bunx eslint tests/omni-sandbox-mothership-gate.test.mjs`: passed.
- `bun run test:railway`: passed build and startup smoke test.
- Workflow YAML parse: passed.
- Docker daemon verification: blocked locally because `/Users/omertarow/.docker/run/docker.sock`
  is unavailable. The new CI job performs synthetic no-network/container-hardening checks.
- A container image smoke failure found and is addressed by copying the sandbox
  nonce reconciler and worker modules into the runtime image. The new CI run
  must pass again before readiness can advance.
- The sandbox container smoke additionally verifies the child privilege drop;
  passing health alone does not establish isolation readiness.

## Remaining blockers

- Reference image checks do not certify the selected host; workspace execution
  in Docker remains unsupported.
- Bubblewrap, AppArmor, seccomp, UID/GID mapping and descendant cancellation
  CI evidence is experimental, not proof satisfying the deployment gates.
- Live RLS/audit, production monitoring, Vultr isolation and backup/restore
  verification are deployment-gated and remain unverified. They require
  separate owner authorization and the evidence listed in the architecture
  document.
- No live Railway, Vultr, database, provider credential or production secret
  verification was performed. The actual live executor host and deployed
  identity remain unresolved.

## Rollback

Do not deploy or change the external runtime. To remove this implementation:

```sh
git revert <container-hardening-commit>
git push origin HEAD:docs/enterprise-fusion-reliability-plan-20261123
```

If a container image was built locally, remove it only from the local Docker
daemon; this does not affect GitHub, Railway or Vultr:

```sh
docker image rm omni-sandbox:pr omni-autonomous:pr
```
