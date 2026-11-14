# Steps 9–10: live link activation and cross-system CODE Emergency Stop enforcement

## What I found (read-only, verified this turn)

- **Live link is already on in OMNI.** The signed handshake verified at 00:50 UTC, and Step 8 is approved. Steps 9 and 10 are pending.
- **OMNI has no running executor.** Autonomy windows are switched off in the build. The CODE queue has no worker and holds 0 jobs. There are 0 autonomy windows. So nothing is running in OMNI that a stop could interrupt today.
- **OMNI already halts its own records.** When OMNI's Emergency Stop or terminal Kill Switch is triggered, the database ends autonomy windows and marks running CODE jobs stopped.
- **OMNI does not know Jackboy's CODE Emergency Stop.** Jackboy's link replies contain no pause, CODE stop or CODE-enabled field. Jackboy never notifies OMNI when its stop changes.
- **When Jackboy is paused, it refuses every link request with an unsigned "grant_unavailable".** That includes handshake and status. OMNI cannot tell this apart from an expired approval.
- **Real CODE runs only in Jackboy.** Jackboy's CODE Emergency Stop saves the stop first, then asks GitHub to cancel the running job. That is a cancellation request, not proof the job ended. The OMNI link can never start CODE; it only runs the fixed self-test.
- **OMNI's own Emergency Stop is currently released, since 12 Nov.** I read your "keep Emergency Stop engaged" as Jackboy's CODE Emergency Stop. I will not change OMNI's stop. Tell me if you want OMNI's stop engaged as well.

**Conclusion:** real enforcement across both systems needs changes on both sides. The Jackboy half has to be made in the Jackboy project. I can only write its exact specification from here.

## What gets built

### A. Jackboy side (separate project, you open it there)
1. **New signed "safety-state" request.** It answers even while Jackboy is paused, and checks the identity and single-use code first. It returns only: paused, CODE stop, CODE enabled, cancellation status, observed time, and an expiry 2 minutes later. It is signed exactly like today's link replies. If anything can't be read, it reports "unknown", never "safe".
2. **Signed stop notice to OMNI.** It is sent after the stop is saved, whenever the CODE stop engages or Jackboy pauses, including automatic trips from failure or spend limits. It is queued and retried, and a failed send never delays or undoes the stop. It uses its own new signing secret.
3. **No other changes.** The link still can't start CODE, and no switches change.

### B. OMNI side (this project)
1. **Jackboy safety record (new database table, migration 0053).**
   - It stores the latest *verified* Jackboy safety state and when it expires. Only the server writes it. The owner can read it.
   - A fail-closed check treats it as "stopped" if it is missing, unknown, expired, paused, or the CODE stop is engaged.
2. **Database enforcement.** Starting an autonomy window or moving a CODE job to running is refused unless all of these hold:
   - The Jackboy safety record is fresh and shows no pause and no CODE stop.
   - Step 10 is approved and still within its window.
   - All existing gates pass.
3. **Automatic halt.** When a verified record shows engaged, paused or unknown, or the record goes stale, OMNI:
   - ends all autonomy windows;
   - marks running CODE jobs stopped;
   - marks queued CODE jobs as held;
   - sends a stop to the OMNI sandbox for any in-flight jobs where that's supported;
   - writes an audit row.
   A notice from Jackboy can only ever *stop* things. Only a fresh signed read can show "clear", and even that starts nothing.
4. **Sync.**
   - A protected endpoint receives Jackboy's signed notices and checks the signature, time and one-time code.
   - A once-a-minute scheduled check reads Jackboy's safety state. It uses the existing protected job-route pattern.
   - The owner also gets a "Refresh safety state" button.
5. **Step 9 = live link activated.** Approving it lets OMNI run the connection check and the safety sync. The approvals page shows:
   - link connected, with the time;
   - Jackboy safety state: Engaged / Clear / Unknown (stale), with the time;
   - "Kill Switch on" shown separately from "CODE stop engaged".
6. **Step 10 = autonomy authorization.** Approving it records the authorization, needs your fresh two-step code, and lasts for the existing window. The page shows "Authorized — not running" and the reason, for example "CODE Emergency Stop engaged" or "no executor connected". It never shows "running" while any stop applies. Approving starts no jobs and turns on neither CODE nor autonomy.
7. **The manual OMNI Terminal stays separate.** Local diagnostic commands (status, probe) keep working while the CODE stop is engaged. If Jackboy's Kill Switch is on, Jackboy link requests are refused and shown as a safety denial, and local diagnostics still work.

## Testing
- **Database tests** for:
  - refusal when the record is stale, missing, unknown, paused or stopped;
  - automatic halt of windows and jobs;
  - notices can't release anything;
  - replays are rejected;
  - the Step 10 gate.
- **Server tests** for:
  - signature checks on the exact reply bytes;
  - rejecting old or replayed replies and wrong project or signature;
  - the endpoint refusing unsigned or malformed notices.
- **Screen tests** for the Engaged / Clear / Unknown states and for "Authorized — not running".
- **End-to-end check, after Jackboy ships.** You re-press Jackboy's CODE Emergency Stop while it is already engaged. OMNI should show the notice within seconds and the halt in its audit. A blocked attempt to start an autonomy window should be refused. Until that passes, I will report the kill mechanism as **unverified**.

## What needs you
1. Approve this plan. This includes migration 0053.
2. Add one new secret for the stop notices in both OMNI and Jackboy. I will request it through the secure form and never see the value.
3. Open the Jackboy project and apply spec A. I will write it as a ready-to-paste instruction.
4. Allow publishing OMNI after the tests pass. Then publish Jackboy.
5. On evoomni.tech: approve Step 9, refresh the safety state, and approve Step 10 only if you want the authorization recorded.

## Will not do
Release any stop, turn Jackboy's Kill Switch on or off, turn on CODE or autonomy, start jobs, approve steps for you, change spending limits or existing secrets, or claim the kill mechanism works before the end-to-end check passes.

## Technical details
- **Migration 0053:**
  - `jackboy_safety_state` table: singleton, RLS on, owner read, service-only write. Fields: observed/expires/paused/code_stop/code_enabled/cancellation/source (`poll`|`event`)/proof_digest.
  - `jackboy_safety_nonces` table.
  - `jackboy_safety_clear()` as SECURITY DEFINER, fail closed.
  - Recorder RPC that sets the state and calls `omni_code_halt('global','jackboy_code_stop')` + `omni_autonomy_end_all(NULL,'jackboy_code_stop')`, and sets queued jobs to paused.
  - Extend `omni_autonomy_window_guard` (INSERT) and `omni_code_job_guard` (entering leased/running) with `jackboy_safety_clear()` and Step 10 effective approval.
- **Stale halt** runs in the minute check *and* inside the guards. A stale record blocks admission even if the check doesn't run.
- **Safety read:** `JackboyLink.safetyState()` reuses `omni.link/v2` proof verification on the raw body, binds nonce/project, bounds the deadline, and never treats an unsigned 403 as state.
- **Notice receiver:** `/api/public/jackboy/safety-event`. HMAC-SHA256 over contract, method, path, timestamp (±60 s), nonce and body. Contract `jackboy.safety-event/v1`, new secret `JACKBOY_SAFETY_EVENT_HMAC_SECRET`. Can only record engaged or paused.
- **Flow marker:** bump `APPROVAL_FLOW_VERSION` to 7. Record the rule in `src/lib/AGENTS.md`. Update `roadmap.md` and `completion-register.json` with evidence states.
