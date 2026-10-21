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
- Cosmic art/stars use light deterministic motion and static mobile/reduced-motion fallbacks, why: no GPU-heavy scenes or SSR randomness.
- Orbital controls use fixed buttons/mobile lists and semantic tokens, why: accessible cosmic styling.
- Creator pathways stream structured output through an internal server route and request-local AI helpers; keep secrets server-only, why: cancellable drafting is not execution.
- AI access-denial and credit blocks are persisted in a service-only circuit-breaker table; clear a block only after an owner confirms restored access, why: prevent automatic billed retries across reloads and server restarts.
- Command search uses a pure typed evolution-data index and validated search parameters or stable anchors, why: exact results without changing local interactions.
- Code Exchange uses pure helpers and validated local storage shared with Commons/Pulse, why: useful reviews without impersonating secure multiuser persistence.
- Localize Exchange copy independently of code; documentation never implies repository provenance, why: translation must not rewrite code or invent permissions.
- Genesis uses pure transitions and a versioned local store; SDK APIs remain disabled references, why: local identities/visibility labels cannot enforce multiuser security.
- Open Call adds optional passport declarations and contribution defaults to Genesis; exports only pending/revoked states, why: preserve old records without implying verification.
- Digital Twin results run only a deterministic synthetic numeric model; arbitrary submitted code, shell commands and hardware connectors never execute, why: distinguish useful simulations from real sandbox or hardware validation.

- SDK validators load in browser events; schema stays SSR-safe, why: no server CommonJS evaluation or JSON transmission.

- CARE uses a separate validated local store, pure consent transitions, fictional inventory, historical releases and additive defaults, why: preserve records without claiming native capabilities or account security.
- CARE/Updates/Pilot/Voice/native references never call OS/capture/audio/updater/shell APIs; real capabilities need signed software, grants and review.

- CARE plans/check rehearsals capture channel context in editable local audit records, not jobs or trusted receipts, why: truthful provenance without claiming native or secure audit capabilities.
- Guardian and Fleet use a separate validated browser-local demo store with pure expiry/consent/revocation transitions; every device starts unpaired and scope-less, why: rehearse device-bound gates without impersonating authenticated ownership or affecting CARE/Genesis records.
- Guardian reviews use fixed proposed-only references and current local samples, not models or source execution, why: no billed retries, fabricated scans or instruction-based privilege.
- Guardian emergency pause invalidates local fleet pairing/scopes/plans and separately pauses CARE preferences, reporting failures without remote receipts; release gates remain unverified, why: local state cannot establish secure platform readiness or confirmed endpoint containment.
- Robotics uses central demo scenarios, bounded arithmetic and a separate validated local store, never referenced-code/ROS/hardware execution, why: reproduce research without implying physics, diagnosis or safety certification.
- Scenario handoffs prefill Founder/Oracle/Challenges/Releases without automatic requests; Guardian is proposed-only, why: handoffs confer no authority.
- Debrief/Archives/Accountability share additive local records, consent gates, revisions and validated release/replay references; checks are patterns only, why: preserve work without claiming confidential audit, verified fault or execution provenance.
- Trusted Release uses a separate validated browser-local store, Web Crypto sample-text digests and consent-bound rehearsals; hardware/deployment stay blocked, why: hashes and local signoffs are not signatures, authenticated audit or independent safety evidence.
- Vault reuses Trust records, owner confirmation, exact comparisons and event-loaded parsers; Lounge uses Genesis consent, why: no signing/enrollment claims.
- Nexus keeps separate consented local records and isolated base-version drafts; corrected example labels overlay stored data, why: preserve work without secure chat or execution claims.
- OmniBridge uses central inert registry data, pure keyword plans and a separate validated local store; recheck Guardian/Nexus pause at mutation, why: review is not connectivity, signing or execution.
- Entertainment uses central samples, a separate local store and revision-bound reviews; recheck Guardian/Nexus pause, why: checkpoints and numeric media checks confer no execution, rights clearance or publication.
