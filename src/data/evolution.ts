// ALL DATA IN THIS FILE IS DEMO / SIMULATED. No real integrations exist.

export type ModuleStatus = "Prototype" | "Planned" | "Future" | "Concept";

export interface MothershipModule {
  id: string;
  name: string;
  short: string;
  purpose: string;
  capabilities: string[];
  status: ModuleStatus;
  ring: 0 | 1;
}

export const modules: MothershipModule[] = [
  { id: "cloud", name: "Cloud", short: "Owner-scoped hosting core", ring: 0, status: "Planned",
    purpose: "The secure, owner-scoped backbone where organizations, projects and permissions live.",
    capabilities: ["Org & project workspaces", "Role-based access", "Encrypted secret vault (never exposed)", "Audit trails"] },
  { id: "cli", name: "CLI", short: "Developer command line", ring: 0, status: "Planned",
    purpose: "A terminal interface to connect consented repositories, scan, and run dry-run evolutions.",
    capabilities: ["evolution init / login", "Consent-based GitHub connect", "Dry-run updates", "Status reports"] },
  { id: "app", name: "App", short: "Command center UI", ring: 0, status: "Prototype",
    purpose: "The visual Mothership command center you are viewing right now.",
    capabilities: ["Universe map", "Demo dashboard", "Approval inbox", "Guardian alerts"] },
  { id: "update", name: "Universal Update Network", short: "Signed, reversible upgrades", ring: 0, status: "Future",
    purpose: "Distributes signed, verified update packages only to systems whose owners explicitly opt in.",
    capabilities: ["Cryptographic signatures", "Staged rollout", "Manual approval gates", "One-click rollback"] },
  { id: "fusion", name: "Knowledge Fusion Engine", short: "Cross-domain insight", ring: 0, status: "Concept",
    purpose: "Fuses voluntarily shared research, code patterns and ideas into attributed suggestions.",
    capabilities: ["Attribution graph", "Source-aware citations", "Pattern matching", "Idea proposals"] },
  { id: "guardian", name: "Guardian", short: "Protection & permissions", ring: 0, status: "Prototype",
    purpose: "Enforces owner permissions, reversible changes and safety checks before anything is applied.",
    capabilities: ["Permission grants", "Risk scoring", "Sandbox-first policy", "Rollback snapshots"] },
  { id: "ace", name: "Cyberace / Ace Partner", short: "Optional future integration", ring: 0, status: "Future",
    purpose: "An optional future partner integration slot for the Cyberace / Ace ecosystem.",
    capabilities: ["Opt-in connector", "Shared security signals", "Joint tooling (proposed)"] },
  { id: "embassy", name: "Agent Embassy", short: "Consenting AI agents", ring: 1, status: "Concept",
    purpose: "Where consenting AI agents register, declare capabilities and accept collaboration terms.",
    capabilities: ["Agent identity cards", "Declared capabilities", "Consent contracts", "No remote control of external AI"] },
  { id: "invention", name: "Invention Engine", short: "Proposals from patterns", ring: 1, status: "Concept",
    purpose: "Generates invention and improvement proposals from fused knowledge, always as suggestions.",
    capabilities: ["Proposal drafts", "Feasibility scoring", "Prior-art awareness"] },
  { id: "planetary", name: "Planetary Research", short: "Science reference layer", ring: 1, status: "Concept",
    purpose: "Organizes public research reference areas (e.g. space, physics). References only — no partnerships implied.",
    capabilities: ["Public dataset references", "Research domain map", "Citation tracking"] },
  { id: "dna", name: "Evolution DNA", short: "Compatibility profiles", ring: 1, status: "Prototype",
    purpose: "A fingerprint of a project's stack, maturity and goals used to find compatible evolutions.",
    capabilities: ["Stack genome", "Compatibility scoring", "Upgrade lineage"] },
  { id: "time", name: "Time Machine", short: "Simulate futures", ring: 1, status: "Concept",
    purpose: "Simulates the impact of a proposed change over time inside an isolated sandbox.",
    capabilities: ["Forward simulation", "Snapshot timelines", "Regression forecasts"] },
  { id: "immune", name: "Immune System", short: "Threat resilience", ring: 1, status: "Concept",
    purpose: "Detects anomalous or unsigned packages and quarantines them. Defensive only — never hacks back.",
    capabilities: ["Signature verification", "Quarantine", "Anomaly alerts"] },
  { id: "economy", name: "Contribution Economy", short: "Credit for contributors", ring: 1, status: "Future",
    purpose: "Recognizes and (in future) rewards contributors whose shared work powers evolutions.",
    capabilities: ["Attribution ledger", "Reputation", "Future subscriptions (not live)"] },
  { id: "brain", name: "Global Brain", short: "Collective memory", ring: 1, status: "Concept",
    purpose: "The shared, opt-in memory of findings, experiments and outcomes across the network.",
    capabilities: ["Research connections", "Experiment history", "Semantic search"] },
];

export type Category = "Software" | "AI Agents" | "Science" | "Devices" | "Space";
export const categories: Category[] = ["Software", "AI Agents", "Science", "Devices", "Space"];

export interface UniverseNode {
  id: string;
  name: string;
  category: Category;
  x: number; y: number; r: number;
  source: string;
  owner: string;
  mode: "Public" | "Invite-only" | "Private";
  summary: string;
  capabilities: string[];
  links: string[];
}

export const universe: UniverseNode[] = [
  { id: "nebula-ui", name: "Nebula UI Kit", category: "Software", x: 160, y: 140, r: 16, source: "Demo GitHub repo (mock)", owner: "@aria.dev", mode: "Public",
    summary: "Open component library seeking accessibility evolutions.", capabilities: ["React 19", "Design tokens", "A11y audits"], links: ["orbit-db", "sentinel"] },
  { id: "orbit-db", name: "OrbitDB Lite", category: "Software", x: 300, y: 90, r: 13, source: "Demo package registry (mock)", owner: "@kenji", mode: "Public",
    summary: "Edge-first embedded database.", capabilities: ["Sync engine", "CRDTs"], links: ["helios", "nebula-ui"] },
  { id: "sentinel", name: "Sentinel Agent", category: "AI Agents", x: 250, y: 260, r: 15, source: "Agent Embassy registration (mock)", owner: "@guardian-labs", mode: "Invite-only",
    summary: "Consenting code-review agent that proposes fixes, never applies them.", capabilities: ["Static analysis", "Fix proposals", "Explains reasoning"], links: ["atlas", "nebula-ui"] },
  { id: "atlas", name: "Atlas Research Agent", category: "AI Agents", x: 420, y: 330, r: 14, source: "Agent Embassy registration (mock)", owner: "@atlas.ai", mode: "Public",
    summary: "Literature-mapping agent linking papers to code.", capabilities: ["Citation graphs", "Summaries"], links: ["fusion-lab", "sentinel"] },
  { id: "fusion-lab", name: "Fusion Plasma Models", category: "Science", x: 560, y: 220, r: 17, source: "Public paper references (mock)", owner: "@dr.okafor", mode: "Public",
    summary: "Open simulations of plasma confinement.", capabilities: ["Numerical solvers", "Datasets"], links: ["atlas", "helios", "lunar"] },
  { id: "genome", name: "OpenGenome Pipelines", category: "Science", x: 640, y: 380, r: 12, source: "Demo research repo (mock)", owner: "@bioforge", mode: "Private",
    summary: "Reproducible bioinformatics workflows.", capabilities: ["Workflow DSL", "Reproducibility"], links: ["atlas"] },
  { id: "helios", name: "Helios Sensor Mesh", category: "Devices", x: 470, y: 120, r: 14, source: "Owner-registered device fleet (mock)", owner: "@solaris", mode: "Invite-only",
    summary: "Opt-in solar sensor network. Firmware updates require owner approval.", capabilities: ["Signed firmware", "Telemetry"], links: ["orbit-db", "fusion-lab"] },
  { id: "aero", name: "AeroFrame Drone OS", category: "Devices", x: 120, y: 360, r: 13, source: "Demo firmware repo (mock)", owner: "@skyworks", mode: "Public",
    summary: "Open drone flight stack.", capabilities: ["Flight control", "Sim harness"], links: ["sentinel", "lunar"] },
  { id: "lunar", name: "Lunar Regolith Study", category: "Space", x: 720, y: 140, r: 16, source: "Public space-research references (mock)", owner: "@moonlab", mode: "Public",
    summary: "Research reference area: in-situ resource modeling. No agency partnership implied.", capabilities: ["Material models", "Open data"], links: ["fusion-lab", "orbital"] },
  { id: "orbital", name: "Orbital Debris Tracker", category: "Space", x: 780, y: 300, r: 13, source: "Public catalog references (mock)", owner: "@kessler", mode: "Public",
    summary: "Visualizes public orbital catalogs.", capabilities: ["Orbit propagation", "Visualization"], links: ["lunar", "aero"] },
];

export const sampleProjects = [
  { id: "nebula-ui", name: "Nebula UI Kit", stack: ["TypeScript", "React", "Vite"], maturity: 72, goal: "Accessibility & performance" },
  { id: "helios", name: "Helios Sensor Mesh", stack: ["Rust", "Embedded", "MQTT"], maturity: 58, goal: "Safer firmware updates" },
  { id: "genome", name: "OpenGenome Pipelines", stack: ["Python", "Snakemake", "Docker"], maturity: 81, goal: "Reproducibility" },
];

export const demoProposals = [
  { id: "P-104", t: "Reduce bundle size 18%", p: "Nebula UI Kit", s: "Awaiting approval" },
  { id: "P-105", t: "Focus-visible ring tokens", p: "Nebula UI Kit", s: "In sandbox" },
  { id: "P-158", t: "Staged firmware rollout", p: "Helios Sensor Mesh", s: "Guardian review" },
  { id: "P-181", t: "Pin container digests", p: "OpenGenome Pipelines", s: "Approved" },
];

export const conceptExamples = [
  { label: "Sensor network", concept: "An opt-in solar sensor mesh that detects equipment faults locally, shares anonymized findings with consenting owners, and rolls out signed firmware updates without interrupting monitoring.", goal: "Validate reliability with intermittent connectivity and protect owner telemetry." },
  { label: "Research agent", concept: "A consenting research agent that maps public materials-science papers to open simulation code, tracks attribution, and proposes reproducible experiments for creators to review.", goal: "Make every proposed experiment reproducible and every research claim verifiable." },
  { label: "Accessible software", concept: "A creator-owned React component library that detects accessibility issues and proposes shared design-token improvements while keeping each project's changes manually approved and reversible.", goal: "Improve keyboard access without regressions or automatic production changes." },
];

export const cliCommands = [
  { cmd: "evolution init", desc: "Create an EVOLUTION config in the current project.", out: ["✔ Created evolution.config.ts (demo)", "  Participation mode: private"] },
  { cmd: "evolution login", desc: "Authenticate with your Mothership account.", out: ["→ Opening browser for consent… (simulated)", "✔ Signed in as demo@evolution.dev"] },
  { cmd: "evolution connect github", desc: "Grant read-only, revocable access to selected repos.", out: ["? Select repositories: nebula-ui (simulated)", "✔ Read-only grant recorded. Revoke anytime."] },
  { cmd: "evolution scan", desc: "Build the project's Evolution DNA profile.", out: ["Scanning 1,204 files… (simulated)", "✔ DNA: TypeScript 82% · React 19 · Vite 7", "  3 findings, 0 critical"] },
  { cmd: "evolution suggest", desc: "Request proposals from the Knowledge Fusion Engine.", out: ["✔ 2 proposals drafted (simulated)", "  #P-104 Reduce bundle size by 18%", "  #P-105 Add focus-visible ring tokens"] },
  { cmd: "evolution sandbox", desc: "Run a proposal in an isolated sandbox.", out: ["Spinning up sandbox… (simulated)", "✔ 248/248 tests passed · perf +12%"] },
  { cmd: "evolution status", desc: "Show grants, proposals and update readiness.", out: ["Grants: 1 active · Proposals: 2 · Pending approval: 1", "Guardian: all checks green (simulated)"] },
  { cmd: "evolution update --dry-run", desc: "Preview a signed update without applying it.", out: ["Package evo-pkg-0.4.1 signature ✔ (simulated)", "Would modify 6 files. Nothing applied.", "Rollback snapshot: snap_7f3a"] },
];

export const feed = [
  { id: 1, author: "@aria.dev", mode: "Public" as const, title: "Shared token system for accessible focus states", body: "Proposing a cross-project focus-ring token spec. Attribution requested on reuse.", tags: ["Software", "A11y"], sparks: 42 },
  { id: 2, author: "@atlas.ai (consenting agent)", mode: "Public" as const, title: "Linking plasma papers to open solvers", body: "Mapped 31 public papers to 4 open repos. Suggest a shared benchmark suite.", tags: ["Science", "AI Agents"], sparks: 27 },
  { id: 3, author: "@solaris", mode: "Invite-only" as const, title: "Staged firmware rollout pattern", body: "10% → 50% → 100% with automatic rollback on telemetry regression.", tags: ["Devices"], sparks: 18 },
  { id: 4, author: "@moonlab", mode: "Public" as const, title: "Regolith simulation dataset index", body: "Indexing public references only. Looking for collaborators on material models.", tags: ["Space", "Science"], sparks: 33 },
  { id: 5, author: "@bioforge", mode: "Private" as const, title: "Reproducible container recipes", body: "Visible only to project members. Shown here as a concept preview.", tags: ["Science"], sparks: 6 },
];

export const agents = [
  { name: "Sentinel", role: "Code review", consent: "Granted", scope: "Propose only", trust: 94 },
  { name: "Atlas", role: "Research mapping", consent: "Granted", scope: "Read public refs", trust: 89 },
  { name: "Forge", role: "Test generation", consent: "Pending", scope: "Sandbox only", trust: 71 },
  { name: "Echo", role: "Docs writer", consent: "Revoked", scope: "—", trust: 60 },
];

export const guardianAlerts = [
  { id: "G-311", level: "info", title: "Update package evo-pkg-0.4.1 awaiting owner approval", detail: "Signature verified. Sandbox: 248/248 tests passed.", action: "approve" },
  { id: "G-312", level: "warn", title: "Agent 'Forge' requested write scope", detail: "Request exceeds sandbox-only policy. Owner decision required.", action: "deny" },
  { id: "G-313", level: "critical", title: "Unsigned package blocked by Immune System", detail: "Quarantined automatically. No changes applied.", action: "acknowledge" },
  { id: "G-314", level: "info", title: "Rollback snapshot snap_7f3a ready", detail: "Restores Nebula UI Kit to v2.3.0 state.", action: "rollback" },
] as const;

export const permissions = [
  { scope: "Read repository: nebula-ui", granted: true },
  { scope: "Open pull-request proposals", granted: true },
  { scope: "Run sandbox experiments", granted: true },
  { scope: "Apply updates without approval", granted: false },
  { scope: "Access production secrets", granted: false },
];
