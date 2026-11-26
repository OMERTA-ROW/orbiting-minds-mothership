# Evolution infrastructure — bounded first increment

## Coordination and source

PR [#44](https://github.com/OMERTA-ROW/orbiting-minds-mothership/pull/44) is open, specification-only. Reviewed head: `cc3f245c9e6db738a388ed281e889341fbeabd2f`, document `docs/evolution-infrastructure-foundation.md`. Its requirements are preserved; this change does not merge the PR or replace its branch. Existing public URLs, repository identifiers, authentication and OMNI/Jackboy contracts remain unchanged.

Read-only PR #28 check on 2026-11-26: **closed/merged at 2026-11-22T09:50:38Z**, titled “Quarantine unverified OMNI workspace sandbox”. This is evidence of quarantine, **not completion of an isolated execution service**. `services/omni-sandbox/` and CODE remain locked pending sandbox verification and a separately reviewed release.

## Actual changes

- User-facing product identity is Evolution. The verified owner's primary navigation is Home, Repositories, Pull Requests, Actions, Migrations, Deployments, Settings. Existing menus remain available to other accounts, and old routes are preserved. OMNI/Jackboy controls remain reachable from the workspace.
- Six private pages: `/repositories`, `/pull-requests`, `/actions`, `/migrations`, `/deployments`, `/settings`. Owner Home replaces only the owner's home presentation; the public cosmic homepage remains intact.
- Create private project **records**, reusing `beta_projects`; no duplicate project registry and no claim a Git repository was created.
- Configure source HTTPS address, branch, build command and output directory. Saving stores a numbered immutable revision with backend timestamp. Source addresses and commands are non-sensitive declarations, never executed or fetched.
- Versioned configuration history, automatic metadata audit, caller-RLS reads, owner/verified-email/aal2 write checks in both server functions and database RPCs. A project row lock serializes saves; stale expected revisions are refused rather than overwritten.
- Missing Git/review/build/database/staging services have explicit unavailable states and remediation. Import, merge, build/cancel, project migration, stage/rollback controls are disabled. No invented logs, artifacts, deployment dates, Git URLs or success results.
- Applied additive migrations `0075_evolution_project_configuration`, `0076_evolution_configuration_audit_alignment`, `0077_evolution_configuration_privilege_hardening`. The second aligns audit with the existing database trigger; the third removes inherited anonymous/direct-write privileges. No existing migration bytes or history were edited.
- Historical pending Claude/native migration draft numbers are **not installation numbers**. The migration tool must assign their next free numbers when separately approved; those drafts remain uninstalled and unchanged.

## Enabled actions and their boundaries

| Action                                     | Real operation                                 | Evidence / limits                                                              |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Refresh records                            | Owner-authenticated project/configuration read | Backend checked-at timestamp; failures show no cached success                  |
| Create project                             | Atomic insert through owner-checked RPC        | Returned project ID; existing automatic project audit                          |
| Save configuration                         | Append revision through owner-checked RPC      | Returned revision/time; old revisions immutable; concurrent stale save refused |
| Project selector                           | Chooses an already returned private project    | No network side effect or authorization                                        |
| Account Security / OMNI / approvals / keys | Existing compatible routes                     | Existing independent permissions, Stop, passkeys and caps unchanged            |

Read limits are explicit: 100 recent projects and 1,000 recent configuration revisions. These are displayed-record limits, not operational repository counts. No environment secret values or Git credentials can be entered in the configuration form.

## First milestone: blocked, not completed

| Gate                                           | Current result                     | Required next dependency                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authorized test repository                     | Not selected                       | Owner supplies the exact disposable repository and confirms import scope; no existing repository was migrated                                                                                    |
| Independent private Git hosting                | Not connected                      | Owner-reviewed maintained Forgejo/Gitea instance or equivalent, private durable volume, TLS, scoped credentials, backups/restore, protected branches                                             |
| Import refs/tags/history                       | Not implemented as hosted workflow | Import adapter with explicit source authorization; compare all refs and reachable objects, fsck, LFS inventory/object availability and submodule review; archive unsupported metadata separately |
| Authenticated clone/push independent of GitHub | Unverified                         | Git host and test account; branch protection/denial tests and a recorded disposable push; optional mirror must be one-way, separately authorized, loop-safe, never force overwrite               |
| Project configuration                          | Implemented, database-tested       | Owner two-step sign-in required for positive hosted UI save/readback                                                                                                                             |
| Review/merge                                   | Not connected                      | Protected-branch review API with revision-bound approval; no merge authorized in this request                                                                                                    |
| Build/logs/artifacts/failure/cancel            | Locked pending sandbox             | Isolated external runner with durable job/events/artifact storage, request idempotency, owner admission, Stop/lease enforcement and descendant cancellation proof                                |
| Staging/rollback                               | Not connected                      | Owner-reviewed isolated staging target, artifact digest, immutable release history, previous release and rollback receipt; no production authority                                               |
| Versioned project database migrations/recovery | Not connected                      | Owner-selected project database and backup store; checksum-bound migrations, backup receipt, dry-run where supported, disposable restore/recovery proof                                          |

The app's serverless runtime cannot run a Git daemon, keep durable bare repositories, spawn build processes or operate a deployment host. Browser storage and the app filesystem are **not substitutes**. Existing Jackboy/OMNI executor credentials authorize only their existing contracts; they do not authorize a new infrastructure service.

## Cheapest next increments

1. Owner reviews this increment and names one disposable repository. Complete two-step sign-in and verify create → configure → reload → second revision. No paid model call is needed.
2. Select an existing authorized machine, if available, for a maintained free/open-source private Git service with durable storage; review hosting/storage/backup costs before provisioning. Do not purchase or deploy automatically. Record the actual host API/version and narrow credentials before writing adapters.
3. Implement only that host's private repository import/read API first. Prove refs, tags, history, object integrity, clone/push and protection using the disposable repository; no source-of-truth cutover or GitHub mirror until separately reviewed.
4. Complete sandbox isolation/Stop/cancellation acceptance and owner release review. Then connect one runner, show actual bounded/redacted log events and artifacts, and prove failure/cancel. Preserve $0.50/call, $1/job, $5/day, one active job; configuration never overrides those caps.
5. Add one staging target with digest-pinned artifacts and rollback to a verified previous release; retain explicit review and production lock. Add migration recovery only after a disposable project database/backup target is approved.

## Tests and honesty

Final results: **1,515 application tests passed, 23 skipped (116 passing files, 3 skipped)**; **34 real disposable PostgreSQL checks passed**, including a concurrent stale-save conflict; **3 completion-register tests passed**. Changed-file lint: 0 errors, 1 existing navigation fast-refresh warning. Latest harness compilation: build OK. Hosted read-only grant inspection confirms anonymous SELECT/execute denied, authenticated direct INSERT/UPDATE/DELETE denied, authenticated SELECT and owner-checked create RPC available.

- Focused application tests cover configuration validation, no credential-bearing URLs/commands, no traversal, no production flags, blocked execution/import/merge/deployment/migrations, owner refusal, expected revision and backend receipt/error handling.
- Disposable real PostgreSQL exercises owner/MFA isolation, immutable history, automatic audit, explicit grant hardening, revocation and a real concurrent stale-save conflict. No hosted test repository or project data was created.
- Signed in as the requesting owner without elevating assurance: all six new pages show the two-step sign-in remediation and hide write forms; desktop/mobile tested with no page errors or horizontal overflow. This is **denial-path evidence**, not positive owner configuration verification.
- End-to-end import → clone/push → build → stage → rollback remains blocked by the services and owner inputs above. Nothing published, merged, activated, executed, purchased or imported.
