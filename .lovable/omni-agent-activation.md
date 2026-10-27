# One OMNI text agent — 2026-10-27

## Built, not yet activated
- Existing `/beta-omni` now runs one real text-only inference adapter through `/api/omni-agent`, not an independent fleet or shell runner. The configured Responses model and 4,000 output-token budget are unchanged; no tools, external fetch tools, files, devices or history replay.
- New private run records hold request, model, consent, status, answer, returned token usage and gateway-issued reference. Stable request IDs plus conditional claims prevent duplicate execution. UI offers saved history/readback, Stop and persistent account pause.
- Every AI entry point requires verified email, assigned private membership, existing service-managed AI approval, fresh pause/ownership checks and explicit consent. Approval cannot substitute for membership. Cancellation remains owner-scoped after membership removal.
- Request-bound permission polling propagates pause/revocation/cancellation upstream, including before text arrives. It is not a daemon/background scheduler. Host interruption leaves an outcome-unknown run, never automatically replayed.
- A durable pre-provider guard is written before inference. Provider denial and result-write failures retain the guard across restarts; no immediate/automatic retries. Successful terminal persistence is required before clearing the guard. Existing legacy OMNI endpoint respects the same guard and membership.

## Exact minimal pending backend change
1. Activate the already staged `.lovable/pending/owner-invitations.sql` (protected roles, owner configuration, verified claim and invitation RPCs).
2. Activate `.lovable/pending/omni-agent.sql` (one owner/project-bound run table and three authenticated RPCs; no seeds/accounts/approvals).
3. Owner chooses their actual email through secure Cloud configuration; never infer it from a screen name or first visitor. They register/confirm via `/auth`, then `/members` → Claim owner matches the protected configured email.
4. A separately authorized operator grants existing `beta_access.ai_approved` only to that confirmed owner identity; no client self-approval. Save/select a non-sensitive project via `/beta`.
5. Open `/beta-omni`, enter **Omni connection test**, explicitly consent to AI credits and private text retention, then Run OMNI agent. Read back completed result/token reference from Saved agent runs. Stop and pause must be tested with this same authenticated account.

No hosted changes were made. Preview and published app share this backend; separate backend-change authorization is an **owner-imposed safety boundary**, not a missing AI provider or Lovable platform entitlement. The existing AI key is configured. Lack of verified membership is an application security prerequisite. No tool currently offers a separate secure app-owner approval/configuration card; do not misuse a publish, secret or provider card as owner activation. There is no supported native companion activation flow in this checkout.

## Evidence scope
- Read-only hosted check: 0 auth users; 1 orphan approval row; 4 retained projects; no `user_roles`, `caller_role` or `omni_agent_runs`; no saved OMNI provider block. No retained orphan record was claimed/reassigned.
- `bunx vitest run`: **1,069 tests / 69 files PASS**; 29 new agent rules/handler checks plus two universal membership-denial checks. Full suite includes request-before-model ordering, dedupe, missing schema, denial persistence, exact returned usage, failed writes, Stop, account pause before first text and membership revocation. Provider responses are fixtures, not real inference.
- `python3 src/test/test_omni_agent_sql.py`: **15 isolated PostgreSQL acceptance checks PASS** against the actual staged owner/agent SQL, with fictional `.invalid` identities only in a temporary Unix-socket database. Verified owner-email matching, role prerequisites, owner/project RLS, stable request identity/conflict, forged write denials and pause/revocation-safe cancellation. Initial local test bootstrap failed while preparing fixture identity; the final run passed. Local database was stopped/removed; no Cloud data changed.
- `python3 /tmp/browser/omni-agent/check_agent.py`: actual public OMNI labels and private sign-in gate PASS, final private-route URL `/auth`; actual new endpoint anonymous/forged **401**, separate foreign-Origin **403**; desktop 1280×1800 and mobile 390×844 no overflow/page errors. Screenshots inspected. Authenticated saved-response UI cannot be exercised without creating an account, which this request forbids.
- Changed production-code ESLint PASS; automatic preview build **OK** after correcting the SDK PromiseLike usage read. All content leaves retain app-specific head metadata; no content route added and no public settings changed.
- **Actual inference: NOT RUN.** A direct gateway test would bypass the requested private-account/security path and cannot establish agent activation; it was not used as a workaround.
- No accounts created, shared schema changes, emails, publishing, purchases, desktop access or native CLI login.

Skills used: AI SDK gateway setup and OpenAI Responses streaming/recovery contracts.

## Still blocked / concrete next owner action
Explicitly authorize applying **both named pending scripts to the shared backend** (or provide genuinely isolated backend access), and choose the real owner email through secure configuration; then personally complete `/auth` confirmation and `/members` owner claim. A separate authorized AI approval is still required. These cannot be replaced by the current chat screen name or orphan approval row. No AI vendor connection/purchase is currently needed; actual model availability/credits remain unverified until the first authorized request.

No app-native or platform approval card is available for this particular schema/owner configuration; separate chat authorization of the named shared-backend change is required before invoking its migration tool. Native desktop/CLI login remains entirely outside this web agent milestone.