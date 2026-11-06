# Railway production startup

## Reproduced root cause

At base commit `af67266cebd4dd141ad28dfebd258379f5425486`, `bun run build`
successfully produced `.output/server/index.mjs`, but `.output/nitro.json`
identified it as **cloudflare-module**. Running that artifact with Node exited
**0** immediately, with zero output and no persistent HTTP listener. It exports
a Worker fetch handler, not a Node server. There was no `start` script or tracked
Railway, Nixpacks, Dockerfile, Procfile or GitHub Actions configuration.

This reproduces a startup failure mode; it is not evidence of Railway's actual
effective command, deployed SHA or process exit history. A successful build or
"Starting Container" message alone does not establish a running service.

The fix follows [Jackboy Dev Control PR #28](https://github.com/OMERTA-ROW/jackboy-dev-control/pull/28)
but tests Mothership's actual routes, SVG favicon and authentication contract.
`vite.config.ts` and `src/server.ts` are unchanged: the custom catastrophic SSR
error wrapper and `wavefile` SSR bundling remain in place.

## Exact Railway configuration for owner review

| Setting                      | Value                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| Repository root              | Repository root, not `cli/`                                       |
| Install                      | `bun install --frozen-lockfile` including build/dev dependencies  |
| Build command                | `bun run build:railway`                                           |
| Start command                | `bun run start`                                                   |
| Equivalent start             | `NITRO_HOST=0.0.0.0 node .output/server/index.mjs`                |
| Runtime mode                 | `NODE_ENV=production`                                             |
| Runtime                      | Node 24 (hosted verification target), Bun 1.4.4 for build/scripts |
| Port                         | Railway's supplied `PORT`, not a fixed port                       |
| Optional startup healthcheck | `/favicon.svg` (static/listener readiness only)                   |

`build:railway` selects `NITRO_PRESET=node-server` at **build time**. Setting
that variable only at runtime cannot convert a Worker artifact. Confirm the
metadata reports `node-server` before publishing. Retain the complete `.output`
directory, including `server` and `public`, in the runtime image. The artifact is
the application, not the separate Go CLI or an integration bridge.

`start` binds all IPv4 interfaces. Nitro reads `NITRO_PORT` before `PORT`, so
do not set a conflicting `NITRO_PORT`, `NITRO_UNIX_SOCKET` or service-domain
target port. Railway terminates TLS; Nitro's development TLS options are not
required. Use a long-running web service, not a one-shot or cron service.

Do not copy `LOVABLE_SANDBOX=1` or `DEV_SERVER__PROJECT_PATH` into Railway:
the installed Lovable wrapper ignores `NITRO_PRESET` in its sandbox.
The existing default `build`, `dev` and `preview` scripts remain unchanged for
Lovable. Do not use `vite dev` or `vite preview` as the production start command.

No live Railway setting, secret, domain, integration, cron or deployment is
changed by this PR. Apply configuration only after owner review and separate
deployment authorization.

## Automated and manual verification

```sh
bun install --frozen-lockfile
bunx tsc --noEmit
bunx eslint tests/railway-start.test.mjs src/test/server-entry.test.ts
bun run test
bun run test:railway
```

`test:railway` builds the Node artifact and checks actual startup on an ephemeral
`PORT`, static SVG byte equality, HTML homepage content and continued process
liveness. It checks missing/malformed credentials on `/api/public/omni/health`
and `/api/public/omni/jobs` return **401** with `Cache-Control: no-store`, without
calling the database or enabling OMNI. The unconfigured knowledge cron returns
**500** ("Server configuration error"), not success or a dispatched job.
The child process inherits no provider keys, cron secret, service-role key or
integration grants and is terminated after verification.

Four application tests separately preserve the existing SSR wrapper contract:
successful responses and intentional API errors pass through; thrown errors
and swallowed h3 failures produce safe HTML without exposing diagnostics.

On local Node 26, the unchanged jsdom suite collides with Node's experimental
global Web Storage (75 failures before this repair). To use jsdom's own storage:

```sh
NODE_OPTIONS=--no-experimental-webstorage bun run test
```

This produced **1,263 passed, zero failed/skipped**, including the four added
SSR tests. No production runtime flags or application assertions were changed.
Hosted CI runs the ordinary suite on Node 24 and must be checked separately.

For manual inspection after `bun run build:railway`:

```sh
cat .output/nitro.json
NODE_ENV=production PORT=8080 bun run start
# Second terminal:
curl --fail http://127.0.0.1:8080/favicon.svg -o /dev/null
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/api/public/omni/health
```

Expect a sustained listener, asset/homepage **200**, and unauthenticated API
**401**. Stop the local process after inspection.

## Security and release blockers

- Dependency remediation updates the affected packages and migrates the
  application schemas to Zod 4. `bun audit` now reports **zero vulnerabilities
  across 851 packages**. The pre-fix advisory paths, their production exposure
  assessment and patched versions are documented in
  [DEPENDENCY-SECURITY.md](DEPENDENCY-SECURITY.md). No advisory is suppressed.
- Full repository lint remains **FAIL** at **5,902 errors and 35 warnings**.
  All remaining errors are Prettier findings; all warnings are
  `react-refresh/only-export-components`. The baseline was 6,196 errors and 35
  warnings. Touched files are formatted and their targeted lint passes; the
  unrelated formatting baseline is not hidden or disabled.
- The new read-only PR workflow runs app/types/build/startup checks, full lint
  and dependency audit as separate jobs. The app/type/build/startup and
  dependency checks pass locally; the repository-lint job will remain red on
  the documented formatting baseline until that baseline is remediated.
  Actions are SHA-pinned; no production secrets, write permissions, dispatch
  or deployment steps.
- [Tracked environment audit](ENVIRONMENT-AUDIT.md): only public Supabase
  configuration was found; no credential rotation or history rewrite was
  performed. Removal from tracking is a separate owner decision.
- No authenticated live Railway access was available. Owner must verify the
  effective build/start commands, artifact/deployed SHA, port/domain, restart
  history, homepage, authenticated user access, RLS and audit behavior after an
  authorized deployment. Static readiness and local tests cannot prove these.
- Do not enable cron, integrations, provider access or autonomous execution as
  part of this startup repair. Database migrations and production rollback
  verification remain outside this PR.

Production readiness remains **BLOCKED** pending updated hosted CI, review of
the remaining repository formatting baseline and authorized live Railway
verification.
References: [Railway start command](https://docs.railway.com/deployments/start-command)
and [Nitro Node deployment](https://nitro.build/deploy/runtimes/node).
