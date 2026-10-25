# Evolution terminal maintenance — bounded development increment

Date: 2026-10-25. Extends Guardian Step 3 and terminal Step 7; no duplicate backend, external repo change or production release.

## Implemented and tested

- **CLI `device identity` / `permissions`:** unattested local invocation, no hardware ID, no enrollment/scopes. Explicit remote target denied. Not cloud-user authorization.
- **`storage report`:** selected existing local project/profile only; metadata traversal through Go root-relative operations, Linux UID and nonshared-write checks, no content read. 5,000-entry / 10-second bound; large-file metadata, cache/temp/other byte counts, exclusions and actual filesystem available bytes. Excludes recognizable personal/media/credential/application/backup/trash paths, unsafe modes, symlinks, hardlinks and other OS-user files. No whole-device scan or savings claim. Read-only output, no report/audit persistence.
- **`storage plan`:** explicit cache/temp categories, only project's `.evolution/cache` / `.evolution/tmp`; 1-hour recent modification exclusion, 10-minute expiry, at most 256 MiB selected bytes, exact paths/category/size/mode/mtime/Linux device+inode+ctime metadata, full project binding, exclusions and SHA-256 review. No files moved or deleted. Inode/ctime metadata is not signed identity or reliable active-file detection.
- **`storage apply`:** exact `--device local`, saved clean absolute regular private plan, exact fingerprint and `--approve`; validates expiry, profile, duplicate/path/symlink/permissions/UID/file changes and estimates, THEN BLOCKED. No trash/recovery or enrolled capability exists; no destructive fallback/reversibility claim.
- **`malware availability` / `status`:** fixed `/usr/bin/clamscan` and `/usr/local/bin/clamscan` metadata checks only. **No scanner installed here; NOT SCANNED.** Never execute PATH candidates or infer clean/malware-free.
- **`malware scan`:** BLOCKED. Fixed-argv prototype exists in `_test.go` only, NOT compiled into binaries. Actual compiled disposable process fixture tests version handling, exact no-remediation argv, exit 1/2, redaction, timeout, active/pre-cancellation and unavailable scanner. Fixture is NOT ClamAV, no real database/engine/detection verified. Safe native file confinement remains absent: a pathname precheck cannot close all concurrent symlink races.
- **`operation status/cancel`:** unsupported background/remote service, no receipt. Foreground report Ctrl-C/context bounded; previous Linux local task process-group cancellation retained.
- **`terminal security`:** names actual partial local enforcement and missing authentication/scopes/revoke/rate/adapters. No certification or all-clear.
- **`/platform` Maintenance & security tab:** exact source-command/status list, device action unavailable, current-project terminal surface inventory, Guardian navigation, separate external targets and mobile limitations; black/gold preserved. No device connection or operation in browser.

## Actual commands / evidence

- Go 1.25.7: `go test -race -count=1 ./...` and `go vet ./...` in `cli/` PASS. Most recent full run before extra Linux UID fixture: 38.471s; final command/result recorded in register. Ten maintenance top-level cases plus separate OS-user exclusion case, existing Guardian/workspace/manifest/redaction/project regression suite retained.
- `bunx vitest run`: **933 tests / 57 files PASS** (maintenance changes introduced no markup/copy tests).
- `bunx eslint src/components/cli/Maintenance.tsx src/components/cli/Companion.tsx src/data/terminal-boundaries.ts` PASS; project formatting applied.
- All six unsigned source targets cross-compiled (Linux/macOS/Windows × amd64/arm64). Only Linux amd64 executed; native macOS/Windows and real scanner not verified.
- `/tmp/browser/maintenance/local_flow.py`: actual compiled source binary -> explicit disposable project -> actual free bytes/metadata -> **2 files/12 bytes** dry-run -> full file hash snapshot unchanged -> valid reviewed apply BLOCKED -> wrong confirmation, stale file and remote target DENIED -> scanner `NOT SCANNED`, identity `enrolled=false`. No owner device touched; no scan process or cleanup.
- `/tmp/browser/maintenance/check_view.py`: `/platform` tab, disabled device action, inventory, Guardian link, desktop 1280×1800 and mobile 390×844 no overflow; screenshots inspected, no page errors or POST/PUT writes/uploads.
- Leaf head checked for all 64 content routes including `/`, all retained. Preview latest `build OK`; an intermediate undefined-view error was corrected and not counted as pass.
- Completion register validation preserves 15 steps; later maintenance item records bounded partial state rather than operational completion. No manual commit/push; observed managed revision before final report/register changes `9ef24c551955e00706506884890cae1818ab95fa`, not external repo/PR evidence.

## Inventory — this source only

| Surface | Actual boundary |
|---|---|
| `cli/` local companion | Fixed tasks/project binding/local evidence; new metadata-only reports and plans. No enrollment/remote execution. Fixed file-manager opener separate; no arbitrary shell. |
| `/beta-omni`, `/api/omni` | Authenticated approved owned-project inference, not a terminal/device endpoint. |
| `/pathway`, `/api/evolution-pathway` | Authenticated bounded AI drafting; no shell or file authority. |
| `/sandbox`, `/dashboard` | Scripted browser demo terminal samples. |
| `/omni`, `/omnibridge`, `/command-nexus` | Demo/reference plans and local drafts, no attached terminal. |
| `/care`, `/care-agent`, `/pilot`, `/updates`, `/voice` | Demo/unshipped native reference; no OS scan, file or policy action. |
| `/guardian`, `/devices`, `/fleet`, `/security-report` | Demo consent/pause and imported offline evidence; no remote stop. |
| `/api/public/jobs/knowledge-collect` | Existing cron-authenticated collector, not a shell; not changed or live-tested here. |

Known external targets: `https://github.com/street-Tech666/Omni` separate source copy, not auto-synced; `https://evoomni.tech`, `https://www.evoomni.tech`, `https://orbiting-minds-mothership.lovable.app` existing hosting not redeployed/tested disruptively. No other websites/repos covered; API repository access and explicit reconciliation target remain absent. No CyberLink/Cyberace enrollment.

## Blocked / next adapters

1. Authenticated signed companion/device enrollment and secure owner/device/project service checks, scoped short-lived capabilities, revocation, Guardian emergency stop, protected redacted audit. Local OS UID/profile comparisons cannot establish customer isolation; no fresh hosted cross-user/device acceptance test.
2. Standard backend rate limiter absent; confirm custom durable design and concrete quotas before implementing. Existing report/time/log/candidate caps are not server request rate limits.
3. Native safe pinned targets and open-file/active checks, recoverable trash/quarantine with verified restore and receipts. No apply until independently reviewed recovery; no silent empty trash/uninstall/format.
4. Real supported installed scanner/engine/version/database evidence in an authorized isolated host; safe no-remediation scan adapters/status/cancel, no installs/purchases/uploads or protection changes. Current disposable fixture tests prove argv/process handling only.
5. macOS/Windows native free-space/ownership/ACL/link, trash/restore, scanner and process-tree support; mobile restrictions remain explicit. Unsupported adapters fail closed; no implementation implied by successful cross-compile.
6. Persistent operation status/cancel and background job identity/limits; no remote receipt fabricated.

No additional credentials needed for current disposable tests. Future inputs require secure editor/OS custody, never chat. No production migration/config/auth connection, paid service, live-site disruption, deployment, scanner install or owner-device operation occurred.

## Changed files

New: `cli/internal/companion/storage.go`, `storage_platform_linux.go`, `storage_platform_other.go`, `maintenance_cli.go`, `maintenance_test.go`, `storage_owner_linux_test.go`, `scanner.go`, `scanner_adapter_test.go`; `src/data/terminal-boundaries.ts`, `src/components/cli/Maintenance.tsx`, this report.
Extended: `cli/internal/companion/commands.go`, `cli/README.md`, `cli/SECURITY.md`, `src/components/cli/Companion.tsx`, `AGENTS.md`, `roadmap.md`, `completion-register.json`, register validator's expected count. No generated integrations, owned data, external repositories or settings changed.