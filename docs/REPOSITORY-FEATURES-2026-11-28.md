# Developer navigation and provider reads — preview only

## Implemented

All Developer Center destinations now navigate: Repositories, Pull Requests, Issues, Branches, Commits, Actions, Releases, Environments, Packages, Code Search, Projects, Wiki, Security and Settings. Seven new protected routes cover Issues/Branches/Commits/Environments/Packages/Code Search/Wiki. Existing routes and project/approval/terminal controls are preserved; Actions/Pull Requests retain their earlier project configuration beneath an expandable section. Releases preserves its earlier browser-record download.

Shared repository view selects the actual provider and authorized repository, manually reads paginated real records, filters returned records, and shows checked time, identifier/state and explicit failures. No idle polling, mock records or AI calls.

Forgejo: exact `https://git-api.evoomni.tech`, GET only, Bearer gateway key, both Cloudflare Access headers, requested User-Agent and JSON Accept. Reads implemented for pulls, issues, branches, commits, Actions runs and releases. Existing integrity adapter is unchanged. Each feature is **implemented but live-unverified**: successful repository listing does not prove feature endpoint availability.

GitHub: existing CryptoGoochi workspace connector only, through its gateway; owner/MFA and fresh OMERTA-ROW inventory membership checked before every feature read. Pulls/issues/branches/commits/Actions/releases/environments and bounded, repository-fixed code search implemented. No token or credential reaches browser code. Queries cannot inject another organization/repository scope.

True black (`oklch(0 0 0)`, equivalent to #000000) base and panel tokens, gold accents and existing moving starfield retained.

## Actual evidence

- Three read-only calls using CryptoGoochi's GitHub API returned HTTP 200: OMERTA-ROW inventory (one-row probe), `task-dashboard` branches (real SHA `53f6e25af33e9169cc858f181e6ef30477821281`) and pulls (real open PR #17). This proves these connector reads only, not all private repository access, Forgejo endpoint support or write permission.
- Four Forgejo/Access secrets and linked GitHub connector configuration are present by name. No secrets were printed or changed.
- Browser: all 13 requested developer/project/security/settings destinations render one console, zero horizontal overflow and no page errors at desktop 1440×1000; navigation to Branches works. Mobile 390×844 drawer-to-Wiki closes, correct full-width repository selector verified, no overflow. Body black token verified.
- Restored owner session lacks required MFA: both provider inventories correctly refuse access. **Positive authenticated feature readback remains unverified**; no mock records or bypass were used. Owner-reported 38 Forgejo mirrors is prior evidence, not reverified here.
- Final full suite: **1,656 passed / 23 environment-specific skipped, 131 passing files / 3 skipped**. New mocked transport/compiled-handler tests: **39 passed** for scope injection, origin/headers/GET/no redirects, page/reply bounds, parsing, redaction, owner/MFA ordering and repository membership. These are synthetic unit tests, not live service acceptance.
- Changed-file lint clean; latest harness preview **build OK**. No deployment/publication, provider write, production migration, new service or agent activation.

## Blocked and next action

- Repository writes on either provider remain unavailable: missing separately reviewed, per-repository mutation grant, fresh-MFA/Stop checks and durable approval/audit contract. GitHub connector authorization is not permission to silently modify upstream. No unsafe partial write path was added.
- Packages and Wiki: no reviewed scoped provider endpoints/inventory; no grants inferred. Forgejo Environments/Code Search also unverified/unimplemented; use GitHub's implemented read option where provider permits. A returned HTTP denial is surfaced rather than bypassed or retried against another origin.
- Actions records do not prove an isolated executor, running jobs or approval. Existing execution/permit controls remain unchanged and gated.
- **Single next owner action:** confirm a fresh authenticator code in Account Security, then select an authorized repository and use Read records to collect real endpoint evidence. Write enablement remains a separate reviewed contract decision; do not widen the existing Forgejo GET-only policy.

## Changes and rollback

`src/lib/repository-features{,.functions,.server}.ts`, three associated test files, `src/components/evolution/RepositoryFeatures.tsx`, console navigation, root workspace classification, seven protected route leaves, Actions/Pull Requests/Releases presentation, neutral black panel token, generated route tree, root architecture note and roadmap. No stored data was reset.

Baseline `5570a5d`. Restore only changed files from that commit and commit the restoration after review; do not reset data or repository history. The implementation commit is the commit containing this report. Preview only.