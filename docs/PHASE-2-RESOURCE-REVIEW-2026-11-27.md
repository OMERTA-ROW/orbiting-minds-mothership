# Phase 2 — resource optimization review

2026-11-27 UTC. **Partial implementation passed local checks; overall Phase 2 acceptance is BLOCKED. Phase 3 is deferred, not completed. Nothing published.**

## Delivered

- Execution display makes one initial read, then stops automatic reads when no armed, running or cancellation-pending work is reported. Manual Refresh and returning to the tab request a new read. Failed reads stop automatic repetition and show a blocked state.
- Armed/running/pending-cancellation observation retains its five-second cadence, including hidden tabs. Every consequential action still passes the existing server-side checks; cached display state is never authorization.
- Activation safety observations retain their existing visible-tab 20-second cadence but cannot overlap; hidden tabs stop passive reads and returning refreshes immediately. The independent one-minute safety schedule is unchanged.
- Open workspace output retains the existing one-second cadence, including hidden tabs, but slow calls cannot overlap. No provider call, job start, cancellation or lease was removed.
- CyberLink live scene, animation, textures, public landing, GitHub import, repository controls, cloud connections, project management, CODE, Fusion and Task Agent server code are unchanged. Existing blocked capabilities remain blocked; this change does not make them operational.

## Cost/load baseline and estimates

Recording window: **Nov 14 00:00 UTC–Nov 27 04:51 UTC**, including a partial current date; recording may lag activity. Returned usage is complete for that lookup, but not attributed to individual code paths or preview versus live.

| Resource | Recorded quantity | Requested credits |
|---|---:|---:|
| Database pico compute | 280.75 instance-hours | 21.735440400 |
| Function worker-days | 265 worker-days | 2.650000000 |
| Function requests | 18,929 requests | 0.028393500 |
| Network | 0.012887657 GB | 0.005799511 |
| File storage | 0.81908423 GB-hours | 0.000117822 |

Build requested credits: 466.823; separate from running costs. No model-specific AI usage was returned; that does not prove no external inference occurred.

Current quote: pico **0.0774192 credits/active hour**; worker requests **0.0000015 credits/request**. Worker-days are a different meter and are not eliminated by fewer display requests.

**Conditional estimate, not observed billing savings:** an idle execution display formerly scheduled 720 reads/hour; the new display schedules zero recurring idle reads. If one successful server request equals each avoided read, avoiding 720 requests saves **0.00108 requested credits per idle display-hour**. At a hypothetical eight idle hours/day for 30 days, that is **0.2592 credits**. Actual affected traffic share is unmeasured; this is not an estimate for the whole application. Test timers establish the code-path reduction, not deployed use.

Database savings require fewer billed active hours, not just fewer queries: each actual avoided active hour would be 0.0774192 credits at today's quote. Achievable avoided hours are **unknown** because automatic hibernation/wake is unverified and necessary scheduled safety work remains. No resize or pause was performed; measured cash savings and reduced recorded deductions are not established.

Health snapshot: backend up; memory 72%, disk 15%, connections 14/60, pool clients 1/200, no reported exhaustion. A snapshot does not prove sustained sizing headroom. No app-owned persistent SQL pool was found in the inspected application call paths; clients use HTTP. Managed connections were not killed, and the generated auth client/renewal was not changed.

Slow-query sample: two audit reads totalled 28,452.67 ms/1,213 calls and 21,643.94 ms/1,228 calls (means 23.46/17.63 ms); safety reads 5,324.88 ms/2,537 calls. Statistics reset time and caller attribution were unavailable. These are cumulative elapsed query times, not CPU consumption or the financial window. No production index/migration was applied.

## Browser-closed execution and hibernation — not accepted

Three active managed schedules were observed:

| Schedule | Cadence | Target |
|---|---|---|
| evolution-daily-knowledge | Daily 06:00 UTC | `/api/public/jobs/knowledge-collect` |
| razul-observe | Every six hours at minute 23 | `/api/public/jobs/razul-observe` |
| jackboy-safety-sync | Every minute, 1,440 possible runs/day | `/api/public/jobs/jackboy-safety` |

Schedules are server-side and do not require an open browser, but a configured schedule is not evidence of completed work. The first two use request-bound background retention; unsupported published runtimes fail closed. Safety failures halt authority. No schedule cadence, delivery guarantee or safety lease was changed to save resources.

**Actual persisted outcomes contradict a success claim:** knowledge has 33 failed scheduled runs, latest Nov 26 06:00 UTC; Razul has 101 failed scheduled runs, latest Nov 27 00:23 UTC, with five source errors per failed run. Two old completed knowledge rows labelled `schedule` are not proof of scheduler delivery (prior verification used that label). No successful recent scheduled business completion was established. No CODE jobs, workspace jobs or handoffs were returned by the grouped metadata read. Autonomous execution with the browser closed remains unverified; no job was started or autonomy enabled.

Current lifecycle/reachability probes prove only an already-awake backend is healthy (auth 79 ms, database 82 ms, auth-to-database 461 ms); these are **not wake-up latency**. Available controls document manual pause/resume, not an authenticated automatic-wake configuration for this instance. Manual pause does not wake on visitors and takes database/auth/storage offline. **Do not enable hibernation or manually pause this shared backend** under this review. Verify a supported mechanism, scheduler wake, queued-job persistence and bounded cold-start latency in an approved separate acceptance environment first.

## Verified Jackboy artifact reuse — blocked at contract boundary

Inspected `src/lib/jackboy-handoff.ts`, `.server.ts`, `.functions.ts`: signed handoff replies contain contract, nonce, job ID and status only; persisted rows expose metadata. A completed status is not a verified artifact. No authorized result-fetch contract, immutable result digest/provenance or per-repository reuse policy is present. Never substitute Dread/Draco memory, terminal text or another owner's result to avoid a paid request.

Existing safe reuse remains: knowledge checks for the day's stored brief before inference and has a durable pre-provider guard; workspace ingest deduplicates remote step IDs and stores body digests. Neither is a Jackboy artifact cache. No AI calls were made or suppressed based on unverified artifacts.

Required compatibility contract before implementation: owner/project/repository/commit + exact task/input digest + tool/model/policy version; authenticated result retrieval; content digest and signed producer provenance; immutable completion evidence; revocation/freshness; explicit same-scope reuse consent. Tests must reject wrong tenant/repo/commit, modified bytes, stale/revoked consent, incomplete/unknown outcomes and concurrent duplicate admissions. Unknown paid outcomes must never auto-replay. This requires reviewed Jackboy support; other projects were not modified.

## Test evidence

- Full application: **1,553 passed / 23 skipped**, 120 passing files / 3 skipped. Host lifecycle/supervisor/containment skips remain unverified.
- Focused application suite: **77 passed** (included in full count).
- Eight new tests: concrete idle/active/cancellation cadence, hidden-tab handling, explicit/visibility refresh, no overlapping reads, no failure replay, unmount cleanup and mounted display transitions without control/plan invocation.
- Isolated service tests: **38 passed / 3 skipped** across health, Mothership admission, session/worker leases, recovery and commands. No remote host or paid provider contacted. Skips are not acceptance passes.
- Preview compiler: build OK after edits. ESLint: zero errors; existing component-export fast-refresh warning remains. `git diff --check` passes.
- Actual owner session: desktop 1280×1800 and mobile 390×844; home canvas renders and live scene source is unchanged; private approvals, terminal and project pages enforce two-step access; no page errors or horizontal overflow. Screenshots inspected. Positive owner controls, real running/cancelled tasks and provider connections cannot be tested with the current session's missing aal2; no bypass or fake records.

## Changed files and commits

Implementation commit: **`c938b82` — Reduce idle OMNI observations without changing active safety monitoring**. Baseline/rollback source: **`0662828`**.

- `src/lib/demand-polling.ts`
- `src/lib/demand-polling.test.ts`
- `src/hooks/use-demand-polling.ts`
- `src/test/execution-demand.test.tsx`
- `src/components/omnibridge/UnifiedExecutionStatus.tsx`
- `src/components/omnibridge/OmniWorkspace.tsx`
- `src/components/omnibridge/ActivationApprovals.tsx`
- `src/lib/AGENTS.md`
- `roadmap.md`
- This report (separate evidence commit).

No database, credentials, permissions, provider model, service execution code, release pin, connector configuration or other project changed. No deploy, publish, merge, visibility change or autonomy activation.

## Rollback instructions

Use a new review commit, never reset published history. With no unrelated pending edits, restore these four pre-existing files from `0662828`: the three changed `src/components/omnibridge/*.tsx` files listed above and `src/lib/AGENTS.md`; remove the four new polling/hook/test files listed above. Stage those specific paths and commit the rollback. Preserve this report and roadmap evidence. Example restore:

```text
git restore --source=0662828 -- src/components/omnibridge/UnifiedExecutionStatus.tsx src/components/omnibridge/OmniWorkspace.tsx src/components/omnibridge/ActivationApprovals.tsx src/lib/AGENTS.md
```

Re-run the original approvals/workspace/unified-execution suites and full app tests. Database rollback, credential reversal and connector changes are unnecessary because none occurred. Rollback stays unpublished pending owner review.

## Acceptance blockers / exact next owner actions

1. Complete two-step sign-in and existing passkey verification for positive private UI tests; do not provide codes or secrets in chat.
2. Review failed knowledge/Razul schedule outcomes and the intended published runtime/feed access. A later production correction or activation needs separate review; this turn cannot fix production while staying unpublished.
3. Provide evidence of this instance's supported automatic wake mechanism and authorize a separate nonproduction cold-start/restart/browser-closed acceptance environment. No manual pause of the shared instance.
4. Coordinate the scoped artifact retrieval/reuse contract in Jackboy's own project; select a disposable private repo and authorize a bounded no-paid-call fixture first.
5. Existing developer blockers remain in `docs/OMNI-JACKBOY-INTEGRATION-AUDIT-2026-11-27.md`: owner-approved isolated executor/release and compatible remote cancellation. Missing setting names from that dated inventory: `OMNI_SANDBOX_ORIGIN`, `OMNI_SANDBOX_CLIENT_ID`, `OMNI_SANDBOX_HMAC_SECRET`, `OMNI_SANDBOX_ENABLED`, `JACKBOY_DISPATCH_CLIENT_ID`, `JACKBOY_DISPATCH_HMAC_SECRET`, `JACKBOY_DISPATCH_ENABLED`. Presence was not re-checked here; switches must stay off pending acceptance. No new credential name is invented for wake or artifact reuse.

**Phase 3 gate:** proceed with the full OMNI compatibility audit only after Phase 2 wake, scheduling, artifact and positive owner-flow acceptance pass; the source boundary review above is prerequisite diagnosis, not Phase 3 certification. No work continues automatically after this turn.