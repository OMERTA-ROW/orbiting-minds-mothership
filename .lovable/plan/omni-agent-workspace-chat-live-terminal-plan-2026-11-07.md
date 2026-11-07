# OMNI Agent Workspace (chat + live terminal) — plan

This adds to the existing OMNI Terminal page (`/omni-terminal`). It doesn't create a second terminal. The current status, held tasks, Emergency Stop and logs stay as they are. The new workspace becomes the main panel on that page. Nothing is built, turned on or published until you approve.

## Layout

```text
+---------------------------- header strip -----------------------------+
| Sandbox: name/ID | Session ID | Model | Idle lock 9:42 | Spend meter    |
| [Autonomous: OFF]                     [ STOP ]   Kill switch: Enabled |
+-------------------------------+---------------------------------------+
| CHAT WITH OMNI                | LIVE TERMINAL                         |
| You: "add a health endpoint"  | $ npm test                            |
| OMNI step cards:              | ...streamed output...                 |
|  1 Plan                       |                                       |
|  2 Files changed (diff)       |                                       |
|  3 Command run                |                                       |
|  4 Result / fix attempt       |                                       |
| [Approve] [Reject] per step   | > type commands here                  |
| > message box                 | history (up/down, search)             |
+-------------------------------+---------------------------------------+
| Tabs: Audit log | Approvals waiting | Sessions                         |
+-----------------------------------------------------------------------+
```

On phone the two panels stack, with a Chat / Terminal toggle.

## Screens

**1. Locked screen (default)**
- "Not connected — OMNI secure-link self-test has not passed."
- Live checklist: link configured, Railway reachable, self-test passed (with date), kill switch, Emergency Stop, your link approval.
- The chat box and command line are both disabled until everything is green.

**2. Passkey gate.** You confirm with a passkey when opening the workspace, starting a session, turning Autonomous Mode on and changing the kill switch.

**3. Chat panel (OMNI agent)**
- You write in plain language. OMNI, the coding agent on the OMNI server (backed by a model there, for example OpenAI), plans the work, edits files in its sandbox, runs commands, reads the output and tries fixes.
- Each step shows up as a card: **Plan**, then **Files changed** (side-by-side diff with added and removed lines), then **Command run** (links to its output in the terminal), then **Result** (pass/fail, exit code, cost).
- When Autonomous Mode is off, OMNI pauses before each file change and each command, and waits for **Approve** or **Reject** on that card.
- The model name and the cost of each step appear on its card.

**4. Terminal panel**
- Live streamed output from the same sandbox, colour-coded output and errors, and exit codes.
- You can type commands directly. Your commands and OMNI's commands appear in the same stream, labelled "you" or "OMNI".
- Command history, searchable.

**5. Autonomous Mode**
- Off by default. Turning it on needs a passkey check and a duration you pick: 15, 30 or 60 minutes. It turns itself off when the time runs out, with a visible countdown.
- When on, OMNI runs its plan → edit → run → fix loop inside the sandbox without asking at each step.
- Spend meter: **$1 per task / $5 per day / $10 total**. Hitting any limit stops OMNI straight away and turns Autonomous Mode off. Limits are checked on the server before each model call, never only in the browser.
- **Always needs your approval, even in Autonomous Mode:** merging, deploying or publishing, anything touching secrets or credentials, changing GitHub permissions, and network access outside the sandbox's allowlist. These go to the "Approvals waiting" tab, and OMNI pauses until you decide.

**6. Stop and kill switch**
- **Stop** (large, always visible) cancels the current model call and the running command, and turns Autonomous Mode off.
- **Kill switch** (passkey to change) disables the whole workspace and ends every session. If the Emergency Stop or the kill switch is engaged, everything is blocked. If either one can't be read, it counts as engaged.

**7. Audit log tab.** Read-only and append-only: every chat message, OMNI step, diff fingerprint, command, exit code, cost, approval decision, Autonomous Mode on/off, Stop and kill-switch change. You can filter it by **agent**, session, type and date, and export it.

**8. Agents view (OMNI as the shared execution engine)**
- OMNI runs code for all of your agents: OMNI itself, Jackboy, and future ones. The view has one card per agent.
- Each card shows:
  - **Identity:** name, ID, model, and how it's linked.
  - **Allowed actions:** for example chat, edit files, run commands. These are separate from what the agent says it can do.
  - **Live jobs:** counts for queued, running, done and failed, with a list you can open.
  - **Budget:** the agent's own spend budget and usage.
  - **Autonomous Mode:** on or off, with its expiry.
  - A **Stop** button for that agent.
- The agent's own Stop cancels that agent's running and queued jobs and turns its Autonomous Mode off. It leaves the other agents alone.
- The global kill switch and the Emergency Stop are still shown on this view and still stop everything.
- An agent's own budget sits inside your overall limits ($1 per task, $5 per day, $10 total). Whichever limit is hit first stops the job.
- Agents start with no permissions. You add an agent and grant its permissions with a passkey check. Jackboy reuses its existing link identity. Future agents stay listed as "not enrolled" until you add them.

## How it works

```text
Browser ──(owner session + fresh passkey)──> Mothership server
Mothership server ──(HMAC-signed existing link)──> OMNI on Railway
OMNI agent (model on the OMNI server) ──> isolated sandbox
                                         (no production keys or database)
Step events and terminal output stream back the same way
```

- The browser never holds model keys, link keys or any other secret. The model key stays on Railway. Signing happens only on the Mothership server.
- Every request carries a timestamp, a one-time number and the session ID, and is signed. OMNI refuses repeats and expired requests.
- Timeouts: 10 minutes with no activity locks the session. Sessions also end after 60 minutes regardless.

## Database tables to add

- **Passkeys:** your registered passkey's public key, name, counter and last use.
- **Passkey checks:** one-time challenges and when each was confirmed, so the server can require a recent check.
- **Workspace settings:** one row with the kill switch. If it's missing or can't be read, the workspace counts as disabled.
- **Sessions:** sandbox ID and name, model, start time, last activity, end time and why it ended.
- **Autonomy windows:** when Autonomous Mode was turned on and when it expires, who turned it off and why. Only one can be active at a time.
- **Spend ledger:** append-only cost entries per task, per day and in total, compared against the $1, $5 and $10 limits before every model call.
- **Agent steps:** one row per step card (plan, diff fingerprint and summary, command, result, cost, status).
- **Approvals:** pending, approved or rejected decisions for gated actions such as merges, deploys and secrets. Each decision needs a fresh passkey check.
- **Agents:** identity, status (enrolled, paused, revoked), allowed actions, and its own budget limits.
- **Agent jobs:** agent, session, status (queued, running, done, failed, stopped), cost, start and end times.
- Agent ID is also recorded on sessions, autonomy windows, spend ledger entries, steps, approvals and audit log rows, so each agent has its own limits, Stop button and audit filter.
- **Audit log:** append-only. Owner can read it; only the server can add to it. Rows can't be edited or deleted.

All tables are owner-only. Signed-out visitors get no access, and the browser can't write to them directly.

## Work that has to happen on Railway (the OMNI/Jackboy project)

I'm listing these for you; I won't do them from here:
1. Add signed endpoints: start session, send a chat message (streamed agent steps), run a command (streamed output), approve or reject a step, stop, end session.
2. Build the agent loop on the OMNI server using its model key, which you said already lives on Railway.
3. Run everything in a separate sandbox container with no production settings or database, with CPU, memory, time and network limits.
4. Report the cost of each model call back, so the spend meter is accurate.
5. Accept jobs for each agent identity, and support stopping a single agent's jobs.
6. Pass the existing link self-test.

## Build order (after approval)

1. Check what passkey support exists today. I believe sign-in uses authenticator-app codes now, but I'll confirm before building. Then add passkey setup and checks.
2. Add the tables and server rules, with tests on a throwaway database.
3. Add the server relay: signing, streaming, Stop, timeouts, kill switch and Emergency Stop checks, spend limits, autonomy expiry and approval gates.
4. Build the chat, terminal and tab screens on the existing page. They stay locked until OMNI answers the self-test.
5. Tests: refused before the self-test, kill switch, a stale passkey check, a repeated request, autonomy expiry, each spend limit, gated actions stopping even in Autonomous Mode, Stop, one agent's Stop and budget not affecting other agents, and the audit log not being changeable. Then a signed-out browser check.

## Still blocked after the build

- Nothing runs live until Railway has the endpoints, the agent loop and the sandbox, the self-test passes and you give approval.
- I can't test your passkey myself. You'll need to try it on your device.
- Nothing gets deployed or published.

## Questions (defaults assumed if you don't answer)

- Passkey only for this workspace? Default: yes.
- Autonomous Mode durations: 15, 30 or 60 minutes?
- Should the audit log keep full command output, or a fingerprint plus the first 4 KB? Default: fingerprint plus 4 KB.
- Should the $10 total reset, or stay a lifetime cap until you raise it? Default: lifetime cap.
