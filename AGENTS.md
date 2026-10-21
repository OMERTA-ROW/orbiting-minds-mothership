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
- Cosmic artwork and deterministic SVG stars use lightweight motion and static mobile/reduced-motion fallbacks, why: cinematic depth without GPU-heavy scenes or SSR randomness.
- Orbital controls use stationary design-system buttons and a mobile list; inner pages use semantic tokens, why: keyboard access and consistent cosmic styling.
- Creator pathways stream structured output through an internal server route and request-local AI helpers; keep secrets server-only, why: cancellable drafting is not execution.
- AI access-denial and credit blocks are persisted in a service-only circuit-breaker table; clear a block only after an owner confirms restored access, why: prevent automatic billed retries across reloads and server restarts.
- Command search uses a pure typed evolution-data index and validated search parameters or stable anchors, why: exact results without changing local interactions.
- Code Exchange uses pure helpers and validated local storage shared with Commons/Pulse, why: useful reviews without impersonating secure multiuser persistence.
- Localize Exchange copy independently of code; documentation never implies repository provenance, why: translation must not rewrite code or invent permissions.
- Genesis workflows use pure validated transitions and a separate versioned browser-local store; SDK contracts describe disabled future APIs and never act as endpoints, why: integrated rehearsal without pretending local identity or visibility labels enforce multiuser security.
- Open Call adds optional passport declarations and contribution defaults to Genesis; exports only pending/revoked states, why: preserve old records without implying verification.
- Digital Twin results run only a deterministic synthetic numeric model; arbitrary submitted code, shell commands and hardware connectors never execute, why: distinguish useful simulations from real sandbox or hardware validation.

- SDK JSON validation is loaded only from browser events; schema data remains SSR-safe, why: avoid evaluating the CommonJS validator in server rendering and never transmit user JSON.

- CARE uses a separate validated local store, pure consent transitions, fictional inventory, historical releases and additive defaults, why: preserve records without claiming native capabilities or account security.
- CARE, Updates, Pilot, Voice and native references are public demos with no OS/capture/audio/updater/shell calls, why: real capabilities require signed software, grants and review.

- CARE plans/check rehearsals capture channel context in editable local audit records, not jobs or trusted receipts, why: truthful provenance without claiming native or secure audit capabilities.
- Guardian and Fleet use a separate validated browser-local demo store with pure expiry/consent/revocation transitions; every device starts unpaired and scope-less, why: rehearse device-bound gates without impersonating authenticated ownership or affecting CARE/Genesis records.
- Guardian review roles use fixed proposed-only reference findings, not model calls or executable source analysis; reports read current local sample records and unknown real evidence, why: no billed retries, instruction-based privilege or fabricated detection/scan history.
- Guardian emergency pause invalidates local fleet pairing/scopes/plans and separately pauses CARE preferences, reporting failures without remote receipts; release gates remain unverified, why: local state cannot establish secure platform readiness or confirmed endpoint containment.
- Robotics uses central demo scenarios, bounded arithmetic and a separate validated local store, never referenced-code/ROS/hardware execution, why: reproduce research without implying physics, diagnosis or safety certification.
- Known scenario IDs prefill Founder, Oracle, Challenges and Releases without consent or automatic requests; Guardian uses a whitelisted proposed-only surface, why: handoffs cannot confer hardware or release authority.
- Debrief/Archives use a separate validated local store, consent-bound previews and inert media metadata; Guardian checks patterns only, why: preserve existing work without claiming verified incidents or confidential moderation.
- Trusted Release uses a separate validated browser-local store, Web Crypto sample-text digests and consent-bound rehearsals; hardware/deployment stay blocked, why: hashes and local signoffs are not signatures, authenticated audit or independent safety evidence.
- Code Vault reuses Trusted Release records with additive owner confirmation, byte-exact text/manifest comparison and event-loaded syntax parsers; Lounge previews use consented Genesis declarations, why: preserve old work without claiming trusted signing or external enrollment.
