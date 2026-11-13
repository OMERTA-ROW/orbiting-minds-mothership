# Repair plan: database update 0051 (activation approval checks)

Status: PLAN ONLY — awaiting separate owner approval. Nothing below has been run.
Inspected read-only on 2026-11-13 ~17:55 UTC.

## 1. Which database
- The single Lovable Cloud database shared by the preview and evoomni.tech (PostgreSQL 17.11).
  There is no separate staging database, so any repair touches the live app.

## 2. What the mismatch actually is
- The applied-history table has 51 rows, ids 1–51. Ids start at 1; update file names start at 0000.
- Every row matches its file byte-for-byte (SHA-256) and by timestamp:
  row 1 = 0000 … row 51 = `0050_razul_intelligence_provisioning` (hash 74f2852cc6d0…).
- Comparing row 51 with file 0051 is an off-by-one. There is no corrupted or altered history.
- The real finding: **0051 was never applied.**
  - Expected hash of `0051_activation_approval_checks.sql`: `1a09ae7e87041f0f15429aae0a1f0f39e7a5a487442124425f317dab48823a6f`
  - Journal timestamp 1794521167000 (2026-11-12 22:06:07 UTC) is newer than the newest applied row, so the normal migrator would pick it up.
- Cause: 0051 arrived in an outside commit (52ecf52, 2026-11-12 23:06 UTC) with a hand-set timestamp and no snapshot.
  Files in the repo are only applied when run through the migration tool, so it never ran.
  App code that needs it shipped first, which is why Activation Approvals broke.
- The history checker also notes missing snapshot files for 0031 and 0051. 0031 applied normally, so this is a bookkeeping gap only.

## 3. Live objects vs what 0051 expects
| Object | Live now | After 0051 |
| - | - | - |
| `activation_approval_checks` table | absent | created, RLS on, service-role only |
| `activation_approval_record_check` function | absent | created, service-role only |
| `activation_approval_decide` | present, no fresh-check rule | replaced: steps 1, 2, 4, 8 need a passed server check < 15 min old |
| `activation_approvals` columns/constraints | all columns 0051 uses exist | unchanged schema |
| `razul_control_audit` | exists, no restricting constraint or trigger | 1 new row added |
| `assert_razul_owner`, `assert_fresh_mfa(int)` | present | unchanged |

No partially applied pieces exist, so applying the file exactly once is clean.

## 4. Exactly which approvals would reset
The file runs `UPDATE activation_approvals SET status='pending' … WHERE status <> 'pending'`.
| Step | Now | After |
| - | - | - |
| 1 | approved 2026-11-12 21:25:56 UTC, revision 1 | pending, approver/decision time/note cleared, revision 2 |
| 2–10 | pending, revision 0 | unchanged |

- One audit row is added: `fresh_evidence_required` for step 1 (no actor).
- The existing audit rows (2 in `razul_control_audit`) are kept; nothing is deleted.
- Step 1 already counts as "Needs fresh approval" in the app, because two-step sign-in was turned off at 2026-11-13 16:20:51 UTC, after it was approved.

## 5. Things that must not change (baseline to compare after)
users 1 · sign-in identities 1 · roles 1 · beta access rows 5 · MFA recovery events 4 · workspace audit 10 · control audit 2 (→ 3) · approval rows 10.

## 6. Steps (each needs the owner's go-ahead)
1. **Backup (owner, in Lovable):** open More → Database → Manage → Backups and note the newest UTC timestamp. I can't see that list.
   Then take a fresh export: More → Database → Manage → Settings → Export data. Wait until the download arrives.
2. **Read-only pre-check (me):** confirm again that the table and function are absent, that step 1 is the only non-pending row, and that the counts match section 5.
   If anything differs, stop and re-plan.
3. **Apply (me, after approval):** run 0051 through the Lovable migration tool with the file's **exact bytes**.
   - Why exact bytes: the tool recognises an identical file as the same update and records it once, with the hash above.
   - Rewriting it with "IF NOT EXISTS" would change the hash and risk a second record.
   - Safe to retry: it runs in one transaction, so a failure rolls back completely. After success, the migrator skips it on every later run.
   - No manual history edits and no "mark as applied".
4. **Validate (me, read-only):**
   - Table exists, RLS is on, no access for anonymous or signed-in roles; the function is service-role only.
   - `activation_approval_decide` now references the check table.
   - Step 1 is pending at revision 2; steps 2–10 are unchanged; exactly 1 new audit row.
   - Every count in section 5 is unchanged.
   - History has 52 rows, the last one with hash `1a09ae7e…`.
   - Regenerate app types, remove the temporary type workarounds, and run the build and tests.
   - Open Activation Approvals: the "missing update" notice is gone and "Run check" is enabled.
5. **Owner follow-up (separate decision):** enter a fresh two-step code, run the step 1 check, then re-approve step 1 if it passes. Nothing is activated automatically.

## 7. Recovery
- **Apply fails:** the database is unchanged (transaction rollback). Read the error and re-plan. No retries without review.
- **Applies but something is wrong:** fix forward with a new reviewed update (for example, restore the previous `activation_approval_decide` body, which is recorded in this plan's inspection).
  Do not write step 1's approval back by hand; re-approving through the app keeps the audit trail honest.
- **Last resort:** restore the daily backup or the export from step 1. Warning: this permanently loses everything written after that snapshot and reverts the schema.

## Out of scope
The optional update 0052 (database-enforced reset rule / single owner), CODE, autonomy, deploys and secrets.

## Pre-apply record (read-only, 2026-11-13 19:11 UTC)
- Preconditions re-confirmed: 51 history rows (max id 51, newest created_at 1794511673056 = 0050); check table and record function absent; 0051 file SHA-256 1a09ae7e87041f0f15429aae0a1f0f39e7a5a487442124425f317dab48823a6f; 1 user account; 2 control-audit rows.
- Step 1 before change: status approved, approver 40543e40-5202-4219-a852-ead1c659e9a9, decided_at 2026-11-12 21:25:56.570764 UTC, note '' (empty), approval_expires_at NULL, spend_confirmations NULL, revision 1.
- Matching audit row: id 140bd914-989c-41a0-989d-868cc73a13b9, action approve, record 1, 2026-11-12 21:25:56.570764 UTC.
- Steps 2–10: pending, revision 0, no approver.

## Applied (2026-11-13 19:16 UTC, owner-approved)
- First attempt (19:12) rolled back fully: the tool re-filed 0051's text as a duplicate. Nothing changed; it used up sequence id 52.
- Applied 0051 exactly as written plus 0052 (one table COMMENT only) in one normal tool run.
- History: 53 rows; ids 53 (0051, hash 1a09ae7e8704…) and 54 (0052, hash 4c458affbdb8…). Id 52 is skipped because the rolled-back attempt used it.
- Check table: present, RLS on, 0 rows, service role only (no anon/authenticated access). Record function: SECURITY DEFINER, service role only. Decide function: requires fresh check; authenticated only (owner+MFA enforced inside), not anon.
- Step 1 pending revision 2, approver/time cleared; steps 2–10 pending revision 0 unchanged. Audit 3 rows (new: fresh_evidence_required, step 1). Accounts: 1.
