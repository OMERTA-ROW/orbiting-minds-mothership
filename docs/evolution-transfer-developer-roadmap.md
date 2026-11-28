# Evolution Transfer and Developer Workspace

Status: proposal only; no runtime capability or activation is implied.

## Customer experience
Enter a website URL, select Transfer, authorize the source provider when necessary, and choose a destination. Show discovery, import, repair, validation, preview and cutover progress. A URL alone cannot authorize private source or data access. Keep the original site live until the owner approves cutover.

## Architecture
CODE is the execution foundation. Fusion dispatches scoped tasks to provider adapters, Jackboy engineering and validation workers, and Evolution infrastructure. A developer-facing assistant (working name RIO, identity not finalized) explains repositories, prepares changes and coordinates tasks. Jackboy implements and tests changes; owner approval gates publication. Evolution hosts repositories, builds, artifacts and private server nodes. Use original interface design and standard Git interoperability.

## Migration workflow
1. Discover provider and supported export capabilities; verify ownership and obtain scoped authorization.
2. Inventory source, data, assets, dependencies, environment variable names and domain settings. Never log secret values.
3. Snapshot and import to an isolated staging workspace; preserve provenance and licenses. Unsupported proprietary components require explicit reconstruction approval.
4. Run CODE jobs with scoped credentials, quotas, cancellation, idempotency, audit records and restricted network access. Jackboy repairs incompatibilities on reviewable branches.
5. Validate build, authentication, database integrity, integrations, security and smoke tests. Report gaps; do not claim success on partial migration.
6. Present preview and cutover plan; require owner approval for DNS, production writes or deployment. Retain rollback and backups; never delete the source automatically.

## Infrastructure and delivery
Start with Git import and a staging deployment, then add provider-specific adapters (subject to API/export access), database migration, domain cutover, and optional synchronization. Provide independent deployment targets for monorepos. Add authenticated private CPU/GPU nodes, health checks and emergency stop. Keep app-builder and integration automation boundaries explicit.

## Acceptance gates
- Unauthorized URL cannot trigger private import; block SSRF and unsafe redirects.
- Unsupported export produces an actionable report, not false success.
- Cancellation stops new work and revokes temporary access; retry is idempotent.
- No production cutover without verified tests and approval; rollback tested.
- CODE execution, isolation, spending limits and live provider adapters must be independently verified before activation.

This is a documentation-only roadmap, not a working migration engine. Existing infrastructure and CODE PRs must be reconciled before implementation; no duplicate runtime changes are proposed here.
