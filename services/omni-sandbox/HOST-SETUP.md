# Dedicated Linux host package (quarantined)

This is a review checklist, not permission to configure or deploy Vultr. Docker is unsupported
for workspace execution and its image diagnostics are not a workspace gate. The selected
alternative is pre-provisioned workers with distinct real host UID/GID pairs, not dynamic
subuid/subgid allocation. No service may claim subordinate mappings have been established.

## Runtime prerequisites

- Dedicated VM, unified writable cgroup v2, systemd 249 or newer. Linux 5.14 is the minimum
  for `cgroup.kill`; the historical fixture was tested on Ubuntu 22.04, Linux
  6.8.0-1070-azure, systemd 249 and bubblewrap 0.6.1. This does not certify Vultr's kernel.
- Node 22.13+ at `/usr/bin/node` (required for `node:sqlite`), bubblewrap without a setuid
  bit, util-linux, bash, coreutils, systemd and AppArmor inspection tools. Root-owned
  executable code under `/opt/omni-workspace`, not writable by any worker.
- Inspect `user.max_user_namespaces` (positive and adequate for bounded concurrency),
  `kernel.unprivileged_userns_clone` where present (must permit user namespaces),
  and `kernel.apparmor_restrict_unprivileged_userns` where present. The passing
  disposable host used 63848, 1 and 0 respectively. Do not globally disable an LSM or
  change sysctls in production based on this checklist: obtain a reviewed per-service
  AppArmor policy if restrictions deny bubblewrap. Inspect actual kernel audit logs.
- Verify mount, user, PID, network, IPC and UTS namespaces under the exact unit;
  `RestrictNamespaces` allows these only, not cgroup namespaces. The sandbox must not
  inherit the service environment or mount its private state, configuration or cgroups.
  Bubblewrap requires `AF_NETLINK` to configure loopback in its isolated network
  namespace; that address family must remain allowed. This does not provide a host route.
- Delegate CPU, memory and PID controllers with `Delegate=yes` on each worker service
  in `omni-workspace.slice`. Delegation belongs to the service, not the slice. The
  launcher moves itself into a manager leaf before enabling controllers. Never grant
  a worker another worker's subtree. Job-wide `cgroup.kill` and emptiness verification
  are mandatory; per-process limits do not substitute for aggregate limits.

## Reviewed installation plan

1. Reserve disjoint, stable UID/GID pairs for `omni-worker-<slot>` system accounts
   with no login shell or home. Do not reuse an identity while any previous job, process
   or state is retained. Verify numeric identities and ownership; `/etc/subuid` and
   `/etc/subgid` alone do not permit a no-new-privileges process to change identities.
   Dynamic subordinate mappings would require a separately reviewed external mapping
   boundary and are not part of this selected package.
2. Review the supplied `systemd/omni-workspace.slice` and
   `systemd/omni-workspace@.service`. The unit uses an empty capability bounding set,
   no-new-privileges, strict read-only system files, protected homes, private temporary
   storage, per-worker private durable state, no automatic restart, and control-group
   termination. `ProtectControlGroups=no` is deliberate: the worker needs its delegated
   subtree; delegation and bubblewrap mount exclusion must be tested. Do not replace
   this with a broadly writable shared cgroup mount.
3. Install root-owned code and reviewed unit files only after owner approval. Prepare
   a root-only `worker-<slot>.env` for each worker with a unique loopback `PORT`,
   project/client binding and credentials through the separately approved secret process.
   Do not put secret values in the unit, repository or logs. `StateDirectory` is private
   and must persist nonce, decision and journal records across restart and rollback.
4. The host entrypoint refuses root, effective capabilities, missing no-new-privileges,
   missing delegated controllers and failed recovery. It serves loopback only and
   preserves production command quarantine; it deliberately reports network unverified
   rather than running the historical root-only probe.
5. Admission/routing must bind one session to one worker identity, exclude simultaneous
   assignment and prevent slot reuse until durable termination. The experimental
   socket lifecycle described below is separate from this existing unit. The unit is a
   quarantined package, not an executable production service. Do not turn on execution,
   release Stop, issue permits or configure an external listener.

## Required evidence before rollout

The subsequent experimental `worker-leases.mjs` registry atomically reserves workers with
unique live worker/session indexes and refuses exhaustion. It retains unfinished reservations
after restart; no reservation becomes free without a lease-bound authenticated cleanup
acknowledgement. The database must be private to the coordinator on one durable locking-capable
filesystem. Losing or replacing it is not a safe way to recover capacity.

`worker-watchdog.mjs` is tested as a **different non-root UID** outside the complete worker
cgroup, with the worker UID unable to write that subtree. It checks short-lived signed
owner/project/session/job/worker/lease-bound records every 50 ms, using a monotonic deadline;
Stop, unreadable/invalid control and expiry kill the whole cgroup. It closes the empty cgroup
against late attachment and signs an acknowledgement only after workspace removal. These
are experimental control primitives, not a deployed daemon or integrated Mothership renewal
endpoint. The disposable fixture's root provisioning/launch oracle is not a production broker.

The new `leased-coordinator.mjs`, `leased-worker.mjs` and `leased-watchdog.mjs` compose an
experimental socket lifecycle. Neither coordinator nor watchdog switches UID. Each worker
launches bubblewrap from its own delegated service. `/work` and `/tmp` are namespace-private
tmpfs mounts, charged to the job's aggregate memory limit; no job-owned disk directory is
left for another UID to traverse. The previous direct-cgroup wipe-failure test remains
unchanged as evidence of why disk-backed cross-UID removal is not used in the new path.

The disposable lifecycle fixture provisions **test-only** socket units and narrowly scoped
Polkit authorization. It does not modify the packaged production units or provision Vultr.
Before any separate reviewed rollout, the serving runtime must match these invariants:

- Worker and watchdog each have a different stable non-root UID/GID; neither has the
  coordinator group as a supplementary job identity. Socket activation, not `chgrp` by
  the worker, creates each AF_UNIX listener with `SocketUser=<service user>`,
  `SocketGroup=<coordinator group>`, `SocketMode=0660` and `RemoveOnStop=yes`.
  The worker validates its inherited listening FD and rejects shared coordinator groups.
- `omni-worker@<slot>.service` has `BindsTo=omni-watchdog@<slot>.service` and matching
  `After=`. Both services retain no-new-privileges, empty capabilities, strict system
  protection, private temporary storage and `Restart=no`. A failed watchdog exits;
  systemd stops its bound worker, including all descendant cgroups. No job is resumed.
- The watchdog's service-manager permission allows only `start` and `stop` on its exact
  `omni-worker@<slot>.service` and `.socket`, for that watchdog identity only. No wildcard
  units, shell broker, sudo grant, general systemd management or capabilities. Missing
  permission must prevent startup admission. Do not copy the fixture policy to production.
- Before isolated spawn, the watchdog proves it can stop socket activation, stop the
  complete worker unit, observe its old cgroup gone and start a fresh invocation.
  After completion or Stop, the same sequence destroys the job's namespaces and unit
  `PrivateTmp`, and produces a fully lease-bound signed cleanup acknowledgement.
  Failed Stop, stale invocation, failed restart or missing acknowledgement retains quarantine.
- Coordinator state lives on one private durable filesystem. Hold an exclusive leadership
  lock for the entire process lifetime, including recovery. On restart, recover unfinished
  leases before any new admission, terminate/recycle only, and never send the old command.
  Worker sockets accept one assignment per invocation and reject old invocation IDs.
- Owner command approval binds the complete lease identity and SHA-256 command digest.
  The separate renewal callback must verify current owner consent, Stop, revocation and
  spending controls; this PR's fixture issues synthetic records only. Renewal runs every
  100 ms; signed authority lasts 500 ms, with a monotonic, non-extendable watchdog deadline.
  Delayed/unreadable renewal cannot extend authority. No control key, service socket,
  coordinator database, cgroup filesystem or inherited environment is mounted in the job.

The experimental coordinator requires the existing trusted Mothership approval/renewal
adapter; it is not connected to the quarantined production HTTP entrypoint. Actual serving
runtime, permissions and transport still require independent verification before rollout.

`workspace-host-gate` combines the unchanged 11 historical host assertions and
the hardened-unit worker, independent-watchdog and integrated socket lifecycle checks. The historical fixture remains a root-started test-only
coordinator; its passing result alone does not verify the non-root package. Worker tests
run two distinct pre-provisioned identities under the packaged unit with a test-only
`ExecStart` override, check actual UID/GID maps and reject selecting another host UID.
The integration test also checks concurrent namespace and identity separation.

Run `gh workflow run omni-linux-isolation.yml --ref street-tech666-sandbox-integration`
for disposable Linux evidence. Optional `unsupported_docker_diagnostics=true` retains the
unsupported image investigations; image failures/skips are never host passes. Configure
the `workspace-host-gate` required check separately through an owner-reviewed branch
protection change; this PR does not change repository settings.

Before enabling anything, test the unmodified service entrypoint and routing on the actual
Vultr host with synthetic settings, journal recovery, cleanup failure, concurrent worker
assignment, lease expiry/revocation, Stop races and detached descendants. Independently
verify persistent filesystem locking/flush and aggregate limits. CI is not serving-runtime
or production verification.

## Rollback

Keep execution disabled and Stop engaged. Stop the affected worker units; verify every job
cgroup is empty before reusing identities or storage. A failed kill or unreadable population
must be reported as unconfirmed, not success. Restore a reviewed earlier package using new
commits; do not rewrite Lovable history. Preserve private SQLite nonce/decision/journal state
and identity ownership; never delete it to get startup to succeed. State loss requires the
separate owner-approved credential-rotation procedure before reconnecting. Do not resume jobs
or automatically resume workers. The experimental watchdog recycles an empty worker explicitly;
that is not a job restart. Unit rollback does not authorize deployment or execution.
