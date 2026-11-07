# OMNI Live Terminal — plan

This plan adds to the existing OMNI Terminal page (`/omni-terminal`). It does not create a second terminal. The page you have now (status, held tasks, Emergency Stop, logs) stays as it is. The live terminal becomes a new panel on that page. Nothing is built, turned on or published until you approve.

## What you will see

**1. Locked screen (default)**
- Banner: "Not connected — OMNI secure-link self-test has not passed."
- Checklist with live status: link configured, Railway reachable, self-test passed (with date), kill switch, Emergency Stop, your approval step.
- The command box is disabled and greyed out. You can't type in it until every item is green.

**2. Passkey gate**
- When you open the terminal or start a session, a "Confirm with passkey" prompt appears. Your device asks for Face ID, Touch ID or your security key.
- If the check is cancelled or fails, you go back to the locked screen with a clear reason.

**3. Live terminal window**
- Header strip: sandbox name and ID, session ID, OMNI version, connected since, idle countdown (for example "Locks in 9:42").
- Dark monospace window with streamed output. Normal output, errors and system messages each get their own colour, and the exit code shows when a command ends.
- Command line with history: up and down arrows, plus a searchable history list beside it.
- A large red **Stop** button, active while a command runs. It kills that command in the sandbox and shows "Stopped by owner".
- Error panel: link errors, timeouts, signature rejections and sandbox errors appear in plain language with a reference ID.

**4. Kill switch panel**
- "Terminal: Enabled / Disabled". Turning it on or off needs a fresh passkey check.
- Disabling ends every session at once and blocks new ones. It is separate from the Emergency Stop, and either one being on blocks the terminal.

**5. Audit log tab**
- Read-only list: time, session, sandbox, the command exactly as typed, exit code, how long it took, output size and a fingerprint of the output, and who stopped it.
- You can filter it and export it as a file. Nothing can be edited or deleted, by you or by the app.

## How it works

```text
Browser ──(owner session + passkey proof)──> Mothership server
Mothership server ──(HMAC-signed, existing Jackboy link)──> OMNI on Railway
OMNI ──> isolated sandbox (no production keys or database)
Output streams back the same way, piece by piece
```

- The browser never holds any link key or secret. Signing happens only on the Mothership server.
- Every command is signed with a timestamp, a one-time number and the session ID. OMNI refuses repeats and expired requests.
- Inactivity timeout: 10 minutes with no typing ends the session, and you need a fresh passkey check to continue. A session also ends after 60 minutes no matter what.
- Execution stays off until all of these are true: the self-test has passed, the kill switch is enabled, the Emergency Stop is released, your link approval is recorded and your passkey check is fresh.

## Database tables to add

- **Passkeys:** your registered passkey's public key, name, counter and when it was last used. Owner-only.
- **Passkey checks:** one-time challenges and when each was confirmed, so the server can require a recent check.
- **Terminal settings:** one row holding the kill switch (on or off), who changed it and when. If this row is missing or can't be read, the terminal counts as disabled.
- **Terminal sessions:** session ID, sandbox ID and name, started, last activity, ended, and why it ended (timeout, stopped, kill switch, error).
- **Terminal audit log:** append-only. Owner can read it; only the server can add to it. Rows can never be edited or deleted.

All tables are owner-only. Visitors who aren't signed in get no access, and the browser can't write to them directly.

## Work that has to happen on Railway (in the OMNI/Jackboy project)

These are listed for you; I won't do them from here:
1. Add signed endpoints to start a session, run a command (with streamed output), stop a command and end a session.
2. Run commands in a separate sandbox container with no production settings or database access, with CPU, memory, time and network limits.
3. Report the sandbox ID and its health back to the Mothership.
4. Pass the existing link self-test.

## Build order (after approval)

1. Confirm what passkey support exists today. I believe sign-in uses authenticator-app codes now; I'll check that first. Then add passkey setup and checks.
2. Add the database tables and the server rules for them, with tests on a throwaway database.
3. Add the server-side terminal relay: signing, streaming, Stop, timeouts, and checking the kill switch and Emergency Stop.
4. Build the screens above on the existing Terminal page. Until OMNI responds, the locked screen stays in place.
5. Tests: refused before the self-test, kill switch, a stale passkey check, a repeated request, timeout, Stop, and that the audit log can't be changed. Then a signed-out browser check.

## Still blocked after the build

- Live commands can't run until Railway has the endpoints above, the sandbox exists, the self-test passes and you give approval.
- I can't test the passkey flow myself. You'll need to try it on your device.
- Nothing gets deployed or published.

## Questions (defaults assumed if you don't answer)

- Passkey only, or passkey with authenticator code as a backup? Default: passkey only for the terminal.
- Timeout: 10 minutes idle and 60 minutes maximum?
- Should the audit log keep full command output, or only a fingerprint and the first 4 KB? Default: fingerprint plus 4 KB, so secrets that appear in output aren't stored in full.
