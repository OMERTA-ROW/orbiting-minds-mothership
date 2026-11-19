# Founder-only OMNI Orb ↔ Mothership integration

Status: implementation plan only. No runtime connection, provider access, terminal execution, deployment, or public rollout is activated by this document.

## Existing projects
- Lovable OMNI Orb Interface: `8325455a-c043-4a06-9a74-470a2511f91f` (unpublished).
- Lovable Orbiting Minds Mothership: `f02f1b04-6f4d-4d33-bd52-d2d44971db21` (published; preserve current owner protections).
- Integrate these existing projects; do not create a replacement app.

## Founder scope
Only the existing founder identity may access OMNI chat, voice, agent selection, tasks, CODE, terminal, approvals, and files. Do not enable public registration, other users, subscription onboarding, or new public permissions. Authentication and authorization must be checked server-side for every operation, including proxy functions. Never expose a shared Mothership API token to the browser.

## Current gap
OMNI frontend has a server-side bridge with `MOTHERSHIP_API_URL` and `MOTHERSHIP_API_TOKEN` configuration, but a verified Mothership connection is not established. The frontend currently lacks a founder login gate and keeps chat history locally. Do not set a privileged token until the gate is tested. The expected `/api/omni/*` contract must be verified/implemented on the Mothership side before claiming connectivity.

## Implementation PR sequence
1. **OMNI founder authentication:** sign-in gate, founder authorization on every bridge function, negative authorization tests. Do not enable public signup.
2. **Mothership scoped API:** implement/version health, manifest, chat, task status, approvals and stop routes behind dedicated revocable token and founder authorization; never accept client-selected privileges. Enforce budget caps, stop, and approval gates on server.
3. **Connected chat and agent switcher:** verify real agent/model IDs from manifest; persistent task and conversation IDs; fail closed when disconnected. Voice input/output and orb animation remain optional UI layers, not evidence of agent completion.
4. **CODE and terminal:** first use authenticated deep links/read-only results; command execution only through approved isolated runner, auditable permits, explicit owner approval for sensitive actions. GitHub PR creation is allowed when authorized; merges/deployments remain owner-approved.
5. **Mobile:** responsive UI, optional installable web app, verified authenticated session and stop control; native app distribution later.

## Owner setup and acceptance
1. Open the OMNI project in Lovable; confirm unpublished status and inspect its Setup/Connection page.
2. Add and test founder authentication before configuring bridge secrets.
3. In the Mothership backend, provision the dedicated OMNI API contract and revocable least-privilege token. Verify endpoint URLs and scopes in staging.
4. In OMNI Lovable project settings, configure `MOTHERSHIP_API_URL` and `MOTHERSHIP_API_TOKEN` as server-side secrets only; never paste the token into chat or browser code.
5. Check authenticated health/manifest, then send one message to a real agent and verify reply provenance and task ID.
6. From phone, switch to CODE, prepare a test PR, review its audit trail, and verify approval, emergency stop, and disconnected states.
7. Deploy/publish only after founder review and staging tests.

## Visual direction
Keep the current OMNI orb and navigation as the baseline. Explore a second concept: **Liquid Gold Singularity**—a floating obsidian sphere with flowing metallic-gold ribbons, a luminous inner core that pulses with speech, subtle silver agent-specific accents, and a compact agent carousel. Respect reduced-motion and performance settings. No redesign of Mothership globe is required.

## Future backlog, not part of activation
Owner-authorized app generation, app-store packaging/distribution, media editing, and scheduled publishing. Each requires its own permission and provider integration review.

## Acceptance tests
- Anonymous/non-founder calls to all privileged OMNI bridge functions fail.
- Missing/invalid token fails closed; no mock response labeled live.
- Agent switch preserves conversation/task identity and labels the responding agent.
- Task execution is traceable to a real runner; stop and spending limits are enforced server-side.
- No public accounts, unexpected publishing, or deployment introduced.
