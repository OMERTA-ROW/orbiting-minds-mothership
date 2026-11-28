# Phase 2B Forgejo gateway review — preview only

## Delivered

- `src/lib/forgejo.ts`: exact origin/root allowlist, Bearer gateway key, both required Cloudflare Access headers, requested User-Agent and Accept, GET only, no body, refused redirects, 15-second per-request deadline. Existing bounded pagination (50 rows/page, 20 pages) and immutable-ID deduplication preserved; no fixed repository count or sample data added to the interface.
- `src/lib/forgejo.functions.ts`: reads all four secrets only inside the existing authenticated handler, after verified owner/MFA validation. Private no-store result; credentials never returned.
- `src/components/evolution/ForgejoRepos.tsx`: invalid configuration names the exact permitted gateway root. Existing real repository table and manual Refresh remain; no writes or new idle timers.
- `src/lib/forgejo.test.ts`, `src/lib/forgejo.functions.test.ts`: allowlist, headers, GET-only pagination, 38-row synthetic fixture, missing settings, redirects, error responses, malformed success payloads, redacted failures and owner refusal before fetch.
- `src/lib/AGENTS.md`, `roadmap.md`, `docs/OMNI-BLOCK-OWNED-INFRASTRUCTURE-ROADMAP.md`: contract and evidence updated. This review is the additional changed file.

## Actual connection evidence

| Check | Result |
|---|---|
| Four configured secret names | Confirmed by secret-name inventory; no values inspected |
| External gateway HTTP 200 / 38 private repositories | Reported by owner; not independently repeated through this app |
| Actual signed-in preview `/repositories` | Owner session restored; existing MFA check refuses before outbound listing |
| 38 real rows displayed in Evolution | **Not verified; blocked on owner completing two-step sign-in** |
| Owner-only security preserved | Real preview refusal plus isolated handler regressions |
| Interface/space preservation | Desktop/mobile screenshots inspected; one live canvas, no desktop page errors, no mobile overflow |

No public diagnostic endpoint, auth bypass, injected repository response or mocked browser listing was created to manufacture a pass.

## Tests

`bunx vitest run src/lib/forgejo.test.ts src/lib/forgejo.functions.test.ts src/lib/razul-eye.test.ts src/test/site-links.test.ts`

**45 passed:** 21 pure adapter tests, 2 mocked authenticated-handler tests, 13 owner tests, 9 site-link tests. Unit fixtures are synthetic and are not live gateway proof. Changed TypeScript ESLint and `git diff --check` passed. Preview compilation reported **build OK** at 2026-11-28 02:34:08 UTC; no manual production build or deployment was run.

Real browser check: desktop 1280×1800 and mobile 390×844; MFA refusal shown, live scene retained. Initial element screenshot timed out waiting for animated layout stability; repeated viewport screenshot checks completed successfully. No claim of positive repository end-to-end acceptance.

## Owner action and remaining blockers

Complete two-step sign-in **in preview**, then open Repositories and click Refresh. The list must show 38 actual private repositories without truncation; if authentication is refused, review the Cloudflare Access service-token policy and gateway Bearer key using secure settings, never chat. No credential names are missing.

Keep the tunnel outbound-only, upstream Forgejo localhost-only, TLS validated, gateway read-only and upstream reader least-privilege. Gateway/host policy details were not independently inspected. Repository content/hash comparison, hourly sync timer receipts, backups/restore, agent read grants, repository writes and executor readiness are not verified or enabled by this listing change.

No new server, subscription, paid AI request, purchase, production migration, secret change, repository write, autonomy activation or publication. Ordinary existing gateway/hosting request costs are not measured; no savings claim.

## Commit and rollback

The implementation/review commit is recorded by the final Git save and chat reference. Rollback baseline: the parent commit of that Phase 2B commit (inspect `git show --no-patch <phase-2b-commit>`). On the preview branch only, use `git restore --source=<phase-2b-commit>^ --` for the seven pre-existing changed files listed above; delete the two newly added files `src/lib/forgejo.functions.test.ts` and this review, then make a normal rollback commit. Do not reset history or publish. Secrets and infrastructure were unchanged; no database rollback is needed.