<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All prototype data lives in `src/data/evolution.ts` and must be labeled demo/simulated in the UI; future backend should be owner-scoped (orgs, projects, agents, permission_grants, proposals, audit_events…), why: owner wants a consent-first prototype with no claimed live integrations.
- Shared visual primitives live in `src/components/evo.tsx`; nav items in `src/components/SiteNav.tsx`, why: one place for the design language.
- Cosmic atmosphere uses a bundled hero artwork and deterministic SVG starfields; animate only lightweight decorative layers and keep reduced-motion/mobile static fallbacks, why: cinematic depth without a GPU-heavy scene or SSR-dependent randomness.
- Orbital module controls are stationary design-system buttons with a compact mobile list; shared inner-page surfaces and typography use global semantic tokens, why: preserve keyboard accessibility and consistent cosmic styling across existing flows.
