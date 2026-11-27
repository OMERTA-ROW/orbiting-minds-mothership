# OMNI / Jackboy integration: Mothership-side audit and safe completion

Date: 2026-11-27. **Overall integration-ready: NO. Autonomy was not enabled.**

## Scope and evidence standard

This turn changed Mothership source only. No deployment, merge, hosted migration, credential change, visibility change, role change, external repository write or remote execution occurred. OMNI and Jackboy were inspected as read-only snapshots:

- Jackboy Dev Control: `6f88a7aa`.
- OMNI: `fdffd4cd`.
- Local test copies contained source and temporary test dependencies, not source-project credentials. Temporary databases, TLS certificates and synthetic identities never entered working pages or the shared database.

**Live verified** below means the exact observed preview/shared-backend behavior, not a successful coding workflow. **Implemented but unverified** means source plus bounded local tests without current remote acceptance. **Demo/mock** means test fixtures, synthetic no-op work or retired prototypes—not a usable developer integration. **Blocked** names the prerequisite preventing real use. A historical approval or credential name is not proof of a present connection.

## Changes completed

1. Fixed an unsafe cancellation claim in `src/lib/unified-activation.functions.ts`: after a failed plan response, signed disarm must report no armed work, **zero running jobs**, and no pending cancellation before cancellation is called confirmed. Previously the error path omitted the running count, unlike the existing Stop path. Dispatch is never replayed.
2. Fixed `src/lib/omni-spend-evidence.ts`: a future-dated permit record no longer appears fresh or advertises `spendingCapUsd`.
3. Added an additive `execution` section to `src/lib/omni-contract.ts` discovery. It explicitly keeps `integrationReady:false`, CODE/workspace unavailable, restricted self-test authority, metadata-only handoff, quarantine-only dispatch and unverified remote cancellation. Existing OMNI fields, IDs, URLs, scopes and version remain compatible. The OMNI frontend may ignore this extra field; its UI was not changed.
4. Added concrete regression tests for both reproduced bugs, clean/uncertain disarm outcomes, transport failure, no replay and the rule that configured models plus fresh caps cannot imply integration readiness. Removed touched test non-null assertions.

Both bugs were first reproduced by failing tests, then passed after the fixes. No execution gate or reviewed-release pin was relaxed. Background and all UI presentation code are unchanged.

## Feature inventory

| Feature | Classification | Exact source / route | Evidence, boundary and blocker |
|---|---|---|---|
| Owner-only access | **Live verified: denial only** | `/omni-terminal`, `/activation-approvals`, `/omni-api-keys`; `src/lib/razul-owner.server.ts`, `src/lib/omni-workspace.functions.ts` | Restored actual owner session; it lacks aal2. Desktop/mobile show authenticator/owner sign-in gates with no private controls exposed. Successful owner operation remains unverified; no MFA bypass. |
| Tenant/owner isolation | **Implemented but unverified live positive flow** | `drizzle/migrations/0020*` onward; `src/lib/omni-delegation*.ts` | Disposable SQL checks exercise other-user/admin/aal1 refusal, scopes, quotas, concurrency and no direct client writes. No new hosted tenant fixtures created. |
| Emergency Stop | **Live verified: stored state only** | `omni_terminal_controls`; `src/lib/unified-stop.server.ts`, `src/lib/jackboy-safety.server.ts`; `/api/public/jackboy/safety-event` | Shared backend reports Stop **released**, last changed Nov 12; not changed this turn. Fail-closed Stop and durable reduction tested locally. A current remote termination drill is not verified. |
| Owner approvals/passkeys | **Implemented but unverified current live operation** | `/activation-approvals`; `src/lib/activation-*.ts`, `src/lib/omni-workspace.functions.ts` | Current backend: live-link activation active, autonomy activation revoked, both dated Nov 19. These are history, not current signed reachability. Fresh code/passkey must be supplied by owner. |
| Mothership health/manifest gateway | **Live verified: unsigned refusal only** | `/api/omni/health`, `/api/omni/manifest`; `src/lib/omni-contract.server.ts` | Actual unsigned requests return 401. Positive scoped-key calls are covered locally; no owner API key issued this turn. Execution readiness explicitly false. |
| Coding gateway page | **Demo/mock: retired** | `/omni-gateway`; `src/lib/retired-areas.ts` | Honest not-connected page; not a CODE gateway. No simulator reactivated. |
| Provider/model discovery | **Implemented but unverified live authenticated read** | `src/lib/omni-contract.ts`, `src/lib/omni-contract.server.ts` | Configuration Boolean and installed capability probes only. Lovable AI and Anthropic credential names exist; no inference/provider health call made. Configuration is not a verified response. |
| Agent discovery | **Implemented but unverified live enrollment** | `src/lib/omni-chat-agents.ts`, `src/lib/omni-contract.ts`, `omni_agents` | Manifest distinguishes OMNI/Dread/Draco text agents from six held-task IDs. Shared `omni_agents` has no rows on this read; declarations do not enroll external developers. JAX/Hercules/Guardian have no verified live adapter. |
| Owner delegation | **Implemented but unverified current cross-site owner flow** | `/omni-authorize`; `/api/public/omni/delegation/{token,status,revoke}`; `src/lib/omni-delegation*.ts` | Single-use PKCE, exact callback/client, 15-minute hash-only bearer, per-scope consent. 239 disposable SQL checks pass. No live code exchange performed with owner's MFA. |
| Held tasks | **Implemented but unverified owner write/readback** | `/api/omni/tasks`, `/api/omni/held-tasks`; `src/lib/omni-terminal*.ts` | Persisted held-only queue, idempotency and cancel locally tested. Creation never means execution. No task added to shared backend this turn. |
| Private agent chat | **Implemented but unverified live reply** | `/api/omni/chat`, `/api/omni-agent`; `src/lib/omni-delegated-chat.server.ts`, `src/lib/omni-agent.server.ts` | Actual unsigned chat 401. Requires owner/member checks, AI approval, released Stop, shared durable provider guard and quota. Text only; no tool registry or repo execution. |
| Fusion rules planner | **Implemented but unverified live owner proposal** | `/api/omni/fusion/plans`; `src/lib/omni-fusion*.ts`; migration 0069 | Actual unsigned POST 401; 395 disposable checks plus 9 concurrent races pass. Rules-only held-task proposal; 10/owner/rolling day; no models, dispatch or approvals. |
| Dread/Draco Fusion collaboration | **Implemented but unverified live inference** | `src/lib/fusion-duo*.ts`, `src/lib/claude-fusion.ts`; migrations 0072–0075 | Bounded owner-click text turns, independent AI/Stop/budget checks. Does not orchestrate coding or confer authority. No paid turn performed. |
| Full Fusion orchestration | **Blocked** | `docs/OMNI-FUSION-REQUIREMENTS.md`, `src/lib/omni-fusion.ts` | Missing reviewed execution/tool bridge, consulted-agent evidence and per-step approved dispatch. Do not attach tools to rules-only planner. |
| Jackboy signed link | **Implemented but unverified deployed connection** | `src/lib/jackboy-link.server.ts`; Jackboy `src/lib/omni-session.server.ts`; `/api/public/omni/link` on Jackboy | Real handlers pass local TLS/database interoperability, HMAC tamper rejection, idempotent handshake, session recovery and audit-failure cases on Node 26. Fixed self-test only; not coding. |
| Jackboy protocol runner | **Implemented but unverified deployed runtime** | Jackboy `src/lib/omni-session-runner.server.ts`; `scripts/omni-link-server.mjs` | Requires Node >=26 with permission API, or reviewed remote restricted runner. Test initially failed on local Node 22; passed on Node 26.13.1. This is a runtime prerequisite, not a protocol defect or CODE acceptance. |
| Mothership-to-Jackboy handoff | **Implemented but unverified live dispatch** | `src/lib/jackboy-handoff*.ts`; Jackboy `src/lib/omni-handoff-v1*.ts`; `/api/public/omni-handoff/v1` on Jackboy | Owner-selected project, signed create/status, digest and bounded replies. Metadata only. No handoff sent this turn. Existing contract has no remote cancel operation. |
| Jackboy-to-Mothership dispatch | **Live verified: disabled; local interoperability verified** | `/api/public/jackboy/dispatch`; `src/lib/jackboy-dispatch*.ts`; migration 0031 | Actual POST returns 503 `dispatch_disabled`; missing dispatch settings. Local real-handler test proves signed quarantine intake, status, cancellation and callback. Only `test` kind, quarantined/cancelled; never execute. |
| Signed budget permits | **Implemented; current evidence stale** | `src/lib/jackboy-permit.server.ts`, `src/lib/omni-spend-evidence.ts`; `jackboy_permits` | Shared backend has 9 released permits; latest Nov 19, expired Nov 19. Limits $0.50/call, $1/job, $5/day; one active permit. No fresh permit requested. Local real Jackboy permit/Stop/no-op integration passes. |
| CODE queue/executor | **Blocked** | `src/lib/omni-code.functions.ts`, `src/lib/omni-code-queue.ts`; `omni_code_jobs` | Queue policy and leasing schema exist; no connected general coding worker. Zero CODE rows on this read. 46 disposable checks pass; no build/test/clone claimed. |
| Synthetic no-op worker | **Demo/mock: test diagnostic only** | `src/lib/omni-noop-worker.ts`, `src/lib/omni-noop-broker.server.ts`, `scripts/omni-noop-worker.ts` | Timer/heartbeat diagnostic. Real-handler Stop/cancel test passing does NOT prove command execution. Kept as explicit test fixture, not substituted for CODE. |
| Bounded command executor | **Blocked** | `services/omni-autonomous/executor.mjs`; `src/lib/unified-activation.functions.ts`, `src/lib/unified-activation.server.ts` | Actual allowlisted launcher exists; source release `omni-bounded-plan-3-unreviewed` differs from accepted `omni-bounded-plan-2`. Left mismatched intentionally until review. No host or command invoked. Not a Git/build worker. |
| Workspace sandbox/terminal | **Blocked** | `services/omni-sandbox/*`; `src/lib/omni-workspace*.ts`, `src/lib/omni-sandbox-config.server.ts`; `/omni-terminal` | Separate isolation/watchdog/recovery source exists. Workspace self-test remains containment-blocked; zero persisted sessions. Missing sandbox config. Kernel containment/reboot/persistence acceptance cannot be inferred from local unit tests. |
| Progress/cancellation | **Implemented but unverified real coding termination** | `src/lib/unified-activation.functions.ts`, `src/lib/unified-stop.server.ts`, `services/omni-sandbox/workspace-command.mjs` | Signed states, lease monitoring, journals and local tests exist; failed-plan cancellation invariant fixed. Local cancellation is not proof of remote handoff cancellation; status polling on handoff is paused during Stop. Missing remote cancel contract is a real blocker. |
| GitHub import vs branch/commit/PR | **Import implemented; developer writes blocked** | `/projects`; `src/lib/evolution-control*.ts`; Jackboy GitHub App modules | Workspace GitHub connection linked; names only checked this turn. No GitHub API call or repository write. Owner-selected installation, disposable repo, durable clone, dirty-tree refusal and draft PR acceptance required. Earlier org OAuth restrictions are historical, not newly probed. |
| Jackboy developer memory | **Blocked** | Dread/Draco memory exists separately; Neuro registry is metadata | No approved per-repository Jackboy developer-memory adapter. Never reuse chat-agent memory or owner credentials as implicit grants. |
| Lovable project create/provider | **Blocked** | Project directory supports manual links | No verified official project-creation API credential/contract. Managed AI credentials are not project-creation authority; do not invent a secret name or provider API. |
| Browser voice | **Implemented but unverified native audio** | `src/lib/omni-voice.ts`; OMNI `src/hooks/use-voice.ts` | 11 Mothership voice tests pass: identity, opt-in/browser fallback and honest unconnected-agent naming. No microphone or real playback exercised. No new TTS connection, audio or billing. |
| Package distribution | **Blocked; offline source tested** | `cli/README.md`, `cli/internal/companion/*`; OMNI `src/lib/terminal-release.shared.ts`, `/omni-download`, `/terminal/download` | Go race tests/vet pass. No signed release downloaded/published, OS installer run or PATH change. OMNI release contracts require provenance/hashes/signing/notarization; unsigned owner-only GitHub handoff is not a public release. |
| Honeycomb | **Blocked** | `src/lib/omni-dock*.ts`, `docs/OMNI-DOCK-PROTOCOL.md`; prior Honeycomb source audit | Mothership signed pairing/read/held/Stop contract exists. Honeycomb has a separate LAN PTY, not this cloud adapter; simulated jobs/local flags do not authorize execution. No paired device or hardware test. Prior audit only, not a refreshed Honeycomb snapshot this turn. |

## Test evidence

### Passing

- Full application suite: **1,545 passed / 23 skipped, 118 passing files / 3 skipped** (`bunx vitest run`). Skips cover 9 Linux lifecycle, 3 supervisor, 11 containment checks; they are not passes.
- New/focused safety suite: **48 passed**, including five failed-plan cancellation cases, future-record refusal, additive manifest boundaries and existing Stop tests. Included in full count.
- Real Mothership/Jackboy source interoperability: **21 passed, zero skips** on **Node 26.13.1**, Jackboy snapshot `6f88a7aa`, isolated PGlite and locally trusted test TLS. Covers fixed self-test, handshake reuse, signatures, expiry, audit, quarantined dispatch/callback, and Stop during a synthetic no-op. This is local cross-repository evidence, NOT a deployed connection or coding acceptance.
- Separate service suite: **66 passed / 11 skipped**. Admission, leases, recovery, replay, decisions, durable health evidence and cancellation checks. Host/cgroup tests skipped where prerequisites were not supplied; no kernel/persistence certification.
- Disposable PostgreSQL: **758 checks** (42 terminal + 239 delegation + 395 Fusion + 46 CODE + 36 Jackboy safety), plus **9 real concurrent Fusion races**. No hosted migration or fixtures. Initial bundled PostgreSQL lacked `dict_snowball`; rerun with complete PostgreSQL 17.12 passed.
- CLI: `go test -race -count=1 ./...` and `go vet ./...` passed with Go 1.26.10; no packages distributed.
- Changed TypeScript lint and `git diff --check` passed. Latest preview compilation: **build OK**.
- Browser: actual signed-in owner, 1280×1800 and 390×844. Home live scene retained; private terminal/approvals/key dashboard deny absent MFA, no horizontal overflow or page errors. Successful owner read/write/reload/dispatch remains blocked. No owner OTP/passkey entered by the agent.
- Actual unsigned API checks: health/manifest/held tasks 401; POST chat/Fusion 401; POST dispatch 503 disabled; invalid token exchange 400. GET on POST-only routes returns the app fallback, not authenticated API data—those earlier 200 GET responses were not counted as successful endpoint checks.

### Reproduce locally

```text
bunx vitest run
JACKBOY_TEST_ROOT=<secret-free-temporary-Jackboy-source-with-PGlite> \
  nix shell nixpkgs#nodejs_26 -c node --import tsx --test \
  tests/jackboy-link-integration.test.mjs \
  tests/jackboy-dispatch-integration.test.mjs \
  tests/jackboy-dispatch-quarantine.test.mjs \
  tests/jackboy-noop-worker-integration.test.mjs
nix shell nixpkgs#postgresql_17 -c python3 src/test/test_omni_terminal_sql.py
```

Use the same PostgreSQL shell for the other four named SQL scripts. Do not point test identities/configuration at a real provider or shared database. Initial Node 22 handshake failures were resolved by the required runtime, not by changing Jackboy or weakening runner readiness.

## Exact owner actions / unresolved prerequisites

None of these actions was performed automatically. **Do not enable autonomy, publish, merge or apply a production migration under this audit.**

1. Complete owner two-step sign-in and register/use the existing passkey. Then personally verify the free held-task/delegation/Fusion flow. Agent cannot manufacture aal2 or sign approvals.
2. Select one **disposable private repository**, explicit project ID, protected target branch and allowed tools. Review GitHub App/OAuth organization access and least-privilege selected-repository permissions in Jackboy. No default-branch writes, force push, dirty-clone overwrite or automatic execution of repository code.
3. Provide/review a separate executor host, durable workspace storage and current signed health/version evidence. Reconcile accepted release with the unreviewed source only after independent isolation review; changing a release string is not acceptance.
4. Run isolated non-root, environment-secret denial, network denial, read-only host mounts, cgroup CPU/memory/PID, durable nonce/restart/reboot and orphan cleanup tests on the intended host. Verify detached descendants terminate on cancel/Stop and network loss, and require zero running/armed/pending state. This sandbox lacks the installed Bubblewrap binary; host-specific tests were not bypassed.
5. Coordinate in OMNI and Jackboy's own projects: compatible scoped delegation callback, signed admission/permit identities and exact plan hash, tool policy, developer queue, project/repo memory, progress events and an explicit remote cancel operation. Mothership-side held handoff cannot invent that remote operation.
6. For a later separately authorized acceptance run: owner click → exact reviewed tool plan → fresh bounded permit → isolated selected-repo checkout → build/test → progress readback → cancel/Stop drill → zero running jobs/permit release → owner-reviewed draft PR only. Replay, stale approvals, wrong tenant/repo/hash, dirty clone, unknown tools, expired lease and lost outcomes must refuse. No paid step is automatically retried. Do not perform this run before its gates and separate activation approval.
7. Browser voice needs actual device permission/playback tests; server voices require a separately chosen authorized provider. Packages need real signed/notarized artifacts, provenance/checksum verification and native install/uninstall tests. No mandatory companion installation.

### Missing setting names only

From this project's secret-name inventory, the workspace sandbox lacks:

- `OMNI_SANDBOX_ORIGIN`
- `OMNI_SANDBOX_CLIENT_ID`
- `OMNI_SANDBOX_HMAC_SECRET`
- `OMNI_SANDBOX_ENABLED` (switch, not a credential; **do not turn on before reviewed acceptance**)

The quarantine receiver lacks:

- `JACKBOY_DISPATCH_CLIENT_ID`
- `JACKBOY_DISPATCH_HMAC_SECRET`
- `JACKBOY_DISPATCH_ENABLED` (switch; enabling it would only allow reviewed quarantine receipts, not CODE)

Existing names include `OMNI_EXECUTOR_ORIGIN`, `OMNI_EXECUTOR_CONTROL_SECRET`, `OMNI_LINK_*`, `JACKBOY_HANDOFF_*`, `JACKBOY_LINK_*` and `JACKBOY_SAFETY_EVENT_HMAC_SECRET`. Presence is known; matching values, valid approval windows and current endpoints are **not verified**. Executor-side permission credentials are separate and cannot be checked through this project's secret inventory. No provider secret value is reproduced here. No missing Lovable project-creation credential name is invented.

## Changed files

- `src/lib/unified-activation.functions.ts`
- `src/lib/unified-activation.functions.test.ts`
- `src/lib/omni-spend-evidence.ts`
- `src/lib/omni-spend-evidence.test.ts`
- `src/lib/omni-contract.ts`
- `src/lib/omni-contract.test.ts`
- `src/lib/AGENTS.md`
- `roadmap.md`
- `docs/OMNI-JACKBOY-INTEGRATION-AUDIT-2026-11-27.md`

**Remaining simulations:** explicitly synthetic test no-op worker, contract stand-ins in unit tests and retired gateway/prototype routes. They were not relabelled as real integrations. No fake developer execution was replaced by an unreviewed general shell. Safe local development is complete for the identified contract gaps; actual integration remains blocked by the owner/session, host/remote-contract and release prerequisites above.