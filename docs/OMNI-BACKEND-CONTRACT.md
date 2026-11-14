# OMNI backend contract: GitHub source, Railway backend, Lovable UI

Status audited 2026-11-12 (read-only checks; no secret values read, nothing sent to Railway or Jackboy).

## 1. Who owns what

| Part                                          | Holds                                                                                                                                                                                                   | Never holds                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **GitHub** (source)                           | Code for Mothership (synced by Lovable Git sync, one branch), and separately the OMNI/Jackboy repositories.                                                                                             | Running state, approvals, secrets. Mothership cannot see whether Git sync is connected; check Project settings → Git. |
| **Railway** (backend)                         | The OMNI service and Jackboy CODE, their own secrets (for example `CODE_PROVIDER_API_KEY`), and — later — the isolated sandbox.                                                                         | Mothership's database credentials or owner sessions.                                                                  |
| **Lovable / Mothership** (UI + control plane) | Owner sign-in and two-step codes, passkeys, Activation Approvals, Emergency Stop, kill switch, held tasks, Docking Bay, audit, per-agent memory records, the secure-link settings (names listed in §3). | Any provider API key for CODE, any shell or executor.                                                                 |

Each counterpart keeps its own knowledge: Mothership keeps owner-saved per-agent memory (§5); OMNI and Jackboy keep whatever they store on Railway. Nothing is shared between them today.

## 2. Audited state (2026-11-12 18:30 UTC)

| Check                                       | Result                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Preview typecheck                           | Passes.                                                                                   |
| Owner account                               | One owner; one confirmed authenticator (enrolled 2026-11-12 17:45 UTC); one OMNI passkey. |
| Emergency Stop                              | **Released** by the owner at 18:13 UTC. Releasing turns nothing on.                       |
| Terminal kill switch                        | Enabled by the owner (passkey) at 18:11 UTC.                                              |
| Activation Approvals                        | **0 of 10** recorded.                                                                     |
| `JACKBOY_LINK_SELF_TEST_ENABLED`            | **Not set** (off).                                                                        |
| Verified handshake / self-test with Railway | **Never recorded.** A ping only proved the Railway address answers.                       |
| Docking Bay                                 | No pair codes issued, no devices.                                                         |
| Executor / sandbox                          | None. `EXECUTOR_AVAILABLE = false`.                                                       |
| CODE, autonomy                              | Off. Agent budgets are $0.                                                                |

**Why `/omni-terminal` looks locked:** the page itself opens for the owner at two-step level; the _agent workspace_ stays locked because the self-test has never passed (and approvals 1–10 are not recorded). The page now shows a numbered checklist and one of five states: Stopped, Not authorized, Not connected, No device docked, Read-only.

## 3. Existing signed contracts (all built on the Mothership side)

All use HTTPS POST, platform certificate checks, refused redirects, a 5-second timeout, a 32 KB reply cap, 32-hex single-use nonces and Unix-second timestamps. The link secret stays on the server.

### `omni.link/v2` — handshake and protocol self-test (`POST {JACKBOY_LINK_ORIGIN}/api/public/omni/link`)

- Headers: `authorization: Bearer <session or bootstrap token>`, `x-omni-client`, `x-omni-timestamp`, `x-omni-nonce`, `x-omni-signature`.
- Signature: HMAC-SHA256(`OMNI_LINK_HMAC_SECRET`, `omni.link/v2\nPOST\n/api/public/omni/link\n<ts>\n<nonce>\n<sha256(token)>\n<body>`).
- Body: `{ action: "handshake"|"submit"|"run"|"status"|"cancel", projectId, jobId?, kind?: "protocol.self-test" }`.
- Reply must carry `x-omni-proof` and echo the nonce. Only a completed job whose runner is `restricted-protocol-self-test` with `result.passed === true` records `self_test_passed`.

### `omni.workspace/v1` — cloud shell relay (`POST {OMNI_SANDBOX_ORIGIN}/api/public/omni/workspace`) — **reference service in `services/omni-sandbox/`, not deployed**

- Goes to a **separate** sandbox service with its own `OMNI_SANDBOX_*` settings. Mothership refuses a sandbox address equal to the Jackboy host or a secret reused from the Jackboy link.
- Headers: `x-omni-client`, `x-omni-timestamp`, `x-omni-nonce`, `x-omni-signature`, `content-type: application/json`.
- Signature: HMAC-SHA256(secret, `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n<ts>\n<nonce>\n<sha256(body)>`).
- Body: `{ action, projectId, ...payload }` with actions `health.check {}` (live isolation probe, limits, provider and GitHub status), `repo.checkout {sessionId, jobId, repository, ref}`, `pr.propose {sessionId, jobId, title}` (returns a `pull_request`-gated diff step), `session.start {sessionId, agentId, allowedActions, provider}`, `chat.send {sessionId, jobId, agentId, autonomous, text}`, `command.run {… command}`, `events.poll {sessionId, jobId, cursor}`, `job.stop`, `agent.stop`, `session.end`, `step.decide {sessionId, jobId, stepId, approve}`.
- Reply: HTTP 200/202, `x-omni-proof` = HMAC(secret, `omni.workspace/v1\nresponse\n<nonce>\n<status>\n<raw body>`), JSON `{ contract, requestNonce, session?: {sandboxId, sandboxName, model}, job?: {status, cursor}, steps[] }` (schema `remoteReply` in `src/lib/omni-workspace.ts`). 404 is reported as "OMNI has no workspace endpoint yet". HTTP 409 is a signed refusal whose `error` text is shown; nothing ran.
- `command.run` never executes on arrival: it returns a `command` step with `pending_approval`; only `step.decide {stepId:"cmd", approve:true}` runs it. Output comes back through `events.poll` as `output` steps (`stdout`/`stderr`/`system`) and a final `result` step with `exitCode`.

### `omni.dock/v1` and `jackboy.omni-handoff/v1`

See `docs/OMNI-DOCK-PROTOCOL.md`. Docked devices get status, held proposals and stop-engage only.

## 4. Isolated sandbox prerequisites (Railway side, before any command can run)

The reference service (`services/omni-sandbox/`, deploy steps in its README) implements items 1–9 and was tested end to end **on Lovable's build machine only** (`src/test/omni-sandbox-interop.test.ts`, 11 checks). Whether Railway's container allows the no-network namespace is **unverified**: the service logs `network isolated` or `network open` at startup, and Mothership's self-test fails on `open`. If Railway reports `open`, the options are a host that allows user namespaces, or a sandbox provider with per-sandbox network off; Mothership's contract stays the same.

Mothership will not relay a command until **all** of these are true and evidenced:

1. A separate Railway service/project for the sandbox with **no** production secrets, database URLs or provider keys in its environment.
2. One short-lived container per session; non-root user; read-only base image plus a size-capped scratch directory wiped at session end.
3. CPU, memory, process-count and wall-clock limits per command; output streamed in capped chunks.
4. Network egress denied by default; any allow-list (for example a package registry) is an owner-approved, logged change.
5. No Docker socket, host mounts, SSH keys or cloud metadata access.
6. Stop by job ID and by agent ID that kills the process tree within a few seconds and reports `stopped`.
7. Every reply reports `sandboxId`/`sandboxName`, cost in cents and the model used; spend is checked against $1/task, $5/day, $10 total and each agent's own budget (currently $0).
8. Merge, deploy, publish, secrets, GitHub-permission and network actions come back as `gated` steps for the owner, never auto-run.
9. The `omni.workspace/v1` endpoint above, with proofs, plus the `omni.link/v2` self-test passing within 24 hours.

Mothership side for the cloud shell, in order: deploy sandbox → add `OMNI_SANDBOX_ORIGIN`, `OMNI_SANDBOX_CLIENT_ID`, `OMNI_SANDBOX_HMAC_SECRET` → `OMNI_SANDBOX_ENABLED=true` → kill switch enabled (passkey) → **Run sandbox self-test** (passkey; must pass within 24 h) → start session (passkey) → each command approved by you. Emergency Stop engaged at any time blocks every step. Activation Approvals 1–10 and the Jackboy link switches remain the gate for Jackboy CODE only.

Mothership's self-test passes only when the live probe shows: network isolated, non-root per-session user, no environment names beyond `HOME, LANG, OLDPWD, PATH, TERM`, clean probe exit, and limits within ceilings (≤300 s per command, ≤8 GB memory, ≤1 MB output, ≤5 sessions, 10 min idle, 60 min session). Providers show "Connected" only when the sandbox reports the key was accepted by the provider's model list.

## 5. Per-agent memory (built in Mothership; no outside backend)

- Stored in `omni_agent_memories`, one row per owner + agent (`omni`, `jackboy`, `jax`, `razul`, `sabrina`, `guardian`, `hercules`, `honeycomb`).
- The owner (verified email, owner role, two-step level) saves, lists and deletes through `omni_memory_save`, `omni_memory_list(agent)` and `omni_memory_delete(id, agent)`. There is no direct table access, and every call names exactly one agent.
- Each entry records its source (typed, terminal session, held task, document, web page) plus an optional reference and a SHA-256 fingerprint.
- `omni_agent_memory_audit` is append-only and stores only event, agent, entry ID and count — never titles, text or fingerprints — so a delete really removes the text.
- **No agent, model, OMNI on Railway or Jackboy reads these entries.** A future `omni.memory/v1` read path (signed, per-agent, owner-toggled, read-only, audited) is a design note only. Nobody should describe it as a durable external memory until it is built and tested end to end.

## 6. Local shell recovery (your own computer; no startup-file edits)

If a local OMNI/Evolution terminal seems stuck:

1. Press `Ctrl+C` once, wait, then `Ctrl+D`. If the screen looks garbled, type `reset` and press Enter (or `stty sane`).
2. Open a **new** terminal window or tab. Leave the stuck one alone; don't close anything that may be writing files.
3. To check whether your shell startup is the problem without changing it, start a clean shell just for this window: `zsh -f` (macOS default) or `bash --noprofile --norc`. If that works, the delay comes from a startup file; review it later, slowly, with a backup.
4. Find a stuck program: `ps -ef | grep -i -E "omni|evolution"` (macOS/Linux) or Task Manager (Windows). Stop only the process you recognise, with `kill <PID>`; use `kill -9 <PID>` only if it ignores that.
5. Check the companion: `evolution doctor` (or `omni doctor` if you installed it under that name). It reports problems and changes nothing.
6. Never paste keys, recovery codes or authenticator codes into a terminal or chat while troubleshooting.

## Autonomous Mode readiness (contract v0.2 — designed, not active)

Autonomous Mode is **OFF** and cannot be turned on in this build. The Mothership turns it on for one agent only when every gate below is met **at that moment**, from recorded, proof-checked evidence (missing or unreadable evidence counts as not met):

| Gate                          | Evidence the Mothership checks                                                                                                    | Status today                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Reviewed live verification    | `AUTONOMY_VERIFIED_RELEASE` set in code after a reviewed live Railway run of every gate                                           | **Missing** (null)                         |
| Signed connection + self-test | A `sandbox_self_test_passed` audit row from a signed, proof-checked reply, last 24 h, `OMNI_SANDBOX_*` configured and enabled     | **Missing** (not configured)               |
| Isolated shell                | Self-test health: network `isolated`, per-session user, non-root, only allowed env names, limits within ceilings                  | **Missing**                                |
| Sandbox supports windows      | Health reports `autonomy: "windowed"` (reference service v0.1 reports `"off"` and always waits for approval)                      | **Missing**                                |
| Live stop drill               | `autonomy_stop_drill_passed`: owner-passkey run of `sleep 30`, sandbox reported `running`, then `stopped` within 3 s, last 24 h   | **Missing**                                |
| Spend meter                   | Agent task/day/total budgets above $0 and a verified provider with prices; overall caps stay $1/task, $5/day, $10 total           | **Missing** (agent budgets $0)             |
| Agent                         | Enrolled, not paused, not Jackboy                                                                                                 | **Missing** (agents paused; Jackboy never) |
| Approval gates                | Merge, deploy, publish, secrets, GitHub permissions, network and pull requests stay owner-gated; sandbox reports `merge: "never"` | Code ready; health not reported            |
| Controls                      | Emergency Stop released, terminal kill switch on                                                                                  | Depends on owner settings                  |
| Passkey                       | Fresh single-use passkey check for purpose `autonomy`                                                                             | Asked at the moment of turning on          |

Windows are 15, 30 or 60 minutes. The database (migration 0047) also refuses any other length, refuses Jackboy, refuses opening while Emergency Stop is engaged/unreadable, the kill switch is off or the agent is not enrolled, forbids extending/reassigning/reopening, and ends every open window when Emergency Stop is engaged, the kill switch is turned off, or the agent is paused. Per-agent Stop and global STOP also end windows.

### What the sandbox must add for v0.2 (OMNI GitHub repo / Railway, not this project)

1. Report `autonomy: "windowed"` only once implemented.
2. Accept `autonomous: true` plus `autonomyExpiresAt` (ISO) on `command.run`/`chat.send`; re-check the expiry on **every** step server-side and fall back to waiting for `step.decide` once expired.
3. Auto-run only plain shell commands inside the isolated session. Anything touching merge, deploy, publish, secrets, GitHub permissions, outside network or pull requests must still return a gated `pending_approval` step.
4. Report `costCents` on every billed step; refuse a model call that would exceed the per-task budget sent by the Mothership.
5. Honour `job.stop`/`agent.stop`/`session.end` immediately while autonomous, and reply `stopped` on the next poll.
6. Keep per-agent queues separate: one agent's job never reads another agent's session directory, history or memory.

Until then the Mothership always sends `autonomous: false`.

## OMNI CODE supervised queue and Mac companion (designed; nothing connected)

OMNI is the motor; CODE is its terminal/coding engine. **Always-on** = the service may pick up jobs the owner already authorized, continuously, inside these limits. It is not unlimited shell privilege and not standing approval of destructive work. Jackboy's autonomous mode stays OFF independently and Jackboy jobs are refused by the queue.

**Queue (`omni_code_jobs`, migration 0048)** — states `queued → leased → running → succeeded`, with `awaiting_approval`, `retry_wait`, `paused`, `failed`, `stopped`, `cancelled`.

- Bounded concurrency: default 3 at once (max 5), 2 per agent (max 3), 20 starts per agent per hour (max 60).
- Leases last 120 s and are renewed by checkpoints. An expired lease returns the job to `queued` and it resumes from its last checkpoint. An interrupted destructive job goes back to the owner instead of resuming.
- Retries: retryable failures back off 30 s, 60 s, 120 s… (max 15 min), at most 3 attempts (max 5). Destructive jobs are never retried automatically.
- Spend: the existing $1/task, $5/day, $10 total caps and per-agent budgets apply to every billed step.
- Idle scheduling: optional allowed hours; Mac jobs run only while the companion reports the Mac idle ≥ N minutes (default 10).
- Always-on authorization lasts at most 24 h and is renewed with a passkey. The database refuses a lease while it is off or expired, while Emergency Stop is engaged or unreadable, while the kill switch is off, for a paused agent, for Jackboy, during retry back-off, or for an unapproved file change. Emergency Stop or kill switch: always-on off and active jobs stopped. Agent pause: that agent's jobs paused.
- Every event goes to append-only `omni_code_job_events`.
- Per-agent memory stays in the existing owner-only per-agent store; a worker receives only the memory the owner attaches to that job.

**Mac companion contract `omni.files/v1` (to be built in the companion, e.g. `omni_desktop`)**

1. Docks through `omni.dock/v1` (device key, owner approval). No full disk access by default; it reads only owner-granted folders (`omni_mac_folder_grants`: a folder inside `/Users/<you>/`, never the home folder itself, `Library`, `Applications`, `.ssh`, `.gnupg`, `.aws`, `.config`, `.Trash` and similar; read-only or organize; 1–30 days; never widened; revocation permanent).
2. Signed heartbeat at least every 60 s including idle seconds. No heartbeat = disconnected = no Mac jobs (fail closed).
3. `inventory`: metadata only (path, size, modified time, folder/symlink flags) for one grant; never file contents.
4. The Mothership builds a **dry-run plan**: create folders and move files by rule, rename on a name clash (`name (2).ext`). It never generates overwrite or delete. Symlinks, hidden files and anything outside the grant are skipped.
5. Owner approves the exact plan (SHA-256 of the canonical plan). `overwrite` (old file kept in `.omni-undo/`) and `trash` (macOS Trash, never permanent delete) each need their own confirmation; the database refuses approval otherwise. Plans cannot be edited after creation.
6. `apply`: the companion recomputes the digest, re-checks each file's size and modified time before each step (changed → skipped), stays inside the grant, refuses symlinks, and journals every step (`omni_file_journal`, append-only).
7. `undo`: inverse steps newest-first (moves back, backups restored, Trash items put back, created folders removed only if empty), each re-checked first.
8. Pause/Stop/Emergency Stop are honoured between every step.

## Unified activation and separate bounded executor (feature branch; not deployed)

`feat/unified-activation` rebases onto Mothership main `6ea3619` and integrates its
connection-only Step 9 diagnostics. Approval flow **v7** changes approval semantics:
Step 9 now persists an authorized connection in Jackboy and verifies a signed,
fresh reply before completing the approval. Step 10 verifies CODE gateway/workflow
identity, spending enforcement and the separate executor's signed configuration,
then persists configuration. Neither approval releases Emergency Stop, enables
CODE, arms the executor or starts a plan.

Mothership migration `0054_unified_activation.sql` stores owner-bound operation IDs,
locked prerequisite revisions, expiration and audit evidence. Only the service
finalizer can complete Steps 9/10 after actuation. Expiration, a concurrent
prerequisite change, recovery during activation or failed auditing prevents
completion. Lost finalization acknowledgements read the persisted result instead
of blindly reconnecting. Failed Step 9 revokes the connection; failed Step 10
unconfigures it. An unverified rollback stays unresolved. Use **Reconcile pending
activation** with fresh authentication; this rolls back and closes a failed
attempt, never approves it. If an approval was recorded but is no longer effective,
refresh and explicitly revoke that step before requesting a new approval.

Jackboy migration `0064_omni_execution_authority.sql` is the durable admission and
safety authority. CODE Stop and global pause disarm and request cancellation
transactionally. The cancellation outbox retains failures; acknowledgement is
atomic with audit. Both dashboards show configuration separately from the
effective **Blocked / Configured / Running** state. A stale/unreadable signed reply
is Blocked, never an invented live state. Cancellation pending is not confirmed
termination. Disarm, Stop and reconciliation never auto-release either Stop.

### Executor scope and trust boundary

`services/omni-autonomous/executor.mjs` is a new, separate Node 26/Linux service
(`omni.autonomous/v1`, release `omni-bounded-plan-1`), default disabled. It is **not**
a model-driven agent, general shell, repository worker, existing CODE runner,
manual sandbox or the designed windowed/mac queues described above. It executes
only an exact owner-authorized plan: at most five allowlisted argv commands,
10 seconds each, 30 seconds total and a 60-second authorization. Jobs are hash-bound,
claimed durably once in Jackboy, and never resumed or retried automatically.

Bubblewrap namespaces isolate network, process IDs, filesystem and scratch; the
worker is non-root with scrubbed environment and CPU/memory/process/file/output
ceilings. Before each command and every 250 ms during a command, authenticated
Jackboy permission is rechecked (1.5-second transport deadline; replies older than
2 seconds are refused). Unknown safety aborts; cancellation waits for process
termination, including descendants. Thus remote loss detection is bounded, not
instantaneous propagation. No network/model/provider calls are supported inside
plans. `providerCostUsd: 0` measures that absence, **not** infrastructure cost.
The executor receives no Supabase, production link, GitHub, provider or manual
sandbox credentials. Manual diagnostics keep their existing independent policy;
no manual terminal gate is relaxed by this feature.

### Exact remaining owner actions (none performed by this branch)

1. Review both branches, migration journals and backup/rollback plans. Separately
   authorize isolated staging deployment and migrations before any production work.
   Mothership 0053 is reserved for the intelligence branch and is not applied or
   added here; reconcile that branch's journal ordering before combining migrations.
2. Provision the dedicated Linux executor using its Dockerfile, initially
   `OMNI_AUTONOMOUS_ENABLED=false`. Do not reuse the legacy protocol/manual service.
   Configure `OMNI_EXECUTOR_ORIGIN` and `OMNI_EXECUTOR_CONTROL_SECRET` on Mothership
   and Jackboy; control secret on the executor. Configure separate
   `OMNI_EXECUTOR_PERMISSION_SECRET` / `OMNI_EXECUTOR_PERMISSION_TOKEN` on Jackboy
   and the executor, plus executor `JACKBOY_LINK_ORIGIN` and `OMNI_LINK_CLIENT_ID`.
   Existing production credentials must not be rotated or copied into tests.
3. Independently prove Linux isolation/resource/descendant cancellation on the
   exact staging image:
   `OMNI_LINUX_ISOLATION_TEST=true node --test tests/omni-autonomous-linux.test.mjs`.
   Test signed cross-system Stop, expiry, network loss and restart against staging.
   Never use privileged containers or weaken isolation to make verification pass.
4. On Mothership, authenticate freshly and approve Steps 1-8 using the real signed
   Step 8 proof and current approval window; approve Step 9. Confirm the live
   connection in both dashboards. Run **Verify executor** explicitly; this performs
   a diagnostic self-test/cancellation drill, not an autonomous plan.
5. Only after independent review, manually set
   `OMNI_AUTONOMY_REVIEWED_RELEASE=omni-bounded-plan-1` on all three services.
   Confirm the existing $10 cap/$5 daily controls and approve Step 10. Configuration
   may be present while effective execution remains Blocked.
6. If execution is separately authorized, explicitly release global pause and
   enable CODE through Jackboy's existing fresh-passkey gates; no Step 9/10 action
   does this. Separately authorize enabling the dedicated executor and set
   `OMNI_AUTONOMOUS_ENABLED=true` there. Click **Authorize autonomous capability**
   with fresh Mothership authentication. Arming starts nothing.
7. Enter one reviewed JSON command array and explicitly press **Authorize and run
   this plan once**. Fresh owner approval and live Jackboy permission are required.
   Verify the result and Stop cancellation before any broader activation decision.

### Evidence and deployment boundary

All implementation and disposable tests remain on isolated feature branches.
Neither migration is applied to a hosted database. No merge, push, deployment,
owner approval, Stop release or production activation occurred. Docker's daemon is
unavailable in this macOS environment; real Linux isolation and live cross-system
connection/cancellation remain **unverified**, and the new executor remains disabled.
Public build markers identify deployed screens only, not authenticated safety or
our uncommitted branch. Verification results below are local fixture evidence.
