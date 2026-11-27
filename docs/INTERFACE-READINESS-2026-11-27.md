# Staged Mothership / Evolution interface readiness

2026-11-27 UTC. **Stage 1 implemented and locally checked. Entire-system production readiness: BLOCKED, not certified. Preview only.**

Implementation commit: **`ab89b80`**. Baseline: **`034daff`** (retains prior idle-polling changes). No published deployment, external merge, hosted migration, autonomy enablement, safety release or credential change.

## Inventory first

`node scripts/interface-inventory.mjs` creates:

- `docs/INTERFACE-ROUTE-INVENTORY.md`: every route declaration, source path/line, kind, head presence, retired wrapper and reachable controls.
- `docs/INTERFACE-SOURCE-INVENTORY.json`: **129 declarations: 91 content routes, 37 server endpoints, one protected layout; 859 control declarations and 180 panels**, plus agent/provider/contract source references and per-route transitive static control references.

This is a complete static declaration inventory, **not 859 successful runtime actions**. Native input controls, composed design-system controls, conditional disabled actions, unmounted legacy files and dynamically imported components require contextual review. Per-control bindings/disabled/blocker attributes are recorded; absent bindings are not automatically defects (for example native summaries and controlled form fields). No placeholder-link/empty-click-handler violations were found by the existing source contract tests. Every content route declares its own head; the managed pathless layout is not a second home page.

Do not turn the inventory into fake live badges. Current runtime acceptance is only the bounded evidence below; unknown actions remain implemented/unverified or blocked. Canonical completion-register milestones were not promoted.

## Implemented first-stage repairs

1. **Shared real space scene:** every non-landing route now renders the existing CyberLink `SpaceBackground` through the one root wrapper. Removed the interior-only route allowlist, opaque OMNI shell backdrop and legacy decorative page-header orbit layer. Retained public signed-out landing presentation and all legitimate scene textures. No generated wallpaper, replacement SolarSystemBackground or copied image substitute.
2. **Readable, pointer-inert shell:** shared token-based dim veil and pointer-inert descendants; existing controls/layout/colors retained. Reduced-motion and hidden-tab motion policy remain from the original scene. Quality/DPR mobile limits unchanged; navigation preserves the same canvas rather than mounting a second scene.
3. **Confirmed project writes:** project create/update/remove, cloud add/remove, settings, website-check outcome, cloud-check outcome and import finalization now require an actually returned affected row. A zero-row update/delete or failed persistence cannot say Saved/Removed/Verified. Owner/MFA checks precede every operation; caller RLS and existing service-only outcome writes unchanged.
4. **Actual provider response evidence:** Railway must return its account identity; Vultr must return its account schema. HTTP 200 with null, malformed, empty or GraphQL error data cannot mark a connection verified. Raw provider response/credential content is never displayed.
5. **Honest project controls:** GitHub configuration is labelled Review GitHub connection rather than an inert connected-success button. Refresh records clearly refreshes saved data, not repository contents; result/error feedback is visible. Clone blocker corrected: PR #28 quarantine is not coding acceptance. Manual action ref blocks overlapping import/save controls; blocked session storage leaves automatic import off while manual import remains available.
6. **Bounded metadata reads:** directory/cloud lists bounded to 1,000 rows; repository/history limits preserved. No production index, retention, record deletion or provider model change. Earlier `c938b82` demand-polling work remains intact; active one-second output, five-second execution observations, server Stop checks and permit leases were not reduced.

## Per-feature disposition and actual evidence

| Feature / source | Current classification | What is proven / exact remaining boundary |
|---|---|---|
| Global background, root navigation | **Live verified in preview, visual boundary only** | 16 desktop/mobile route checks, one canvas, legacy root layers absent, no horizontal overflow/page errors; changed pixels across frames; same canvas after real link navigation. Not backend readiness. |
| Public landing `/` | **Live verified presentation preserved** | Signed-out landing remains its existing Mothership content, no interior canvas added. |
| Route/link inventory | **Implemented + source checked; public navigation smoke verified** | 85 unique static pages opened signed-out; 14 unauthenticated endpoint probes match documented refusal. Six parameterized content routes need real IDs/data for individual acceptance. |
| Retired areas `src/lib/retired-areas.ts`, `RetiredAreaPage` | **Blocked / honestly retired, not operational** | Existing no-demo wrappers and alternative links remain. Nothing relabelled connected. Browser-saved records preserved. |
| Owner authentication / account security | **Implemented/unverified positive flow; private refusals verified** | Restored existing owner session lacks aal2; private terminal/project/approval actions remain refused. Account security initially showed Checking during the quick screenshot; positive enrollment/recovery not exercised. No sign-in/auth migration or bypass. |
| Project directory, website linking, Lovable project IDs | **Implemented/unverified positive hosted writes** | Owner-isolated source, 12 new save/provider evidence tests; no shared database records created. Manual IDs/website links are directory entries, not verified external connections. |
| GitHub discovery/import/matching `/projects` | **Implemented/unverified current authenticated provider result** | Existing paginated dedup by immutable repo ID retained; finalization requires evidence. No GitHub call or external write this turn. Existing connection configuration is not new provider acceptance. |
| Clone all, branch/commit/draft PR, build/test | **Blocked** | No verified coding executor or durable isolated clone storage. Quarantine/no-op diagnostics are not repository execution. Dirty-tree/branch protection/owner review gates unchanged. |
| Railway/Vultr cloud checks | **Implemented/unverified real credential acceptance** | Malformed/empty/error responses and failed/zero-row persisted checks rejected locally. No provider calls this turn. Missing configured credentials must be added securely; a read-only account check never means server provisioning/deployment. |
| OMNI health/manifest gateway | **Unsigned refusal verified; positive scoped calls unverified** | Existing owner-key scope/expiry/revocation paths retained; 14 browser/API smoke probes make no real grant. |
| Agent discovery | **Implemented/unverified enrollment** | OMNI/Dread/Draco chat identities distinct from held-task agents. Declarations/JAX/Hercules/Guardian are not proof of connected workers. No enrollment/grant fabricated. |
| Private chat / voice | **Implemented/unverified actual inference/native audio** | Existing account AI consent, Stop and durable guard retained. No paid model call, microphone/playback or voice provider test; user-directed chat independent of autonomy remains unchanged. |
| Fusion rules planning and approved Dread/Draco turns | **Implemented/unverified positive owner/provider flow** | Existing separate scope, quotas, per-turn approval, Stop and engine checks retained; focused contracts pass. Rules planner remains rules-only; full orchestration not claimed. |
| Full Fusion/CODE/Task Agent execution | **Blocked** | Requires reviewed live tool/executor bridge, signed budget admission, current release/isolation and positive owner acceptance. No model tool invocation or autonomy enabled. |
| Jackboy handoff/dispatch | **Implemented/unverified live service; quarantine only** | Signed metadata/status contracts tested in existing suite; no live handoff. Remote handoff has no approved artifact retrieval/cancel operation. Quarantine stays quarantine. |
| Signed budget permits | **Implemented/unverified fresh live permit** | Existing $0.50/call, $1/job, $5/day, one active job and future-dated-evidence refusal preserved. No permit requested, spend cap raised or fresh enforcement invented. |
| Progress / cancellation / Stop | **Implemented/unverified remote termination** | Demand observation, strict no armed/running/pending confirmation and signed leases unchanged; focused safety tests pass. No real job started/stopped; an acknowledgment cannot claim termination. |
| Executor isolation / terminal | **Blocked operational acceptance** | Local source tests are not kernel/cgroup/reboot/host containment evidence. Missing host settings and reviewed release remain prerequisites. No shell launched in the application runtime. |
| Neuro | **Implemented/unverified positive owner registry flow** | Existing immutable revision/scope review/rollback metadata preserved, autonomy off; no agent-memory integration inferred. |
| Docking Bay / Honeycomb / package distribution | **Blocked live companion/release acceptance** | Existing signed pairing/read/held/Stop contracts preserved. No paired device, native terminal installation, signed package or provider integration produced. |
| Scheduled jobs, browser closed | **Configured, completed work unverified/failed** | Prior same-day Phase 2 reads: 33 failed knowledge and 101 failed Razul scheduled runs; no new successful job evidence. Never disable needed safety schedules to save credits. No cadence changes or manual backend pause. |
| Jackboy artifact reuse / auto wake | **Blocked contract/acceptance** | Signed handoff returns status, not digest/provenance-bound reusable results. Automatic wake contract and cold-start acceptance unavailable; manual pause does not auto-wake. No paid replay or hibernation. |
| Other tools/media/financial/member features | **Implemented/unverified or blocked by existing scope** | Exact controls and routes inventoried. No blanket positive acceptance from static bindings; financial actions remain read-only/unconnected, and private media/member actions retain existing grants. |

**Remaining mock source:** existing synthetic no-op/contract fixtures, unmounted legacy prototype components and retired routes; none was activated, deleted along with user records, or advertised as real. Wiring a simulator into live execution would violate the requested gates. Every blocked feature needs real support, not another scripted success.

## Test and preview evidence

- Full suite: **1,565 passed / 23 skipped**, 122 passing files / 3 skipped (`bunx vitest run`). Host lifecycle/containment/supervisor skips are not passes.
- Focused interoperability/project/link suite: **141 passed / 12 files**, included above.
- **12 new regressions**: zero affected rows, failed write despite returned data, settings/project/cloud persistence, owner refusal before writes/network, website outcome persistence, Railway empty/error/identity responses, Vultr schema and cloud-check save failure. All network/database responses there are deliberate test fixtures, never real connections.
- All-static-page smoke: **85 pages + 14 endpoint probes, zero failures**, using a temporary reduced-motion adaptation of `scripts/smoke_site.py` (350-ms settling, 12-second load timeout) to avoid repeated WebGL startup. Original full-motion all-route run exceeded 300 seconds and produced no usable aggregate result; not counted as pass. Runtime-generated/parameterized routes are not individually certified.
- Actual owner-context desktop 1280×1800/mobile 390×844: `/account-security`, `/beta-omni`, `/omni-terminal`, `/activation-approvals`, `/projects`, `/neuro`, `/platform`, `/dashboard`: one shared scene, zero legacy root background layers, no overflow/page errors. Screenshots inspected. Private positive actions blocked by missing aal2; **not tested signed-out-only and labelled successful**.
- Reduced motion: `/platform` background present, no animated canvas. Signed-out public home preserved.
- Animation/navigation: two background captures 1.5 seconds apart differ; clicking `/dashboard` → Owner dashboard retains exactly the same single canvas; wrapper pointer-events none.
- ESLint changed files: no errors. Automatic harness initially identified a nullable provider-response field; narrowed it explicitly and latest entries **build OK**. No manual build/typecheck run; platform compiler is the build signal.
- `git diff --check` and source link/no-placeholder tests pass. No claims of measured cloud savings from unpublished changes.

## Next stages — exact owner actions / blockers

1. Complete owner two-step sign-in and existing passkey confirmation in the app, then authorize a disposable project/repository for positive save/readback and held-task tests. Never paste codes or secrets into chat.
2. Review matching executor endpoints, durable workspace storage, accepted release and actual isolation/cancellation/reboot evidence on a separate nonproduction host. Do not accept quarantine/no-op self-tests as CODE acceptance or merely change a release string.
3. Coordinate Jackboy/OMNI-side scoped result retrieval and remote cancellation contracts in their own projects. No access/credential/approval broadening; Mothership changes cannot invent those remote actions. Selected repo/commit/task/input digest, producer signature, immutable completion and consent are prerequisites to AI artifact reuse.
4. Review existing GitHub installation/org permissions and connect the selected repository through the supported connector. For cloud checks only, configure **`RAILWAY_API_TOKEN`**, **`VULTR_API_KEY`** in Project Settings → Secrets as applicable. Do not submit secret values to chat.
5. Executor/dispatch prerequisite names from the latest integration audit: **`OMNI_SANDBOX_ORIGIN`**, **`OMNI_SANDBOX_CLIENT_ID`**, **`OMNI_SANDBOX_HMAC_SECRET`**, **`OMNI_SANDBOX_ENABLED`**, **`JACKBOY_DISPATCH_CLIENT_ID`**, **`JACKBOY_DISPATCH_HMAC_SECRET`**, **`JACKBOY_DISPATCH_ENABLED`**. Those names are requirements, not newly rechecked credential presence; enable switches only after separate reviewed acceptance. Existing `OMNI_EXECUTOR_*`, `OMNI_LINK_*`, `JACKBOY_LINK_*`, `JACKBOY_HANDOFF_*` configuration still needs matching live evidence. No invented Lovable project-creation or wake credential.
6. Scheduled knowledge/Razul failure recovery and automatic-wake/browser-closed tests require reviewed runtime evidence and a separately approved acceptance environment. Production correction/deployment is excluded from this request; leave schedules, backend state and active tasks untouched.

Independent safe work completed here is the inventory, global shell and save/evidence repairs. Full positive backend/provider/developer flows remain blocked; the rest of the interface is **not declared finished**. No background work continues after this turn.

## Changed files / rollback

Commit `ab89b80`:

- `src/routes/__root.tsx`, `src/styles.css`
- `src/components/evolution/ControlCenter.tsx`
- `src/lib/evolution-control.ts`, `src/lib/evolution-control.functions.ts`, `src/lib/evolution-control.functions.test.ts`
- `src/lib/persistence-evidence.ts`, `src/lib/persistence-evidence.test.ts`, `src/lib/AGENTS.md`
- `scripts/interface-inventory.mjs`
- `docs/INTERFACE-SOURCE-INVENTORY.json`, `docs/INTERFACE-ROUTE-INVENTORY.md`
- `roadmap.md` (included in the implementation commit)

This report and the final roadmap disposition are a separate evidence commit.

Rollback in a new review commit, with no unrelated pending edits: restore the pre-existing app files above from **`034daff`**, remove only the three new persistence test/helper files and the new inventory script/generated inventories if desired, preserve dated reports. Example:

```text
git restore --source=034daff -- src/routes/__root.tsx src/styles.css src/components/evolution/ControlCenter.tsx src/lib/evolution-control.ts src/lib/evolution-control.functions.ts src/lib/AGENTS.md
```

Remove `src/lib/persistence-evidence.ts`, `src/lib/persistence-evidence.test.ts`, `src/lib/evolution-control.functions.test.ts` only after the old imports are restored; stage exact paths and commit the rollback. Re-run project/action/link and full tests. Do not reset, amend, force-push or publish. No database/secret/provider rollback is needed; none changed. Baseline preserves earlier Phase 2 idle-polling implementation. Global scene preference is an owner rule; a temporary code rollback is not permission to disregard it later.