/**
 * Grouped site navigation. Pure data so the header, the home page, the
 * command palette and tests share one list. Every page that was reachable
 * from the old flat menu is still listed (primary groups or Advanced).
 */

export type NavStatus = "account" | "owner" | "browser" | "ai" | "demo" | "off" | "guide";

/** Plain-language badge text and tooltip for each status. */
export const NAV_STATUS: Record<NavStatus, { label: string; help: string; tone: string }> = {
  account: {
    label: "Your account",
    help: "Works now. Saved to your signed-in account.",
    tone: "border-success/50 text-success",
  },
  owner: {
    label: "Owner only",
    help: "Only the owner can open this, after entering an authenticator code.",
    tone: "border-gold/60 text-gold-light",
  },
  browser: {
    label: "This browser",
    help: "Works, but is saved only in this browser. Not shared or backed up.",
    tone: "border-primary/50 text-primary",
  },
  ai: {
    label: "AI draft",
    help: "Real AI writes a suggestion. Nothing is run, sent or published.",
    tone: "border-primary/50 text-primary",
  },
  demo: {
    label: "Demo",
    help: "Simulated example. Nothing real happens.",
    tone: "border-muted-foreground/40 text-muted-foreground",
  },
  off: {
    label: "Not connected",
    help: "Planned or blocked. It does not work yet.",
    tone: "border-warning/50 text-warning",
  },
  guide: {
    label: "Guide",
    help: "Information and instructions.",
    tone: "border-muted-foreground/40 text-muted-foreground",
  },
};

export const navGroups = [
  {
    id: "projects",
    label: "Projects",
    blurb: "Your private work and drafts.",
    items: [
      { to: "/beta", label: "My projects", status: "account", note: "Private projects saved to your account." },
      { to: "/quantum-studio", label: "Quantum Studio", status: "account", note: "Private media for approved members." },
      { to: "/knowledge-brief", label: "Daily Knowledge Brief", status: "account", note: "For approved readers." },
      { to: "/pathway", label: "AI Pathway", status: "ai", note: "Describe an idea; get a written draft plan." },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    blurb: "OMNI and the agents it coordinates.",
    items: [
      { to: "/beta-omni", label: "OMNI chat", status: "account", note: "Text chat, after owner approval of AI access." },
      { to: "/omni-terminal", label: "OMNI Terminal", status: "owner", note: "Status, held tasks and Emergency Stop. Nothing runs by itself." },
      { to: "/omni", label: "Razul Central Intelligence", status: "demo", note: "Public overview." },
      { to: "/omni-razul", label: "Razul workspace", status: "browser", note: "Local notes and settings." },
      { to: "/omni-agents", label: "Agent registry", status: "demo", note: "Concept list of agents." },
      { to: "/omni-models", label: "Model choices", status: "browser", note: "Which AI models you plan to use." },
      { to: "/agents", label: "Agent network", status: "demo", note: "Simulated network." },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    blurb: "Nothing important happens without you.",
    items: [
      { to: "/activation-approvals", label: "Activation approvals", status: "owner", note: "Records your decisions. Never switches anything on." },
      { to: "/approval-ledger", label: "Approval ledger", status: "demo", note: "Example of how approvals are traced." },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    blurb: "Devices, keys and outside services.",
    items: [
      { to: "/omni-dock", label: "Docking Bay (devices)", status: "owner", note: "Pair a desktop or phone app. No device paired yet." },
      { to: "/omni-api-keys", label: "API keys", status: "owner", note: "Create, limit and revoke keys. Shown once." },
      { to: "/omni-gateway", label: "Coding gateway", status: "off", note: "Blocked until approved and verified." },
      { to: "/platform", label: "Evolution CLI", status: "off", note: "Planned terminal companion." },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    blurb: "Sign-in, security and members.",
    items: [
      { to: "/sign-in-help", label: "How to sign in", status: "guide", note: "Step-by-step sign-in, two-factor and recovery." },
      { to: "/account-security", label: "Two-factor & recovery", status: "account", note: "Authenticator app and recovery codes." },
      { to: "/members", label: "Members & invitations", status: "owner", note: "Invite people with single-use links." },
      { to: "/launch-control", label: "Launch readiness", status: "guide", note: "Dated checks. Not a launch approval." },
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  blurb: string;
  items: readonly { to: string; label: string; status: NavStatus; note: string }[];
}[];

/** Everything else: earlier modules, demos and references, with their original labels. */
export const advancedItems = [
  { to: "/mothership", label: "Mothership" },
  { to: "/command-nexus", label: "Command Nexus · Demo" },
  { to: "/omnibridge", label: "OmniBridge · Demo" },
  { to: "/omni-marketing", label: "OMNI Marketing · Local" },
  { to: "/angel-tech", label: "Angel Tech · Sabrina Concept" },
  { to: "/omni-rights", label: "OMNI Rights · Local" },
  { to: "/omni-legal", label: "Omni Legal · Synthetic" },
  { to: "/entertainment", label: "Entertainment Galaxy · Demo" },
  { to: "/cartoon-galaxy", label: "Cartoon Galaxy · Demo" },
  { to: "/code-exchange", label: "Code Exchange" },
  { to: "/code-vault", label: "Code Vault · Demo" },
  { to: "/commons", label: "Commons · Demo" },
  { to: "/pulse", label: "Pulse · Local" },
  { to: "/challenges", label: "Grand Challenges" },
  { to: "/open-call", label: "Evolution Open Call" },
  { to: "/embassy", label: "Agent Embassy" },
  { to: "/agent-lounge", label: "Welcome Lounge · Demo" },
  { to: "/incident-archives", label: "Incident Archives · Demo" },
  { to: "/agent-debrief", label: "Agent Debrief · Demo" },
  { to: "/guardian-incidents", label: "Incident Accountability · Demo" },
  { to: "/report-incident", label: "Report Incident · Demo" },
  { to: "/sdk", label: "SDK / API Docs" },
  { to: "/discovery", label: "Discovery Radar" },
  { to: "/digital-twin", label: "Digital Twin Lab" },
  { to: "/robotics", label: "Robotics & Mobility Lab" },
  { to: "/physical-safety", label: "Physical Safety Lock · Demo" },
  { to: "/experiment-replay", label: "Oracle Experiment Replay · Demo" },
  { to: "/impact-scorecard", label: "Idea-to-Impact Scorecard · Demo" },
  { to: "/trust", label: "Trust & Certification" },
  { to: "/marketplace", label: "Creator Marketplace" },
  { to: "/compute-grid", label: "Compute Grid" },
  { to: "/releases", label: "Release Galaxy" },
  { to: "/care", label: "Evolution CARE · Demo" },
  { to: "/updates", label: "Update Engine · Demo" },
  { to: "/pilot", label: "Evolution Pilot · Demo" },
  { to: "/voice", label: "Mothership Voice · Demo" },
  { to: "/care-agent", label: "Native Agent Reference" },
  { to: "/universe", label: "Universe" },
  { to: "/knowledge-fusion", label: "Knowledge Fusion" },
  { to: "/guardian", label: "Guardian" },
  { to: "/devices", label: "My Devices · Demo" },
  { to: "/fleet", label: "Fleet Control · Demo" },
  { to: "/security-report", label: "Health & Security Report" },
  { to: "/sandbox", label: "Sandbox Lab" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/partnerships", label: "Partnerships" },
  { to: "/dashboard", label: "Demo Dashboard" },
  { to: "/arena", label: "Racing Arena · Simulation" },
] as const;

/** Flat list (Home, groups, Advanced) for the command palette and tests. */
export const navItems = [
  { to: "/", label: "Home" },
  ...navGroups.flatMap((g) => g.items.map(({ to, label }) => ({ to, label }))),
  ...advancedItems,
] as const;
