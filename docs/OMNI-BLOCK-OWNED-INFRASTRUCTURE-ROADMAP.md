# OMNI Block — owned-infrastructure roadmap (expanded read adapter implemented; live acceptance pending)

## Expanded Developer Center gateway (2026-11-28, preview only)

- Owner reports all 10 Omni-Staging live tests passed for GET inventory plus `omniblock/{repo}` branches, commits, pulls, issues, releases and tags. This is owner-provided infrastructure evidence; it is not an independently observed Evolution gateway test.
- All seven corresponding sections now use the existing four server-side settings and exact HTTPS gateway, Bearer + Cloudflare service authentication, GET only, refused redirects, bounded replies/timeouts and existing owner/MFA/inventory checks. No `FORGEJO_GATEWAY_READ_ROUTES` setting is required for these reviewed routes; declarations cannot activate Actions or any extra route.
- Added protected `/tags`. Repository/provider selection is URL-bound, retained across developer navigation, and automatically reads each supported section. Feature paging is 50 records/page, at most 20 pages, with local filtering, bounded independently scrollable tables, loading/error/empty/refresh states and stale-result isolation.
- Verification: 1,670 automated tests passed / 23 environment-specific skips; 128 focused existing adapter/auth/routing tests and three new synthetic UI tests included. Preview build OK; changed-file lint clean. Twelve destinations traversed in signed-in Chromium; desktop 1911×1068 and mobile 390×844 have one console, no horizontal overflow/page errors, retained repository selection and mobile drawer closure. Synthetic transport/auth tests are not live evidence.
- Independent live GET checks remain pending: restored owner test session returns unknown assurance / owner not confirmed and zero inventory options; protected reads refuse before external requests. No active user preview viewer was available; configured credential names were confirmed but values were neither fetched nor exposed. No security bypass or unauthenticated diagnostic endpoint was introduced.
- Unsupported Forgejo Actions needs an approved Actions-runs GET route and configured service; environments a reviewed inventory endpoint; packages scoped registry reads; code search an approved index/read service; wiki scoped content reads. Writes need their separate reviewed mutation/grant/audit contract. Timer/sync integrity and isolated recovery remain Phase 3 gates.
- Single next owner action: in the authenticated owner preview, open `/repositories`, then choose a repository and visit Branches, Commits, Pull Requests, Issues, Releases and Tags to complete positive live read acceptance (use existing two-step verification if the page requests it). No new credentials or publication needed.
- Detailed evidence and rollback baseline `28a92e0`: `docs/EXPANDED-FORGEJO-GATEWAY-2026-11-28.md`.

## Phase 2C (2026-11-28, preview implemented; integrity/recovery acceptance pending)

- Owner reports all 38 private repos displayed after Phase 2B. Read-only manual audit now compares original-source mapping, default branch/head and accessible branches/tags to OMERTA-ROW via existing authenticated gateways, with bounded metadata, no redirects/writes, downloadable per-repo evidence and explicit unavailable results.
- 69 focused app tests and 11 Python verification tests pass. Actual GitHub inventory probe returns HTTP 200; restored preview owner session still lacks MFA, so actual all-38 comparison remains pending. Local encrypted snapshot/SQLite/ref readback works; sandbox Git fsck and real host recovery remain unverified.
- Consolidated unprivileged host diagnostic and separate approval-gated snapshot backup / isolated restore scripts are in `deploy/evolution-git/verification/`; actual unit identity, recent per-repo sync receipts, consistent/off-host backup and 38-repo application restore proof remain pending. No host script or configuration changed.
- Phase 3 remains gated. Full results, discrepancies limitations, reproduction, single owner evidence-review action and rollback: `docs/PHASE-2C-INTEGRITY-RECOVERY-2026-11-28.md`.

## Phase 2B gateway authentication (2026-11-28, preview only)

- All four setting names are confirmed configured: `FORGEJO_BASE_URL`, `FORGEJO_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`. Values were not inspected or exposed.
- Adapter uses only `https://git-api.evoomni.tech/api/v1/user/repos?page=N&limit=50` GET, `Authorization: Bearer` gateway key, `CF-Access-Client-Id`, `CF-Access-Client-Secret`, `User-Agent: Evolution-OMNI-Gateway/1.0` and `Accept: application/json`. Redirects are not followed; each read has a 15-second timeout.
- Existing owner/verified-email/MFA authorization and private no-store responses remain. No repository writes, autonomous execution or agent grants.
- Owner reports external HTTP 200 with 38 private repositories. This is owner-provided gateway evidence, not yet a Mothership live-list acceptance pass: the available restored owner session is refused by the existing two-step check before gateway access.
- 45 focused tests passed (23 adapter/server-boundary tests plus owner and site-link regressions); synthetic tests are not live connection evidence. Preview build OK; changed TypeScript lint and diff checks clean. Desktop/mobile show the truthful MFA refusal, one live space canvas and no mobile horizontal overflow.
- Remaining owner step: complete two-step sign-in in preview, open `/repositories`, click Refresh and confirm 38 private rows. No missing credentials were found. Hash comparison, hourly timer verification, backup restore and agent read grants remain separate future acceptance work.
- Full evidence and rollback: `docs/PHASE-2B-FORGEJO-REVIEW-2026-11-28.md`.

## Phase 2A (implemented in preview, read-only)

- `src/lib/forgejo.ts`, `src/lib/forgejo.functions.ts`, `src/components/evolution/ForgejoRepos.tsx` on `/repositories`.
- Owner + two-step check (`requireRazulOwner`), `Cache-Control: private, no-store`, GET-only paginated `/api/v1/user/repos`, dedupe by repository id, `redirect: "manual"`.
- Shows name, privacy, default branch, mirror sync time (or "Sync not reported"), last update; honest states: not configured (names missing settings), invalid address, refused token, unreachable.
- Tests: `src/lib/forgejo.test.ts` (missing settings, localhost/http refused, pagination/dedupe/GET only, refused token never succeeds).
- Historical Phase 2A blocker: gateway settings were absent and Forgejo listened only on Omni-Staging localhost. Phase 2B now uses the configured private gateway; positive owner UI acceptance remains pending MFA.
- The hourly timer's 38 syncs are host-side; Forgejo's API does not expose them unless repos are mirrors. Independent GitHub↔Forgejo hash comparison is deferred.

## Secure network requirement (owner action)

1. Keep Forgejo bound to `127.0.0.1:3000`; no public port.
2. Run an outbound-only gateway on Omni-Staging (e.g. Cloudflare Tunnel, free) to a dedicated hostname, e.g. `git-api.evoomni.tech`, exposing only `/api/v1/*` GET.
3. Protect it with Cloudflare Access service-token authentication and a separate Bearer gateway key. Keep the upstream Forgejo credential on the gateway, scoped to a dedicated read-only account; the Mothership key is the gateway key, not a direct Forgejo token.
4. The four settings listed above are configured. Keep `FORGEJO_BASE_URL` exactly `https://git-api.evoomni.tech`; enforce GET-only routes at the gateway as well as the adapter. Do not expose Forgejo port 3000 publicly.

## Agent read scopes (prepared, not granted)

OMNI, Jackboy and Razul get `evolution-git:read` only after a reviewed server route reuses the existing OMNI API key / delegation checks. No agent can write.

## Dependency inventory

| Dependency                                 | Status                                                                                               | Owned/rented/external           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| Lovable Cloud (database, auth, storage)    | live                                                                                                 | rented                          |
| Lovable hosting/publishing, Worker runtime | live                                                                                                 | rented                          |
| Lovable AI Gateway                         | live                                                                                                 | external                        |
| Anthropic Claude                           | key saved                                                                                            | external                        |
| GitHub (OMERTA-ROW, connector)             | live, upstream                                                                                       | external                        |
| Forgejo on Vultr Omni-Staging              | owner-reported 38 private repositories; expanded preview reads wired, independent acceptance pending | owned software on rented server |
| Railway (Jackboy runner)                   | in use by Jackboy                                                                                    | rented                          |
| Vultr                                      | server in use, no API key here                                                                       | rented                          |
| Squarespace DNS (evoomni.tech)             | live                                                                                                 | rented                          |
| Jackboy Dev Control / OMNI apps            | Lovable projects                                                                                     | rented hosting                  |

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
