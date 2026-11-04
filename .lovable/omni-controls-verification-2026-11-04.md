# OMNI simplification and button verification

## Scope
Presentation and browser-local reliability only. Existing features/routes/data retained. No secret, schema, role, audience, schedule, external-service or publication changes. Real signed-in session used for read-only readiness/denial checks; no owner privileges inferred.

## Defects and fixes
- Rights open overwrote malformed saved records with `[]`; reproduced, now preserves original and warns.
- Specimen/file intake rejected asynchronously without feedback; reproduced Web Crypto failure, now visible failure and existing records unchanged.
- Specialist mobile action row exceeded 390px width; reproduced and now wraps without overflow.
- API secret Copy lacked rejection/success handling; controlled component tests cover both, retaining show-once value on failure.
- Autonomy readiness retained stale errors and accepted repeat pending submissions; failing tests now pass with busy/error/reset guards.
- Browser saves in gateway/agents/models/marketing/intake/Sabrina/archive lacked failure handling; shared hook preserves old/concurrently changed copies and labels unsaved edits.
- Export buttons and saved-run refresh/cancel lacked explicit confirmation; now announce prepared download/readback or failure.
- Local archive grant controls before enrollment were silent; now explain prerequisite.
- Global sign-out could reject outside its error handling; now catches failures and blocks double-clicks.
- Dashboard tabs already worked with mouse; moved to existing accessible tab control. Homepage links and Mothership module selectors tested, no defect found.

## Verification
- `bunx vitest run`: **1,259 tests / 86 files PASS** on the final rerun, including 12 control-regression tests.
- `bunx vitest run src/test/omni-controls.test.tsx ...`: initial five failures reproduced; seven after-fix tests passed, related focused suite 123 passed / 9 files.
- Playwright scripts in `/tmp/browser/omni-review/`: baseline/reproduce/flows/remaining/private_checks/bridge_final. Synthetic browser contexts only for local edits; session restoration origin-scoped, no tokens printed or screenshotted.
- 53 main OMNI actions and 62 additional Sabrina/archive/legal/home/Mothership/menu actions completed; supplemental bridge proposal → review → export → withdrawal and adapter export passed. Local changes read back after reload.
- 14 routes × desktop 1280/mobile 390: no horizontal overflow. Mobile top screenshot inspected; zero page errors.
- Existing signed-in account: private readiness and autonomy return blocked feedback; API owner form absent, All-Seeing Eye denies configured-owner access. Positive MFA-owner provisioning/settings, inference, cancellation and companion execution not claimed.

## Changed areas
`src/styles.css`, root shell, OMNI/observatory/dashboard routes; `src/components/omnibridge/{OmniAreaHeader,RasulChat,OmniAssistant,OmniAutonomy,OmniApiKeys,OmniRights,OmniGateway,OmniAgentRegistry,OmniModelGateway,OmniMarketing,OmniIntake,AngelTechWorkspace,SabrinaDirector,RazulArchive,OmniLegal,OmniLegalForms,OmniAgentHistory,CapabilityGraph,IntentPlanner,AdapterReference}`; `src/components/razul/{AllSeeingEye,LiveObservatory}`, AccountButton and private OMNI feedback; shared local-record/download hooks; regression tests; roadmap and architecture notes. Existing CLI instructions moved verbatim from oversized root AGENTS into `cli/AGENTS.md`; no CLI code changed.

## Owner actions
Configured verified owner + strong MFA for key/settings acceptance. Approved AI membership/context/consent for real agent requests. Separate authenticated Honeycomb companion and Jackboy isolated runner/enrolled project for device/coding work. No secrets requested or altered; no publishing.