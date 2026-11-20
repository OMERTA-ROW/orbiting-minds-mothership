// Reference data: concept module descriptions (AI Pathway context), the CLI command
// reference and the compatibility policy. No integrations, records or statuses are claimed.

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
  {
    id: "cloud",
    name: "Cloud",
    short: "Owner-scoped hosting core",
    ring: 0,
    status: "Planned",
    purpose:
      "The secure, owner-scoped backbone where organizations, projects and permissions live.",
    capabilities: [
      "Org & project workspaces",
      "Role-based access",
      "Encrypted secret vault (never exposed)",
      "Audit trails",
    ],
  },
  {
    id: "cli",
    name: "CLI",
    short: "Optional existing-terminal companion",
    ring: 0,
    status: "Planned",
    purpose:
      "A lightweight opt-in companion for existing macOS, Linux and Windows terminals, not a replacement terminal. Public installation and connected commands remain planned.",
    capabilities: [
      "evolution help / doctor / version",
      "omni or evolution omni",
      "Planned consent-based connect / login",
      "No mandatory download or tool changes",
    ],
  },
  {
    id: "app",
    name: "App",
    short: "Command center UI",
    ring: 0,
    status: "Prototype",
    purpose: "The visual Mothership command center you are viewing right now.",
    capabilities: ["Universe map", "Demo dashboard", "Approval inbox", "Guardian alerts"],
  },
  {
    id: "update",
    name: "Universal Update Network",
    short: "Signed, reversible upgrades",
    ring: 0,
    status: "Future",
    purpose:
      "Distributes signed, verified update packages only to systems whose owners explicitly opt in.",
    capabilities: [
      "Cryptographic signatures",
      "Staged rollout",
      "Manual approval gates",
      "One-click rollback",
    ],
  },
  {
    id: "fusion",
    name: "Knowledge Fusion Engine",
    short: "Cross-domain insight",
    ring: 0,
    status: "Concept",
    purpose:
      "Fuses voluntarily shared research, code patterns and ideas into attributed suggestions.",
    capabilities: [
      "Attribution graph",
      "Source-aware citations",
      "Pattern matching",
      "Idea proposals",
    ],
  },
  {
    id: "guardian",
    name: "Guardian",
    short: "Protection & permissions",
    ring: 0,
    status: "Concept",
    purpose:
      "Enforces owner permissions, reversible changes and safety checks before anything is applied.",
    capabilities: [
      "Permission grants",
      "Risk scoring",
      "Sandbox-first policy",
      "Rollback snapshots",
    ],
  },
  {
    id: "ace",
    name: "Cyberace",
    short: "Concept · integration unconfirmed",
    ring: 0,
    status: "Concept",
    purpose:
      "Cyberace is a proposed project concept. Integration details are unconfirmed; no repository, terminal or deployment is connected. Owner authorization is required before integration.",
    capabilities: [
      "Integration details unconfirmed",
      "Owner authorization required",
      "No connected project or terminal",
    ],
  },
  {
    id: "embassy",
    name: "Agent Embassy",
    short: "Consenting AI agents",
    ring: 1,
    status: "Concept",
    purpose:
      "Where consenting AI agents register, declare capabilities and accept collaboration terms.",
    capabilities: [
      "Agent identity cards",
      "Declared capabilities",
      "Consent contracts",
      "No remote control of external AI",
    ],
  },
  {
    id: "invention",
    name: "Invention Engine",
    short: "Proposals from patterns",
    ring: 1,
    status: "Concept",
    purpose:
      "Generates invention and improvement proposals from fused knowledge, always as suggestions.",
    capabilities: ["Proposal drafts", "Feasibility scoring", "Prior-art awareness"],
  },
  {
    id: "planetary",
    name: "Planetary Research",
    short: "Science reference layer",
    ring: 1,
    status: "Concept",
    purpose:
      "Organizes public research reference areas (e.g. space, physics). References only — no partnerships implied.",
    capabilities: ["Public dataset references", "Research domain map", "Citation tracking"],
  },
  {
    id: "dna",
    name: "Evolution DNA",
    short: "Compatibility profiles",
    ring: 1,
    status: "Concept",
    purpose:
      "A fingerprint of a project's stack, maturity and goals used to find compatible evolutions.",
    capabilities: ["Stack genome", "Compatibility scoring", "Upgrade lineage"],
  },
  {
    id: "time",
    name: "Time Machine",
    short: "Simulate futures",
    ring: 1,
    status: "Concept",
    purpose: "Simulates the impact of a proposed change over time inside an isolated sandbox.",
    capabilities: ["Forward simulation", "Snapshot timelines", "Regression forecasts"],
  },
  {
    id: "immune",
    name: "Immune System",
    short: "Threat resilience",
    ring: 1,
    status: "Concept",
    purpose:
      "Detects anomalous or unsigned packages and quarantines them. Defensive only — never hacks back.",
    capabilities: ["Signature verification", "Quarantine", "Anomaly alerts"],
  },
  {
    id: "economy",
    name: "Contribution Economy",
    short: "Credit for contributors",
    ring: 1,
    status: "Future",
    purpose: "Recognizes and (in future) rewards contributors whose shared work powers evolutions.",
    capabilities: [
      "Attribution ledger",
      "Reputation",
      "Optional hosted/team offerings · proposed, not live",
    ],
  },
  {
    id: "brain",
    name: "Global Brain",
    short: "Collective memory",
    ring: 1,
    status: "Concept",
    purpose: "The shared, opt-in memory of findings, experiments and outcomes across the network.",
    capabilities: ["Research connections", "Experiment history", "Semantic search"],
  },
];

export const cliCommands = [
  {
    cmd: "evolution help",
    desc: "Read the command reference.",
    local: true,
    permissions: "No network, credentials or file changes.",
    out: [
      "PLANNED public command · offline help exists in unreleased source.",
      "No distributed CLI or installation claimed.",
    ],
  },
  {
    cmd: "evolution doctor --json",
    desc: "Check platform and command-name collisions.",
    local: true,
    permissions:
      "Read platform and evolution/omni names in PATH only; no project scans or tool execution.",
    out: [
      "PLANNED public command · local source check only.",
      "Browser cannot inspect your PATH, aliases or installed tools.",
    ],
  },
  {
    cmd: "evolution connect github",
    desc: "Select a repository and least-privilege consent.",
    local: false,
    permissions:
      "Future authenticated owner, official API consent and selected repository. No connection made.",
    out: [
      "PLANNED / BLOCKED · no repository or connector connected.",
      "No keys accepted; no API request.",
    ],
  },
  {
    cmd: "evolution login",
    desc: "Future browser-based account authorization.",
    local: false,
    permissions:
      "Future PKCE, verified callback, scoped session and OS-secure keys. Not implemented.",
    out: [
      "PLANNED / BLOCKED · secure CLI login not available.",
      "No browser opened or account authenticated.",
    ],
  },
  {
    cmd: "evolution nexus",
    desc: "Future authorized project workspace selection.",
    local: false,
    permissions:
      "Owner-selected project and explicit context grant; no implicit private-thread access.",
    out: [
      "PLANNED / BLOCKED · terminal workspace not connected.",
      "Existing tools and chats stay independent.",
    ],
  },
  {
    cmd: "evolution agents",
    desc: "Future approved operator-owned agent list.",
    local: false,
    permissions:
      "Verified operator identities and per-agent scopes; no discovery, enrollment or broadcasts.",
    out: [
      "PLANNED / BLOCKED · no real agents enrolled.",
      "Consumer ChatGPT/Claude histories cannot sync.",
    ],
  },
  {
    cmd: "evolution update --dry-run",
    desc: "Future signed self-update preview.",
    local: false,
    permissions:
      "Pinned trusted signer, provenance, approval and tested recovery; no other tool updates.",
    out: [
      "PLANNED / BLOCKED · no release feed or signatures.",
      "Nothing downloaded, installed or rolled back.",
    ],
  },
  {
    cmd: "evolution version",
    desc: "Report the executable’s source version.",
    local: true,
    permissions: "Read embedded version only; no connection or changes.",
    out: [
      "PLANNED public command · unreleased local source reports 0.0.0-source.",
      "Unsigned source is not a published release.",
    ],
  },
  {
    cmd: "omni",
    desc: "Direct interactive OMNI once a model is authorized.",
    local: false,
    permissions:
      "Approved model/API, project context consent, costs and human action gates. No trained proprietary model.",
    out: [
      "PLANNED / BLOCKED · no terminal AI session.",
      "If omni belongs to another tool, use evolution omni; never overwrite it.",
    ],
  },
  {
    cmd: "evolution omni",
    desc: "Collision-safe direct OMNI fallback.",
    local: false,
    permissions: "Same future model/consent gates; no alias or shell-profile modification.",
    out: [
      "PLANNED / BLOCKED · fallback name reserved in source.",
      "No model response, tool execution or provider request.",
    ],
  },
  {
    cmd: "evolution uninstall --dir <owned-directory> --approve",
    desc: "Remove unchanged source copies with explicit consent.",
    local: true,
    permissions:
      "Dedicated source directory and receipt only. Extra/modified files or symlinks block removal; no recursive cleanup.",
    out: [
      "PLANNED public command · isolated source uninstall only.",
      "Not an installed package; browser removes nothing.",
    ],
  },
  {
    cmd: "evolution workspace init --approve",
    desc: "Create the local Omni Projects workspace on your real Desktop and save the choice.",
    local: true,
    permissions:
      "Creates one folder on this machine and writes one per-user config file; --dir chooses a custom location. The browser cannot do this.",
    out: [
      "Implemented in unreleased source · defaults to <Desktop>/Omni Projects (OneDrive-redirected Desktops detected).",
      "Runs only in your terminal; no folders are created by this website.",
    ],
  },
  {
    cmd: "evolution project new <name> --template game --approve",
    desc: "Create a project folder with starter subfolders inside the workspace.",
    local: true,
    permissions:
      "Fixed templates only (game: Code, Game Assets, Audio, Builds, Exports · video: Footage, Music, Edits, Finished Videos). Existing names refused; nothing overwritten.",
    out: [
      "Implemented in unreleased source · writes .evolution/project.json like project use.",
      "Path traversal, symlink escapes and collisions are refused.",
    ],
  },
  {
    cmd: "evolution workspace status",
    desc: "Show the saved workspace, its projects and exact output locations.",
    local: true,
    permissions: "Reads the per-user config and workspace directory only.",
    out: [
      "Implemented in unreleased source · prints the real saved path.",
      "The browser has no access to this folder.",
    ],
  },
  {
    cmd: "evolution project open --project <dir> --approve",
    desc: "Open the project folder in your file manager.",
    local: true,
    permissions:
      "Launches the platform opener (open/xdg-open/explorer) with a fixed path; reports honestly when no opener exists.",
    out: [
      "Implemented in unreleased source · local file manager only.",
      "No remote or browser folder access is claimed.",
    ],
  },
] as const;

// Owner-directed product policy only, not billing entitlements or live pricing.
export const compatibilityPolicy = {
  schemaVersion: 1,
  mode: "ROADMAP_POLICY",
  basic: {
    recurringSubscriptionRequired: false,
    accountRequiredForOfflineSource: false,
    replacementTerminalRequired: false,
    replacementIdeRequired: false,
    downloadRequiredForWebPreview: false,
  },
  providers: {
    optInRequired: true,
    officialApiRequired: true,
    existingConsumerSubscriptionIncludesApi: false,
    externalFeesMayApply: true,
    guaranteedFreeAi: false,
    liveUsageMeterAvailable: false,
    actualUsageCostUsd: null,
    privateKeysInChatAllowed: false,
    secureKeyCustodyRequired: true,
  },
  hosted: { optional: true, available: false, priceUsd: null, billingEnabled: false },
  portability: {
    exportFormat: "JSON",
    policyExportContainsCredentials: false,
    automaticToolchainEdits: false,
    nativeUninstallRequiresConsent: true,
    projectDiagnosticsAvailable: false,
    sourceLicenseApproved: false,
  },
  evidence: {
    verifiedUserSavings: false,
    carbonNeutralClaim: false,
    liveAgentCountAvailable: false,
  },
} as const;
