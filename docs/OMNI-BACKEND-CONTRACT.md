# OMNI backend contract: GitHub source, Railway backend, Lovable UI

Status audited 2026-11-12 (read-only checks; no secret values read, nothing sent to Railway or Jackboy).

## 1. Who owns what

| Part | Holds | Never holds |
|---|---|---|
| **GitHub** (source) | Code for Mothership (synced by Lovable Git sync, one branch), and separately the OMNI/Jackboy repositories. | Running state, approvals, secrets. Mothership cannot see whether Git sync is connected; check Project settings → Git. |
| **Railway** (backend) | The OMNI service and Jackboy CODE, their own secrets (for example `CODE_PROVIDER_API_KEY`), and — later — the isolated sandbox. | Mothership's database credentials or owner sessions. |
| **Lovable / Mothership** (UI + control plane) | Owner sign-in and two-step codes, passkeys, Activation Approvals, Emergency Stop, kill switch, held tasks, Docking Bay, audit, per-agent memory records, the secure-link settings (names listed in §3). | Any provider API key for CODE, any shell or executor. |

Each counterpart keeps its own knowledge: Mothership keeps owner-saved per-agent memory (§5); OMNI and Jackboy keep whatever they store on Railway. Nothing is shared between them today.

## 2. Audited state (2026-11-12 18:30 UTC)

| Check | Result |
|---|---|
| Preview typecheck | Passes. |
| Owner account | One owner; one confirmed authenticator (enrolled 2026-11-12 17:45 UTC); one OMNI passkey. |
| Emergency Stop | **Released** by the owner at 18:13 UTC. Releasing turns nothing on. |
| Terminal kill switch | Enabled by the owner (passkey) at 18:11 UTC. |
| Activation Approvals | **0 of 10** recorded. |
| `JACKBOY_LINK_SELF_TEST_ENABLED` | **Not set** (off). |
| Verified handshake / self-test with Railway | **Never recorded.** A ping only proved the Railway address answers. |
| Docking Bay | No pair codes issued, no devices. |
| Executor / sandbox | None. `EXECUTOR_AVAILABLE = false`. |
| CODE, autonomy | Off. Agent budgets are $0. |

**Why `/omni-terminal` looks locked:** the page itself opens for the owner at two-step level; the *agent workspace* stays locked because the self-test has never passed (and approvals 1–10 are not recorded). The page now shows a numbered checklist and one of five states: Stopped, Not authorized, Not connected, No device docked, Read-only.

## 3. Existing signed contracts (all built on the Mothership side)

All use HTTPS POST, platform certificate checks, refused redirects, a 5-second timeout, a 32 KB reply cap, 32-hex single-use nonces and Unix-second timestamps. The link secret stays on the server.

### `omni.link/v2` — handshake and protocol self-test (`POST {JACKBOY_LINK_ORIGIN}/api/public/omni/link`)
- Headers: `authorization: Bearer <session or bootstrap token>`, `x-omni-client`, `x-omni-timestamp`, `x-omni-nonce`, `x-omni-signature`.
- Signature: HMAC-SHA256(`OMNI_LINK_HMAC_SECRET`, `omni.link/v2\nPOST\n/api/public/omni/link\n<ts>\n<nonce>\n<sha256(token)>\n<body>`).
- Body: `{ action: "handshake"|"submit"|"run"|"status"|"cancel", projectId, jobId?, kind?: "protocol.self-test" }`.
- Reply must carry `x-omni-proof` and echo the nonce. Only a completed job whose runner is `restricted-protocol-self-test` with `result.passed === true` records `self_test_passed`.

### `omni.workspace/v1` — agent chat/terminal relay (`POST {origin}/api/public/omni/workspace`) — **Railway endpoint not confirmed to exist**
- Headers: `x-omni-client`, `x-omni-timestamp`, `x-omni-nonce`, `x-omni-signature`, `content-type: application/json`.
- Signature: HMAC-SHA256(secret, `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n<ts>\n<nonce>\n<sha256(body)>`).
- Body: `{ action, projectId, ...payload }` with actions `session.start {sessionId, agentId, allowedActions}`, `chat.send {sessionId, jobId, agentId, autonomous, text}`, `command.run {… command}`, `events.poll {sessionId, jobId, cursor}`, `job.stop`, `agent.stop`, `session.end`, `step.decide {sessionId, jobId, stepId, approve}`.
- Reply: HTTP 200/202, `x-omni-proof` = HMAC(secret, `omni.workspace/v1\nresponse\n<nonce>\n<status>\n<raw body>`), JSON `{ contract, requestNonce, session?: {sandboxId, sandboxName, model}, job?: {status, cursor}, steps[] }` (schema `remoteReply` in `src/lib/omni-workspace.ts`). 404 is reported as "OMNI has no workspace endpoint yet".

### `omni.dock/v1` and `jackboy.omni-handoff/v1`
See `docs/OMNI-DOCK-PROTOCOL.md`. Docked devices get status, held proposals and stop-engage only.

## 4. Isolated sandbox prerequisites (Railway side, before any command can run)

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

Mothership side, in order: Activation Approvals 1–10 → owner turns on `JACKBOY_LINK_ENABLED` / `JACKBOY_LINK_SELF_TEST_ENABLED` in Lovable project settings → handshake → self-test passes → kill switch enabled → fresh passkey → session. Emergency Stop engaged at any time blocks every step.

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
