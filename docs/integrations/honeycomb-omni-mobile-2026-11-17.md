# OMNI Mothership ↔ Honeycomb mobile client integration

## Purpose
Provide Honeycomb Terminal Companion with a secure mobile client surface for existing OMNI sessions and agent workflows. No duplicate execution backend.

## Lovable evidence
Mothership published/ready at commit 841acdabc94164f3251a66502edfe318a49d2343; Honeycomb published/ready at 1b09174d9183c33949d5b2b946c9529b883b2e69 (2026-11-17). Neither status proves end-to-end executor availability.

## Proposed server contract (verify routes before coding)
- Device registration/pairing with one-use approval, binding, expiration, revocation and audit.
- Scoped session list, attach/resume, stream output and status; idempotent reconnect.
- Submit/cancel job only with current owner authorization, Jackboy permit, spend limits and emergency stop respected.
- Agent catalog and capability metadata with provenance; mobile client receives only authorized metadata.
- Per-job isolation evidence: namespace/container identifier, egress policy, secret access, teardown and logs (sensitive values redacted).
- Central policy enforcement server-side; client UI controls are not security boundaries.

## Stage gates
1. Reconcile actual Mothership routes, Jackboy authority, Vultr/Railway executor deployments and Lovable Git sync.
2. Publish versioned API contract and integration fixtures.
3. Read-only mobile session viewer with server-side auth and tests.
4. Pairing, job request, streaming, cancellation, audit and permission tests.
5. Sandbox and recovery validation, concurrency, kill switch and revocation drills.
6. Production canary, rollback and signed owner acceptance.

## Historical diagnostics to rerun
Vultr vs Railway executor attribution, isolation diagnostics missing on main, session reuse migration 0077, capability field compatibility, owner activation gates 7–9, handshake and permit renewal. Record real run IDs, SHA and environment.

## Safety
No live permits, deployments, autonomous enablement, or emergency-stop release by merging this document. Implement functionality in separately tested code PRs.
