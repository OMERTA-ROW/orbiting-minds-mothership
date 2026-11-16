# Step 10 refusal: findings and next step (read-only)

## What the live records show (UTC, 16 Nov 2026)
- 21:39:03 Step 9 signed handshake verified. Step 9 live link is **active** since 21:39:04.
- 21:39:03 Jackboy's signed safety reading: CODE Emergency Stop **released**, Kill Switch **off**, CODE enabled, autonomy allowed, capabilities `autonomous` + `code`, approval ends 03:49:58.
- 21:39:18 Step 10 autonomy activation sent. At 21:39:22 Jackboy answered **HTTP 503 `execution_control_unavailable`**. Mothership rolled back; rollback confirmed. No permits, no jobs.
- 21:42:03 latest signed reading still clear (stops released, kill switch off, 0 permits).

## Conclusion
- **Failing side: Jackboy.** Handshake, reachability, signatures, scopes and safety state all pass. Jackboy itself could not perform the "configure autonomy" step. `execution_control_unavailable` is Jackboy's catch-all for an internal error (it is not "approval expired" or "kill switch on").
- Most likely cause (unconfirmed, Jackboy logs needed): Jackboy's execution-control database step or its Railway runner check failed — for example a missing/uninstalled Jackboy migration or runner configuration not reachable.
- The "engaged" indicators you saw are not what Jackboy reports right now: its signed reading says stops are released.
- **GitHub "Allow dispatch" and the "$1 CODE acceptance test" are separate** Jackboy features. They do not grant or block Step 10 autonomy authorization, and they were not used.

## What you need to do
1. In Jackboy Dev Control, open its server logs around 21:39:18–21:39:22 UTC and find the error behind `execution_control_unavailable` (I can read them if you open that project and ask).
2. Fix that on Jackboy's side, then retry Step 10 "Activate autonomy authorization" in Mothership (Step 9 is still active until 03:49:58).

## Not done
No code, settings, stops, spend or jobs were changed. I could not read Jackboy's live logs from this project.
