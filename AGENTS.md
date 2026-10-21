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
- Creator pathways stream strict structured output through an internal TanStack server route and request-local server-only AI helpers; secrets and system instructions stay on the server, why: allow cancellable real AI drafting without claiming execution or live module integrations.
- AI access-denial and credit blocks are persisted in a service-only circuit-breaker table; clear a block only after an owner confirms restored access, why: prevent automatic billed retries across reloads and server restarts.
- Global command search uses a pure typed index sourced from evolution data and navigates to validated module/world/proposal search parameters or stable entity anchors, why: jump to the exact result while retaining existing local interactions.
- Code Exchange domain helpers are pure and browser-safe; demo collaboration is persisted only in a validated, versioned browser-local store shared by Exchange, Commons and Pulse, why: useful review flows and truthful local activity without impersonating secure multi-user persistence.
- Code Exchange interface copy uses keyed English/Spanish dictionaries independently of executable snippets; public documentation references never imply code provenance or a connected repository, why: support localization without silently rewriting code or inventing external permissions.
- Genesis workflows use pure validated transitions and a separate versioned browser-local store; SDK contracts describe disabled future APIs and never act as endpoints, why: integrated rehearsal without pretending local identity or visibility labels enforce multiuser security.
- Digital Twin results run only a deterministic synthetic numeric model; arbitrary submitted code, shell commands and hardware connectors never execute, why: distinguish useful simulations from real sandbox or hardware validation.

- SDK JSON validation is loaded only from browser events; schema data remains SSR-safe, why: avoid evaluating the CommonJS validator in server rendering and never transmit user JSON.

- CARE uses a separate validated versioned browser-local store and pure consent transitions; inventory is fictional and release references historical; additive fields have validated defaults to preserve prior local records, why: demonstrate safe workflows without conflating preferences with account security or native capabilities.
- CARE, Updates, Pilot, Voice and native-agent reference have public demo routes; no OS, capture, microphone, synthesis, updater or shell API is called, why: real capabilities require separately signed native software, per-action grants and security review.

- CARE scan plans and update-check rehearsals produce structured browser-local audit records, not executable jobs or tamper-evident receipts; channel context is captured on new plans, why: preserve truthful provenance without claiming a native agent or secure audit service.
