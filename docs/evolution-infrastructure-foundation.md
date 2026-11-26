# Evolution infrastructure foundation

Rename the user-facing Mothership product to Evolution. Preserve existing repository identifiers, routes, service contracts and OMNI/Jackboy integrations until compatibility is verified. Evolution is the owner-controlled development platform; OMNI orchestrates and Jackboy maintains software.

## Implementation
- Simplify navigation: Home, Repositories, Pull Requests, Actions, Migrations, Deployments, Settings. Provide a guided Create/Import Project flow with environment configuration and actionable next steps.
- Use a maintained self-hosted Git service with durable storage, private-by-default repositories, authenticated clone/push, branch protection and backups. Import authorized repositories with all branches/tags/history, LFS and submodule handling; separately migrate issues/PR metadata where supported. Verify refs and object integrity before owner-approved source-of-truth cutover. GitHub remains an optional mirror; prevent sync loops and destructive overwrites.
- Implement real backend APIs for project configuration, repository operations, reviews, isolated build runners, logs, artifacts, cancellation, deployment and rollback. Database migrations require versioned history, dry-run where supported, backups, explicit production approval and recovery plans.
- Replace decorative red/green indicators with actionable states, timestamps, errors and remediation. Every enabled button must invoke an authorized backend operation and display its verified outcome. Unconfigured features remain clearly unavailable.
- Preserve existing authentication, owner boundaries, scoped credentials, spending limits, emergency stop and audit trails. Never expose private repositories or secrets through public UI. No automatic production activation or deployment.

## Acceptance gates
1. Import one authorized test repository; compare refs, tags and history and verify clone/push from Evolution independently of GitHub.
2. Configure a project, create a branch and review/merge a change under branch protection.
3. Run a real isolated build, inspect logs and artifacts, test cancellation and failure handling.
4. Deploy to staging and demonstrate rollback; test database migration recovery and backup restoration.
5. Verify permissions, integration compatibility and every enabled UI action with end-to-end tests. Report missing infrastructure and blocked steps explicitly.

This document is an implementation specification, not evidence of working infrastructure. Do not mark capabilities operational until acceptance gates pass. Keep production unchanged pending owner review.
