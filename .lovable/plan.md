# Update 0051 — final preflight and execution steps

Nothing in this plan has been run. Re-checked read-only at 19:04 UTC today.

## Preflight results (confirmed live just now)
- Database: the one Lovable Cloud database that serves both the preview and evoomni.tech. There is no staging copy, so this change hits the live app.
- Update history: 51 rows, matching files 0000–0050. 0051 has not been applied.
- The check table and the check-recording function are both absent. Nothing is half-applied.
- Approvals: step 1 is approved (revision 1). Steps 2–10 are pending (revision 0).
- 1 user account; 2 rows in the control audit log.
- The 0051 file's fingerprint matches the one recorded in the repair plan (1a09ae7e…3a6f).

## Backup readiness (you need to check this; I can't)
- I can't see your backup list. Open More → Database → Manage → Backups and confirm a snapshot from today exists.
- Then run More → Database → Manage → Settings → Export data and wait until the export arrives. Daily snapshots can't restore to an exact moment, so the export is the only exact copy of the current state.

## What 0051 changes
- Adds a private check store and a private check-recording function. Only the server can use them; signed-in browsers and visitors can't.
- Replaces the approval-decision function. Steps 1, 2, 4 and 8 can then only be approved after a passed server check from the last 15 minutes. Owner identity and a fresh two-step code (15 minutes) are still required.
- Resets step 1 to pending: approver, decision time, note, expiry and spend confirmations are cleared, and the revision goes to 2.
- Adds 1 audit row: "fresh_evidence_required" for step 1.
- Leaves steps 2–10, accounts, sign-in, two-step sign-in, roles, keys, terminal settings, Emergency Stop and the existing audit rows unchanged.

## Data-loss and security review
- Lost: step 1's original approver ID, decision time and note. The audit log keeps only a step number, not these values. Mitigation: save a read-only copy of the step 1 row in chat and in the repair doc before applying.
- No deletes, no dropped tables or columns, no new permissions for visitors or signed-in users.
- The decision function stays callable by signed-in users, as it is now. It still requires owner + fresh code inside, so this is not a wider opening.
- It runs all-or-nothing: if any statement fails, nothing changes.
- Leftover issues, not changed by 0051: the snapshot file is missing (bookkeeping only), and the hand-set timestamp is still newer than the last applied row, so the normal migrator applies it in order.

## Execution steps (each after your "approve")
1. You confirm the backup and export are done.
2. Me, read-only: repeat the checks above. If anything has changed, I stop.
3. Me, read-only: capture the full step 1 row.
4. Me: apply the exact 0051 SQL once, byte-for-byte, through the normal update tool. No rewrites and no manual history edits.
5. Me, read-only checks:
   - the table and function exist and are private
   - step 1 is pending at revision 2, and steps 2–10 haven't changed
   - the audit log has 3 rows
   - the update history has 52 rows
   - there is still 1 user account
6. Me: regenerate the app's database types, confirm the build passes, run the approval tests, then check in the browser that "Run check" is turned on.
7. You, separately: enter a fresh code, run the step 1 check, and re-approve step 1 if it passes. Nothing activates on its own. Jackboy, CODE and autonomy stay off, and nothing is published.

## If something goes wrong
- The apply fails: nothing has changed, and I re-plan.
- It applies but behaves wrongly: I fix it with a new reviewed update. No hand edits.
- Last resort: restore the export or a snapshot. This permanently loses anything written after it.
