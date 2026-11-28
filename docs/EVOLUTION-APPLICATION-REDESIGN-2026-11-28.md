# Application-wide Evolution redesign — preview only

## Changes

- Shared root shell applies the approved console to every signed-in non-landing content route. Existing Home/Developer/Cloud wrappers are nesting-aware, so only one sidebar/header is rendered, including while protected page data loads.
- True-black neutral surfaces, metallic-gold controls and active navigation, white text; removed the OMNI silver theme exception. Menus and dialogs inherit private-app tokens even when portaled.
- Existing navigation groups remain available in the sidebar, with added Neuro/migration destinations. Public landing and signed-out public navigation remain unchanged.
- Compact shared page headers, sections, rounded dark tools, mobile wrapping, existing live CyberLink scene and reduced motion retained. OMNI Earth orb remains, with gold rather than blue/purple UI glow; natural planet textures/scene colors are unchanged.
- All 61 retired route leaves receive unique Evolution page metadata; they remain honest unavailable pages with browser-record downloads and existing alternatives.

## Route coverage

All signed-in existing content routes inherit the shell, not a copied page-specific replacement. Includes `/`, `/repositories`, `/cloud-services`, `/projects`, `/pull-requests`, `/actions`, `/deployments`, `/migrations`, `/settings`, `/neuro`, `/beta`, `/beta-omni`, `/quantum-studio`, `/knowledge-brief`, `/members`, `/account-security`, every `/omni-*` page, `/activation-approvals`, `/treasury`, guides and all retired legacy addresses including `/dashboard` and `/sandbox`. API endpoints are untouched.

## Verification

- Final full regression suite: **1,617 passed, 23 environment-specific skipped; 128 passing test files, 3 skipped**.
- Changed shared TSX lint: **0 errors**. Git whitespace check passed. Latest harness preview build: **build OK**.
- Signed-in desktop traversal reached 65 existing content pages without page errors or horizontal overflow before the long browser check was stopped. Focused recheck confirmed the Developer/Cloud/project/settings/API-key shell; this is visual/access-boundary evidence, not positive backend acceptance.
- Final mobile checks at 390×844: API keys, repositories, cloud services, projects, terminal, account security and OMNI chat each rendered exactly one console, no horizontal overflow, no page errors. Drawer-to-Projects navigation closed correctly. Reduced-motion live scene remained present.
- Desktop checks at 1440×1000 confirmed black/gold sidebar, OMNI/API-key/project/Developer layouts. Signed-out public landing retained its Mothership presentation and no console.
- No AI call, key creation, repository write, migration, infrastructure action, permission change or publication was performed.

## Limitations and remaining styling

The restored owner session lacks required two-step assurance: repository/cloud/API-key owner reads correctly refuse access. The 38 repositories, private forms after MFA and active execution were not positively reverified; no fabricated records replace them. Existing authorization and integration handlers are unchanged.

Public landing/auth/guide presentation when signed out is intentionally retained. Natural live-space textures and the functional OMNI Earth remain; dormant legacy CSS/components remain in source but are not used as the signed-in application shell. Specialized media/content layouts and safety status colors are retained rather than replacing their controls. No legacy silver/blue console palette remains on signed-in pages.

## Files and rollback

Core changes: `src/routes/__root.tsx`, `src/components/evolution/console/OwnerConsoleShell.tsx`, `src/components/omnibridge/OmniAreaHeader.tsx`, `src/styles.css`; metadata-only changes in the 61 retired route files; `roadmap.md` and this report. Backend, generated clients, space implementation and data untouched.

Baseline: `551d6ef`. The implementation commit is the commit containing this report. Rollback by restoring only these changed files from `551d6ef`, reviewing the diff and committing the restoration; do not reset history or data. Nothing was published or deployed.