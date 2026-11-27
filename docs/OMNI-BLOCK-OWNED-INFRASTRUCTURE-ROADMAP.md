# OMNI Block — owned-infrastructure roadmap (Phase 2A delivered, rest planned)

## Phase 2A (implemented in preview, read-only)
- `src/lib/forgejo.ts`, `src/lib/forgejo.functions.ts`, `src/components/evolution/ForgejoRepos.tsx` on `/repositories`.
- Owner + two-step check (`requireRazulOwner`), `Cache-Control: private, no-store`, GET-only paginated `/api/v1/user/repos`, dedupe by repository id, `redirect: "manual"`.
- Shows name, privacy, default branch, mirror sync time (or "Sync not reported"), last update; honest states: not configured (names missing settings), invalid address, refused token, unreachable.
- Tests: `src/lib/forgejo.test.ts` (missing settings, localhost/http refused, pagination/dedupe/GET only, refused token never succeeds).
- Not verified live: settings `FORGEJO_BASE_URL`, `FORGEJO_API_TOKEN` are not saved; Forgejo listens on Omni-Staging `localhost:3000`, which the app server cannot reach.
- The hourly timer's 38 syncs are host-side; Forgejo's API does not expose them unless repos are mirrors. Independent GitHub↔Forgejo hash comparison is deferred.

## Secure network requirement (owner action)
1. Keep Forgejo bound to `127.0.0.1:3000`; no public port.
2. Run an outbound-only gateway on Omni-Staging (e.g. Cloudflare Tunnel, free) to a dedicated hostname, e.g. `git-api.evoomni.tech`, exposing only `/api/v1/*` GET.
3. Protect it with an access policy (service token header) plus a Forgejo token for a dedicated `mothership-reader` user, scopes `read:repository` + `read:user` only.
4. Save `FORGEJO_BASE_URL` (https gateway) and `FORGEJO_API_TOKEN` in Project Settings → Secrets. If an access service token is used, a follow-up adds its header names.

## Agent read scopes (prepared, not granted)
OMNI, Jackboy and Razul get `evolution-git:read` only after a reviewed server route reuses the existing OMNI API key / delegation checks. No agent can write.

## Dependency inventory
| Dependency | Status | Owned/rented/external |
|---|---|---|
| Lovable Cloud (database, auth, storage) | live | rented |
| Lovable hosting/publishing, Worker runtime | live | rented |
| Lovable AI Gateway | live | external |
| Anthropic Claude | key saved | external |
| GitHub (OMERTA-ROW, connector) | live, upstream | external |
| Forgejo on Vultr Omni-Staging | running, not linked | owned software on rented server |
| Railway (Jackboy runner) | in use by Jackboy | rented |
| Vultr | server in use, no API key here | rented |
| Squarespace DNS (evoomni.tech) | live | rented |
| Jackboy Dev Control / OMNI apps | Lovable projects | rented hosting |

## Staged migration (each stage keeps current apps working)
- 2B: verified read link (gateway + secrets), hash comparison of GitHub vs Forgejo heads, branches/tags, backup restore drill.
- 3: native repos: create/configure, file browser, branches, commits, diffs, pull requests in Forgejo; per-project GitHub/Evolution source switch (read source only).
- 4: controlled bidirectional sync: owner-approved, conflict detection (diverged heads block), no force push, automatic enrollment of new repos.
- 5: isolated runner on separate host (not the Git host): disposable containers + disposable PostgreSQL, no network except allowlist, log redaction, spending caps, Emergency Stop, MFA approvals, results verified from artifacts.
- 6: AI app builder: prompt-to-code through OMNI/CODE, editor, previews, builds/tests, terminal; Jackboy repair/update PRs needing owner approval.
- 7: platform services: managed PostgreSQL, auth, secrets vault, artifact registry, deployment/rollback, domains/TLS, logs, monitoring, backup/restore, provider adapters, portable exports.
- 8: optional move of current apps off rented services, one at a time, with rollback.

## Never in this phase
Repository writes, bidirectional sync, autonomous execution, production changes, publishing.
