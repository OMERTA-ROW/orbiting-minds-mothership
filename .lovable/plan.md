# Jackboy as a working software developer: read-only audit and plan

This audit is read-only. No code, database, permission, credential or deployment changes were made. The Jackboy Dev Control project's own source was not inspected. Its side of the work is marked unverified.

## 1. What exists today (this project, source evidence)

| Area | Files / routes | Status |
|---|---|---|
| Owner Terminal, Emergency Stop, kill switch, passkeys | `/omni-terminal`; `src/lib/omni-workspace.functions.ts` (`setKillSwitch`, `stopWork`, `runStopDrill`, passkey functions); `src/lib/unified-stop.server.ts` | Exists. Stop fails closed |
| Sandbox self-test | `runSandboxSelfTest` (line 288). Always appends `WORKSPACE_CONTAINMENT_BLOCKER` and forces `passed=false` (`src/lib/omni-workspace.ts:8`) | Exists, but by design it can never pass |
| Chat / command / PR proposal | `sendChat`, `runCommand`, `proposePullRequest`, `pollSession` (lines 526–620) relay over the signed `omni.workspace/v1` link | Wiring exists. Blocked because the self-test never passes |
| Jackboy link and protocol self-test | `src/lib/jackboy-link*.ts`, secrets `JACKBOY_LINK_*` | Exists. Fixed protocol self-test only |
| Jackboy handoff (held task to Jackboy) | `src/lib/jackboy-handoff*.ts`; `sendTaskToJackboy`, `refreshTaskHandoff`; secrets `JACKBOY_HANDOFF_*` | Exists. Sends metadata only |
| Quarantine dispatch receipts | `/api/public/jackboy/dispatch`, `src/lib/jackboy-dispatch*.ts` (approve/revoke/callback) | Exists. Receive-only |
| Safety events / permits / spend evidence | `/api/public/jackboy/safety-event`, `/api/public/jobs/jackboy-safety`, `src/lib/jackboy-permit.server.ts`, `src/lib/omni-spend-evidence.ts` | Exists. Spending caps count only when backed by a fresh signed Jackboy permit |
| CODE queue | `src/lib/omni-code.functions.ts` (`readCodeService`, read-only), `src/lib/omni-code-queue.ts`, tables `omni_code_jobs`, `omni_mac_folder_grants`, `omni_file_plans` | Status page only. Nothing leases or runs jobs |
| Fusion | `src/lib/omni-fusion*.ts` (rules-only planner, no model or task-change calls allowed), `/api/omni/fusion/plans`; `src/lib/fusion-duo*.ts` (Dread/Draco text) | Exists. Plans only; executors are owner/Jackboy controls |
| Models | `src/lib/ai/anthropic.server.ts`, `omni-agent.server.ts`, `omni-responses.server.ts` | Text only. The system prompt says "You have NO tools" |
| Executors (separate hosts) | `services/omni-sandbox/*` (quarantined), `services/omni-autonomous/executor.mjs` (allowlisted argv, bubblewrap, disabled by default) | Source exists. No deployment, host or deployed version has been verified |
| Projects / GitHub | `/projects`, `src/lib/evolution-control*.ts`; GitHub connector (`GITHUB_API_KEY`), metadata import | Read-only repo metadata only. Personal repos returned none; OMERTA-ROW restricts third-party apps (403 on Neuro PR #1) |
| Persistent memory | Dread/Draco owner-reviewed memory (0070–0071); Neuro registry (0079–0080) | Exists for chat agents. Jackboy has no developer memory |

## 2. Missing or unverified

- **Model tool use:** missing. No tool registry and no `tools` sent to any model, so the model cannot call anything.
- **Project list/create/tasks for Jackboy:** tasks are held only. There is no create-project action and no Lovable provider connection (no Lovable project API credential beyond the gateway `LOVABLE_API_KEY`, which is for AI only).
- **GitHub branch, commit and PR:** missing. The connector is used read-only. No GitHub App with contents/pull-request write access is installed on OMERTA-ROW.
- **Real terminal execution, build, test and clone:** missing in this app (the Worker cannot run processes, by rule). `OMNI_EXECUTOR_ORIGIN` and `OMNI_EXECUTOR_CONTROL_SECRET` exist, but the host behind them, its version and its isolation are unverified.
- **Progress and cancellation:** polling and Stop exist. A per-job cancel signal reaching a real executor is unverified.
- **Honeycomb:** Honeycomb has a real local network terminal (Python PTY, `companion/honeycomb/lan.py`, `pty_session.py`). Its account-side readiness reports `executionAllowed:false`; OMNI is unconfigured there and its jobs are simulated. No Mothership adapter, dispatch endpoint or signing contract exists on either side.
- **Jackboy Dev Control:** its endpoints, signature verification, permit issuance and runner behavior are unverified from this project.

## 3. Prioritized plan (future authorized writes, each step needs owner approval)

1. **Verify the executor host (no code).** Confirm the Vultr host, the deployed version of `services/omni-autonomous` and `services/omni-sandbox`, and run `isolation-diagnostic.mjs`. Acceptance: signed health report with matching version, non-root worker, cgroup/prlimit limits, network deny, watchdog kill within 5 s.
2. **Replace the forced self-test failure with real evidence** in `omni-workspace.ts`/`runSandboxSelfTest`. It should pass only on verified containment and durable replay protection. Acceptance: replayed nonce rejected; Stop engaged causes a refusal; a host older than 24 h causes a refusal.
3. **Tool registry (new `src/lib/jackboy-tools.ts`).** Fixed, typed tools: `repo.read`, `fs.plan_edit`, `cmd.run_allowlisted` (build/test/lint), `git.branch`, `git.commit`, `pr.open_draft`. The model only proposes tool calls; the server checks Stop, permit and caps, then relays to the executor. Acceptance: an unknown tool or argument is rejected; tools are refused while Stop is engaged; a step over the cost cap is refused before the call.
4. **GitHub write path.** Install a GitHub App on OMERTA-ROW with only contents and pull-request permissions on selected repos. Branch, commit and push happen only on the executor. Draft PRs only, no force push, no default-branch writes. Acceptance: pushing to main fails; a PR opens only after a passkey approval; a dirty clone is never overwritten.
5. **Jobs, progress and cancel.** Bring the CODE queue to life (lease, heartbeat, events, cancel), with Stop cancelling every job. Acceptance: cancel kills the process within 5 s; a lost heartbeat marks the job failed; there is no automatic retry of paid steps.
6. **Jackboy developer memory.** Per-repo notes, owner-reviewable, following the Dread/Draco pattern. Acceptance: nothing is saved without the owner switch; memory is deletable.
7. **Fusion routing.** Fusion plan steps can name Jackboy tool calls, still executed only through step 3's gates. The `omni-fusion*.ts` allowlist stays unchanged; the bridge lives in a new module. Acceptance: Fusion cannot start a tool call without an owner click.
8. **Honeycomb (cross-repo).** Define a signed dispatch envelope (version, requestId, hostId, approvalId, expected revision) and a Honeycomb adapter. Mac execution stays local and needs approval on the Mac. Acceptance: revoked device refused; replay refused; a command not on the allowlist refused.
9. **Lovable project create/link.** Only if Lovable offers an official API credential; otherwise this stays a manual link. Acceptance: no create button appears without a verified credential.

Cross-repo work: Jackboy Dev Control needs matching permit signing, tool policy and runner endpoints (steps 3–5). Honeycomb needs the adapter (step 8). Neither will be changed from this project.

## 4. What the owner must configure (names only, no values)

- Turn on two-step sign-in (aal2) on the owner account and register a passkey.
- Provision the executor host. Confirm `OMNI_EXECUTOR_ORIGIN`, `OMNI_EXECUTOR_CONTROL_SECRET` and `OMNI_LINK_*` match it. Set `OMNI_SANDBOX_ENABLED` only after step 1 passes.
- Install a GitHub App on OMERTA-ROW, or allow the existing OAuth app in the organization's third-party access settings, limited to selected repos.
- Confirm Jackboy permit signing and the `JACKBOY_*` origins point to the deployed Jackboy Dev Control.
- Reconfirm spending caps ($0.50/call, $1/job, $5/day, one job at a time) and the Claude price.
- Optional: `RAILWAY_API_TOKEN` / `VULTR_API_KEY` for read-only cloud checks.
