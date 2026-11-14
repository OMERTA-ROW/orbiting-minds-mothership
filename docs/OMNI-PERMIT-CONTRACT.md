# OMNI ↔ Jackboy execution permits — Mothership side (omni.permit/v1)

Jackboy Dev Control is the authority. This file records how Mothership (OMNI) follows Jackboy's
`docs/OMNI-PERMIT-CONTRACT.md`; if the two ever differ, Jackboy's wins and this side must be fixed.

## Transport
- Same `omni.link/v2` endpoint (`/api/public/omni/link`). Bootstrap handshake first, then every
  `safety`, `permit.request` and `permit.release` call is signed with the session token.
- Every 200/202 reply must carry a valid `X-Omni-Proof` bound to the request nonce and status.
  Refusals always fail closed; a refusal *reason* is only reported as Jackboy's when its proof verifies.

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
- This branch adds an isolated worker for synthetic, 1–30 second timers only. It cannot execute CODE,
  shell commands, provider requests or production work. It uses a separate, short-lived, revocable
  identity; the broker retains the existing Jackboy and database credentials. Identity creation and
  queue admission require an authenticated owner with fresh MFA. Each permit reserves $1 of Jackboy's
  task and daily budget, even though the no-op has no provider cost.
- The broker route is disabled unless `OMNI_NOOP_WORKER_ENABLED=true`. Do not enable it or provision
  a worker without a separate owner decision. First reconcile the live Mothership migration history,
  including `0055` and `0056`, and the proposed `0057` number, schema and prerequisites; approve the
  migration separately. Do not duplicate Jackboy's owner-reported installed `0066`. Verify the
  published Jackboy commit and signed permit service independently before any publication.
- After approval, deploy the broker default-off, arrange the existing authenticated Jackboy safety
  synchronization job and monitor its failures, then securely provision the worker-only token to
  an isolated runtime. `OMNI_NOOP_BROKER_URL` identifies the HTTPS broker and
  `OMNI_NOOP_WORKER_TOKEN` is displayed once when the owner creates an identity; never put the token
  in logs or source control. The `scripts/omni-noop-worker.ts` entry point handles one job per
  invocation, so an operator must separately provide and monitor its lifecycle.
- A broker heartbeat rechecks signed Jackboy safety and renews the permit; cancellation occurs when
  a refusal, stop, timeout or lease failure is detected, not necessarily when Jackboy's stop is
  engaged. A crashed worker's database lease is swept on subsequent broker actions or safety-sync
  runs; without either, the owner list reports an expired lease but persisted cancellation is delayed.
  Revocation immediately cancels the identity's local jobs; remote permit release may wait for
  expiry. A completed local job with an unconfirmed remote release is reported as unconfirmed by
  the worker, not proof of remote cleanup.
- To roll back, first disable the broker, revoke worker identities and stop the worker runtime; keep
  Emergency Stop engaged and verify remote permits have expired or been revoked. Retain the job and
  audit tables for investigation; any destructive schema rollback needs a separate reviewed recovery
  plan. Never change existing approvals or credentials as part of this rollback.
- The isolated cross-repository cancellation test runs with
  `JACKBOY_TEST_ROOT=/path/to/installed/jackboy node --import tsx --test tests/jackboy-noop-worker-integration.test.mjs`.
  It uses two disposable PGlite databases and in-process signed handlers, not live services or
  production TLS. It is not evidence that a deployed worker or live job ran.
