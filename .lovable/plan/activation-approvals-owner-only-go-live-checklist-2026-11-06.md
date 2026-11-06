# Activation Approvals — owner-only go-live checklist

## What you will get
A private page, **Activation Approvals**, reachable from the signed-in account menu, the site navigation and the OMNI area header (next to API Keys). Signed-out or non-owner visitors see only a private notice — no steps, names or history.

The page lists the 10 go-live steps in order:

1. Link settings saved (7 OMNI_LINK values + JACKBOY_LINK_ORIGIN)
2. Railway Jackboy variables confirmed, including SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
3. Node 26 pinned on Jackboy
4. Migration 0030_omni_sessions applied
5. Jackboy link route verified as HTTPS behind Railway
6. Final readiness check passed
7. Approval expiry set (max 24 hours ahead)
8. Self-test approved and passed
9. Live link switches on
10. CODE production switch, with $10 OpenAI cap and $5 daily limit confirmed

Each step card shows: status (**Pending / Approved / Failed**), approver, time, the latest audit entry for that step, and buttons **Approve**, **Mark failed** and **Revoke**. A short optional note (no secrets) can be added.

## Rules
- **Unlocks in order:** a step can be approved only when every earlier step is currently Approved. Later steps show "Locked — waiting on step N".
- **Revoke** returns the step to Pending and also returns every later approved step to Pending (they depended on it). Each change is written to the audit log.
- **Mark failed** records a failure; later steps stay locked until it is re-approved.
- **Fresh two-factor:** every approve / fail / revoke requires owner role, confirmed email, an aal2 session, and an authenticator check within the last 15 minutes. Otherwise the page says "Re-verify with your authenticator" and links to Account Security. This is enforced on the server and in the database, not just the page.
- **Step 7:** you pick an expiry date/time; it must be in the future and no more than 24 hours ahead. It is only recorded here.
- **Step 10:** Approve requires ticking two confirmations — "$10 OpenAI cap set" and "$5 daily limit set". These are your declarations; the app does not check OpenAI.
- **Step 1 helper:** the page shows, by name only, whether the 8 settings exist in OMNI's secret store (present / missing). It never shows values and never approves automatically.
- **Recording only:** approving any step does NOT flip switches, set or read secret values, deploy, run the self-test, contact Railway/Jackboy/OpenAI, or make paid calls. A banner on the page says this plainly.
- Notes are capped at 280 characters and refused if they look like a key or token.

## Technical details
- **Migration (new):** table `public.activation_approvals` — `step smallint PK (1–10)`, `status text ('pending'|'approved'|'failed')`, `approver_id uuid`, `decided_at timestamptz`, `note text`, `approval_expires_at timestamptz` (step 7), `spend_confirmations jsonb` (step 10), `revision int`. Seeded with 10 pending rows. Grants: `SELECT` to authenticated, `ALL` to service_role; RLS SELECT only when `is_razul_owner()`; no direct insert/update/delete policies.
- **RPCs (security definer, `search_path=''`):** `activation_approval_decide(_step, _action, _note, _expires_at, _cap_confirmed, _daily_confirmed)` with `_action ∈ approve|fail|revoke`. Calls `assert_razul_owner()` plus a new `assert_fresh_mfa()` (JWT `amr` contains a `totp` entry with timestamp ≥ now − 15 min). Row-locks all steps, enforces ordering, step-7 window, step-10 confirmations, note validation, cascade-revoke, and writes `razul_control_audit` rows (`record_type = 'activation_approval'`, `record_id = step`).
- **Server functions** `src/lib/activation-approvals.functions.ts`: list steps, list audit, decide, and settings-presence (name-only `process.env` check). All use `requireSupabaseAuth` + existing `requireRazulOwner`, `Cache-Control: private, no-store`.
- **Pure logic** `src/lib/activation-approvals.ts`: step catalog, unlock/cascade rules, input schemas, secret-looking-note detector.
- **UI** `src/components/omnibridge/ActivationApprovals.tsx` + route `src/routes/activation-approvals.tsx` (noindex head), using existing calm OMNI styling and visible button feedback.
- **Tests:** unit tests for ordering, cascade revoke, 24-hour expiry bound, step-10 confirmations and note rejection; disposable-PostgreSQL SQL test (existing pattern) for anonymous/non-owner denial, aal1 and stale-MFA denial, out-of-order denial, expiry bounds, cascade revoke and audit rows. Browser check of signed-out gating.
- **Docs:** add one rule to `AGENTS.md` (approvals are records only, never switch actuators) and a line in `roadmap.md`.

## Not included
No live switch changes, secret writes, deploy, self-test run, Railway/Jackboy/OpenAI calls, publishing or visibility changes.
