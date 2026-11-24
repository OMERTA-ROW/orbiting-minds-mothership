# Native OMNI migration and recovery runbook

**Review only.** Migrations 0075–0080 are pending; this is not permission to apply, deploy, roll
back, restore, release Emergency Stop, or run a paid request. The actual serving database and its
history have not been independently verified by this runbook.

## Dependencies and preflight

1. Identify the serving database and all applications using it. Reconcile the complete migration
   history and hashes with the reviewed repository and any concurrent Lovable updates. Do not infer
   installation from filenames, readiness markers, or a previous environment. Stop on conflicting
   history, missing prerequisites, unknown objects or a partial application; do not edit migration
   history or reapply an unverified migration.
2. Obtain an encrypted backup and verify a restore in an isolated environment. Record schema
   definitions, function grants and RLS policies without copying credentials. Agree on a maintenance
   window and an operator responsible for stopping ingress and checking in-flight requests.
3. Migration 0075 depends on the earlier Claude ledger, private agent and Fusion tables/functions.
   0076 depends on Dock devices, nonces, owner/MFA and task tables. 0077 depends on **both 0075 and
   0076**, and replaces the 0076 native authorization function as well as shared Claude reservation
   and settlement functions. 0078 depends on 0076 and its native owner/device fields. 0079 depends
   on 0076–0078 and adds key-bound native admission and operation wrappers. 0080 depends on 0077
   and replaces the native reservation lock order and adds authorized completion. If all are approved,
   apply in the reviewed order 0075 → 0076 → 0077 → 0078 → 0079 → 0080. Validate each step and its
   recorded history before proceeding; migration 0078 is not a substitute for 0077.
4. Confirm service-only RPC grants and RLS; native owner consent must retain verified owner, aal2,
   fresh TOTP, PKCE, one-use codes and key proof. Confirm 0077's native-only chat consent, Stop,
   owner/AI/project/session checks and shared ledger, 0078's key-bound replay protection and
   0079's service-only key/revision-bound operations, and 0080's atomic completion authorization.
   Keep native ingress disabled until 0079, 0080 and their corresponding server code are installed
   on every replica. The new server does not fall back to legacy admission for native devices;
   old server versions do not enforce 0079 or 0080.
   Exercise only an explicitly approved isolated environment. A readiness marker or catalog entry
   alone is not evidence that these protections or live provider billing work.

## Containment and recovery

- Stop admitting affected native requests by taking the affected application routes out of service
  using an approved deployment/ingress change. Ensure every serving replica is covered. Engage
  Emergency Stop through the existing owner control where appropriate; do not rely on it to block
  enrollment or native device-status reconciliation, which intentionally remain available under
  Stop. Account AI pause affects chat, not all native routes. Route removal must be verified
  externally in the approved environment; neither source changes nor a missing readiness marker
  prove ingress is disabled.
- Wait for or cancel in-flight calls through the existing stop/revocation controls. A provider call
  can have a billed or unknown outcome after disconnection. Preserve `ai_gateway_state`, the Claude
  usage ledger, reservations, native sessions/runs, authorization codes and audit records. Do not
  clear the shared guard, retry a request, or invent a settlement when the outcome is uncertain.
  An owner reviews and reconciles the actual outcome through the existing controls before restoring
  service. Delegated and Fusion turns with ambiguous Claude accounting deliberately remain running
  with their guard retained; the private agent records a failed outcome but retains the guard.
  Revoke a device only after the owner has confidently identified it; revocation is a separate
  reduction and cancels that device's held tasks.
- If an exchange reply is lost, preserve candidate keys. For rotation, the signed 0078 status
  snapshot can identify the currently accepted key and revision, but is not a receipt or future
  authority. If initial enrollment lost its device ID, that endpoint cannot recover it: avoid
  revoking an ambiguous match. An owner may revoke a confidently identified enrollment and begin
  a new consented enrollment; no automated lookup or recovery endpoint currently exists.
- Prefer a separately reviewed **forward repair** over a destructive schema rollback. Capture
  evidence of the failure, reconcile migration state and permissions, and test the exact repair
  on an isolated restored copy. Do not remove columns/tables, replay old function definitions,
  delete audit/ledger rows, or restore old approvals simply to make the application start.
  Specifically, 0077 replaces functions installed by both 0075 and 0076; blindly restoring their
  old bodies or source constraint can reject existing `native` ledger rows and lose chat guards
  or alter other Claude paths. Downgrading the app alone does not undo database functions.
- A database restore is a last resort requiring explicit owner approval, an impact assessment and
  stopped writers. It loses all changes after the snapshot and can resurrect revoked devices, used
  authorization codes, old permissions or stale spending/approval state. Before accepting traffic,
  reconcile those security and billing records against trusted post-backup evidence, revoke or
  re-enroll affected credentials as directed by the owner, and verify Stop remains engaged.
  If trustworthy reconciliation is unavailable, keep affected routes disabled and re-establish
  authority through fresh owner consent rather than trusting restored records.

## Return to service

Only after a separately approved repair: confirm actual database history, function signatures,
grants, RLS and deployed route versions; run the focused auth, Dock, native chat and disposable SQL
lifecycle tests against an isolated restored copy; check refused replay, rotated/revoked key, owner
and Stop paths, guard retention and ledger settlement. Confirm client and server protocol versions
and account for 0078–0080 availability. Resume traffic only on explicit owner authorization; no check
automatically releases Stop, clears an AI block, approves a task or starts an executor.
