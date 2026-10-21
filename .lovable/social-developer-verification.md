# Social Autopilot + developer connector preparation — 21 October 2026

## Actually built
- Existing authenticated Beta → OMNI operations: Social Autopilot and Platform connectors tabs.
- Owner/project-isolated private text drafts: explicit storage rights/privacy consent, exact revision human review, edit-invalidated review, withdraw single/all plans, reload readback and trigger-generated private history.
- UTC intention calendar and text preview only. Dates are explicitly UTC input and never schedule a job; a non-UTC browser check confirms no implicit local conversion.
- Declarative safe JSON exports with no provider credential, connected account, job, receipt, public URL or automatic rules.
- Social/developer API requirements catalog with official documentation and disconnected/not-supported app states. Exact repository/project proposal exports contain no fetched context, branch, PR, CI or deployment.
- Direct table writes explicitly revoked including inherited defaults; authenticated RPC checks owner/project, row locks, exact revision, typed non-null consent and strict fields. Pause denies save/review; stop remains available.

## Verified
- 854 tests across 47 app test files pass, including 26 social/developer rule tests.
- 38 retained authenticated checks pass (`src/test/test_omni_social_workflow.py --run`): real temporary sign-in, project creation, draft save/readback/reload, whitespace trimming, review, changed revision, export, stop-all/single stop, developer proposal, logout; browser UTC behavior, desktop/mobile layout, zero runtime errors/API calls; real hosted cross-account, anonymous, stale/null/forged-action and direct-write restrictions, including null review on an otherwise valid draft.
- Existing 23 hosted project/agent isolation checks repeated successfully.
- Focused lint and current preview build pass. Every content route has head metadata, including index; managed auth layout is not a content page.
- Two adversarial issues were reproduced and corrected: inherited direct-write grants and SQL NULL approval/action behavior. The same retained requests pass after additive permission/function migrations.
- Temporary QA users, projects, plans and audit rows removed. Browser evidence under `/tmp/browser/omni-social/`; no private credentials or customer content in screenshots.

## Blocked, not a live integration
Per-user LinkedIn/GitHub/GitLab/Notion clients are absent; accessible workspace integrations are not substituted for app-user consent. No social posting or authorized developer workflow was completed. A workspace admin must configure/link the selected offline-enabled App User Connector client before encrypted per-user storage and consent/disconnect/expiry can be implemented and tested. Provider OAuth callback: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback` (not the app domain). Founder must select an eligible account/content and exact authorized repository/scope. No client or account was connected.

Media formatting and provider render previews, quotas, durable schedule/autopilot, retries/idempotency, reconnect alerts and confirmed receipt/post URLs are not implemented. Production deployment, billing, secrets, permissions and deletion always need privileged human approval. Rights declarations are not independent clearance; pattern rejection is not comprehensive privacy detection.

No deployment, domain/public-status change, external posting, paid provider call or access/change to CyberLink Social. Hosting was already public before this work; new screens remain behind app authentication, and launch evidence stays UNVERIFIED.