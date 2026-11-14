# OMNI ↔ Jackboy execution permits — Mothership side (omni.permit/v1)

Jackboy Dev Control is the authority. This file records how Mothership (OMNI) follows Jackboy's
`docs/OMNI-SECURE-LINK.md` session safety/permit contract; if the two ever differ,
Jackboy's wins and this side must be fixed.

## Transport

- Same `omni.link/v2` endpoint (`/api/public/omni/link`). Bootstrap handshake first, then every
  `safety`, `permit.request` and `permit.release` call is signed with the session token.
- Every 200/202 reply must carry a valid `X-Omni-Proof` bound to the request nonce and status.
  Refusals always fail closed; a refusal _reason_ is only reported as Jackboy's when its proof verifies.

## Safety snapshot (`omni.safety/v1`)

- Valid for 30 seconds (`validUntil`). Only a fresh, signed snapshot may be recorded as clear, and only
  when Jackboy itself says `autonomousAllowed`.
- Recorded via `jackboy_safety_record_v2`; failures, refusals and stale readings record `unknown`,
  which halts autonomy windows, CODE jobs and agent-started jobs.
- `manualDiagnosticsAllowed: false` (Kill Switch on) is the only thing that refuses the manual terminal.

## Permits

- One active permit per job, 60-second lifetime, renewed every 20 seconds by `PermitHolder`.
- Mothership rejects permits whose signature, scope (job, kind, digest, client, project, approval) or
  limits (≤ $0.50 per call, ≤ $1 per task, ≤ $5 per day) do not match, and returns permits it cannot record.
- Any refused, failed or timed-out renewal, an expired permit, or a stop halts the job at once and it
  never resumes (a new job needs a new permit).
- The database (migration 0055) re-checks stops, Step 10 activation and caps on record, and CODE
  leasing needs an active permit.

## What is not yet proven

- Jackboy's permit database change is staged, not installed: permits answer
  `503 permit_service_unavailable` until the owner installs and publishes it.
- The isolated feature branch adds a disabled, separate bounded executor and Jackboy
  migration 0064. No live job has held a permit or been cancelled by this branch.
  It accepts autonomous bounded plans only, not CODE permits or general agent queues.
- See `OMNI-BACKEND-CONTRACT.md` for the upstream activation integration, deployment
  boundary, independent Linux verification and exact owner actions.
