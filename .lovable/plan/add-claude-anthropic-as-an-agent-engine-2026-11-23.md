# Add Claude (Anthropic) as an agent engine

Claude becomes a second engine choice for the existing text agents (OMNI, Dread, Draco, later Jax). It goes through every check a reply already passes, plus a new per-call cost check. If any check is missing or unreadable, the Claude call is refused, never allowed. The Mothership never runs code with Claude; coding goes to Jackboy.

## What you will see
- In the agent list, each agent shows an "Engine" choice: current engine (default today), **Claude Sonnet 5.5**, or **Claude Opus 5.5**. Claude choices say "Not connected" until the key is saved and the cost ledger is installed.
- Every Claude reply is labelled "Claude Sonnet 5.5 (Anthropic) via <agent name>", with an estimated and an actual cost.
- A new owner-only "Claude usage" panel on the OMNI Terminal: today's spend against the caps, each call (time, agent, model, tokens, estimated and actual cost, outcome). Message text is never stored there.
- "Send to Jackboy as code job" on a Claude plan creates a held, signed job. Its draft PR link and status appear here once Jackboy reports them.

## How caps and Stop are enforced for each Claude call
In order, all on the server, and stopping at the first failure:
1. Owner + two-step sign-in (or a valid owner delegation with `chat:write`), not revoked or expired.
2. Emergency Stop released (missing or unreadable means engaged), AI approval on, server account pause off.
3. Engine allowlist: only the two exact model IDs; anything else is refused.
4. **Estimate before sending**: input tokens counted from the prompt, output capped by a fixed `max_tokens`, multiplied by the price per million tokens you set. Missing or invalid price means refusal.
5. **Reserve on the ledger** in one locked database step: estimate must be at most $0.50 per call, and today's reserved plus spent must stay at most $5. One Claude call at a time per owner, sharing the existing one-at-a-time guard.
6. Call Anthropic with the server key, no tools, text only, with a timeout. Stop and revocation are re-checked every second while the reply streams; if either trips, the request is cut off.
7. Record actual tokens and cost from Anthropic's usage numbers and release the reservation. If recording fails, the guard stays paused (as today) so nothing is retried or billed twice.

Caps stay exactly $0.50 per call, $1 per job, $5 per day, one active job. Claude spend counts toward the same $5 per day.

## Coding jobs (no code runs here)
- Claude may only write a text plan. "Send to Jackboy" reuses the existing signed handoff: a held task, owner passkey approval, then a scoped delegation to Jackboy's own CODE pipeline, which opens a draft PR.
- Jackboy's signed callback (existing dispatch callback) gains optional `prUrl` and `prStatus` (draft, open, merged, closed). Only links to the allowlisted repository are shown. Nothing here merges, deploys or runs code.

## Sandbox and voice
- `services/omni-sandbox` is unchanged; its execution flag stays OFF. No Vultr calls and no deploys. A test asserts that the Claude code path does not import the sandbox or any deploy helper.
- Voice hook only: agents get an optional `voice.engine: "elevenlabs"` type with `voiceId`, plus an empty server interface `synthesizeSpeech()` that always returns `not_connected`. Jax is added later; nothing is built for voice now.

## What you must set by hand
1. Save **ANTHROPIC_API_KEY** in the secure form (I will open it after approval).
2. Approve installing the new cost-ledger migration (0074).
3. Confirm the per-million-token prices for both models from Anthropic's pricing page. I will put them in as settings you can review; I won't guess them.
4. In your Anthropic console, set a monthly spending limit as a second safety net.
5. Turn on the Claude engine per agent (off by default).

## Risks
- Token estimates can be slightly off; the fixed output limit keeps the worst case under $0.50, and actual cost is always recorded.
- If Anthropic retires or renames the model IDs, calls are refused until the list is updated.
- Prices can change; stale prices would under-estimate cost, so prices carry a "last confirmed" date and refuse calls after 30 days.
- Your Anthropic key is billed outside workspace credits. The same Claude models can also be used through the built-in Lovable AI route with the project's existing key (billed to credits, with logs and limits). Tell me if you prefer that; switching later is a small change.
- A cut-off stream may still be billed by Anthropic for tokens already produced; this is recorded as a partial cost.

## Technical details
Files that change:
- `src/lib/omni-engines.ts` (new, browser-safe): engine registry `{ id: "lovable-default" | "claude-sonnet-5-5" | "claude-opus-5-5", provider, label, attribution }`, exact-ID lookup.
- `src/lib/ai/anthropic.server.ts` (new): `estimateClaudeCost()`, `callClaude()` via `fetch` to `/v1/messages` (workerd-safe, no SDK), key read inside the handler from `process.env`, never logged; errors are mapped to `provider_error` with no headers or body echoed.
- `src/lib/claude-spend.server.ts` + `drizzle/migrations/0074_claude_usage_ledger.sql`: tables `claude_usage` (owner, agent, model, tokens, estimate and actual cents, outcome, timestamps) with RLS owner-read only; service-only security-definer functions `claude_reserve()` (lock order: delegation, Stop row FOR SHARE, per-owner advisory lock, cap check) and `claude_settle()`; per-agent `engine` column defaulting to current engine.
- `src/lib/omni-delegated-chat.server.ts`, `src/lib/ai/omni-agent.server.ts`, `src/lib/fusion-duo.server.ts`: branch on engine; Claude path wraps reserve, call, settle; attribution added to responses.
- `src/lib/omni-chat-agents.ts`: optional `engine`; voice type widened (hook only).
- `src/lib/omni-contract.ts` manifest: lists engines with `available` and an honest reason.
- `src/lib/jackboy-dispatch-callback.server.ts` + `jackboy-handoff.ts`: `prUrl`/`prStatus` fields with signature check and repository allowlist.
- `src/lib/ai/voice.server.ts` (new stub) and an owner-only `ClaudeUsage` panel on `/omni-terminal`.
- Docs: `docs/OMNI-CLAUDE-ENGINE.md`; `AGENTS.md` rule; roadmap and completion register entries.

Tests to add:
- Engine allowlist: unknown or near-match model IDs are refused.
- Estimate math; missing, zero, or stale prices are refused.
- Isolated SQL: per-call $0.50 boundary (exact passes, +1 cent refused), $5 daily boundary, one-at-a-time under real concurrent sessions, owner isolation, refusals not consuming budget, settle exactly once.
- Stop engaged, Stop unreadable, revoked or expired delegation, AI approval off: no call to Anthropic (fetch mock asserts zero calls).
- Mid-stream Stop and revocation abort the reply and record a partial cost.
- Key never appears in responses, logs or audit rows (key-like string scan).
- Missing key gives `provider_not_configured`; missing ledger gives refusal.
- PR callback: bad signature or a non-allowlisted repository is rejected.
- Static import check: Claude path does not import sandbox, deploy, or code-execution modules; sandbox flag stays OFF.
- Typecheck, lint, build and browser smoke of the usage panel and engine picker.

Nothing is published, no paid call is made in tests, and no live Claude reply happens until you add the key, install 0074 and turn the engine on.
