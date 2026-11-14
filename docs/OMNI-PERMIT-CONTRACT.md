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
- A refused, failed or timed-out renewal, an expired permit, or a recorded stop halts the job and it
  never resumes (a new job needs a new permit). Jackboy revokes its permits when its stop is engaged;
  Mothership must receive a stop notice or detect the refusal on renewal before its holder can cancel
  work. This is not proof of instantaneous cross-service cancellation.
- The database (migration 0055) re-checks stops, Step 10 activation and caps on record, and CODE
  leasing needs an active permit.

## Deployment and executor status

- The owner reported that Jackboy migration `0066_omni_execution_permits` is installed. The matching
  implementation is in Jackboy commit `c86ebce9e610bff9f7f336138406938670836ed9`; its deployment and
  the live database history have not been independently verified here. Do not apply a duplicate
  migration. A database or store error still fails closed with `503 permit_service_unavailable`.
- Mothership migration `0055` and its halt-audit follow-up `0056` require separate live-history and
  deployment verification. Check the existing history and prerequisites before any owner-approved
  migration; do not infer installation from this document.
- This feature branch adds a disabled, separate bounded executor and unapplied
  Jackboy 0068–0070 integration, reusing native 0066/0067 authorization/permits.
  It accepts autonomous exact plans only; native CODE permits remain supported
  without rerouting CODE jobs to this worker. Mothership's $0.01 estimate does not
  reduce Jackboy's $1/job reservation against $5/client/UTC day.
- Mothership 0058 durably propagates local Stop and requires verified cancellation;
  a one-second exact-job lease prevents work continuing until permit renewal.
  Unknown worker instances cannot acknowledge termination.
- Generic Linux isolation/cancellation passed 5/5 on a real Ubuntu 22.04 runner,
  but the exact Railway image and authenticated live job/Stop drill remain
  unverified. A permit alone does not prove execution.
- See `OMNI-BACKEND-CONTRACT.md` for the upstream integration, evidence, deployment
  boundary and separate owner actions. Nothing here approves, deploys or arms work.
