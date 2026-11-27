# Neuro Intelligence — private Mothership increment

Implemented 2026-11-27 UTC; not published or deployed. This is a persisted metadata registry, not installation of the inaccessible Neuro foundation or an inference/learning system.

## Owner controls

- `/neuro` belongs to the existing authenticated Evolution workspace and uses its unchanged CyberLink live scene. Public landing page untouched.
- **Register ecosystem** is an explicit owner action, not page-load seeding. It idempotently creates distinct OMNI, CODE, Jackboy, Evolution, Razul Central Intelligence, Guardian, JAX, Hercules, Cyberlink, Honeycomb, Legacy, X-Federal and Neuro pathways, plus entries from the owner's existing project directory. New components can be added with unique keys.
- Knowledge, reasoning, memory boundaries, learning policy, evaluations, version and evidence are owner-authored profile notes. Empty means not recorded; no fabricated findings, memory contents or evaluations.
- Proposals are immutable and inactive. Database SHA-256 integrity checks and a separate owner-recorded scope review precede approval. Approval changes only the active registry profile.
- Rollback can restore only a different previously approved profile. It does not roll back repository code, infrastructure or external services.
- Component locking and expected active revision refuse stale concurrent actions. Reviews are append-only with exact revision and prior revision.
- Read and action paths validate the verified owner and aal2; private no-store responses; owner-scoped RLS; no anonymous reads or direct authenticated table writes. Existing `requireRazulOwner` is reused as the owner identity boundary, not a grant to Razul agents.
- Autonomy is false by database constraint. Integration status is `not_connected` by database constraint. No Neuro adapter, network calls, model calls, jobs, memory reads or permission mutations are introduced.

## Foundation and connections

Reference: https://github.com/OMERTA-ROW/Neuro-Intelligence/pull/1

Read through **CryptoGoochi's GitHub API** returned HTTP 403: OMERTA-ROW restricts third-party OAuth application access. No PR source, reviewed commit, implementation details or merge status could be verified; no foundation code was copied. To reconcile, the organization must authorize the existing GitHub connection, or the owner can upload PR #1's source/diff and exact commit.

Actual new connection: the registry persists in this project's existing Lovable Cloud database. There are **no new external or agent connections**. Existing OMNI Terminal, Razul Observatory and My Projects destinations were verified in this checkout and linked as navigation only. Other ecosystem profiles have no verified destination linked. Razul's own controls, permissions, source records and Guardian/Jackboy gates remain unchanged; no agent review is implied by owner notes.

## Verification and remaining blockers

- `bunx vitest run src/lib/neuro.test.ts src/lib/evolution.test.ts src/lib/razul-eye.test.ts src/test/site-links.test.ts`: **57 passed**.
- `nix shell nixpkgs#postgresql_17 -c python3 src/test/test_neuro_registry_sql.py`: **61 real disposable SQL checks passed**, covering owner/MFA/unverified-email/other-user denial, registry deduplication and extension, distinct required pathways, immutable history/digest, review-before-approval, approved-only rollback, stale writes and a real concurrent approval race, autonomy off and forbidden connected status.
- Changed Neuro file ESLint passed. Latest harness preview: build OK. All 91 content route files inspected have leaf heads; new `/neuro` has unique title/description/OG and noindex.
- Signed-in Playwright at desktop and 390×844: current owner session lacks aal2 and correctly receives the private-access refusal; Retry preserves refusal, Account Security opens, mobile Neuro navigation works, no overflow and no page errors; live canvas renders and reduced-motion removes it. Signed-out `/neuro` redirects to `/auth`; public landing remains Evolution with no Neuro registry exposed.
- Hosted read-only verification confirms 0079–0080 objects installed, anonymous reads denied, direct authenticated inserts denied, and **zero profiles** before the owner's explicit registration. No demo records were created in the project database.
- **Not verified:** positive owner browser registration, editing, approval/reload and rollback, because the available owner session has no aal2; isolated SQL success is not substituted for this check.
- **Blocked:** PR #1 reconciliation needs authorized organization access or supplied source; active Neuro/Razul/other ecosystem data exchange needs a reviewed adapter and separate scoped grants. No permissions were broadened to overcome either blocker.

## Files

- `src/lib/neuro.ts`, `neuro.functions.ts`, `neuro-query.ts`, `neuro.test.ts`
- `src/components/evolution/NeuroRegistry.tsx`
- `src/routes/_authenticated/neuro.tsx`
- `src/lib/evolution.ts` (owner navigation), `src/routes/__root.tsx` (shared interior inclusion only)
- `drizzle/migrations/0079_neuro_private_registry.sql`, `0080_neuro_registry_indexes.sql` and tool-generated journal/snapshots/types
- `src/test/test_neuro_registry_sql.py`, `src/lib/AGENTS.md`, `roadmap.md`, this report
- Automatically regenerated route tree and platform dependency lock refresh; no new application dependency.