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

These container checks improve supply-chain and runtime evidence; they do not
prove filesystem/PID/network isolation or certify a production host.

## Verification

Before this update, the latest branch CI was green for:

- `Railway startup verification`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45234836572
- `Bounded OMNI Linux isolation`: https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/45234836576

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

## Remaining blockers

- Docker/Moby and production host isolation must be verified independently.
- Bubblewrap, AppArmor, seccomp, UID/GID mapping and descendant cancellation
  evidence is experimental and not a production runtime gate.
- No live Railway, Vultr, database, provider credential or production secret
  verification was available.
- Repository-wide lint has a documented formatting baseline that remains to be
  remediated by the repository owner.
- Release rollback, live health and RLS/audit behavior require explicit owner
  authorization after a separate deployment.

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
