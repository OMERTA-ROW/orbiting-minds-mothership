# Guardian defense-in-depth — development increment, 2026-10-25

## Verified bounded scope

Existing Guardian DEMO records, account gates, CLI workspace and black/gold design remain separate and preserved. No backend schema/configuration, auth provider, production route, connected account, live-site test, paid service, Parrot installation, model invocation or deployment changed.

1. **Independent local enforcement:** local sandbox, routing and change-manifest entry points reload the complete on-disk project binding. Forged/stale/withdrawn/mismatched local selections and unknown tasks fail before process startup. Explicit operator approval and fixed argv remain required. This is not authenticated cross-user authorization or a capability system.
2. **Actual evidence:** fixed allowlist/approval/binding denials, three literal routing-goal indicators, task authorization and task results. No fabricated incidents/counters. No prompts, file requests/content, credentials or paths in these security events. Authorization/result name the run ID; missing result is outcome unknown. Detection is lexical/advisory, not AI. Tested benign quote false-positive and obfuscated false-negative never change permissions.
3. **Bounded Linux containment:** new task process group, context timeout, Ctrl-C, attached-descendant cleanup, capped pipe wait. Real child PID checked in `/proc` as gone/zombie. Detached descendants can escape. Other hosts remain direct-process only. CANCELLED is a cancellation request/context outcome, not universal remote stop verification.
4. **Owner-visible evidence:** private local 0700/0600 security directory/file, exclusive lock, fsync, 2 MiB cap, SHA-256 previous-event chain. Corrupt/incomplete/busy/unsafe/oversized evidence blocks new tasks and preserves originals. JSON export plus Guardian Development Evidence import, optional independently retained head, time/severity/rule/action/evidence, clear control and unknown-outcome warning. Imports are memory-only; no upload/localStorage policy changes. Internal hashes cannot prove publisher/owner identity, immutability or defeat a same-user writer; without external head, replacement/truncation is not detectable.
5. **Owner recovery:** withdrawn local selection denies work; explicit same-name known-good project reselection permits a real passing Go run. Unrelated local project remains usable. Interrupted lock recovery requires confirming stopped writer, retaining original evidence/head, then removing only the empty lock after review. No automatic repair/deletion, live session revoke or code-version restoration.

## Actual verification

- Go 1.25.7 / Linux amd64: `go test -race -count=1 ./...` PASS, final full suite 35.481s; `go vet ./...` PASS. Nine new top-level Guardian tests, including four invalid-binding subcases, actual descendant termination, real owner recovery, unknown task/approval denial, prompt indicator false-positive/negative separation, corrupt evidence, private permissions, lock, symlink/capacity, timeout and pre-cancellation. Existing real failing/passing tasks, log redaction, manifest, workspace and change tests rerun.
- App: `bunx vitest run` PASS **933 tests / 57 files**. New evidence tests **11**, including order/tamper/mixed-project denial, external-head replacement/truncation, 2 MiB cap, forged scope fields, empty records, multiline canonical safety and authorization-only unknown outcome. Prior focused suite passed 131 tests before adding the eleventh evidence case.
- `bunx eslint src/lib/guardian-evidence.ts src/test/guardian-evidence.test.ts src/components/guardian/DevelopmentEvidence.tsx src/components/guardian/Center.tsx` PASS; project formatting applied.
- Six unsigned Go source targets compiled: Linux/Darwin/Windows × amd64/arm64. Only Linux amd64 executed; no signing/native installation or source-repository sync inferred.
- `/tmp/browser/guardian-defense/local_flow.py`: actual compiled source binary targets temporary project, denies unknown command, logs advisory goal indicators, runs real PASS/FAIL/restored PASS tests, handles Ctrl-C with attached descendant stopped, exports **12 actual security events**.
- `/tmp/browser/guardian-defense/check_evidence.py`: actual Go export opened in `/guardian`, saved head matched, CANCELLED displayed, clear removed records, changed digest rejected, 390×844 mobile no overflow, 1280×1800 desktop checked. No page errors or POST/PUT uploads. Screenshots inspected; final preview harness `build OK`.
- Every content route inspected for its leaf `head` including `/`; metadata retained. No new route or public indexing change.
- `python3 src/test/test_completion_register.py`: run after reconciliation; all 85 items retained, Step 3 and Step 7 not promoted to operational completion.

## Changed files / commit

`cli/internal/companion/project.go`, `change.go`, `commands.go`, new `security_audit.go`, `process_linux.go`, `process_other.go`, `cli_guardian.go`, `guardian_defense_test.go`; `cli/README.md`, `cli/SECURITY.md`; new `src/lib/guardian-evidence.ts`, `src/components/guardian/DevelopmentEvidence.tsx`, `src/test/guardian-evidence.test.ts`; `src/components/guardian/Center.tsx`; `AGENTS.md`, `completion-register.json`, `roadmap.md`, this report. Lovable manages commits automatically. Observed managed revision before final report/register edits: `f96a5a0b74473a360a381ce44ac3b8ca7392fd71`; not an external GitHub commit/PR or guarantee of final revision. Separate street-Tech666/Omni copy not synchronized.

## Remaining stages — not verified by this increment

| Stage | Status and concrete prerequisite |
|---|---|
| Repeated auth failure/anomaly/file-request monitoring | Not implemented: verified auth-event ingestion adapter, attributable owner correlation, redacted retention/access model. No test sign-ins or hostile requests sent to shared live backend. |
| Cross-user denial | Existing owner/project account tests retained and mocked account regressions rerun; no fresh hosted two-user test in this turn. Local profile mismatch is not cross-user proof. |
| Short-lived forged/expired/revoked capability tests | Blocked: authenticated owner/project/agent capability schema, issuance/verification/revocation adapter and least-privilege tool endpoints. No capability introduced or claimed. |
| Server durable request/rate/concurrency limits | Blocked: no standard backend primitive; explicit confirmation of custom durable design and concrete quotas needed. No ad-hoc limiter or paid infrastructure silently chosen. Local timeout/log/audit capacity are not request rate limits. |
| Secret/config custody and restricted hosted audit | Blocked: privileged service boundary, secure OS/provider custody, owner-scoped append-only event store and retention policy; local same-user metadata is editable, POSIX modes are not Windows ACL evidence. |
| Live job/descendant cancellation and compromised session revoke | Blocked: isolated durable runner/queue plus actual authenticated revoke/pause/cancel adapters and owner recovery; no remote job or refresh-token revocation adapter connected. |
| Tamper evidence beyond local chain | Blocked: independently retained/checkpointed external anchor or approved signatures/access restrictions; local hashes alone can be rewritten. |
| Known-good code restore | Deferred/blocked: reviewed versioned snapshot/signed update/rollback adapter and native-host evidence; project reselection is not code restoration. |
| Scraped sources/model-output injection monitoring | Not implemented: those existing contents remain untrusted and confer no tool authority; no universal classifier or AI threat feed installed. |
| Parrot OS / paid services / production rollout | Not authorized, not installed/connected/deployed. Separate future isolated owner decision only. |

Rollback of this source increment means reviewing/reverting these development changes through managed project history, preserving local evidence and user files. No generated keys, purchases, new secrets or credentials are required for the verified offline increment.