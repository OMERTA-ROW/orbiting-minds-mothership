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
- Keep prototype data in `src/data/evolution.ts`, label it demo and scope future backend records to owners, why: preserve consent without claiming live integrations.
- Shared visual primitives live in `src/components/evo.tsx`; nav items in `src/components/SiteNav.tsx`, why: consistent design.
- Cosmic atmosphere uses a bundled hero artwork and deterministic SVG starfields; animate only lightweight decorative layers and keep reduced-motion/mobile static fallbacks, why: cinematic depth without a GPU-heavy scene or SSR-dependent randomness.
- Orbital module controls are stationary design-system buttons with a compact mobile list; shared inner-page surfaces and typography use global semantic tokens, why: preserve keyboard accessibility and consistent cosmic styling across existing flows.
- Creator pathways stream structured output through an internal server route and request-local AI helpers; keep secrets server-only, why: cancellable drafting is not execution.
- AI access-denial and credit blocks are persisted in a service-only circuit-breaker table; clear a block only after an owner confirms restored access, why: prevent automatic billed retries across reloads and server restarts.
- Global command search uses a pure typed index sourced from evolution data and navigates to validated module/world/proposal search parameters or stable entity anchors, why: jump to the exact result while retaining existing local interactions.
- Code Exchange domain helpers are pure and browser-safe; demo collaboration is persisted only in a validated, versioned browser-local store shared by Exchange, Commons and Pulse, why: useful review flows and truthful local activity without impersonating secure multi-user persistence.
- Localize Exchange copy independently of code; documentation never implies repository provenance, why: translation must not rewrite code or invent permissions.
- Genesis workflows use pure validated transitions and a separate versioned browser-local store; SDK contracts describe disabled future APIs and never act as endpoints, why: integrated rehearsal without pretending local identity or visibility labels enforce multiuser security.
- Open Call uses the existing Genesis store with additive passport declarations and contribution defaults; exports derive pending/revoked states without a verification command, why: preserve old records and prevent local declarations from implying verified providers or account authorization.
- Digital Twin results run only a deterministic synthetic numeric model; arbitrary submitted code, shell commands and hardware connectors never execute, why: distinguish useful simulations from real sandbox or hardware validation.

- SDK JSON validation is loaded only from browser events; schema data remains SSR-safe, why: avoid evaluating the CommonJS validator in server rendering and never transmit user JSON.

- CARE uses a separate validated local store, pure consent transitions, fictional inventory, historical releases and additive defaults, why: preserve records without claiming native capabilities or account security.
- CARE, Updates, Pilot, Voice and native-agent reference have public demo routes; no OS, capture, microphone, synthesis, updater or shell API is called, why: real capabilities require separately signed native software, per-action grants and security review.

- CARE scan plans and update-check rehearsals produce structured browser-local audit records, not executable jobs or tamper-evident receipts; channel context is captured on new plans, why: preserve truthful provenance without claiming a native agent or secure audit service.
- Guardian and Fleet use a separate validated browser-local demo store with pure expiry/consent/revocation transitions; every device starts unpaired and scope-less, why: rehearse device-bound gates without impersonating authenticated ownership or affecting CARE/Genesis records.
- Guardian review roles use fixed proposed-only reference findings, not model calls or executable source analysis; reports read current local sample records and unknown real evidence, why: no billed retries, instruction-based privilege or fabricated detection/scan history.
- Guardian emergency pause invalidates local fleet pairing/scopes/plans and separately pauses CARE preferences, reporting failures without remote receipts; release gates remain unverified, why: local state cannot establish secure platform readiness or confirmed endpoint containment.
- Robotics uses central demo scenarios, bounded arithmetic and a separate validated local store, never referenced-code/ROS/hardware execution, why: reproduce research without implying physics, diagnosis or safety certification.
- Known scenario IDs prefill Founder, Oracle, Challenges and Releases without consent or automatic requests; Guardian uses a whitelisted proposed-only surface, why: handoffs cannot confer hardware or release authority.
