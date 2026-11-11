# Plan: Mothership as the OMNI Bridge landing spot

Design only. Nothing is built, turned on, or changed in Jackboy or OMNI until you approve.

## What already exists (checked in the code)
- **Docking Bay** (`/omni-dock`, protocol `omni.dock/v1`): pair, heartbeat, jobs and stop addresses exist, plus database records from step 0035. Device kinds already include `omni_cli`, `omni_desktop` and `honeycomb_mobile`. No device has ever docked.
- **OMNI Terminal** (`/omni-terminal`): status commands, Emergency Stop and a held task list. Tasks proposed by docked devices stay held. Nothing runs them.
- **Jackboy links in Mothership:** two exist.
  - The secure OMNI link (`omni.link/v2`, owner and two-factor gated).
  - A Jackboy dispatch receiver (`jackboy.dispatch/v2`) that only accepts `test` jobs, with approve, revoke and callback.
  - Neither one creates a queued job inside Jackboy from a held Mothership task. That piece is missing.

## 1. Docking readiness: your clicks
1. Open Docking Bay and sign in with your authenticator code. Click **Issue pair code**. You get a 10-character code that lasts 15 minutes and works once.
2. Type the code into `omni_cli` or `omni_desktop`. The device makes its own key and shows a 6-digit safety code.
3. Docking Bay shows the waiting device with its safety code. If the two codes match, click **Approve device**. If they don't, click **Reject**.
4. On the device card, tick **status.read**, **jobs.propose** and **stop.engage**. Leave the others off.
5. Use **Revoke device** at any time. The device is cut off right away.

**Production config:**
- The dock addresses only work on evoomni.tech after you publish. Until then, testing happens on the preview address.
- During the build I will check that each required setting name exists, without reading any values. The names are below; I'll mark each one present or missing.
  - Dock and link: `JACKBOY_LINK_ENABLED`, `JACKBOY_LINK_ORIGIN`, `OMNI_LINK_CLIENT_ID`, `OMNI_LINK_PROJECT_ID`, `OMNI_LINK_BOOTSTRAP_KEY`, `OMNI_LINK_HMAC_SECRET`, `OMNI_LINK_APPROVAL_EXPIRES_AT`.
  - New for the handoff (all missing today): `JACKBOY_HANDOFF_ENABLED` (off by default), `JACKBOY_HANDOFF_ORIGIN`, `JACKBOY_HANDOFF_CLIENT_ID`, `JACKBOY_HANDOFF_HMAC_SECRET`. You would add these through the secure form. The secret must match one Jackboy issues.
- A desktop command-line tool doesn't need browser permission rules, so none are required for it. Honeycomb's browser access stays unverified.

## 2. Handoff: held task to queued Jackboy job
- On a held task, a new **Send to Jackboy** button. It requires you as owner, a two-factor sign-in, and an authenticator code from the last 15 minutes.
- Mothership sends exactly one signed request to Jackboy with: project, repo, Test or Build, the exact instructions, and a fingerprint of those instructions.
  - The request is signed with a time stamp and a one-time number, and must arrive within 60 seconds.
  - Sending the same task twice returns the original job, not a second one.
  - Redirects are refused, with a 5-second limit and a small reply size.
- Jackboy creates the job as **queued, waiting for your passkey**. Mothership never sends work to OMNI, and Jackboy keeps its own passkey approval and spend caps.
- Each handoff is recorded in the owner-only audit log: who sent it, when, the fingerprint and Jackboy's reply.
- **The Jackboy endpoint to request (send this to Jackboy):** the current `jackboy.dispatch/v2` only allows `test` and runs in the other direction. So Jackboy needs one small new address:
  - `POST /api/public/omni-handoff/v1`, with the actions `create` and `status`.
  - It checks the signature, the clock, the one-time number and that the client is on its allowlist.
  - It only creates queued jobs and never runs them.
  - It answers `{ jackboyJobId, status }` and signs the reply.

## 3. Results back to the terminal
- Each handed-off task shows a status badge in OMNI Terminal: queued, approved, quarantined, running, completed or failed. **Refresh** asks Jackboy for the status (owner only).
- Docked devices with **status.read** see the same statuses in a new read-only list, `POST /api/public/omni/dock/jobs-status`. It is signed like the other dock calls and only shows that device's own tasks. The list is plain text, with no output or secrets.
- Statuses come straight from Jackboy's signed replies. Mothership never guesses them.

## 4. Emergency Stop and autonomy
- Every step checks Emergency Stop first: pair code, approving a device, handoff, status refresh and the device status list. If Stop is on, or can't be read, the step is refused.
- A device with **stop.engage** can turn Stop on, but never off.
- Autonomy for OMNI core, Jackboy CODE and Honeycomb stays off, and attempts to turn it on are refused. Nothing runs on Mothership or on devices.

## 5. Files, database, tests, first staging test
**Files:**
- New: `src/lib/jackboy-handoff.server.ts` (signed sender and reply check), `src/lib/jackboy-handoff.functions.ts` (owner send and refresh), `src/routes/api/public/omni/dock/jobs-status.ts`.
- Changed: `omni-dock.server.ts` and `omni-dock-store.server.ts` (status list), `OmniTerminal.tsx` (button and badges), `docs/OMNI-DOCK-PROTOCOL.md`, `AGENTS.md`, `roadmap.md`, `completion-register.json`.

**Database (one new step, 0037, applied only with your approval):**
- A `omni_task_handoffs` record: task, Jackboy job, fingerprint, status, times. Owner can read; only the server can write. Sending is limited to one per task.
- An owner-only action that checks the recent authenticator code and Emergency Stop before recording a handoff.
- A device-scoped status reader.

**Tests:**
- Signing and reply checks, including a wrong or tampered reply.
- The same task sent twice, and Stop blocking each step.
- A device trying to read another device's tasks.
- Database checks run on a disposable copy.

**Your first staging test (preview, desktop command-line tool):**
1. Confirm Emergency Stop is off and Jackboy's handoff address is ready in staging.
2. Add the four handoff settings, with `JACKBOY_HANDOFF_ENABLED=true` set for staging only.
3. Dock the command-line tool (section 1) and give it status.read and jobs.propose.
4. Propose a Test task from the tool. It shows up as held.
5. Click **Send to Jackboy** with your authenticator code. Check that Jackboy shows it queued.
6. Approve it with your passkey in Jackboy. Expect quarantined while the worker is off. Check the badge in the terminal and on the device.
7. Turn on Emergency Stop and retry steps 4 to 6. Each one must be refused.
8. Revoke the device.

## Blockers
- Jackboy's new handoff address (section 2) is built in Jackboy.
- The matching handoff secret comes from Jackboy.
- Publishing is your separate decision.
