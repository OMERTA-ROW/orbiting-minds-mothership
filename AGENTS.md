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
- Prototype data stays separate from owned records; no live claims. SEO defaults to noindex; only approved leaves opt in.
- Visual primitives live in `src/components/evo.tsx`; nav groups/status badges in `src/components/nav-groups.ts`, every page reachable via a group or Advanced, why: consistent design without hiding features.
- Cosmic art uses deterministic/static motion and accessible tokenized controls; homepage overlays share one image frame, why: alignment.
- Pathways use internal streaming routes and request-local AI; secrets server-only, why: drafting is not execution.
- Persist AI denial/credit blocks service-only; clear after owner confirmation, why: prevent billed retries across reloads/restarts.
- Command search uses typed data and validated parameters/anchors, why: exact results preserve interactions.
- Exchange uses pure validated local records and separate copy localization, why: no multiuser, repository-provenance or code-translation claims.
- Genesis uses pure transitions and a versioned local store; SDK APIs remain disabled references, why: local identities/visibility labels cannot enforce multiuser security.
- Open Call adds optional passport declarations and contribution defaults to Genesis; exports only pending/revoked states, why: preserve old records without implying verification.
- Twins use synthetic numeric models only, never submitted code/shell/hardware, why: demos are not sandbox or hardware validation.

- Event-load SDK validators; keep schemas SSR-safe: no CommonJS evaluation/JSON transmission.

- CARE uses a separate validated local store, pure consent transitions, fictional inventory, historical releases and additive defaults, why: preserve records without claiming native capabilities or account security.
- CARE/native references never invoke OS/capture/updater/shell APIs, why: signed software and grants must precede execution.

- CARE rehearsals record channel context in editable local audit, not jobs/receipts, why: no native or trusted audit claims.
- Guardian/Fleet use separate validated local DEMO consent/expiry/revocation; devices start unpaired and scope-less, why: no trusted ownership or CARE/Genesis effects.
- Guardian reviews use proposed-only samples, why: no model, scan, source execution or text-based privilege.
- Guardian pause invalidates local Fleet grants/plans and pauses CARE separately; report failures without remote receipts, why: no secure readiness/containment claim.
- Robotics uses central scenarios, bounded arithmetic and separate local records, never code/ROS/hardware execution, why: no physics, diagnosis or safety proof.
- Scenario handoffs only prefill drafts; Guardian stays proposed-only, why: no authority transfer.
- Debrief/Archives/Accountability share additive local consent/revisions and replay/release references, why: pattern checks prove no fault or provenance.
- Trusted Release uses separate validated local records, Web Crypto sample digests and consent rehearsals; hardware/deployment blocked, why: hashes/signoffs are not signatures, trusted audit or safety proof.
- Vault reuses Trust records, owner confirmation, exact comparisons and event-loaded parsers; Lounge uses Genesis consent, why: no signing/enrollment claims.
- Nexus keeps separate consented local records and isolated base-version drafts; corrected example labels overlay stored data, why: preserve work without secure chat or execution claims.
- Public OMNI stays DEMO; private text agent requires verified email/member/AI approval, owned context and saved-text consent; conditional claims, durable provider guard and request-bound stop/revocation polling forbid replay/tools/daemon. Readiness proves no inference or native access.
- Entertainment/Cartoon use separate validated local stores, revision-bound reviews and fresh Guardian/Nexus pause checks, why: samples, timing and preparation exports confer no processing, rights clearance or publication.
- Subdirectories have their own `AGENTS.md` to read before changing files there; CLI-specific rules live in `cli/AGENTS.md` to keep this shared instruction file bounded.
- Beta tables isolate owners with composite project ownership, trigger audit and service-managed default-deny AI access; one root auth subscriber and cache-clearing logout, why: demos/declarations cannot authorize.
- Account recovery presentation is user-bound and validated by the one root subscriber; updates revalidate identity and Cloud authorizes them, why: URL/storage hints alone cannot establish a recovery session and stale async identity must not survive logout.
- completion-register.json is the canonical ordered item/evidence register; roadmap.md is its crosswalk/backlog, why: demos, verified code and released scope stay separate and traceable.
- Launch Control is dated QA; PATH discovery and cost math never imply approvals/uploads/charges.
- Quantum/Forge use approved private owner-project media, bounded PCM with bundled WaveFile, inert web drafts and immutable digest-reviewed versions; OMNI gets text only, why: consistent SSR exports; plans confer no file/publish authority.
- Creator/Distro use immutable owner-project drafts, digests and row-locked access/review/revoke; post-edit prefills require downloaded WAV QA, why: manual ZIPs never imply hosting, receipts, schedules or recall.
- OMNI private operations use strict proposals and owner-scoped row-locked social draft/review/stop records with explicit grant revokes and typed non-null consent; no provider endpoints, why: declarations confer no posting, CI, scopes or release authority.
- Daily knowledge uses one cron-authenticated public route, supported request-bound waitUntil, bounded attempts, token-owned lease and durable pre-provider guard with checked singleton outcomes; approved readers and owner-confirmed recovery only, why: failed pause/result writes must not replay paid/denied requests; acceptance is not delivery or retraining.
- Racing Arena is deterministic seeded simulation with browser-local points; real-money betting stays a disabled constant, why: no value, wagering or licensing claims.
- Omni Legal uses session-only synthetic drafts/manual PDFs, confirmed-jurisdiction web library labels, dated official references and event-loaded PDF/ZIP exports; public blanks use fixed IDs, bounded no-redirect fetch and reviewed hashes; CLI stays metadata-only. Real cases/transmission/device sync disabled, why: web classification and references prove neither private access, court applicability nor OS scope.
- Autonomous tasks block without an executor; Sabrina/Angel Tech local records require owner/human/invitation approval, why: local flags grant no security, credentials or outreach.
- Reuse RasulChat/All-Seeing Eye; specialist IDs and Guardian deny remain. Private Razul uses NULL-safe verified-owner/aal2 SQL, caller RLS, no-store and metadata audit; bounded source receipts evidence freshness, not leases. No duplicate hub or inspection-triggered jobs, why: declarations confer no authority.
- OMNI API keys are owner-only MFA-gated RPCs with SHA-256 hash-only storage and show-once secrets generated in the server function; `omni_api_key_verify` is service-role-only for the `/api/public/omni/*` metadata endpoints, why: plaintext secrets never persist and key use stays scoped, expiring and auditable.
- OMNI presentation is scoped in the root shell with shared workspace navigation; local-record hooks preserve unreadable/concurrently changed originals and report unsaved edits, why: simplification must not remove features or silently overwrite data.
- The Jackboy link client uses platform `fetch` with public-certificate validation, refused redirects, bounded replies/timeouts and public-HTTPS-origin checks; no custom CA or insecure TLS option, why: this hosting cannot load CA files and verification must never be disabled.
- Activation Approvals are ordered owner records written only through a fresh-TOTP (≤15 min) owner RPC with cascade reset and audit; they never actuate switches, secrets, deploys, self-tests or paid calls, why: a recorded approval is evidence, not execution.
- OMNI Terminal (`/omni-terminal`) is owner/aal2-only; its Emergency Stop fails closed (missing/unreadable = engaged) and gates every outbound or granting Jackboy function, releasing needs fresh TOTP; tasks are `held` only and autonomy/CODE stay off while no executor exists, why: status and records must never imply execution.
- OMNI Docking Bay (`/omni-dock`, `docs/OMNI-DOCK-PROTOCOL.md`) docks branches with owner-issued single-use hashed codes and device ECDSA P-256 keys; device calls are path-bound signed, nonce/clock-checked and use service-only RPCs; per-device mobile autonomy has no stored state and is refused, why: pairing grants status, held proposals and stop-engage only, never execution.
- OMNI Agent Workspace (on `/omni-terminal`) relays chat/commands only via the signed `omni.workspace/v1` link, after owner+aal2, single-use WebAuthn passkey checks, kill switch, Emergency Stop and a passed self-test (<24 h); server-side spend caps, append-only audit/ledger and gated actions always need the owner, why: the browser never holds secrets and readiness must precede execution.
- Held OMNI Terminal tasks reach Jackboy only via the owner-triggered signed `jackboy.omni-handoff/v1` call (mirrors Jackboy's contract exactly; owner-entered Jackboy project id; fresh TOTP, Stop released, server-verified signed replies recorded service-only); Mothership never dispatches to OMNI or approves Jackboy jobs, and docked devices only read their own statuses, why: Jackboy stays the passkey/spend gatekeeper.
- Two-step sign-in is optional provider TOTP for all accounts: on only after a confirmed code; code replacement/turn-off need aal2 + code ≤15 min (server and DB); recovery needs verified email, ≤10-min sign-in and a single-use hashed code, then the server removes TOTP factors and ends other sessions; no-code accounts need admin removal, why: a session alone must never reset or bypass MFA.
- `/invite` is public and passes a validated token to `/auth` via sessionStorage; acceptance stays server-checked, why: the protected gate drops the URL.
- OMNI agent memory is owner/aal2-only, one agent per RPC call, no direct table reads, metadata-only append-only audit; no agent or Railway reads it, why: no cross-agent leakage or external-memory claims.
