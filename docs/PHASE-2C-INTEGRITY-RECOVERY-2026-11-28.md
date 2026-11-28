# Phase 2C — integrity and recovery readiness, preview only

## Actual evidence and disposition

| Area | Evidence | Result |
|---|---|---|
| Forgejo listing | Owner reports seeing all 38 private repositories after Phase 2B | Owner-observed, not independently repeated in this turn |
| GitHub access | Existing CryptoGoochi GitHub connector GET `/orgs/OMERTA-ROW/repos?per_page=1&page=1` returned HTTP 200 and `OMERTA-ROW/task-dashboard` | One actual upstream inventory probe verified; not proof of private access to every mirror source |
| Preview owner access | Restored owner session, desktop/mobile `/repositories` | Existing MFA check refused; audit control disabled before outbound comparison |
| Per-repository integrity | New reproducible audit is implemented and unit-tested | **All 38 actual comparisons pending**; no real discrepancy list or equality claim fabricated |
| Hourly sync timer | No authorized Omni-Staging host session/SSH connector available | Actual timer identity/status, recent receipts and 38 per-repository sync outcomes pending; no sync or schedule change |
| Backup | Approval-gated snapshot packager and runbook | Actual consistent Omni-Staging snapshot and independent/off-host storage unverified |
| Local isolated recovery | Real `age` encryption/decryption, checksum, SQLite integrity and Git ref readback on a disposable synthetic snapshot | Passed these checks; this is not recovery of the 38 real repos |
| Git fsck | Sandbox refuses `git fsck` | Not bypassed; full Git integrity remains unverified and storage readiness correctly remains false |
| Forgejo application / external database restore | Script never starts Forgejo or imports an external DB | Not performed; separate approved isolated application recovery drill required |
| Visuals/safety | Desktop/mobile screenshots inspected after reads settled | One unchanged live space canvas, no page errors/overflow; MFA refusal preserved |

**Phase 3 stays gated.** No host configuration, gateway permissions, schedules, production restoration, repository writes, agent grants, autonomous activation, AI request, new purchase, deployment or publication.

## Implemented read-only audit

On `/repositories`, the manual **Audit upstream integrity** action invokes an owner/verified-email/MFA server function with private no-store output. No automatic audit, polling, retry, sync or persisted database writes. Download exports the real returned evidence; no fixture rows are used in the interface.

The reader preserves the exact `https://git-api.evoomni.tech` origin, Bearer gateway key, Cloudflare Access service authentication, `Evolution-OMNI-Gateway/1.0` User-Agent, Accept header, GET-only operations and no redirects. GitHub uses the existing authorized connector gateway, not a direct credential workaround. Only these read endpoint families can be constructed:

- Forgejo `/api/v1/user/repos`, `/api/v1/repos/{owner}/{repo}`, and corresponding `/branches`, `/tags`.
- GitHub `/orgs/OMERTA-ROW/repos`, `/repos/OMERTA-ROW/{repo}`, and corresponding `/branches`, `/tags`.

No gateway permissions were widened. An inaccessible path remains HTTP-classified unverified; do not widen access merely to manufacture a pass. Metadata replies are capped at 4 MB, pages at 20 (50 Forgejo / 100 GitHub), individual calls at 15 seconds, the audit starts no further calls after a 120-second deadline, and repository comparisons run in batches of four. One in-flight owner action is enforced locally.

### Mapping and discrepancies

Inventory candidates use the same repository basename under OMERTA-ROW, case-insensitively. They are **not considered verified mapping** unless Forgejo repository metadata's `original_url` resolves to the exact OMERTA-ROW GitHub repository. Credentials in original URLs are never returned. Missing original_url, source mismatch, invalid name, duplicate/ambiguous upstream candidates or inaccessible metadata remain explicit unverified outcomes; name equality alone never passes integrity. Renamed/non-matching repository mappings need future reviewed mapping evidence; no guessed alias is silently accepted.

For each candidate: default branch, private status, default head SHA and accessible branch/tag commit identifiers are recorded and compared. Missing refs, differing SHAs/default branches, unavailable refs and missing upstream candidates are reported per repository. Upstream repositories outside the mapped set are listed separately, not falsely described as intended mirrors. Ref identifiers come from provider APIs; annotated-tag API commit IDs are not proof of identical raw tag objects or complete namespaces beyond heads/tags.

`default_head_differs_staleness_unproven` reports divergence **without asserting ancestry or stale age**. HTTP timestamps, metadata `updated_at`, mirror flags and hourly timer claims cannot establish that a differing commit is behind rather than ahead/diverged. Full Git ancestry/staleness and other refs require existing authorized host evidence. Reads are not an atomic distributed snapshot; start/completion times are recorded. Matching refs may change after the check and never prove sync execution or recovery.

## Host and recovery tools

`deploy/evolution-git/verification/RUNBOOK.md` contains all operating steps, prerequisites, approval boundaries and limitations:

- `diagnose.py`: consolidated unprivileged unit status / selected timestamps / recent journal invocation counters and local Git heads/refs; no raw journal/config/env/credential output, network or service mutations.
- `backup.py`: separately owner-approved encryption of an **owner-prepared consistent snapshot**, private destination and checksum, no source changes/overwrite/retention deletion. Does not acquire a live snapshot or pretend a live volume tar is consistent.
- `restore_verify.py`: separately owner-approved decryption/extraction only into a new private temporary copy, traversal/link/device/size/alternates guards, Git fsck and ref reads plus read-only SQLite checks; no production destination argument, network calls, service start or DB imports.
- `test_verification.py`: archive safety, approval/permission/checksum refusals, diagnostic redaction and actual disposable encrypted snapshot/SQLite/ref round trip. No production data used.

Historical `backup.sh` is now a refusal-only wrapper, because its unverified dump command and deletion of older backups were unsafe for this phase. This change is preview source only; no installed host script/timer was changed. Historical compose deployment/admin/write-token instructions are prominently marked not to run in this phase.

## Tests and reproduction

```text
bunx vitest run src/lib/forgejo-audit.test.ts src/lib/forgejo-audit.server.test.ts src/lib/forgejo-audit.functions.test.ts src/lib/forgejo.test.ts src/lib/forgejo.functions.test.ts src/lib/razul-eye.test.ts src/test/site-links.test.ts
nix shell nixpkgs#age -c python3 -m unittest discover -s deploy/evolution-git/verification -p test_verification.py
```

**69 app tests passed**, seven files: audit logic 11, audit HTTP boundary 11, audit owner boundary 2, Forgejo adapter 21, existing owner server boundary 2, owner rules 13, link regressions 9. These use explicit synthetic fixtures/mocked fetch or compiled-handler seams, not real comparison success.

**11 Python tests passed**: nine safety/approval/checksum/redaction/permission tests, one safe archive acceptance test (included in the total safety cases), and the actual disposable encrypted snapshot/SQLite/ref readback exercise. Git fsck was refused by the sandbox and is not counted as a passing check. Initial recovery run failed on sandbox-restricted Git mutation; replaced only fixture construction with valid static Git object bytes, never bypassed the restriction. Subsequent fsck restriction is reported as unavailable, not circumvented.

Total automated tests: **80 passed, zero skipped** in these focused suites. This count is not 80 real infrastructure acceptance checks. Changed TypeScript lint and `git diff --check` pass; latest preview compilation **build OK**. Browser: actual owner session on desktop 1280×1800 and mobile 390×844, settled MFA refusal/disabled audit verified, one live canvas and no page errors or overflow. Initial captures were taken before reads settled and were not counted as acceptance; settled screenshots were re-inspected.

## Single next owner action

Perform the **Phase 2C evidence review**: with two-step sign-in, run Audit upstream integrity and download its JSON, then have your existing authorized Omni-Staging operator run the single read-only `diagnose.py` command with the actual timer/service/repository directory and return its redacted JSON. Do not send credentials, raw logs, environment or configuration. This is one evidence-review handoff, not permission for backup or production restore. Snapshot acquisition and isolated restore need separately reviewed approval after diagnostics.

No additional credential request or configuration change is required by this implementation. If existing gateway endpoint policy blocks refs, record that limitation rather than expanding it in this phase. Actual discrepancies, sync receipts and the 38-repo recovery proof cannot be reported until evidence is available.

## Changed files and rollback

New files: `src/lib/forgejo-audit.ts`, `src/lib/forgejo-audit.server.ts`, `src/lib/forgejo-audit.functions.ts`, their three `.test.ts` files; `deploy/evolution-git/verification/{diagnose.py,backup.py,restore_verify.py,test_verification.py,RUNBOOK.md,AGENTS.md,.gitignore}`; this review.

Existing files: `src/components/evolution/ForgejoRepos.tsx`, `src/lib/AGENTS.md`, `deploy/evolution-git/README.md`, `deploy/evolution-git/backup.sh`, `roadmap.md`, `docs/OMNI-BLOCK-OWNED-INFRASTRUCTURE-ROADMAP.md`.

The final chat gives the Phase 2C commit SHA. To roll back on preview, restore the six existing files from that commit's parent with `git restore --source=<phase-2c-sha>^ -- <paths>`, remove only the new files listed above and make a normal rollback commit. Do not reset history or publish. No database, host, credential or schedule rollback is needed because none was changed. Existing infrastructure request/storage costs are not measured; no new paid service or savings promise.