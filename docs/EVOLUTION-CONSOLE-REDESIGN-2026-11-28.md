# Evolution owner console redesign — 2026-11-28

## Scope and release state

Preview-only presentation work for the owner-approved Evolution / OMNI Block concept. No backend functions, database schema, RLS, grants, credentials, gateway headers, schedules, agent permissions, execution gates, deployment configuration or production hosting were changed. Nothing was published.

The public `/` landing page retains its existing presentation. Once the existing owner check succeeds, `/` presents the new owner Home. `/repositories` retains its route and real read-only Forgejo integration. `/cloud-services` is a new authenticated route using the existing owner/MFA control-center reader and cloud actions.

## Implemented interface

- Shared fixed widescreen sidebar and mobile navigation drawer, Evolution / OMNI Block identity, gold active state, owner security/Stop shortcuts, universal page search, honest notification state, service switcher and existing account menu.
- Home hero, four equal service destinations, real-data metric cards, System Status, Recent Activity and Quick Actions. Values come only from existing workspace, control-center and Forgejo reads; unavailable values say Not verified or Not connected.
- Developer Center dedicated navigation, workspace tabs, four real repository metrics, name/branch/privacy search, full gateway repository table, system status, real repository update activity, unavailable pull-request state, quick actions and the preserved manual upstream integrity audit/evidence download.
- Existing private project creation and immutable configuration revision controls remain available in the Developer Center's Project records & configuration disclosure.
- Cloud Services dedicated navigation, five honest resource metrics, real provider-connection table, add/check/remove controls using existing server functions, credential setup guidance, unconnected resource gauges, quick actions, deployment availability and saved infrastructure health.
- Existing routes remain the destinations for Projects/Website Center, OMNI agents, Network & Security, Billing and Settings. Unsupported developer/cloud sections are disabled and name their missing provider or evidence.
- New deep-space panel/sidebar/header tokens use the existing semantic gold/foreground system. The single pointer-inert CyberLink live scene and its motion policy are preserved.

## Changed files

- `src/components/evolution/console/OwnerConsoleShell.tsx`
- `src/components/evolution/console/OwnerHome.tsx`
- `src/components/evolution/console/CloudServices.tsx`
- `src/components/evolution/console/ConsolePrimitives.tsx`
- `src/components/evolution/console/console-utils.ts`
- `src/components/evolution/console/console-utils.test.ts`
- `src/components/evolution/ForgejoRepos.tsx`
- `src/components/evolution/Workspace.tsx`
- `src/components/CommandPalette.tsx`
- `src/components/nav-groups.ts`
- `src/routes/__root.tsx`
- `src/routes/_authenticated/repositories.tsx`
- `src/routes/_authenticated/cloud-services.tsx`
- `src/routeTree.gen.ts` (generated automatically)
- `src/styles.css`
- `src/test/app-routing.test.tsx`
- `src/test/test_completion_register.py`
- `completion-register.json`
- `roadmap.md`
- this report

No `src/lib/forgejo*`, `src/lib/evolution*.functions.ts`, migration, secret or infrastructure file changed.

## Verification evidence

- Focused regression: **88 passed / 5 files** (`console-utils`, app routing, Forgejo adapter/functions and Evolution functions).
- Full application regression: **1,617 passed, 23 skipped / 128 passed files, 3 skipped files**. Skips are the existing environment-specific sandbox/workspace suites.
- Changed-file lint: **0 errors**; one retained `react-refresh/only-export-components` warning for the pre-existing `shouldOpenPalette` export. `git diff --check` passed.
- Harness preview build: **build OK** after the final application edits.
- Signed-in Chromium at 1440×1000: Home, Developer Center and Cloud Services rendered; account control, search dialog/results, notification disclosure and project-configuration disclosure worked. No horizontal overflow or page errors. Normal Home had one existing live-scene canvas and the background computed `pointer-events: none`.
- Mobile Chromium at 390×844: navigation opened/closed, content had no horizontal overflow and no page errors.
- Reduced-motion context: `prefers-reduced-motion: reduce` matched; the existing background motion policy remained in control.
- Signed-out public landing: existing EVOLUTION hero, public navigation and Sign in action rendered unchanged.

## Not verified / limitations

The restored owner session did not have the required current two-step assurance. Forgejo correctly returned its owner/MFA refusal and the audit button remained disabled; the control-center reader also returned its existing refusal. Therefore this turn did **not** positively display the 38 real repositories or saved cloud records. No mock rows were inserted. The previously owner-reported 38-repository gateway result and all gateway behavior remain preserved, not independently re-proven by this UI check.

Resource utilization, instance inventory, deployment history, pull requests, issues, branches, commits, environments, packages, code search, wiki, storage, networking, backups, images, SSH keys and automation remain unavailable unless an existing authorized destination is named. No metric or activity is inferred from a saved connection.

## Next acceptance step and rollback

Open the preview as the owner, complete the existing fresh authenticator step, then review Home, `/repositories` and `/cloud-services`; run the manual integrity audit only when desired. No setup or permission bypass was added.

Rollback baseline before this work: `e642e8f`. Revert the interface commit with `git revert <interface-commit-sha>` after recording it; do not force-push or amend shared history.
