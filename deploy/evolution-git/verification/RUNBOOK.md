# Omni-Staging Phase 2C — read-only diagnostics and recovery verification

Nothing here was run on Omni-Staging. Do not run the legacy compose deployment instructions, enable writes, open new gateway routes, trigger sync, alter timers, stop services, change permissions on production paths or restore production. Use only existing authorized unprivileged access. If access is denied, record unavailable; do not add sudo. Privileged operations, snapshot acquisition, backup packaging and isolated restoration require separate explicit owner approval.

## 1. One consolidated read-only host diagnostic

Use Python 3.11+ and existing `git`, `systemctl`, `journalctl`. The owner/operator must identify the actual hourly sync `.timer`, corresponding `.service`, and bare repository storage directory from their existing setup; no guessed unit names or paths are supplied. Run:

```text
python3 diagnose.py --timer <actual-sync.timer> --service <actual-sync.service> --repo-root <actual-repository-directory>
```

Capture stdout in an owner-private (0600) evidence file in an already-private (0700) review directory. The script reads only selected unit properties, journal invocation counts/explicit zero-exit event counts and local Git heads/refs. It never prints ExecStart, environment, remote URLs, configuration, credential files, command output errors or journal messages. It never starts sync. No network calls. Repository reads do not run repository code or hooks. If units/journal/files are inaccessible, evidence remains unavailable.

Required acceptance: actual unit identity, active/waiting timer, LastTriggerUSec and next trigger, most recent service Result/ExecMainStatus and timestamps, recent invocation evidence, 38 nonempty local repository heads/refs. Counts alone are **not** per-repository successful sync receipts. If the existing sync service has no redacted per-run result contract, record this as missing; do not change logging/service configuration in this phase. HTTP listing and mirror_updated do not prove timer success. Compare diagnostic heads with the timestamped preview audit; non-atomic reads and a sync during the audit require another owner-directed check, never an automatic sync.

## 2. Backup — separate approval, no production mutation by these scripts

Have the authorized operator obtain an independently consistent export/snapshot using the actual installed Forgejo version, database engine, Git/LFS/attachment storage and existing approved backup procedure. **Do not tar a live volume and call it consistent.** If consistency requires service stop, DB export, volume snapshot, privilege or network/storage provisioning, obtain explicit owner approval first; these scripts neither perform nor authorize those steps. Include Forgejo app config, database, repository objects/refs, LFS/attachments, relevant version metadata and protected recovery key references. Never expose config or credentials in evidence. External PostgreSQL/MySQL need their own engine-specific recovery drill; SQLite checks cannot validate them.

After approval, package an owner-prepared consistent snapshot:

```text
python3 backup.py --snapshot <consistent-export-directory> --destination <fresh-existing-private-backup-directory> --recipient <public-age-recipient> --owner-approved --consistent-snapshot-confirmed
```

Uses installed `age`, secure local temporary staging, encrypted artifact (0600) plus SHA-256 cipher-artifact manifest, no overwrite or retention deletion. Source symlinks/special files are refused. The snapshot must remain immutable throughout packaging. Public recipient is not a secret; keep the age private identity separately, offline and owner-readable only. Use existing approved encrypted off-host storage; no new purchase or upload is authorized. A local artifact is not an off-host recovery guarantee. Record artifact checksum, version, backup time, protected storage location, operator approval and retention policy without keys. Test missing age/failure states before relying on it. Partial artifacts remain for private operator review, not success.

## 3. Isolated restore verification — separate approval

On a disposable, owner-approved offline verification environment with enough capacity, Python 3.12+ (`tarfile` data filter), installed `age` and Git:

```text
python3 restore_verify.py --artifact <encrypted-artifact> --manifest <checksum-manifest> --identity-file <private-age-identity-file> --owner-approved
```

No production destination parameter exists. It verifies the artifact checksum before decrypting; extracts only into a new 0700 temporary directory; rejects traversal, absolute paths, symlink/hardlink/special entries, oversized archives and Git external alternates. Runs only `git fsck --full`, reads branch/tag refs and runs SQLite `PRAGMA integrity_check` in read-only mode. No Forgejo startup, hooks, repository builds, sync, DB imports, external calls or production overwrites. Temporary copy is removed afterward; encrypted original untouched. The environment must enforce offline restrictions externally if required; the script makes no network calls but does not install a firewall.

Storage checks alone are **not application recovery**. Compare all 38 restored heads/refs to the backup-time source evidence; independently approve an isolated version-matched Forgejo startup, DB/LFS/attachment validation and recovery-time drill later. Nonzero checks, missing repos/databases, unsupported DB engine, missing original receipts or version mismatch block recovery readiness. Temporary deletion is confined to the script-created disposable directory.

## Gate and next action

Phase 3 requires real matching per-repository origin/default head/branch/tag evidence, actual hourly timer and recent per-repository execution receipts, independently consistent backup, approved isolated restore of all 38 repos and application/database recovery evidence. Scripts, unit tests and owner reports alone do not pass this gate. The one next action is an owner-operated Phase 2C evidence review: run the preview audit and consolidated unprivileged host diagnostic, returning only the redacted evidence. Review approval for snapshot/restore separately afterward.