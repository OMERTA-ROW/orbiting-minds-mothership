# OMNI execution architecture and deployment gates

This is the authoritative **target architecture**, not a statement of current
live deployment. Older Railway sandbox instructions and staging runbooks are
historical; they do not authorize deployment or execution.

| Component | Responsibility and intended location | Execution authority |
| --- | --- | --- |
| Mothership web/control plane | Lovable or a Railway Node web service; owner authentication, approvals, Emergency Stop, audit and held tasks. | Does not run sandbox commands. |
| Jackboy and its restricted protocol runner | Signed policy, permits and safety decisions; the Railway link runner is limited to its fixed protocol self-test. Separate CODE controls remain independent. | The signed link does not grant a general shell or replace the executor. |
| Workspace sandbox | A separate dedicated Linux host, with pre-provisioned non-root workers, watchdog and isolated per-job workspaces. Vultr is the candidate host, not a verified deployment. | `services/omni-sandbox/` remains quarantined; no session or command execution is admitted. |
| Bounded autonomous executor | A separate Linux service implemented by `services/omni-autonomous/executor.mjs`; it accepts only a short, signed, owner-approved allowlisted argv plan and rechecks Jackboy permission. | Disabled by default; separate from the workspace sandbox and not a general shell. |

[The workspace host package](../services/omni-sandbox/HOST-SETUP.md) is the
authoritative technical design for the workspace boundary. The executor source
and its Linux diagnostic define the separate bounded executor's implemented
behavior. Neither reference Dockerfile nor a successful container health check
establishes a supported execution host. Railway is not the selected workspace
runtime; the old Railway sandbox deployment steps are superseded. No current
Vultr host, executor origin, deployed SHA or live isolation was verified by
this PR. Historical reports of a staging Vultr `printf` job do not establish
today's topology or production readiness.

The two execution lanes have different isolation mechanisms and evidence. The
workspace design needs dedicated worker identities, a delegated cgroup and an
independent watchdog; the bounded executor uses bubblewrap and per-process
`prlimit` ceilings, which are not aggregate job cgroup limits. A passing test
of one lane does not certify the other. Neither lane may be enabled because of
this document or a green CI result.

## Deployment-gated evidence

All items below require separate, explicit owner authorization and remain
**unverified blockers** until evidence is recorded for the actual environment:

1. **Live RLS and audit:** after an authorized deployment, test permitted
   same-owner access and denied cross-owner/project access with synthetic
   principals, including service-only boundaries and audit records. Verify
   effective policies and migration history without exposing credentials or
   weakening RLS. Local SQL tests are not live evidence.
2. **Production monitoring:** verify deployed health and error signals,
   permission denials, Stop/cancellation failures and spend-limit alerts,
   redaction, alert delivery, ownership and escalation. A health endpoint or
   configured dashboard alone is not operational monitoring evidence.
3. **Vultr isolation:** on the exact separately approved host and unmodified
   service, verify UID/GID separation, namespace and filesystem boundaries,
   denied egress/metadata and secrets, cgroup resource ceilings, enforcing
   AppArmor/seccomp, no-new-privileges, Stop and descendant termination,
   renewal loss, restart recovery and cleanup. Use synthetic data; do not
   disable host security controls to make a probe pass. Verify the bounded
   executor separately, including its non-aggregate resource limitations.
4. **Backup and restore:** establish an owner-approved backup, retention,
   encryption, RPO/RTO and restore procedure; restore into an isolated
   environment and verify consistency, RLS, audit, nonce/decision journals,
   lease recovery and replay denial. Preserve durable state; never clear it or
   replay unfinished jobs to force recovery. A backup existing is not proof
   that restore works.
5. **Authorization and safety:** independently verify owner/MFA approvals,
   default-deny permissions, per-task/day/total spending caps and fail-closed
   Emergency Stop on the actual deployment. Keep execution quarantined and
   autonomy disabled until all required controls and a separate release
   decision are satisfied.

The normal Vitest suite exercises portable executor and workspace
decision/lease lifecycle tests with synthetic authority, and discovers the
systemd lifecycle cases but skips them without the disposable Linux fixture.
The `Bounded OMNI Linux isolation` PR workflow runs those same lifecycle cases
through Vitest on a provisioned disposable host and runs the real bounded
executor launcher separately. These are CI fixtures, not live Vultr, RLS,
monitoring, backup or production evidence.
