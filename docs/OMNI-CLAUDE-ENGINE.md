# Claude engine (Anthropic)

Optional engine for OMNI, Dread and Draco on `POST /api/omni/chat` (send `model: "claude-sonnet-5-5"` or `"claude-opus-5-5"`). Off by default per agent.

Order of checks: delegation + `chat:write` → AI approval, Stop, daily run limit, one-at-a-time guard (`omni_delegation_begin_chat`) → `claude_reserve` (Stop row FOR SHARE, run row, agent switch, price confirmed within 30 days, estimate ≤ 50¢, 24 h total ≤ 500¢) → Anthropic call (text only, 1024 max output tokens, Stop/revocation polled every second) → `claude_settle` (once; unknown usage charges the estimate) → `omni_delegation_finish_chat`.

Responses add `engine`, `attribution` ("Claude Sonnet 5.5 (Anthropic) via Dread") and `cost { estimateCents, actualCents }`.

Not yet on Claude: owner terminal agent and Fusion Dread/Draco sessions (default engine only). Coding: Claude never runs code; jobs go to Jackboy via the existing held handoff. `src/lib/jackboy-pr-report.ts` validates PR links; the signed Jackboy PR report endpoint waits on Jackboy's report format. Voice: `src/lib/ai/voice.server.ts` returns `not_connected`. Sandbox flag unchanged (OFF).
