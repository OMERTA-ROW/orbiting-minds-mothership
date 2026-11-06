# Orbiting Minds Mothership

Create a NEW Lovable project named EVOLUTION MOTHERSHIP. This instruction is based on the owner's actual Notion blueprint: https://app.notion.com/p/3ffc11610306814c9780f7f661b13eac?pvs=204 . The requirements are reproduced here so the builder does not need to access Notion. Build the functioning visual prototype, not just a plan, and do not publish/deploy publicly without further owner approval.

PRODUCT: EVOLUTION is an opt-in universal technology collaboration network, joining developers, consenting AI agents, software, research, inventions, and future technology under a modular Mothership. Slogan: "Bridge technology into its next evolution." It is not a general social network and cannot remotely control unauthorized systems. Make a complete visually connected prototype now, leaving live integrations as future implementation.

VISUAL DIRECTION: Luxury futuristic cinematic BLACK AND METALLIC GOLD (#07090D, #11151C, #D4AF37, #F6D879, #F3F0E8). Real depth, elegant glasslike panels, subtle gold glow, connected orbital lines, animated constellations, distinctive Mothership command center. Premium typography, beautiful responsive layout, accessible high contrast/reduced motion. Avoid generic dashboard aesthetics. Refined nav, sophisticated hero, functional interactions.

PAGES/NAV: Home, Mothership, Evolution Universe, Platform, Knowledge Fusion, Guardian, Agent Network, Sandbox Lab, Join, Roadmap, Partnerships, Demo Dashboard. Provide routed navigation and responsive mobile experience. Home hero: eyebrow "THE FUTURE IS CONNECTED", huge EVOLUTION headline, subheading "Bridge technology into its next evolution." CTAs "Explore the Mothership" and "Join the Network". Near hero a striking central orbital graphic with interactive module nodes and details.

KEY WORKING PROTOTYPE EXPERIENCES:
(1) Interactive EVOLUTION UNIVERSE: black/gold navigable network visual where sample technology projects/agents/research domains appear as nodes/worlds with connections; filters Software, AI Agents, Science, Devices, Space; click nodes for source-aware project panel and capabilities. Search, keyboard accessibility.
(2) Mothership architecture explorer: click module nodes Cloud, CLI, App, Universal Update Network, Knowledge Fusion Engine, Guardian, Cyberace/Ace partner, Agent Embassy, Invention Engine, Planetary Research, Evolution DNA, Time Machine, Immune System, Contribution Economy, Global Brain to open purpose/capability descriptions.
(3) Demo project journey using seeded mock data: choose a sample project -> Evolution DNA compatibility profile -> Global Brain research connection -> Invention Engine proposal -> Sandbox/Time Machine simulation -> Guardian checks -> explicit opt-in approval/rollback proposal. Mark ALL data and results DEMO / SIMULATED; no claims real integrations.
(4) Guardian dashboard showing reversible protection and owner permissions via mock alerts.
(5) developer terminal visual with proposed commands: evolution init; evolution login; evolution connect github; evolution scan; evolution suggest; evolution sandbox; evolution status; evolution update --dry-run; mark coming soon, not live. Build a slick copyable CLI preview if possible.
(6) Discovery feed with voluntarily shared mock idea proposals and attribution; participation modes public, invite-only and private as concepts.
(7) Demo dashboard: projects, agents, proposals, experiments, version/upgrade status, health and readiness indicators, all labeled simulated.
(8) Join form that actually responds with useful on-page validation and local demo success; don't misrepresent a real waitlist database unless implemented. No real outbound sends.
(9) Roadmap clear phase 1 visual prototype, phase 2 developer GitHub consented integration, phase 3 signed verified update workflow, phase 4 partner ecosystems. Use future status labels for proposed capabilities.

ARCHITECTURE FOR LATER: modular auth/roles, organizations, projects, agents, integrations, permission_grants, repositories, findings, proposals, experiments, update_packages, deployments, audit_events, contributions, subscriptions. All owner-scoped. Never expose secrets. Do not provision production automation or real billing for a demo.

SECURITY RULES: no unauthorized device access/hacking, no destructive control of external AI, no hacking back. Signed updates, sandbox evaluation, manual approval and rollback concept. NASA/SpaceX/Starlink/CERN are research reference areas only, not actual partnerships. Cyberace/Ace optional future integration.

DELIVERABLE: Implement the polished TypeScript + Tailwind + shadcn/ui site, working menus/routes/filters/interactive demo UI, with no placeholder dead buttons. Ensure no build errors. Give user editor/preview access. This is an owner-reviewed *prototype*, do not publish to production.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://orbiting-minds-mothership.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f02f1b04-6f4d-4d33-bd52-d2d44971db21).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Railway startup

Use `bun run build:railway` and then `bun run start`; the default Lovable build
is a Cloudflare Worker, not a Node listener. See [Railway startup](docs/RAILWAY.md)
for host/port requirements, test evidence and live-verification blockers, and
[the environment audit](docs/ENVIRONMENT-AUDIT.md) for tracked `.env` findings.
