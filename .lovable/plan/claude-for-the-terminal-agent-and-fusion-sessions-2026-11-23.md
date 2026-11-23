# Claude for the terminal agent and Fusion sessions

Goal: let the owner pick Claude (Sonnet 5.5 default, Opus 5.5 optional) for (a) the private OMNI text agent ("terminal agent", `/beta-omni`) and (b) owner-approved Dread & Draco Fusion sessions, with every existing control kept and the same $0.50 per call / $5 per day Claude limits shared across all three places Claude can run.

Out of scope (unchanged): OMNI Agent Workspace relay to Jackboy, CODE/sandbox (stays OFF), Fusion planner (`omni-fusion*.ts` stays model-free), voices, Jackboy PR reports, publishing.

## What the owner will see

- **Terminal agent:** an engine picker next to the send box, visible to the owner only. Members keep the current engine. Each reply carries "Claude Sonnet 5.5 (Anthropic) via OMNI" and its estimated and actual cost. With Claude, the reply arrives in one piece when it finishes, not word by word.
- **Fusion sessions:** the approval step shows each agent's engine (for example "Dread: Claude Sonnet 5.5, Draco: current engine") and the most the session can cost (replies x up to $0.50). The engine is fixed when you approve and can't change during the session. Each reply shows who wrote it and with which engine.
- **Claude tab:** the usage list gains a "Where" column (Chat, Terminal agent, Fusion). It shares one daily total.

## How the controls stay in force

Order for every Claude reply. A missing or unreadable check refuses the call:

```text
existing checks (unchanged) -> claude reserve -> Anthropic call (polled every 1 s) -> final re-check -> settle once -> existing finish
```

1. **Existing checks run first, unchanged.**
   - Terminal agent: verified member, owned project, saved-text consent, AI availability, run claim and the durable one-at-a-time guard.
   - Fusion: owner + fresh approval, fixed reply count, one owner click per reply, Stop row lock, AI approval, quota from the audit log, and the shared guard (`omni_fusion_turn_begin`).
2. **Reserve (new, service-only database functions).** Lock order matches the existing writers: Stop row (FOR SHARE) -> the run or turn row (FOR UPDATE, must still be running and belong to the owner) -> the per-owner Claude ledger lock. Then it checks:
   - Claude is switched on for that agent and model.
   - Prices were confirmed within 30 days.
   - The estimate is at most 50 cents.
   - The 24-hour total for chat, terminal and Fusion together stays at or under 500 cents.
   - For Fusion, the model matches the one bound at approval.
3. **During the reply:** every second the server re-reads Stop, run or session status, membership, project ownership and AI approval. Any change aborts the call. The terminal agent gains a Stop check on the Claude path. Today its poll checks only run, membership and project.
4. **Settle exactly once** with Anthropic's reported tokens. If usage is unknown, or the call was aborted or timed out, it charges the estimate. If settlement can't be recorded, the reservation stays counted at its estimate (fail closed) and the reply is reported "outcome not recorded".
5. **Key:** the Anthropic key is read only inside the server handler and is never logged, returned or stored. Errors carry only a status code. With no key, the call is refused before any reservation.
6. **No new authority:** text only, no tools, no retries, max 1,024 output tokens. Claude can't start tasks, hand off work, issue permits or touch Stop.

## Owner actions needed

1. Approve installing migration 0075 after reviewing it. It is written to `.lovable/pending/` and not installed until you approve.
2. Confirm Claude prices in the Claude tab, if you haven't yet.
3. Switch Claude on per agent. OMNI covers the terminal agent; Dread and Draco cover Fusion.
4. Publish later, once you've reviewed it.

## Risks

- **Cost:** a 4-reply Fusion session on Claude can cost up to about $2. The shared $5 per day limit still caps everything. Opus reaches the 50-cent limit sooner, so long Opus prompts will be refused.
- **Aborted calls:** Anthropic may still bill tokens it generated before Stop. The ledger charges the full estimate in that case, so the daily total over-counts instead of under-counting.
- **No streaming on Claude replies (phase 1):** this keeps usage accounting exact. Streaming can come later.
- **Ledger lock:** chat, terminal and Fusion all wait on one per-owner lock. That's fine at one-at-a-time volumes.
- **Members:** Claude stays owner-only, because the switches and prices are owner records.

## Technical details

**Migration 0075 `claude_engine_terminal_fusion` (pending, forward-only, no changes to installed functions' behavior):**
- `claude_usage`: add `source text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat','agent','fusion'))`; replace `UNIQUE(run_id)` with `UNIQUE(source, run_id)`.
- `omni_agent_runs`: add nullable `model` (check: default engine or the two Claude IDs).
- `omni_fusion_sessions`: add `dread_engine`, `draco_engine` (default engine id), set only by `omni_fusion_session_create` (new overload with engine args; owner + aal2; refuses Claude unless the switch is on and prices are fresh at approval time).
- `omni_fusion_turns`: add `model`, copied from the session at `turn_begin`.
- New `claude_reserve_agent_run(_run_id, _model, _input_chars, _max_output_tokens)` and `claude_reserve_fusion_turn(_turn_id, _input_chars, _max_output_tokens)`: lock order as above, shared cap math via the existing `claude_estimate_cents`, owner must satisfy `is_razul_owner`.
- New `claude_settle_source(_source, _run_id, _status, _in, _out)`. The existing `claude_settle` stays for chat.
- All functions are SECURITY DEFINER with `search_path = ''`, EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role only. Audit rows hold metadata only.
- Until installed, the new functions are typed through `staged-rpc.ts`. Callers fail closed with `claude_not_installed`.

**Code:**
- `src/lib/ai/claude-turn.server.ts` (new): one shared helper (reserve -> `callClaude` with abort signal -> settle) used by both paths, so cap and settle logic exists once.
- `src/lib/omni-agent.ts`: optional `engine` field in `omniAgentInput` (exact IDs via `claudeEngineFor`).
- `src/lib/ai/omni-agent.server.ts`: Claude branch after the run claim and guard. Adds the Stop read to the 1 s poll on that branch, emits one `text` event plus `engine`, `attribution` and `cost` in the final event, and stores `model` on the run.
- `src/lib/fusion-duo.server.ts`: pick inference by the turn's bound model. `serviceInference` stays the default. Claude goes through the shared helper, and the existing 1 s `omni_fusion_turn_check` and final re-check stay unchanged.
- `src/lib/fusion-duo.ts` / `.functions.ts`: engine args on create, plus a worst-case cost preview.
- UI: `/beta-omni` owner-only picker plus attribution; the Fusion approval card shows engines and worst-case cost; `ClaudeEngine.tsx` usage gets a source column.
- Docs: update `docs/OMNI-CLAUDE-ENGINE.md`, `docs/OMNI-FUSION-DUO.md`, the root `AGENTS.md` Claude rule, `roadmap.md` and `completion-register.json`.

**Tests:**
- Isolated SQL (disposable DB, same harness as the 0072–0074 suites):
  - Each refusal: Stop engaged, run not running or another owner's, switch off, stale price, 50-cent call limit, 500-cent daily boundary (499+1 passes, 500+1 refused) shared across chat, agent and Fusion.
  - Fusion engine bound at approval; turning the switch off mid-session refuses the next reply.
  - Settle once; a double settle is refused.
  - Real two-session races: Stop engage vs reserve, and cancel vs reserve.
  - Grants are service-only; ledger and audit rows contain no text.
- App tests (fake fetch, no network):
  - No key: refused before reserve.
  - Reserve refusal: Anthropic is never called.
  - Stop, revocation or cancel mid-reply: aborted and settled `cancelled`.
  - Provider 4xx/5xx and timeouts: settled `failed`, no retry.
  - Settle failure: "outcome not recorded".
  - Member (non-owner) Claude request refused.
  - Attribution and cost fields; the key never appears in errors or logs.
- Plus typecheck, lint, build and browser smoke of `/beta-omni`, the Fusion card and the Claude tab. No live paid call without your separate approval.
