# Omni activation — 2026-10-27

Source: this owner's activation request, not a retrieved Notion page. Existing project only; no schema, account, provider, publication or native installation changes.

## Implemented in development preview
- `/omni` now has an explicit read-only private connection check, secure sign-in, existing authenticated model channel, Members & Invitations and offline CLI handoffs. Its template conversation remains Demo.
- The authenticated check revalidates identity, reads only the caller's beta approval/pause and owned-project count, reads the caller's pending membership RPC, then checks service-managed availability. No writes, model invocation, token output or remote commands. Missing role setup never establishes owner identity; beta approval remains separate.
- Existing model requests now require confirmed account email server-side before approval checks. Existing same-origin, bearer validation, project ownership, consent, bounded input, revalidation before inference, stop and persistent provider denial remain intact.
- Each displayed sample agent is Demo, and toggling demo consent never grants live scopes. Independent agents/CLI bridge remain Blocked. Platform page shows source-backed build/help/doctor/security commands, no fabricated start/download/login instructions.

## Actually activated
- Only preview UI and read-only readiness handling are wired this turn. The existing Lovable AI request path was already configured; no live AI entitlement, owner account, native connection or independent agent was activated.
- Read-only backend evidence: auth users **0**, verified approved users **0**, owner_config/claim_owner/caller_role **absent**. There is one beta approval row without an auth user; it cannot authorize anyone. No saved OMNI provider block; service key present, value never printed. These are configuration facts, not model availability proof.
- Preview/published app share the backend; staged `.lovable/pending/owner-invitations.sql` remains unapplied. No account creation or policy/schema changes permitted by this request.

## Verification actually performed
- `bunx vitest run`: **1,038 tests / 67 files PASS**. Focused Omni/auth/invitations/navigation suite: **188 tests / 15 files PASS**. Added nine readiness rules, five server snapshot checks and one confirmed-email gate test.
- `python3 /tmp/browser/omni-activation/check_activation.py`: desktop 1280×1800 and mobile 390×844 connection labels/handoffs, signed-out private readiness denial, private OMNI redirect to `/auth`, Demo consent control, offline source instructions and no horizontal overflow PASS. No page errors observed. First script used the wrong sign-in heading; corrected to actual “Welcome back” and rerun successfully. Screenshots reviewed.
- Live `POST /api/omni`: missing token **401**, forged token **401**, foreign Origin **403**. No provider calls or paid inference triggered.
- Actual disposable Linux amd64 CLI build with Go 1.25.7: help/version/doctor --json/terminal security exit **0**; login/agents/connect/start/omni exit **2**. Terminal security explicitly reports missing enrollment/auth/capabilities/rate limiter. These are actual offline commands, not desktop installation or AI-agent verification.
- No Go suite claimed this turn; CLI source unchanged. Prior Go pass cannot prove AI/companion runtime.
- Targeted code lint passed after formatting correction. Harness preview build OK; all existing content routes inspected for route head metadata (none missing).
- Completion-register structural checks PASS; existing 15-step order and queued add-ons preserved. 04.01/04.02 are Blocked, not operational. No commit/repository sync/release receipt claimed.

## Exact blockers and secure next actions
1. **Private owner activation:** no account exists, and owner/invitation schema is not installed. Needs separately authorized isolated backend setup (or explicit shared-backend approval), owner-selected real email through secure configuration, email-confirmed account and `claim_owner` server bootstrap. Never first visitor, never invented identity. `/auth` and `/members` are supported web handoffs, but creating accounts is outside this request.
2. **Model runtime:** verified signed-in account with explicit service-managed beta AI approval and selected private project, then user consent to a real request and workspace credit use. A key or orphan approval row is insufficient. No self-approval toggle added. Real output/usage/Stop checks pending.
3. **Desktop terminal/Honeycomb:** no browser-to-device service, secure credential store, enrollment adapter or working CLI login/start exists. Requires reviewed companion implementation, OS-secure custody, one-time pairing/device identity approval, scoped expiring/revocable grants and authentic fixed-command job results. No secure native setup flow can be claimed until these adapters exist; do not paste keys in chat or CLI flags.
4. **Independent AI agents/code execution:** only role descriptions/operator declarations exist. Needs supported isolated runner, owner/project/tool capabilities, independent review, safe fixed arguments, cancellation/audit and explicit apply approval/rollback. Current model has no tools; outputs stay untrusted proposals.
5. **Limits and release:** application request rate limiter, agreed quotas, signed distribution/native QA remain pending. No publisher, installer/updater, cleanup, scanner, Vault credential custody, external messages or paid service activated.

## Source commands verified (not released installation)
From this checkout's `cli/`, reviewed Go 1.25+ and an existing staging parent:
```text
go build -trimpath -o <absolute-staging-path>/evolution ./cmd/evolution
<absolute-staging-path>/evolution help
<absolute-staging-path>/evolution doctor --json
<absolute-staging-path>/evolution terminal security
```
Windows output would be `evolution.exe`, but native Windows/macOS execution is not verified this turn. Existing opt-in source install/uninstall code was not run or modified. No supported `start` command or CLI login, signed package/download or update flow exists. The separate `street-Tech666/Omni` repository was not accessed or synchronized.

## Changed files
`src/lib/omni-activation.ts`, `src/lib/omni-activation.functions.ts`, `src/components/omnibridge/OmniActivation.tsx`, `src/components/omnibridge/OmniAssistant.tsx`, `src/lib/beta-auth.server.ts`, `src/routes/omni.tsx`, `src/routes/agents.tsx`, `src/components/cli/Companion.tsx`, `src/test/omni-activation.test.ts`, `src/test/omni-activation-server.test.ts`, `src/test/beta-auth.test.ts`, `AGENTS.md`, `roadmap.md`, `completion-register.json`, this evidence note.