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
- Persist AI denial/credit blocks service-only; clear after owner confirmation, why: prevent billed retries across reloads/restarts.
- Command search uses a pure typed evolution-data index and validated search parameters or stable anchors, why: exact results without changing local interactions.
- Exchange uses pure validated local records and separate copy localization, why: no multiuser, repository-provenance or code-translation claims.
- Genesis uses pure transitions and a versioned local store; SDK APIs remain disabled references, why: local identities/visibility labels cannot enforce multiuser security.
- Open Call adds optional passport declarations and contribution defaults to Genesis; exports only pending/revoked states, why: preserve old records without implying verification.
- Twins use synthetic numeric models only, never submitted code/shell/hardware, why: demos are not sandbox or hardware validation.

- SDK validators load in browser events; schema stays SSR-safe, why: no server CommonJS evaluation or JSON transmission.

- CARE uses a separate validated local store, pure consent transitions, fictional inventory, historical releases and additive defaults, why: preserve records without claiming native capabilities or account security.
- CARE/native references never invoke OS/capture/updater/shell APIs, why: signed software and grants must precede execution.

- CARE plans/check rehearsals capture channel context in editable local audit records, not jobs or trusted receipts, why: truthful provenance without claiming native or secure audit capabilities.
- Guardian and Fleet use a separate validated browser-local demo store with pure expiry/consent/revocation transitions; every device starts unpaired and scope-less, why: rehearse device-bound gates without impersonating authenticated ownership or affecting CARE/Genesis records.
- Guardian reviews use proposed-only samples, why: no model, scan, source execution or text-based privilege.
- Guardian pause invalidates local fleet grants/plans and pauses CARE separately, reporting failures without remote receipts, why: local state cannot establish secure readiness or endpoint containment.
- Robotics uses central demo scenarios, bounded arithmetic and a separate validated local store, never referenced-code/ROS/hardware execution, why: reproduce research without implying physics, diagnosis or safety certification.
- Scenario handoffs prefill Founder/Oracle/Challenges/Releases without automatic requests; Guardian is proposed-only, why: handoffs confer no authority.
- Debrief/Archives/Accountability share additive local records, consent gates, revisions and validated release/replay references; checks are patterns only, why: preserve work without claiming confidential audit, verified fault or execution provenance.
- Trusted Release uses a separate validated browser-local store, Web Crypto sample-text digests and consent-bound rehearsals; hardware/deployment stay blocked, why: hashes and local signoffs are not signatures, authenticated audit or independent safety evidence.
- Vault reuses Trust records, owner confirmation, exact comparisons and event-loaded parsers; Lounge uses Genesis consent, why: no signing/enrollment claims.
- Nexus keeps separate consented local records and isolated base-version drafts; corrected example labels overlay stored data, why: preserve work without secure chat or execution claims.
- Public OMNI stays local DEMO; beta OMNI streams request-local Responses with verified identity/approval/owned context and no history or tools, why: inference grants no execution authority.
- Entertainment/Cartoon use separate validated local stores, revision-bound reviews and fresh Guardian/Nexus pause checks, why: samples, timing and preparation exports confer no processing, rights clearance or publication.
- CLI remains offline source in `cli/`, never web-imported; access policy is inert/exportable, why: no billing/auth entitlement or signed distribution claims.
- Beta tables isolate owners with composite project ownership, trigger audit and service-managed default-deny AI access; one root auth subscriber and cache-clearing logout, why: demos/declarations cannot authorize.
- Launch Control uses dated evidence, not editable PASS toggles, why: QA records cannot grant launch approval.
