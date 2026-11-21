# OMNI Fusion: owner-approved Dread & Draco sessions (phase 2a)

Installed: migrations 0072 (sessions) and 0073 (daily limits counted from the append-only control audit).
Owner surface: OMNI Terminal → **Fusion** tab (owner, two-step sign-in). Not exposed to OMNI web; the
manifest still reports orchestration as `not_available`.

Fusion is the orchestration architecture, not an agent. Here it only alternates the two existing chat
agents (`src/lib/omni-chat-agents.ts`), each keeping its own identity and personality.

## Flow

1. Owner writes a topic (≤ 2,000 chars, no key/token-like text), picks who speaks first and approves
   **2–4 replies** with a two-step code from the last 15 minutes (`omni_fusion_session_create`).
2. Each reply runs only on an owner click (`runFusionReply` → `omni_fusion_turn_begin`, as the owner).
   Begin locks the Stop row then the session row and refuses unless: session open, Emergency Stop
   released (missing row = engaged), AI approved and not paused, no reply running, approved replies
   left, attempts < replies + 2, < 20 reply attempts per rolling 24 h, and the shared one-at-a-time
   `evolution-omni` guard is free.
3. One model call (same provider/model and safety rules as OMNI chat, no tools, no retries,
   30 s deadline). `omni_fusion_turn_check` re-checks session/Stop/AI approval every second and stops
   the reply when any changes, and once more before keeping it.
4. Only the service records the outcome (`omni_fusion_turn_finish`): reply text (≤ 6,000 chars) only
   when completed; guard released, or kept as a pause on provider 402/403/404 for owner review. The
   session finishes after the approved number of replies.
5. Owner can stop a session at any time (a running reply stops within a second) and delete
   stopped/finished sessions. Deleting never frees daily quota (0073).

## Limits

| Limit | Value |
| --- | --- |
| Replies per session | 2–4 (owner chooses) |
| Attempts per session | replies + 2 |
| Reply length | 6,000 characters (longer is trimmed and marked) |
| Sessions | 5 per rolling 24 h, one open at a time |
| Reply attempts | 20 per rolling 24 h |
| Concurrency | one AI request at a time (shared guard) |

Spend: each reply is one small paid call. These limits bound it well inside the owner's caps
($0.50/call, $1/job, $5/day, one job); they are policy bounds, not verified Jackboy enforcement.

## Not included

No task creation/handoff, permits, approvals, Stop changes, CODE/workspace execution or OMNI web
endpoint. Sessions do not read Dread/Draco chat memory. Multi-model comparison, shared knowledge and
diagnostics coordination remain planned Fusion capabilities.

Tests: `src/lib/fusion-duo.test.ts`, `src/test/test_omni_fusion_duo_sql.py`.
