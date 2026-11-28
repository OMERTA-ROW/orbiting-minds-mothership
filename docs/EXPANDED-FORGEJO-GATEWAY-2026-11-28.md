# Expanded OMNI Block Forgejo gateway — preview review

## Delivered

- Seven sections: `/repositories`, `/branches`, `/commits`, `/pull-requests`, `/issues`, `/releases`, new protected `/tags`.
- Existing credentials: `FORGEJO_BASE_URL`, `FORGEJO_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`; all names confirmed configured, values not read. Fixed `https://git-api.evoomni.tech`, required Bearer/Cloudflare service headers, exact User-Agent/Accept, GET-only and no redirects retained.
- Removed obsolete list-only feature-setting blocker for the six owner-confirmed repository GET routes. Forgejo namespace restricted to `omniblock/` and every read still checks current authorized inventory after owner/MFA authorization. No runtime declaration enables other routes.
- Repository selection is shared in validated URL search across sidebar navigation and inventory-to-Branches links. Automatically reads the active section; cache identity includes owner/provider/repository/feature/page/search. Switching selection never displays the previous repository's results.
- Full authorized inventory searchable, scrollable picker; independently scrolling sticky-header results; 50 records/page, max 20 pages; explicit loading/empty/error states, refresh and next/previous; respects pagination Link evidence without following links. Commit dates parse actual nested provider dates.
- Existing upstream integrity audit, release browser-record downloads and project configuration disclosures preserved. Black/metallic gold and moving scene unchanged.

## Actual verification

| Check                                        | Result                                                            | Evidence type                                 |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Full app suite                               | 1,670 passed / 23 environment-specific skipped; 132 passing files | Automated, includes synthetic transports/auth |
| Focused adapter/auth/routing suite           | 128 passed (included in full count)                               | Synthetic unit/regression                     |
| New automatic read/selection/Tags page tests | 3 passed (included in full count)                                 | Mocked auth and gateway; not live             |
| Preview build                                | build OK                                                          | Harness compiler output                       |
| Changed-file lint and diff check             | clean                                                             | Static checks                                 |
| Twelve Developer Center routes               | one console, correct title, no overflow/page errors               | Real signed-in browser rendering              |
| Desktop/mobile                               | 1911×1068 / 390×844; retained selection, drawer closes            | Real browser and inspected screenshots        |
| Four credential names                        | configured                                                        | Secrets names listing only                    |
| Owner's 10 gateway tests / 38 private repos  | reported by owner                                                 | Not independently reproduced                  |
| Independently requested remote endpoints     | **Pending: no successful gateway requests made this turn**        | Owner/MFA refusal precedes gateway; no bypass |

The restored browser test session showed unknown assurance / owner not confirmed and zero repository options. Existing global bearer attachment and owner check were inspected and preserved. A read-only attempt to inspect the owner's current preview returned no active viewers; no credential/storage inspection occurred. Neither automated fixtures nor route rendering prove real API readback. Real repository records, empty pages, endpoint paging and refresh still need positive owner acceptance.

## Unsupported capabilities

- Forgejo Actions: reviewed `GET /api/v1/repos/omniblock/{repo}/actions/runs` route plus configured Actions service; GitHub provider retains existing Actions reads.
- Environments: scoped environment inventory endpoint.
- Packages: registry-specific read scope and approved endpoint.
- Code Search: approved repository-scoped index/search endpoint; no index upload added.
- Wiki: approved scoped wiki content read endpoint.
- Writes: separate reviewed mutation contract, repository grants, fresh MFA, branch approvals, Stop/caps and durable audit. MFA alone grants no writes.
- Agent read grants, timer receipts, real upstream integrity and isolated restore acceptance remain separate; Phase 3 not released.

## Changed source

`src/lib/repository-features.ts`, `.server.ts`, `.test.ts`; `src/components/evolution/RepositoryFeatures.tsx`, new `.test.tsx`, `RepositoryPicker.tsx`, `ForgejoRepos.tsx`, `console/OwnerConsoleShell.tsx`, new `src/components/evolution/AGENTS.md`; `src/routes/__root.tsx`, new `_authenticated/tags.tsx`. Route tree regenerated automatically. Roadmap and this report updated. No schema or permission changes.

## Next action and rollback

Owner: open the verified preview `/repositories`, select a real repository, and visit the six corresponding read sections to complete live acceptance. Existing two-step verification may be requested; no new secret needed. Record actual endpoint results rather than treating this report as an external connection pass.

Rollback baseline: `28a92e0`. Revert the implementation commit with a new revert commit through repository review; do not reset shared history. No database, host configuration, schedule or credential rollback is needed. Nothing published/deployed, no paid service provisioned, no repository writes or autonomous activation.
