# Claude engine (Anthropic)

Optional engine for OMNI, Dread and Draco on `POST /api/omni/chat` (send `model: "claude-sonnet-5-5"` or `"claude-opus-5-5"`). Off by default per agent.

Order of checks: delegation + `chat:write` → AI approval, Stop, daily run limit, one-at-a-time guard (`omni_delegation_begin_chat`) → `claude_reserve` (Stop row FOR SHARE, run row, agent switch, price confirmed within 30 days, estimate ≤ 50¢, 24 h total ≤ 500¢) → Anthropic call (text only, 1024 max output tokens, Stop/revocation polled every second) → `claude_settle` (once; unknown usage charges the estimate) → `omni_delegation_finish_chat`.

Responses add `engine`, `attribution` ("Claude Sonnet 5.5 (Anthropic) via Dread") and `cost { estimateCents, actualCents }`.

## Terminal agent and Fusion sessions (migration 0075, pending owner approval)

The proposed SQL is `.lovable/pending/0075_claude_engine_terminal_fusion.sql`. The code is in place and fails closed (`claude_not_installed`) until the migration is installed.

- **Private OMNI text agent** (`/beta-omni`, `POST /api/omni-agent` with `engine: "claude-sonnet-5-5" | "claude-opus-5-5"`). Owner only: `is_razul_owner` (verified owner, aal2) is checked before a run is created, and the Anthropic key before anything else. After the existing checks (membership, owned project, consent, AI availability, run claim, durable guard), `claude_reserve_agent_run` runs in this lock order: Stop row FOR SHARE → run row FOR UPDATE (must still be `running`) → per-owner ledger lock. It uses the OMNI agent's switch. The 1-second poll on this path also re-reads the Emergency Stop, owner sign-in and AI approval. The reply is not streamed. It is shown only after `claude_settle_source('agent', …)` records its cost; otherwise it is withheld. The final event `engine` carries `engine`, `attribution` and `cost`.
- **Fusion sessions.** The approval (`omni_fusion_session_create` with 5 arguments) binds each agent's engine for the whole session. Claude needs that agent's switch on for that model and prices confirmed within 30 days at approval time. Each turn records its `model`. `claude_reserve_fusion_turn` locks the Stop row FOR SHARE → turn row FOR UPDATE (running) → session row FOR SHARE (open) → ledger, and re-checks the switch, prices and caps on every reply. The existing `omni_fusion_turn_check` poll and final re-check are unchanged. The approval card shows the worst case: (Claude replies + 2 retries) × $0.50.
- **One ledger:** `claude_usage.source` is `chat`, `agent` or `fusion`. All sources share one 500-cent rolling 24-hour total and the 50-cent per-call cap. Unknown usage (an aborted or failed call) is charged at the estimate.
- **Members** never get Claude, because the switches, prices and ledger are the owner's records.

Not on Claude: the OMNI Agent Workspace relay (Jackboy), CODE and the sandbox. Coding: Claude never runs code; jobs go to Jackboy via the existing held handoff. `src/lib/jackboy-pr-report.ts` validates PR links; the signed Jackboy PR report endpoint waits on Jackboy's report format. Voice: `src/lib/ai/voice.server.ts` returns `not_connected`. Sandbox flag unchanged (OFF).
