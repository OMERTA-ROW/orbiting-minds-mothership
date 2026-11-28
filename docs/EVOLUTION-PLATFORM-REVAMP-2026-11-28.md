# Evolution platform revamp — controlled first phase

Date: 2026-11-28  
Scope: existing Evolution / Orbiting Minds Mothership preview only. No publication, production deployment, paid infrastructure, real-money provider, autonomous activation or repository write was enabled.

## Implemented

### Workspace and navigation consolidation

- Separated Owner, Repository, Development, Infrastructure and AI/Agent navigation while preserving every existing route.
- Corrected misleading labels: Account Security, Project Configuration, Project Websites and Treasury now name their actual destinations.
- Preserved repository/provider selection in the service switcher, sidebar and Owner Home links. Repository page numbers reset to 1 when changing destination so a stale page cannot hide results.
- Collapsed the large repeated navigation groups into one closed-by-default All workspace tools section.
- Made unavailable Storage, Networking, Backups, Images, SSH Keys and Automation entries open the actual infrastructure setup section instead of presenting unexplained disabled destinations.
- Corrected Activation Approvals metadata and navigation text to include its separately confirmed activation controls without implying execution readiness.
- Consolidated cloud connection creation, checking and removal in Cloud Services. Projects retains cloud associations and links to the canonical manager instead of duplicating those controls.

### Owner-only internal Treasury ledger

The owner selected internal ledger only. No financial provider or real-money transfer path was added.

- Internal accounts start at zero units and have editable per-transfer and UTC-day limits.
- Opening allocations, internal income, expenses and transfers are prepared first; preparation does not change balances.
- Transfer recipients require exact-name verification.
- Posting requires exact amount confirmation and fresh authenticator verification (15 minutes), rechecked in the database.
- Posting atomically rechecks owner/AAL2, Emergency Stop, account status, recipient verification, limits and available units.
- Balanced append-only entries, pending/posted/cancelled history and append-only audit records are persisted.
- Idempotent request identifiers and replay-safe posting prevent duplicate entries.
- Direct browser writes to ledger entries and audit records are denied. Agents and OMNI API keys receive no Treasury-posting authority.
- Internal units are always distinguished from USD-reported OMNI usage, bank balances and provider invoices.
- Refresh controls perform real on-demand reads; failed owner checks do not retry indefinitely.

## Verification

### Application and contract tests

- Focused: 66 passed across internal-ledger rules, mocked owner/server authorization and routing.
- Full suite: **1,681 passed / 23 environment-specific skipped**, 134 passing test files and 3 skipped files.
- Changed-file lint: passed.
- Preview harness build: **build OK**.

### Real database acceptance, rolled back

**14 disposable checks passed** against the installed owner-only functions:

1. Account creation and owner association.
2. Unverified recipient refusal.
3. Incorrect recipient-name refusal.
4. Exact recipient verification.
5. Incorrect amount-confirmation refusal.
6. Balanced income posting and balance readback.
7. Balanced transfer posting and source/destination readback.
8. Idempotent replay with no duplicate entries.
9. Balanced expense posting.
10. Overdraft refusal after increasing the per-operation limit.
11. UTC-day limit refusal.
12. Direct entry-write refusal and truthful snapshot contract.
13. Emergency Stop refusal with no posted entries.
14. Stale authenticator refusal with no posted entries.

Each test ran in a transaction and rolled back. A follow-up read found no disposable account records. No scheduled job, provider or external account was called.

### Browser acceptance

Signed-in Chromium checks at desktop and 390×844 mobile:

- Treasury, Projects and Repositories rendered without page errors or horizontal overflow.
- Service switching from Branches to Development Workspace preserved `repoProvider=forgejo` and `repoName=omniblock/jackboy-dev-control`; page reset to 1 as intended.
- Storage opens `/cloud-services#infrastructure-setup`.
- Mobile drawer navigation to Developer Center worked and closed the drawer.
- Treasury rendered the internal ledger and separate OMNI usage sections.
- The available session was not the configured owner, so protected reads correctly returned actionable access errors instead of data. No mock rows were inserted and no positive owner UI write was claimed.

## Changed files

- `drizzle/migrations/0081_evolution_internal_treasury_ledger.sql`
- `drizzle/migrations/0082_evolution_treasury_destination_index.sql`
- generated migration snapshots/journal and `src/integrations/supabase/types.ts`
- `src/lib/evolution-treasury.ts`
- `src/lib/evolution-treasury.functions.ts`
- `src/lib/evolution-treasury.test.ts`
- `src/lib/evolution-treasury.functions.test.ts`
- `src/components/evolution/TreasuryLedger.tsx`
- `src/routes/treasury.tsx`
- `src/components/evolution/console/OwnerConsoleShell.tsx`
- `src/components/evolution/console/OwnerHome.tsx`
- `src/components/evolution/console/CloudServices.tsx`
- `src/components/evolution/ControlCenter.tsx`
- `src/components/nav-groups.ts`
- `src/routes/__root.tsx`
- `src/routes/activation-approvals.tsx`
- `roadmap.md`
- `completion-register.json`

## Remaining limitations and owner actions

- The owner should review Treasury in a fresh owner/AAL2 preview session: create a zero-balance internal account, verify a recipient, prepare an opening allocation, confirm it and reload the persisted history. The available test session could not perform this positive UI path.
- The broader document is not a claim that every existing route is now fully operational. Repository writes and unreviewed repository capabilities remain blocked on separately reviewed backend contracts and grants.
- Server/storage/network/image/SSH inventories, provisioning, deployment execution and autonomous work remain unavailable until their real provider and isolation contracts pass review.
- Claude and Jackboy usage remain separate from OMNI usage; no combined platform-spend total is claimed without stable deduplication and authoritative invoices.
- Real-money transfers remain intentionally absent. Adding a provider would require a new owner decision, recipient/provider contracts and another security review.

## Rollback

Commit reference is recorded in the final delivery and git history. Revert that single preview commit to restore the previous interface and remove the additive Treasury application code. Because the ledger migration is additive and may contain owner records by review time, do not drop its tables as part of a routine UI rollback; disable access through the reverted application and preserve data for an explicit owner decision.
