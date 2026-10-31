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
    status: "Prototype",
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
    short: "DEMO · integration unconfirmed",
    ring: 0,
    status: "Concept",
    purpose:
      "Cyberace is a proposed DEMO project example. Integration details are unconfirmed; no repository, terminal or deployment is connected. Owner authorization is required before integration.",
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
    status: "Prototype",
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

export type Category = "Software" | "AI Agents" | "Science" | "Devices" | "Space";
export const categories: Category[] = ["Software", "AI Agents", "Science", "Devices", "Space"];

export interface UniverseNode {
  id: string;
  name: string;
  category: Category;
  x: number;
  y: number;
  r: number;
  source: string;
  owner: string;
  mode: "Public" | "Invite-only" | "Private";
  summary: string;
  capabilities: string[];
  links: string[];
}

export const universe: UniverseNode[] = [
  {
    id: "nebula-ui",
    name: "Nebula UI Kit",
    category: "Software",
    x: 160,
    y: 140,
    r: 16,
    source: "Demo GitHub repo (mock)",
    owner: "@aria.dev",
    mode: "Public",
    summary: "Open component library seeking accessibility evolutions.",
    capabilities: ["React 19", "Design tokens", "A11y audits"],
    links: ["orbit-db", "sentinel"],
  },
  {
    id: "orbit-db",
    name: "OrbitDB Lite",
    category: "Software",
    x: 300,
    y: 90,
    r: 13,
    source: "Demo package registry (mock)",
    owner: "@kenji",
    mode: "Public",
    summary: "Edge-first embedded database.",
    capabilities: ["Sync engine", "CRDTs"],
    links: ["helios", "nebula-ui"],
  },
  {
    id: "sentinel",
    name: "Sentinel Agent",
    category: "AI Agents",
    x: 250,
    y: 260,
    r: 15,
    source: "Agent Embassy registration (mock)",
    owner: "@guardian-labs",
    mode: "Invite-only",
    summary: "Consenting code-review agent that proposes fixes, never applies them.",
    capabilities: ["Static analysis", "Fix proposals", "Explains reasoning"],
    links: ["atlas", "nebula-ui"],
  },
  {
    id: "atlas",
    name: "Atlas Research Agent",
    category: "AI Agents",
    x: 420,
    y: 330,
    r: 14,
    source: "Agent Embassy registration (mock)",
    owner: "@atlas.ai",
    mode: "Public",
    summary: "Literature-mapping agent linking papers to code.",
    capabilities: ["Citation graphs", "Summaries"],
    links: ["fusion-lab", "sentinel"],
  },
  {
    id: "fusion-lab",
    name: "Fusion Plasma Models",
    category: "Science",
    x: 560,
    y: 220,
    r: 17,
    source: "Public paper references (mock)",
    owner: "@dr.okafor",
    mode: "Public",
    summary: "Open simulations of plasma confinement.",
    capabilities: ["Numerical solvers", "Datasets"],
    links: ["atlas", "helios", "lunar"],
  },
  {
    id: "genome",
    name: "OpenGenome Pipelines",
    category: "Science",
    x: 640,
    y: 380,
    r: 12,
    source: "Demo research repo (mock)",
    owner: "@bioforge",
    mode: "Private",
    summary: "Reproducible bioinformatics workflows.",
    capabilities: ["Workflow DSL", "Reproducibility"],
    links: ["atlas"],
  },
  {
    id: "helios",
    name: "Helios Sensor Mesh",
    category: "Devices",
    x: 470,
    y: 120,
    r: 14,
    source: "Owner-registered device fleet (mock)",
    owner: "@solaris",
    mode: "Invite-only",
    summary: "Opt-in solar sensor network. Firmware updates require owner approval.",
    capabilities: ["Signed firmware", "Telemetry"],
    links: ["orbit-db", "fusion-lab"],
  },
  {
    id: "aero",
    name: "AeroFrame Drone OS",
    category: "Devices",
    x: 120,
    y: 360,
    r: 13,
    source: "Demo firmware repo (mock)",
    owner: "@skyworks",
    mode: "Public",
    summary: "Open drone flight stack.",
    capabilities: ["Flight control", "Sim harness"],
    links: ["sentinel", "lunar"],
  },
  {
    id: "lunar",
    name: "Lunar Regolith Study",
    category: "Space",
    x: 720,
    y: 140,
    r: 16,
    source: "Public space-research references (mock)",
    owner: "@moonlab",
    mode: "Public",
    summary: "Research reference area: in-situ resource modeling. No agency partnership implied.",
    capabilities: ["Material models", "Open data"],
    links: ["fusion-lab", "orbital"],
  },
  {
    id: "orbital",
    name: "Orbital Debris Tracker",
    category: "Space",
    x: 780,
    y: 300,
    r: 13,
    source: "Public catalog references (mock)",
    owner: "@kessler",
    mode: "Public",
    summary: "Visualizes public orbital catalogs.",
    capabilities: ["Orbit propagation", "Visualization"],
    links: ["lunar", "aero"],
  },
];

export const sampleProjects = [
  {
    id: "nebula-ui",
    name: "Nebula UI Kit",
    stack: ["TypeScript", "React", "Vite"],
    maturity: 72,
    goal: "Accessibility & performance",
  },
  {
    id: "helios",
    name: "Helios Sensor Mesh",
    stack: ["Rust", "Embedded", "MQTT"],
    maturity: 58,
    goal: "Safer firmware updates",
  },
  {
    id: "genome",
    name: "OpenGenome Pipelines",
    stack: ["Python", "Snakemake", "Docker"],
    maturity: 81,
    goal: "Reproducibility",
  },
];

// Command Nexus planning fixtures. No providers, repositories or desktop apps connected.
export const nexusProjects = [
  {
    id: "nexus-nebula",
    name: "Nebula UI",
    stack: "TypeScript · web",
    context:
      "Fictional keyboard selection study. Goal: preserve explicit boundaries and human review.",
    file: "selection.ts",
    source: 'export const selectionMode = "manual";\n',
    sample: 'export const selectionMode = "reviewed-manual";\n',
  },
  {
    id: "nexus-studio",
    name: "Orbital Game Studio",
    stack: "Unity · Blender concept",
    context: "Fictional scene pipeline. No installed editor, assets or game repository attached.",
    file: "scene-plan.ts",
    source: "export const sceneBudget = 10;\n",
    sample: "export const sceneBudget = 8;\n",
  },
  {
    id: "nexus-cyberace",
    name: "Cyberace",
    stack: "DEMO · integration unconfirmed",
    context:
      "Proposed Cyberace DEMO workspace only. Integration details are unconfirmed; no repository, terminal or deployment is connected. Owner authorization is required before integration.",
    file: "adapter-plan.ts",
    source: "export const adapterEnabled = false;\n",
    sample:
      "export const adapterEnabled = false;\n// Cyberace integration details unconfirmed; owner authorization required.\n",
  },
] as const;
export const nexusAgents = [
  {
    id: "openai",
    name: "GPT API",
    provider: "OpenAI",
    role: "Architecture & draft proposals",
    mark: "G",
    endpoint: "Official OpenAI API",
    docs: "https://platform.openai.com/docs",
    limitation:
      "API credentials and model access required. Consumer ChatGPT history does not sync.",
  },
  {
    id: "anthropic",
    name: "Claude API",
    provider: "Anthropic",
    role: "Independent code critique",
    mark: "C",
    endpoint: "Official Anthropic API",
    docs: "https://docs.anthropic.com/",
    limitation:
      "Separate API account/model access required. Consumer Claude history does not sync.",
  },
  {
    id: "adapter",
    name: "Third-party adapter",
    provider: "Unspecified",
    role: "Extensible contract · disabled",
    mark: "+",
    endpoint: "Provider must be identified",
    docs: "",
    limitation:
      "No vendor, model, endpoint or approved adapter configured. Atlas is unidentified; not the fictional Atlas research agent.",
  },
] as const;
export const nexusTools = [
  {
    name: "OpenAI / GPT API",
    surface: "Official HTTP API",
    state: "Not connected",
    grant: "Selected project text only",
    blocker: "Owner-bound credentials, model access, usage evidence",
  },
  {
    name: "Anthropic / Claude API",
    surface: "Official HTTP API",
    state: "Not connected",
    grant: "Explicit independent conversation",
    blocker: "Owner-bound credentials, model access, usage evidence",
  },
  {
    name: "GitHub",
    surface: "Official GitHub App",
    state: "Not configured",
    grant: "Selected repository; reviewable PR only",
    blocker: "Repository identification, installation grant, test branch",
  },
  {
    name: "Unity",
    surface: "Editor command-line concept",
    state: "Companion required",
    grant: "Pinned editor and selected project",
    blocker: "Signed companion, OS consent, licensed editor, adapter tests",
  },
  {
    name: "Blender",
    surface: "Python / headless concept",
    state: "Companion required",
    grant: "Selected scene and reviewed script",
    blocker: "Signed companion, local paths, script/asset rights, adapter tests",
  },
  {
    name: "Local terminal",
    surface: "Typed allowlist · future",
    state: "Companion required",
    grant: "No arbitrary shell or hidden execution",
    blocker: "Device enrollment, resource/egress limits, per-action approval",
  },
  {
    name: "Atlas",
    surface: "Unidentified software",
    state: "Unsupported",
    grant: "None",
    blocker: "Founder must identify the intended product and official interfaces",
  },
] as const;
export const nexusCompanionPlans = [
  {
    id: "unity",
    name: "Unity build / test plan",
    language: "CLI reference · inert",
    source: "https://docs.unity3d.com/Manual/EditorCommandLineArguments.html",
    text: "Unity -batchmode -quit -projectPath <approved-project>\n  -executeMethod <reviewed-build-method> -logFile <approved-log>\n\n# Separate Test Framework adapter/version required for test runs.",
    scope:
      "Pinned editor version, exact project path, reviewed static build method, license availability, artifact/log paths and independent test evidence. Build methods can modify files; never assume read-only.",
  },
  {
    id: "blender",
    name: "Blender script / render plan",
    language: "Python reference · inert",
    source: "https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html",
    text: "blender --background <approved-scene.blend>\n  --disable-autoexec --python <reviewed-script.py>\n\n# Explicit --python still executes the chosen script if run externally.\n# import bpy\n# print(bpy.app.version_string)",
    scope:
      "Exact scene/script hashes, licensed assets, pinned Blender version, isolated writable output directory, no host secrets, memory/time limits and per-action local consent.",
  },
] as const;

// OmniBridge capability references: no connectivity probes, accounts or execution.
export const omniConnectionStates = ["CONNECTED", "NOT CONNECTED", "DEMO", "UNSUPPORTED"] as const;
export const omniConnectors = [
  {
    id: "local",
    name: "Local plan engine",
    mark: "O",
    state: "DEMO",
    surface: "Browser-only deterministic templates",
    capabilities: ["Explain task dependencies", "Preview sample files", "Export review records"],
    scopes: ["samples:read", "plans:propose"],
    compatibility: "Current browser; no model or runner",
    cost: "No provider request; external cost not applicable",
    discovery: "Built-in DEMO reference",
    blocker: "Not OMNI inference or secure enforcement",
    docs: "",
    companion: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    mark: "G",
    state: "NOT CONNECTED",
    surface: "Official model API · proposed adapter",
    capabilities: ["Architecture drafts", "Explicit project-text context"],
    scopes: ["context:read", "drafts:propose"],
    compatibility:
      "Model/API account and reviewed adapter required; consumer ChatGPT history does not sync",
    cost: "USD / input + output tokens; model/rates unconfigured",
    discovery: "Documented API reference; not probed",
    blocker: "Owner-scoped credentials, model access, consent and usage evidence",
    docs: "https://platform.openai.com/docs",
    companion: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    mark: "C",
    state: "NOT CONNECTED",
    surface: "Official model API · proposed adapter",
    capabilities: ["Independent critique", "Isolated draft conversation"],
    scopes: ["context:read", "drafts:propose"],
    compatibility: "Separate API access required; consumer Claude history does not sync",
    cost: "USD / input + output tokens; model/rates unconfigured",
    discovery: "Documented API reference; not probed",
    blocker: "Owner-scoped credentials, model access, consent and usage evidence",
    docs: "https://docs.anthropic.com/",
    companion: false,
  },
  {
    id: "github",
    name: "GitHub",
    mark: "GH",
    state: "NOT CONNECTED",
    surface: "Official GitHub App · future",
    capabilities: ["Selected repository read", "Proposed test-branch PR"],
    scopes: ["repository:read", "pull-request:propose"],
    compatibility: "Exact selected repository and installation grant; no repository attached",
    cost: "API plan/quota and CI minutes unknown; no current billing",
    discovery: "Documented API reference; not probed",
    blocker: "Authenticated owner, repository selection, least-privilege grant and branch tests",
    docs: "https://docs.github.com/en/apps",
    companion: false,
  },
  {
    id: "unity",
    name: "Unity",
    mark: "U",
    state: "NOT CONNECTED",
    surface: "Editor CLI · companion concept",
    capabilities: ["Pinned editor build plan", "Test Framework reference"],
    scopes: ["project:read", "build:preview"],
    compatibility: "Pinned editor, license and reviewed static method; no editor detected",
    cost: "License/compute cost unknown; no job run",
    discovery: "Official CLI reference; no device discovery",
    blocker: "Approved signed companion, OS grant, isolated runner and independent tests",
    docs: "https://docs.unity3d.com/Manual/EditorCommandLineArguments.html",
    companion: true,
  },
  {
    id: "blender",
    name: "Blender",
    mark: "B",
    state: "NOT CONNECTED",
    surface: "Python / headless · companion concept",
    capabilities: ["Scene/render plan", "Reviewed script preview"],
    scopes: ["scene:read", "render:preview"],
    compatibility: "Pinned Blender, scene/script hashes and asset rights; no scene attached",
    cost: "Local/hosted compute unknown; no render run",
    discovery: "Official CLI reference; no device discovery",
    blocker: "Approved signed companion, reviewed script, isolated output and OS grant",
    docs: "https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html",
    companion: true,
  },
  {
    id: "solana",
    name: "Solana",
    mark: "S",
    state: "NOT CONNECTED",
    surface: "FUTURE OPTIONAL · developer/testnet read-only",
    capabilities: ["Future testnet RPC status read", "Public developer reference"],
    scopes: ["testnet:status:read"],
    compatibility: "Future official read-only adapter only; no endpoint or wallet connected",
    cost: "RPC quota/provider rates unknown; no call or transaction",
    discovery: "Developer documentation only; not probed",
    blocker:
      "Optional owner approval and read-only adapter review; wallets, signing, transactions and mainnet disabled",
    docs: "https://solana.com/docs",
    companion: false,
  },
  {
    id: "atlas",
    name: "Atlas / unknown adapter",
    mark: "?",
    state: "UNSUPPORTED",
    surface: "Unidentified product",
    capabilities: [],
    scopes: [],
    compatibility: "Vendor and official interface not identified",
    cost: "Unavailable · no configured provider",
    discovery: "Not identifiable; no lookup attempted",
    blocker: "Identify intended product, documented API and authorization first",
    docs: "",
    companion: false,
  },
] as const;
export const omniGoalExamples = [
  {
    label: "Accessible code",
    goal: "Review keyboard accessibility, propose a GitHub change and keep the code review independent.",
  },
  {
    label: "Scene pipeline",
    goal: "Prepare a Unity and Blender scene pipeline with reviewed outputs and a safe rollback proposal.",
  },
  {
    label: "Testnet research",
    goal: "Explain a future Solana testnet read-only status check; do not connect a wallet or submit transactions.",
  },
] as const;

// Entertainment Galaxy: authored metadata/templates only, no media accounts or devices.
export const entertainmentStudios = [
  {
    id: "film",
    name: "Film / Postproduction",
    mark: "01",
    focus: "Edit · VFX · color · captions",
    scopes: ["sample:metadata:read", "timeline:propose"],
    files: ["DEMO/timeline.json", "DEMO/captions.vtt"],
    checks: ["Frame count and caption timing", "Color transform and render review"],
    steps: [
      "Inspect sample media metadata",
      "Storyboard edit and VFX",
      "Plan color, caption and render QA",
    ],
    roles: ["Metadata curator", "Edit / VFX planner", "Color & caption reviewer"],
    compatibility: "24 fps sample · Rec.709 delivery proposal · real media not inspected",
  },
  {
    id: "music",
    name: "Music / Sound Lab",
    mark: "02",
    focus: "Stems · sessions · loudness · A/B",
    scopes: ["sample:audio:read", "mix:propose"],
    files: ["DEMO/stems.json", "DEMO/mix-notes.txt"],
    checks: ["Sample peak / RMS dBFS comparison", "Session, sample-rate and plug-in compatibility"],
    steps: [
      "Map declared stems and session",
      "Prepare synthetic A/B audition",
      "Plan loudness and plug-in regression QA",
    ],
    roles: ["Session curator", "Sound planner", "Audio QA reviewer"],
    compatibility: "Synthetic 48 kHz PCM tones · no real stems, plug-ins or LUFS measurement",
  },
  {
    id: "video",
    name: "AI Video Studio",
    mark: "03",
    focus: "Prompts · shots · rights · delivery",
    scopes: ["sample:prompt:read", "video:propose"],
    files: ["DEMO/shot-prompts.json", "DEMO/generation-plan.json"],
    checks: [
      "Prompt/likeness rights and provider policy",
      "Temporal continuity and artifact review",
    ],
    steps: [
      "Review sample prompt and likeness rights",
      "Prepare isolated generation request",
      "Plan continuity and output-rights QA",
    ],
    roles: ["Rights curator", "Video prompt planner", "Continuity reviewer"],
    compatibility: "Official API/provider/model to be chosen · no generation request sent",
  },
  {
    id: "camera",
    name: "Camera / Capture",
    mark: "04",
    focus: "Metadata · codec · timecode · color",
    scopes: ["sample:metadata:read", "capture:propose"],
    files: ["DEMO/capture-metadata.json", "DEMO/timecode-map.json"],
    checks: ["Codec, rate and timecode arithmetic", "Vendor/model-specific capability evidence"],
    steps: [
      "Inspect fictional capture metadata",
      "Plan codec, color and timecode conform",
      "Review vendor-specific control blockers",
    ],
    roles: ["Metadata curator", "Capture planner", "Device-consent reviewer"],
    compatibility:
      "Fictional camera profile · 24 fps non-drop · no camera discovery, recording or control",
  },
  {
    id: "virtual",
    name: "Virtual Production / 3D",
    mark: "05",
    focus: "Unity · Blender · scenes · render",
    scopes: ["sample:scene:read", "render:propose"],
    files: ["DEMO/scene-plan.json", "DEMO/render-budget.json"],
    checks: ["Version and licensed-asset compatibility", "Render outputs / resource limits"],
    steps: [
      "Pin proposed scene and asset versions",
      "Storyboard Unity / Blender handoff",
      "Plan isolated render and rollback QA",
    ],
    roles: ["Asset curator", "3D pipeline planner", "Render reviewer"],
    compatibility: "Unity / Blender reference workflows · signed authorized companion required",
  },
  {
    id: "crucible",
    name: "Media Code Crucible",
    mark: "06",
    focus: "Audio · video · render regressions",
    scopes: ["sample:metrics:read", "tests:propose"],
    files: ["DEMO/expected-metrics.json", "DEMO/regression-plan.json"],
    checks: ["Bounded sample-metric comparison", "Future independent decoder/render tests"],
    steps: [
      "Define expected numeric sample metrics",
      "Compare fictional candidate values",
      "Document regression and evidence gaps",
    ],
    roles: ["Test designer", "Numeric comparison planner", "Independent QA reviewer"],
    compatibility:
      "Arithmetic over entered DEMO numbers only · no media decoder, renderer or submitted code run",
  },
] as const;
export const entertainmentTemplates = [
  {
    id: "lunar",
    name: "Lunar Signal",
    studio: "film",
    goal: "Storyboard a 30-second fictional lunar short with three shots, original sound and caption QA.",
    format: "30 s · 24 fps · 720 frames",
    rights: "Original AI-generated prototype concept artwork; no third-party footage or likeness.",
  },
  {
    id: "sound",
    name: "Orbital Sound Study",
    studio: "music",
    goal: "Compare two synthetic tone levels and prepare a sample stem/session compatibility and mix review.",
    format: "2 s tones · 48 kHz PCM",
    rights: "Procedurally generated sine-tone samples; not music, mastered audio or user stems.",
  },
  {
    id: "stage",
    name: "Beyond the LED Wall",
    studio: "virtual",
    goal: "Plan a fictional Unity and Blender lunar scene with licensed-asset placeholders, render checkpoints and safe outputs.",
    format: "3 shots · editor versions TBD",
    rights:
      "Generated prototype concept still; no Unity project, Blender scene or vendor partnership.",
  },
] as const;
export const entertainmentAdapters = [
  {
    id: "planner",
    name: "Scene-to-Screen planner",
    studio: "all",
    state: "DEMO",
    capabilities: "Editable storyboard, scoped notes, local checkpoints",
    scope: "Non-sensitive sample plan only",
    compatibility: "Browser templates; no model or execution",
    cost: "No provider call",
    blocker: "Local records are editable and not confidential",
    docs: "",
  },
  {
    id: "adobe",
    name: "Adobe workflows",
    studio: "film",
    state: "NOT CONNECTED",
    capabilities: "Proposed timeline / VFX handoff",
    scope: "Selected project/asset permissions · future",
    compatibility: "Exact product/version and supported API not validated",
    cost: "License + compute unknown",
    blocker: "Owner grant, licensed software, supported adapter and tests",
    docs: "https://developer.adobe.com/",
  },
  {
    id: "resolve",
    name: "DaVinci Resolve",
    studio: "film",
    state: "NOT CONNECTED",
    capabilities: "Proposed timeline / color handoff",
    scope: "Selected project and output path · future",
    compatibility: "Installed edition/version/scripting support unverified",
    cost: "License + render compute unknown",
    blocker: "Licensed version, supported interface, approved companion and tests",
    docs: "https://www.blackmagicdesign.com/products/davinciresolve",
  },
  {
    id: "finalcut",
    name: "Final Cut Pro",
    studio: "film",
    state: "NOT CONNECTED",
    capabilities: "Proposed interchange review",
    scope: "Owner-selected exported timeline · future",
    compatibility: "FCPXML interchange reference, not remote editor control",
    cost: "License / local compute unknown",
    blocker: "Validated interchange version and explicit local authorization",
    docs: "https://developer.apple.com/documentation/professional-video-applications",
  },
  {
    id: "audio",
    name: "DAW / plug-in bridge",
    studio: "music",
    state: "NOT CONNECTED",
    capabilities: "Session/stem and plug-in manifest review",
    scope: "Declared session metadata only · future",
    compatibility: "DAW, plug-in formats, versions and licenses unconfigured",
    cost: "Per-product license unknown",
    blocker: "Owner-selected DAW, supported interface and signed companion",
    docs: "",
  },
  {
    id: "generation",
    name: "Official AI video API",
    studio: "video",
    state: "NOT CONNECTED",
    capabilities: "Permissioned prompt-to-video proposal",
    scope: "Explicit selected prompt/rights-cleared assets · future",
    compatibility: "Provider/model/interface/region not selected",
    cost: "USD per provider/model; rates unconfigured",
    blocker: "Secure owner credential custody, policy/rights and billed-use consent",
    docs: "",
  },
  {
    id: "distribution",
    name: "Video distribution",
    studio: "video",
    state: "NOT CONNECTED",
    capabilities: "Separate human-confirmed upload proposal",
    scope: "Selected destination and final asset · future",
    compatibility: "No platform/account selected; never implied by generation",
    cost: "Platform plan / fees unknown",
    blocker: "Separate account grant, rights/privacy review, final publication confirmation",
    docs: "",
  },
  {
    id: "camera",
    name: "Vendor-specific camera adapter",
    studio: "camera",
    state: "NOT CONNECTED",
    capabilities: "Future selected-model metadata/control design",
    scope: "Metadata and control require separate grants",
    compatibility: "No manufacturer/model/interface identified; no universal control",
    cost: "Hardware/license/transport unknown",
    blocker: "Supported vendor-specific adapter, OS grant, owner consent and device tests",
    docs: "",
  },
  {
    id: "unity",
    name: "Unity / virtual stage",
    studio: "virtual",
    state: "NOT CONNECTED",
    capabilities: "Pinned editor build/test reference",
    scope: "Exact selected project + isolated output · future",
    compatibility: "No editor detected; licensed pinned version required",
    cost: "License + compute unknown",
    blocker: "Signed companion, reviewed method, sandbox and independent tests",
    docs: "https://docs.unity3d.com/Manual/EditorCommandLineArguments.html",
  },
  {
    id: "blender",
    name: "Blender / render pipeline",
    studio: "virtual",
    state: "NOT CONNECTED",
    capabilities: "Reviewed scene/script render reference",
    scope: "Exact asset/script hashes + isolated output · future",
    compatibility: "No scene attached; pinned version and asset rights required",
    cost: "Compute unknown; no render",
    blocker: "Signed companion, script review, sandbox and independent tests",
    docs: "https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html",
  },
  {
    id: "runner",
    name: "Independent media test runner",
    studio: "crucible",
    state: "NOT CONNECTED",
    capabilities: "Future codec / render / audio regressions",
    scope: "Selected artifacts in isolated test sandbox · future",
    compatibility: "No decoder, runner or test evidence connected",
    cost: "CI / compute unknown",
    blocker: "Signed runner, artifact provenance and independent evidence",
    docs: "",
  },
] as const;

// Cartoon Galaxy: original fictional development samples, not cleared production IP.
export const cartoonSample = {
  title: "Pip & Moss: The Seedlight Voyages",
  audience: "6–9 + family",
  format: "2D cutout",
  logline:
    "A curious seed courier and a patient garden robot restore floating greenhouses through kindness and careful observation.",
  world:
    "The Seedlight Archipelago: small floating gardens, shared tools and warm lantern paths. No villains, weapons or unsafe imitable experiments.",
  rules:
    "Pip asks before borrowing. Moss never moves a garden without its caretaker. Conflicts resolve through repair, listening and teamwork.",
  learning:
    "Practice turn-taking and observation. Educational benefit is a creative goal, not an independently validated claim.",
  credit: "Fictional Evolution creator / generated concept reference",
  license:
    "Original authored fictional pitch and AI-generated prototype artwork. No imported character IP. Legal originality and distribution clearance unverified.",
  voices:
    "Uncast original voices; adult talent consent and license required. No cloned performer or child recording.",
  music: "Original score to be commissioned; no music imported or licensed yet.",
  characters: [
    {
      id: "pip",
      name: "Pip",
      personality: "Curious, generous and impatient; learns that waiting can be part of helping.",
      silhouette: "Round teal seed body, three gold leaves, coral satchel and amber boots.",
      continuity:
        "Three leaves in every angle; satchel strap from right shoulder to left hip; boots remain amber.",
      rig: "Proposed 2D cutout: body, leaves, face, satchel and boots. No rig file exists.",
    },
    {
      id: "moss",
      name: "Moss",
      personality: "Patient gardener robot; asks questions before offering solutions.",
      silhouette: "Tall square shoulders, gold body, coral limbs and transparent plant terrarium.",
      continuity: "Plant stays inside belly; coral forearms and shins; no human likeness.",
      rig: "Proposed 3D reference: separate limbs and terrarium mesh. Blender/Unity NOT CONNECTED.",
    },
  ],
} as const;
export const cartoonEpisodes = [
  {
    id: "lantern",
    title: "The Lantern That Needed a Nap",
    premise:
      "Pip tries to brighten every lantern at once; Moss suggests sharing one light and resting the garden.",
    beats: [
      "Pip finds a dim lantern beside a sleepy seedling.",
      "Pip and Moss compare light gently, without plugging in any real device.",
      "They share a warm lantern and let the garden rest.",
    ],
    duration: 12,
  },
  {
    id: "bridge",
    title: "The Little Bridge of Leaves",
    premise:
      "A garden path has a gap. Pip asks the caretakers for help instead of borrowing their leaves without permission.",
    beats: [
      "A missing stepping stone pauses the seed delivery.",
      "The caretakers offer fallen leaves; Pip and Moss plan a pretend bridge together.",
      "Everyone crosses only in the fictional story and celebrates asking first.",
    ],
    duration: 10,
  },
] as const;
export const cartoonReviewChecks = [
  { id: "originality", label: "Original character and series design reviewed" },
  { id: "provenance", label: "Source provenance, creator credits and license gaps reviewed" },
  { id: "voice", label: "No performer impersonation; voice and music rights reviewed" },
  { id: "age", label: "Age suitability and imitable-behavior risks reviewed" },
  { id: "privacy", label: "No child personal data, recordings or behavioral profiling" },
  { id: "inclusive", label: "Inclusive storytelling and educational claim limits reviewed" },
  { id: "technical", label: "Continuity, captions, timing and unrun technical checks reviewed" },
] as const;

export const demoProposals = [
  { id: "P-104", t: "Reduce bundle size 18%", p: "Nebula UI Kit", s: "Awaiting approval" },
  { id: "P-105", t: "Focus-visible ring tokens", p: "Nebula UI Kit", s: "In sandbox" },
  { id: "P-158", t: "Staged firmware rollout", p: "Helios Sensor Mesh", s: "Guardian review" },
  { id: "P-181", t: "Pin container digests", p: "OpenGenome Pipelines", s: "Approved" },
];

export const conceptExamples = [
  {
    label: "Sensor network",
    concept:
      "An opt-in solar sensor mesh that detects equipment faults locally, shares anonymized findings with consenting owners, and rolls out signed firmware updates without interrupting monitoring.",
    goal: "Validate reliability with intermittent connectivity and protect owner telemetry.",
  },
  {
    label: "Research agent",
    concept:
      "A consenting research agent that maps public materials-science papers to open simulation code, tracks attribution, and proposes reproducible experiments for creators to review.",
    goal: "Make every proposed experiment reproducible and every research claim verifiable.",
  },
  {
    label: "Accessible software",
    concept:
      "A creator-owned React component library that detects accessibility issues and proposes shared design-token improvements while keeping each project's changes manually approved and reversible.",
    goal: "Improve keyboard access without regressions or automatic production changes.",
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

export const feed = [
  {
    id: 1,
    author: "@aria.dev",
    mode: "Public" as const,
    title: "Shared token system for accessible focus states",
    body: "Proposing a cross-project focus-ring token spec. Attribution requested on reuse.",
    tags: ["Software", "A11y"],
    sparks: 42,
  },
  {
    id: 2,
    author: "@atlas.ai (consenting agent)",
    mode: "Public" as const,
    title: "Linking plasma papers to open solvers",
    body: "Mapped 31 public papers to 4 open repos. Suggest a shared benchmark suite.",
    tags: ["Science", "AI Agents"],
    sparks: 27,
  },
  {
    id: 3,
    author: "@solaris",
    mode: "Invite-only" as const,
    title: "Staged firmware rollout pattern",
    body: "10% → 50% → 100% with automatic rollback on telemetry regression.",
    tags: ["Devices"],
    sparks: 18,
  },
  {
    id: 4,
    author: "@moonlab",
    mode: "Public" as const,
    title: "Regolith simulation dataset index",
    body: "Indexing public references only. Looking for collaborators on material models.",
    tags: ["Space", "Science"],
    sparks: 33,
  },
  {
    id: 5,
    author: "@bioforge",
    mode: "Private" as const,
    title: "Reproducible container recipes",
    body: "Visible only to project members. Shown here as a concept preview.",
    tags: ["Science"],
    sparks: 6,
  },
];

export const agents = [
  { name: "Sentinel", role: "Code review", consent: "Granted", scope: "Propose only", trust: 94 },
  {
    name: "Atlas",
    role: "Research mapping",
    consent: "Granted",
    scope: "Read public refs",
    trust: 89,
  },
  { name: "Forge", role: "Test generation", consent: "Pending", scope: "Sandbox only", trust: 71 },
  {
    name: "Sabrina",
    role: "Angel Tech marketing intelligence",
    consent: "Pending",
    scope: "Local drafts only · no outreach",
    trust: 50,
  },
  { name: "Echo", role: "Docs writer", consent: "Revoked", scope: "—", trust: 60 },
];

export const guardianAlerts = [
  {
    id: "G-311",
    level: "info",
    title: "Update package evo-pkg-0.4.1 awaiting owner approval",
    detail: "Signature verified. Sandbox: 248/248 tests passed.",
    action: "approve",
  },
  {
    id: "G-312",
    level: "warn",
    title: "Agent 'Forge' requested write scope",
    detail: "Request exceeds sandbox-only policy. Owner decision required.",
    action: "deny",
  },
  {
    id: "G-313",
    level: "critical",
    title: "Unsigned package blocked by Immune System",
    detail: "Quarantined automatically. No changes applied.",
    action: "acknowledge",
  },
  {
    id: "G-314",
    level: "info",
    title: "Rollback snapshot snap_7f3a ready",
    detail: "Restores Nebula UI Kit to v2.3.0 state.",
    action: "rollback",
  },
] as const;

export const permissions = [
  { scope: "Read repository: nebula-ui", granted: true },
  { scope: "Open pull-request proposals", granted: true },
  { scope: "Run sandbox experiments", granted: true },
  { scope: "Apply updates without approval", granted: false },
  { scope: "Access production secrets", granted: false },
];

// Code Exchange examples contain executable original snippets, NOT integrated repos.
// People, reviews, outcomes and project compatibility below are fictional demo records.
export type ExchangeLocale = "en" | "es";
export type LocalizedText = Record<ExchangeLocale, string>;
export type ExchangeState =
  "Proposed" | "Researching" | "In Review" | "Tested" | "Approved" | "Released";
export interface CodeContribution {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  compatibility: LocalizedText;
  industry: "Banking" | "Image processing" | "Privacy" | "Accessibility" | "Developer tooling";
  language: "TypeScript" | "Python" | "JavaScript";
  readiness: "Sandbox only" | "Review ready" | "Experimental";
  license: "MIT" | "Apache-2.0";
  authorType: "Human" | "AI-assisted";
  author: string;
  operator?: string;
  agent?: string;
  reviewers: { name: string; note: LocalizedText }[];
  state: ExchangeState;
  risk: "Low" | "Medium" | "High";
  security: LocalizedText;
  version: string;
  filename: string;
  code: string;
  tests: { name: LocalizedText; procedure: LocalizedText }[];
  dependencies: string[];
  rollback: LocalizedText;
  changelog: LocalizedText[];
  reference: { repository: string; commit: string; license: string; purpose: LocalizedText };
}
const text = (en: string, es: string): LocalizedText => ({ en, es });
export const exchangeStates: ExchangeState[] = [
  "Proposed",
  "Researching",
  "In Review",
  "Tested",
  "Approved",
  "Released",
];
export const codeContributions: CodeContribution[] = [
  {
    id: "sandbox-transfer",
    title: text("Replay-safe transfer validation", "Validación de transferencias sin repetición"),
    description: text(
      "Checks a synthetic transfer request before it reaches a sandbox. Rejects invalid amounts and flags an already-used request key. It does not move money or replace a banking security system.",
      "Comprueba una transferencia ficticia antes de llegar al entorno de pruebas. Rechaza importes inválidos y claves usadas. No mueve dinero ni sustituye la seguridad bancaria.",
    ),
    compatibility: text(
      "TypeScript runtimes with a caller-supplied Set. A real banking API needs authenticated callers, durable atomic idempotency, authorization, rate limits and an independent security audit. No production-bank compatibility is certified.",
      "Requiere TypeScript y un Set proporcionado por el llamador. Una API real necesita autenticación, idempotencia atómica persistente, autorización, límites y auditoría. No hay compatibilidad bancaria certificada.",
    ),
    industry: "Banking",
    language: "TypeScript",
    readiness: "Sandbox only",
    license: "Apache-2.0",
    authorType: "Human",
    author: "Maya Chen",
    state: "In Review",
    risk: "High",
    version: "0.1.0",
    filename: "validate-transfer.ts",
    security: text(
      "Sandbox pattern only. The in-memory Set cannot prevent cross-process races and is not an audit ledger. Never send real accounts, credentials or funds to this sample.",
      "Solo para pruebas. El Set en memoria no evita carreras entre procesos ni es un registro de auditoría. No use cuentas, credenciales o fondos reales.",
    ),
    code: `export function validateTransfer(request: { amountCents: number; requestKey: string }, seen: Set<string>) {
  if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0) {
    return { accepted: false, reason: "invalid_amount" };
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(request.requestKey)) {
    return { accepted: false, reason: "invalid_key" };
  }
  if (seen.has(request.requestKey)) return { accepted: false, reason: "duplicate" };
  seen.add(request.requestKey);
  return { accepted: true, reason: "sandbox_only" };
}`,
    reviewers: [
      {
        name: "Jonah Patel",
        note: text(
          "Use a transactional store before any real financial workflow. Demo review, not an audit.",
          "Use almacenamiento transaccional antes de operar con dinero. Revisión demo, no auditoría.",
        ),
      },
    ],
    tests: [
      {
        name: text("Reject invalid amounts", "Rechazar importes inválidos"),
        procedure: text(
          "Try zero, negative, fractional and unsafe integer amounts; expect invalid_amount.",
          "Pruebe cero, negativos, fracciones y enteros inseguros; espere invalid_amount.",
        ),
      },
      {
        name: text("Reject replay in one sandbox", "Rechazar repetición en una prueba"),
        procedure: text(
          "Submit the same valid key twice to one Set; accept once, reject once. Cross-process protection is out of scope.",
          "Envíe la misma clave dos veces al mismo Set; acepte una y rechace otra. La protección entre procesos queda fuera del alcance.",
        ),
      },
    ],
    dependencies: ["TypeScript standard library · no third-party dependencies"],
    rollback: text(
      "Remove the sandbox validator and restore the prior request handler. Preserve any real audit records outside this example.",
      "Quite el validador de prueba y restaure el manejador anterior. Conserve los registros reales fuera de este ejemplo.",
    ),
    changelog: [
      text(
        "0.1.0 · Added integer amount and replay-key checks; no money movement.",
        "0.1.0 · Validación de importes enteros y claves repetidas; sin movimiento de dinero.",
      ),
    ],
    reference: {
      repository: "OWASP/CheatSheetSeries",
      commit: "c366393214da5ae186a7a06a27dade7617987304",
      license: "CC-BY-SA-4.0",
      purpose: text(
        "Public security documentation for independent evaluation; not the source of this original snippet.",
        "Documentación pública de seguridad para evaluación independiente; no es el origen del fragmento.",
      ),
    },
  },
  {
    id: "image-contrast",
    title: text("Bounded grayscale contrast", "Contraste limitado de escala de grises"),
    description: text(
      "Adjusts a small list of grayscale pixel values and clamps output to 0–255. No camera is accessed, no images are uploaded, and no image-quality improvement is claimed.",
      "Ajusta una lista pequeña de píxeles y limita la salida a 0–255. No accede a cámaras, sube imágenes ni afirma mejoras de calidad.",
    ),
    compatibility: text(
      "Python 3.11+; accepts integer grayscale samples, not RGB frames or encoded files. A camera pipeline needs format conversion, memory limits and measured quality/latency tests.",
      "Python 3.11+; admite enteros en escala de grises, no RGB ni archivos codificados. Una cámara necesita conversión, límites de memoria y mediciones de calidad y latencia.",
    ),
    industry: "Image processing",
    language: "Python",
    readiness: "Experimental",
    license: "MIT",
    authorType: "AI-assisted",
    author: "Luis Ortega",
    operator: "Luis Ortega",
    agent: "Lens Lab · demo agent",
    state: "Proposed",
    risk: "Medium",
    version: "0.2.0",
    filename: "contrast.py",
    security: text(
      "Only small in-memory samples. Bound frame sizes in a real pipeline and strip private image metadata before sharing. AI operator identity is fictional and unverified.",
      "Solo muestras pequeñas en memoria. Limite el tamaño de las imágenes reales y quite metadatos privados. El operador de IA es ficticio y no verificado.",
    ),
    code: `import math

def adjust_contrast(pixels, factor=1.0):
    if not isinstance(factor, (int, float)) or isinstance(factor, bool) or not math.isfinite(factor) or not 0 <= factor <= 4:
        raise ValueError("factor must be finite and between 0 and 4")
    result = []
    for value in pixels:
        if type(value) is not int or not 0 <= value <= 255:
            raise ValueError("pixels must be integers between 0 and 255")
        adjusted = round((value - 128) * factor + 128)
        result.append(max(0, min(255, adjusted)))
    return result`,
    reviewers: [
      {
        name: "Amara Okafor",
        note: text(
          "Check the target camera's histogram and noise. No quality benchmark has been run here.",
          "Revise histograma y ruido de la cámara. Aquí no se ha medido la calidad.",
        ),
      },
    ],
    tests: [
      {
        name: text("Pixel bounds", "Límites de píxeles"),
        procedure: text(
          "Pass [0, 128, 255] with factor 2; expect [0, 128, 255]. Reject out-of-range pixels and non-finite factors.",
          "Pruebe [0, 128, 255] con factor 2; espere [0, 128, 255]. Rechace píxeles fuera de rango y factores no finitos.",
        ),
      },
    ],
    dependencies: ["Python standard library · math · no third-party dependencies"],
    rollback: text(
      "Restore the original pixel-processing stage and compare a local reference image before reuse.",
      "Restaure el procesamiento anterior y compare una imagen local de referencia antes de reutilizar.",
    ),
    changelog: [
      text(
        "0.2.0 · Finite-factor validation and output bounds added.",
        "0.2.0 · Validación de factor finito y límites de salida.",
      ),
    ],
    reference: {
      repository: "python-pillow/Pillow",
      commit: "1ee8db96376c1e63f90dae7b8bef071ede6c4b80",
      license: "MIT-CMU",
      purpose: text(
        "Public image-processing reference. Pillow is not imported; this sample is original and does not reproduce Pillow code.",
        "Referencia pública de procesamiento de imágenes. No se importa Pillow; el ejemplo es original.",
      ),
    },
  },
  {
    id: "private-events",
    title: text("Allowlisted event payloads", "Eventos con campos permitidos"),
    description: text(
      "Builds a new telemetry object containing only an event name and duration. Unknown fields are dropped rather than copied. Nothing is sent to a telemetry provider.",
      "Crea un objeto con solo el nombre del evento y su duración. Descarta otros campos. No envía nada a un proveedor.",
    ),
    compatibility: text(
      "TypeScript applications with a known event vocabulary. This reduces accidental field exposure; it is not anonymization, consent collection, encryption or regulatory certification.",
      "Aplicaciones TypeScript con vocabulario conocido. Reduce exposición accidental; no anonimiza ni obtiene consentimiento, cifra o certifica cumplimiento.",
    ),
    industry: "Privacy",
    language: "TypeScript",
    readiness: "Review ready",
    license: "MIT",
    authorType: "Human",
    author: "Amara Okafor",
    state: "Tested",
    risk: "Medium",
    version: "0.1.1",
    filename: "safe-event.ts",
    security: text(
      "Allowlisting is only one layer. Event timing can still reveal behavior; retention, consent and threat modeling remain required.",
      "La lista permitida es solo una capa. Los tiempos pueden revelar comportamiento; aún se necesitan retención, consentimiento y análisis de amenazas.",
    ),
    code: `export function safeEvent(input: Record<string, unknown>) {
  const allowed = ["page_view", "action_completed"];
  if (typeof input.event !== "string" || !allowed.includes(input.event)) {
    throw new Error("unsupported_event");
  }
  const durationMs = typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs)) : 0;
  return { event: input.event, durationMs };
}`,
    reviewers: [
      {
        name: "Maya Chen",
        note: text(
          "Consider coarsening timings. Tested is a simulated board state, not a privacy certification.",
          "Considere agrupar tiempos. Tested es un estado simulado, no certificación de privacidad.",
        ),
      },
    ],
    tests: [
      {
        name: text("Drop identifying fields", "Descartar datos identificadores"),
        procedure: text(
          "Include email, token and unknown properties; output must contain only event and durationMs. Reject unsupported events.",
          "Incluya correo, token y campos desconocidos; la salida solo debe tener event y durationMs. Rechace eventos no admitidos.",
        ),
      },
    ],
    dependencies: ["TypeScript standard library · no third-party dependencies"],
    rollback: text(
      "Disable this telemetry path entirely until the previous privacy-reviewed schema is restored; do not re-enable raw payload logging.",
      "Desactive estos eventos hasta restaurar el esquema anterior revisado; no reactive registros sin filtrar.",
    ),
    changelog: [
      text(
        "0.1.1 · Closed event vocabulary; no network transport.",
        "0.1.1 · Vocabulario cerrado; sin transporte de red.",
      ),
    ],
    reference: {
      repository: "OWASP/CheatSheetSeries",
      commit: "c366393214da5ae186a7a06a27dade7617987304",
      license: "CC-BY-SA-4.0",
      purpose: text(
        "Public privacy/security reference, separate from the original sample's MIT license.",
        "Referencia pública de privacidad y seguridad, separada de la licencia MIT del ejemplo original.",
      ),
    },
  },
  {
    id: "keyboard-navigation",
    title: text("Predictable keyboard selection", "Selección predecible por teclado"),
    description: text(
      "Calculates the next selected index for arrow, Home and End keys. It is a small building block for an accessible list, not a complete accessibility solution.",
      "Calcula la siguiente selección con flechas, Inicio y Fin. Es una parte de una lista accesible, no una solución completa.",
    ),
    compatibility: text(
      "TypeScript UI frameworks. The host must manage focus, semantic roles, aria-selected, announcements and disabled items, and test with keyboard and screen readers.",
      "Interfaces TypeScript. La aplicación debe gestionar foco, roles, aria-selected, anuncios y elementos desactivados, y probar teclado y lectores de pantalla.",
    ),
    industry: "Accessibility",
    language: "TypeScript",
    readiness: "Review ready",
    license: "MIT",
    authorType: "AI-assisted",
    author: "Aria Morgan",
    operator: "Aria Morgan",
    agent: "Echo · demo agent",
    state: "In Review",
    risk: "Low",
    version: "0.3.0",
    filename: "next-index.ts",
    security: text(
      "This helper does not certify accessibility. Keep focus visible and verify the full interaction with assistive technology.",
      "No certifica accesibilidad. Mantenga foco visible y pruebe la interacción completa con tecnología de asistencia.",
    ),
    code: `export function nextIndex(current: number, count: number, key: string) {
  if (!Number.isInteger(count) || count < 0) throw new Error("invalid_count");
  if (count === 0) return -1;
  const start = Number.isInteger(current) ? Math.max(0, Math.min(count - 1, current)) : 0;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (start + 1) % count;
  if (key === "ArrowUp") return (start - 1 + count) % count;
  return start;
}`,
    reviewers: [
      {
        name: "Kenji Sato",
        note: text(
          "Define the parent widget's focus model before adoption. Agent approval is not a human approval gate.",
          "Defina el modelo de foco antes de adoptar. La aprobación de un agente no sustituye a la humana.",
        ),
      },
    ],
    tests: [
      {
        name: text("Navigation boundaries", "Límites de navegación"),
        procedure: text(
          "Check wraparound, Home/End, empty lists and invalid counts. A full screen-reader test is still planned.",
          "Pruebe extremos, Inicio/Fin, listas vacías y cantidades inválidas. La prueba completa con lector de pantalla sigue pendiente.",
        ),
      },
    ],
    dependencies: ["TypeScript standard library · no third-party dependencies"],
    rollback: text(
      "Restore the former keyboard handler and recheck focus order; no project files are modified by this preview.",
      "Restaure el manejador anterior y revise el orden del foco; esta vista no modifica archivos del proyecto.",
    ),
    changelog: [
      text(
        "0.3.0 · Added empty-list handling and Home/End selection.",
        "0.3.0 · Listas vacías y selección con Inicio/Fin.",
      ),
    ],
    reference: {
      repository: "mdn/content",
      commit: "05c1aed375bab88f322b15319e45fb326e4a341c",
      license: "CC-BY-SA 2.5+ prose · CC0/MIT samples (see source)",
      purpose: text(
        "Public keyboard and accessibility documentation. No MDN code was copied into this original sample.",
        "Documentación pública de teclado y accesibilidad. El ejemplo original no copia código de MDN.",
      ),
    },
  },
  {
    id: "dependency-ledger",
    title: text("Dependency license inventory", "Inventario de licencias de dependencias"),
    description: text(
      "Summarizes declared dependency versions and license labels from a supplied object. Missing licenses are marked UNKNOWN for human investigation; there is no package registry scan.",
      "Resume versiones y licencias declaradas de un objeto. Marca UNKNOWN cuando faltan licencias para revisión humana; no consulta registros de paquetes.",
    ),
    compatibility: text(
      "Modern JavaScript, browsers or server runtimes. Callers must supply the inventory. Declared license strings are not a legal clearance or transitive-dependency audit.",
      "JavaScript moderno en navegador o servidor. El llamador aporta el inventario. Las licencias declaradas no son aprobación legal ni auditoría transitiva.",
    ),
    industry: "Developer tooling",
    language: "JavaScript",
    readiness: "Review ready",
    license: "Apache-2.0",
    authorType: "Human",
    author: "Kenji Sato",
    state: "Approved",
    risk: "Low",
    version: "0.1.0",
    filename: "license-inventory.js",
    security: text(
      "Do not execute package scripts to collect metadata. Approved is a fictional demo state; licenses and dependencies still require a real human review.",
      "No ejecute scripts para recopilar metadatos. Approved es un estado demo ficticio; se requiere revisión real de licencias y dependencias.",
    ),
    code: `export function licenseInventory(packages) {
  return Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, metadata]) => ({
      name,
      version: typeof metadata?.version === "string" ? metadata.version : "UNKNOWN",
      license: typeof metadata?.license === "string" && metadata.license.trim()
        ? metadata.license.trim() : "UNKNOWN",
    }));
}`,
    reviewers: [
      {
        name: "Luis Ortega",
        note: text(
          "Demo approval of the concept only. Review full license texts and transitive dependencies before reuse.",
          "Aprobación demo del concepto. Revise textos completos y dependencias transitivas antes de reutilizar.",
        ),
      },
    ],
    tests: [
      {
        name: text("Unknown license gate", "Control de licencias desconocidas"),
        procedure: text(
          "Omit a license and version; expect UNKNOWN rather than invented values. Check deterministic name sorting.",
          "Omita licencia y versión; espere UNKNOWN, no valores inventados. Compruebe el orden por nombre.",
        ),
      },
    ],
    dependencies: ["JavaScript standard library · no third-party dependencies"],
    rollback: text(
      "Remove the inventory helper and restore the prior approved dependency list. No dependency is installed by this sample.",
      "Quite el ayudante y restaure el inventario aprobado anterior. El ejemplo no instala dependencias.",
    ),
    changelog: [
      text(
        "0.1.0 · Sorted inventory and explicit UNKNOWN license labels.",
        "0.1.0 · Inventario ordenado y licencias UNKNOWN explícitas.",
      ),
    ],
    reference: {
      repository: "mdn/content",
      commit: "05c1aed375bab88f322b15319e45fb326e4a341c",
      license: "CC-BY-SA 2.5+ prose · CC0/MIT samples (see source)",
      purpose: text(
        "Public JavaScript documentation; original sample, not an MDN contribution or partnership.",
        "Documentación pública de JavaScript; ejemplo original, no contribución a MDN ni asociación.",
      ),
    },
  },
];

// Genesis seeds are fictional examples, never accounts, funded bounties or activity.
export const genesisDomains = [
  "Accessibility",
  "Privacy",
  "Image processing",
  "Developer tooling",
  "Energy",
  "Banking",
] as const;
export const genesisRoles = ["Explorer", "Researcher", "Critic", "Architect", "Builder"] as const;
export const genesisScopes = ["submit_capsules", "simulate_twins", "review_proposals"] as const;
// Lounge items are free symbolic UI choices, not physical drinks or services.
export const loungeDrinks = [
  { id: "starlight", name: "Starlight Spritz", note: "A toast to a well-defined problem" },
  { id: "nebula", name: "Nebula Tea", note: "A quiet moment before the next hypothesis" },
  { id: "zero", name: "Zero-Gravity Water", note: "Clear assumptions. No hidden ingredients." },
] as const;
export const loungePrompts = [
  "What useful problem would you like to explore?",
  "What evidence would change your mind?",
  "Which permission should always stay off?",
] as const;
export const genesisChallenges = [
  {
    id: "challenge-focus",
    title: "Make keyboard navigation predictable",
    domain: "Accessibility" as const,
    problem:
      "Design a documented selection pattern that handles empty lists and wraparound without losing visible focus.",
    acceptance:
      "Document arrow, Home and End behavior; provide a reproducible test plan and full-widget accessibility limitations.",
    ownerName: "Fictional demo challenge sponsor",
    visibility: "Open" as const,
    bountyUsd: 500,
    funding: "DEMO_PROPOSAL" as const,
    state: "Open" as const,
    createdAt: "2026-10-20T00:00:00.000Z",
    ownerId: null,
    demo: true as const,
    contributionId: "keyboard-navigation",
  },
  {
    id: "challenge-privacy",
    title: "Reduce accidental telemetry exposure",
    domain: "Privacy" as const,
    problem:
      "Create an allowlisted event capsule that never carries account identifiers or secrets.",
    acceptance:
      "Document allowed fields, retention assumptions, threat model and tests rejecting unsupported events.",
    ownerName: "Fictional demo challenge sponsor",
    visibility: "Private" as const,
    bountyUsd: null,
    funding: "DEMO_PROPOSAL" as const,
    state: "Open" as const,
    createdAt: "2026-10-20T00:00:00.000Z",
    ownerId: null,
    demo: true as const,
    contributionId: "private-events",
  },
  {
    id: "challenge-camera",
    title: "Bound an image-processing pipeline",
    domain: "Image processing" as const,
    problem:
      "Propose a bounded grayscale transformation with explicit latency and memory budgets. No camera connection.",
    acceptance:
      "Identify pixel bounds, invalid inputs, format limitations and a future hardware benchmark procedure.",
    ownerName: "Fictional demo challenge sponsor",
    visibility: "Open" as const,
    bountyUsd: 750,
    funding: "DEMO_PROPOSAL" as const,
    state: "Open" as const,
    createdAt: "2026-10-20T00:00:00.000Z",
    ownerId: null,
    demo: true as const,
    contributionId: "image-contrast",
  },
];
export const genesisTrustRules = [
  {
    key: "provenance",
    title: "Traceable provenance",
    requirement:
      "Named human author or responsible operator, versioned source and rights declaration.",
    limitation:
      "Names and links are self-declared; identity and source ownership are not verified.",
  },
  {
    key: "license",
    title: "License and author rights",
    requirement: "Declared capsule license, dependency inventory and permission to share.",
    limitation: "Declarations are not legal clearance; independent license review is required.",
  },
  {
    key: "tests",
    title: "Reproducible evidence",
    requirement: "Configuration, baseline, benchmark target, model version and test procedure.",
    limitation: "Synthetic model results are not execution of submitted code or hardware evidence.",
  },
  {
    key: "approval",
    title: "Independent human decision",
    requirement:
      "Reviewer distinct from submitting identity, documented decision and rollback plan.",
    limitation:
      "Local identities are not authenticated; demo decisions confer no certification or release authority.",
  },
];
export const genesisComputeArchitecture = [
  "Explicit node-owner opt-in",
  "Authenticated, revocable project grants",
  "Signed allowlisted task artifact",
  "Isolated runner with no host credentials",
  "Egress allowlist and resource limits",
  "USD spend cap and owner approval",
  "Provenance-bound result and audit log",
];

// CARE inventory is fictional. Published release references are historical, not live catalog matches.
export const careModules = [
  {
    id: "care",
    name: "Evolution CARE",
    description: "Read-only inventory and virtual storage review",
    permission: "Future local inventory grant",
  },
  {
    id: "updates",
    name: "Update Engine",
    description: "Trusted-source checks and dry-run plans",
    permission: "Future metadata access; installation separate",
  },
  {
    id: "guardian",
    name: "Guardian",
    description: "Review gates and visible pause controls",
    permission: "No monitoring in this demo",
  },
  {
    id: "pilot",
    name: "Evolution Pilot",
    description: "Scoped, user-approved action previews",
    permission: "Future screen / accessibility / browser grants",
  },
  {
    id: "voice",
    name: "Mothership Voice",
    description: "Original persona and private push-to-talk concept",
    permission: "Future microphone consent; none requested",
  },
  {
    id: "developer",
    name: "Developer tools",
    description: "Read-only CLI and adapter architecture reference",
    permission: "No shell or commands executed",
  },
] as const;
export const careDevices = [
  {
    id: "mac-demo",
    name: "Demo creative workstation",
    os: "macOS",
    architecture: "arm64",
    platform: "Homebrew",
    diskUsedGb: 268,
    diskTotalGb: 512,
    memoryUsedGb: 9,
    memoryTotalGb: 16,
    cpuPercent: 23,
    backup: "Unknown · not checked",
    sampleAt: "2026-10-20T00:00:00.000Z",
  },
  {
    id: "win-demo",
    name: "Demo developer PC",
    os: "Windows",
    architecture: "x64",
    platform: "winget",
    diskUsedGb: 710,
    diskTotalGb: 1024,
    memoryUsedGb: 14,
    memoryTotalGb: 32,
    cpuPercent: 41,
    backup: "Unknown · not checked",
    sampleAt: "2026-10-20T00:00:00.000Z",
  },
  {
    id: "linux-demo",
    name: "Demo research node",
    os: "Linux",
    architecture: "x64",
    platform: "apt / dnf",
    diskUsedGb: 92,
    diskTotalGb: 256,
    memoryUsedGb: 3,
    memoryTotalGb: 8,
    cpuPercent: 12,
    backup: "Unknown · not checked",
    sampleAt: "2026-10-20T00:00:00.000Z",
  },
] as const;
export const careStorage = [
  {
    id: "temp",
    path: "SAMPLE:/Temp/export-preview.tmp",
    sizeMb: 240,
    kind: "Temporary preview",
    reason: "Fictional temporary export; owner and app review required",
    reversible: "Not assessed · no restore promise",
    locked: false,
    protected: false,
  },
  {
    id: "cache",
    path: "SAMPLE:/Cache/image-thumbnails",
    sizeMb: 640,
    kind: "App cache",
    reason: "Regeneration may use bandwidth and time; use app-supported cleanup only",
    reversible: "Not assessed",
    locked: true,
    protected: true,
  },
  {
    id: "document",
    path: "SAMPLE:/Documents/design-notes.pdf",
    sizeMb: 18,
    kind: "Personal document",
    reason: "Protected personal content · excluded from cleanup",
    reversible: "Never moved or deleted",
    locked: false,
    protected: true,
  },
  {
    id: "backup",
    path: "SAMPLE:/Backups/project-archive",
    sizeMb: 4096,
    kind: "Backup",
    reason: "Protected backup · do not infer redundant data",
    reversible: "Never moved or deleted",
    locked: false,
    protected: true,
  },
] as const;
export const carePilotScopes = [
  "Screen inspection",
  "Mouse actions",
  "Browser inspection",
] as const;
export const careVoices = [
  {
    id: "navigator",
    name: "Mothership Navigator",
    line: "The next step is yours. I can prepare a plan for your review.",
    description: "Measured, precise and quietly optimistic",
  },
  {
    id: "steward",
    name: "Mothership Steward",
    line: "Your files stay where they are. We review before we change.",
    description: "Warm, reassuring and consent-first",
  },
  {
    id: "analyst",
    name: "Mothership Analyst",
    line: "The evidence is incomplete. This proposal needs verification.",
    description: "Clear, evidence-led and direct",
  },
] as const;

export const careUpdates = [
  {
    id: "git",
    name: "Git",
    vendor: "Git project",
    installed: "2.45.0",
    available: "2.45.1",
    released: "2024-05-14",
    risk: "Medium",
    category: "Developer tool",
    source: "https://github.com/git/git/blob/v2.45.1/Documentation/RelNotes/2.45.1.txt",
    changelog:
      "Security fixes for CVE-2024-32002, 32004, 32020, 32021 and 32465 in cloning and submodule handling.",
    compatibility:
      "Hardening may change untrusted repository workflows. Platform, filesystem and packaging need independent validation.",
    signatures:
      "Upstream source archive provides detached signature; no binary or signer verified here.",
    rollback:
      "Prior package availability and retained configuration required; no guaranteed downgrade or data restore.",
    dependency: "Package-manager dependencies and filesystem behavior need review.",
    tests: "Future clone/submodule regression tests, source provenance and local workflow checks.",
    size: "Unknown · no package fetched",
    downtime: "Unknown · check active Git jobs",
    platforms: ["macOS", "Windows", "Linux"],
  },
  {
    id: "python",
    name: "Python",
    vendor: "Python Software Foundation",
    installed: "3.12.3",
    available: "3.12.4",
    released: "2024-06-06",
    risk: "Medium",
    category: "Runtime",
    source: "https://www.python.org/downloads/release/python-3124/",
    changelog:
      "Windows directory-permission fix for CVE-2024-4030; bundled libexpat 2.6.2 and interpreter fixes.",
    compatibility:
      "Validate native extensions and virtual environments. Windows permission behavior and bundled libraries vary by build.",
    signatures:
      "Upstream artifacts list OpenPGP / Sigstore evidence; verification has not been performed.",
    rollback:
      "Environment snapshot and prior supported installer required; application migrations are not undone.",
    dependency:
      "Native extensions, interpreter pinning and libexpat build provenance require checks.",
    tests:
      "Future environment, extension and application regression checks; none run in this demo.",
    size: "Unknown · no package fetched",
    downtime: "Unknown · active interpreters need review",
    platforms: ["macOS", "Windows", "Linux"],
  },
  {
    id: "curl",
    name: "curl",
    vendor: "curl project",
    installed: "8.10.0",
    available: "8.10.1",
    released: "2024-09-18",
    risk: "Low",
    category: "Network tool",
    source: "https://curl.se/ch/8.10.1.html",
    changelog:
      "HTTP/2 upload end-of-stream, connection timing and rustls cipher-selection fixes; rustls-ffi 0.14.0.",
    compatibility:
      "TLS/backend and HTTP/2 configuration must be tested; distributor builds may differ. Not a blanket low-risk guarantee.",
    signatures:
      "Official source release provides detached signatures; no downloaded artifact, hash or signer verified.",
    rollback:
      "Prior supported package and dependencies must remain available; no guaranteed system rollback.",
    dependency:
      "TLS backend and rustls-ffi when applicable; distro-patched versions may not match upstream.",
    tests: "Future HTTP/2, TLS and application compatibility checks; no execution here.",
    size: "Unknown · no package fetched",
    downtime: "Unknown · active network tasks need review",
    platforms: ["macOS", "Windows", "Linux"],
  },
] as const;
export const careAdapters = [
  {
    os: "macOS / Homebrew",
    command:
      "HOMEBREW_NO_AUTO_UPDATE=1 brew list --versions\nHOMEBREW_NO_AUTO_UPDATE=1 brew outdated --json=v2",
    source: "https://docs.brew.sh/Manpage",
    notes:
      "Formulae/casks only, not whole-device inventory. Cached indexes may be stale. Hashes are not publisher signatures; verify notarization separately. Kegs/casks do not guarantee rollback.",
  },
  {
    os: "Windows / winget",
    command: "winget list\nwinget list --upgrade-available",
    source: "https://learn.microsoft.com/en-us/windows/package-manager/winget/list",
    notes:
      "Matching and version detection can be incomplete. Source refresh may use network or ask for agreements. Installer hashes are not Authenticode publisher checks. Never bypass either; downgrade support varies.",
  },
  {
    os: "Linux / APT",
    command: "apt list --installed\napt list --upgradable",
    source: "https://manpages.debian.org/bookworm/apt/apt.8.en.html",
    notes:
      "Existing indexes only; do not run apt update during inventory-only consent. For automation prefer dedicated APT APIs. Signed repository metadata and hashes authenticate packages, not individual package signatures. Downgrades do not reverse data migrations.",
  },
  {
    os: "Linux / DNF 4",
    command: "dnf --cacheonly list --installed\ndnf --cacheonly check-update",
    source: "https://dnf.readthedocs.io/en/stable/command_ref.html",
    notes:
      "Detect DNF 4 vs 5 before selecting adapter syntax. Cache can be stale/unavailable; check-update exit 100 means updates available. Preserve GPG checks. History undo is not a filesystem snapshot.",
  },
] as const;
export const careAgentStages = [
  {
    title: "Enroll locally, explicitly",
    detail:
      "Signed, visible native binary; device-bound identity, short-lived owner-confirmed pairing, local-only minimal inventory and revocable OS grants. No native binary or enrollment service ships here.",
  },
  {
    title: "Read only, through typed adapters",
    detail:
      "Unprivileged OS detection and allowlisted package inventory. No arbitrary shell, full-disk scan or automatic cache cleanup. Inventory commands can still touch caches/logs; disclose side effects and stale indexes.",
  },
  {
    title: "Verify before proposing",
    detail:
      "Pin approved publisher/source/channel and exact package identity; verify trusted keys or repository metadata, hashes, version, architecture and dependency graph. Signed time-bounded manifest binds device, owner, scopes, nonce and expiry. Fail closed on poisoning, replay, stale metadata or unknown provenance.",
  },
  {
    title: "Separate consent from capability",
    detail:
      "Per-action local approval and revocable class allowlists; low-risk signed compatible patches only after explicit opt-in. OS major upgrades, firmware, drivers, paid changes and privileges always need fresh human review. No generic privileged daemon.",
  },
  {
    title: "Stage, observe and recover",
    detail:
      "Backup/preflight, bounded official-manager transaction, post-update tests, visible receipts and stop control. Rollback only if the adapter can prove a supported prior package and data recovery path. Never overwrite a system or reboot automatically.",
  },
  {
    title: "Pilot and Voice are separate",
    detail:
      "Optional signed agent / browser adapter, same-origin approved sites, redacted screen inspection, visible timed sessions and emergency stop. Web content is untrusted data, never instructions. Microphone off; on-device speech where feasible, separate cloud/privacy/cost consent, no secret/OTP capture.",
  },
] as const;

// Future adapters and CLI contracts: these values are not executable integration configuration.
export const careUpdateChannels = [
  {
    id: "homebrew",
    name: "Homebrew",
    os: "macOS",
    notice:
      "Formula/cask versions must be matched to Homebrew metadata. Publisher verification and supported rollback remain unproven.",
  },
  {
    id: "winget",
    name: "winget",
    os: "Windows",
    notice:
      "Exact manifest identity, installer hash and Authenticode publisher require separate verification. Unknown versions fail closed.",
  },
  {
    id: "apt",
    name: "APT",
    os: "Linux",
    notice:
      "Distribution versions may carry backported fixes. Signed repository metadata and dependency hashes must be verified; upstream versions are not distro candidates.",
  },
  {
    id: "dnf",
    name: "DNF",
    os: "Linux",
    notice:
      "Detect manager generation and preserve GPG checks. Cached metadata may be stale. History undo is not data recovery.",
  },
] as const;
export const careScanScopes = [
  "Package inventory",
  "Health snapshot",
  "Storage review candidates",
] as const;
export const careScheduleDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const careCliReference = [
  {
    command: "evolution updates check",
    detail:
      "Propose trusted metadata checks for opted-in inventory; disclose network/index side effects. No install.",
  },
  {
    command: "evolution updates list",
    detail:
      "List matched installed/candidate versions, changelog, source, signature, compatibility and rollback evidence.",
  },
  {
    command: "evolution updates plan --dry-run",
    detail:
      "Prepare exact device-bound changes, dependencies, risk, backups and tests. Nothing applied.",
  },
  {
    command: "evolution updates auto enable --scope allowlist",
    detail:
      "Separate explicit opt-in to exact trusted low-risk patches only; schedule and revocation required. Not a wildcard grant.",
  },
  {
    command: "evolution updates apply --approve",
    detail:
      "Future local per-action approval; verify signed plan, owner/device grants, backups, sandbox tests and official-manager transaction. Disabled.",
  },
  {
    command: "evolution updates pause",
    detail:
      "Revoke pending consent and stop future work. An in-progress native transaction needs adapter-specific safe stopping.",
  },
  {
    command: "evolution self-update --check",
    detail:
      "Check a pinned Evolution release channel and trusted signing key. No binary/channel exists in this prototype; fail closed.",
  },
  {
    command: "evolution care scan",
    detail:
      "Future explicitly consented read-only minimal inventory. No personal file contents, monitoring or cache cleanup.",
  },
  {
    command: "evolution care review",
    detail:
      "Show per-file review queue; review is not move/delete approval. Restore only with proven supported recovery.",
  },
] as const;

// Guardian/Fleet: fictional owner devices and threat exercises, not detected telemetry.
export const guardianDeviceScopes = ["inventory:read", "updates:check", "reports:preview"] as const;
export const guardianDeviceFixtures = [
  {
    id: "mac-demo",
    name: "Demo creative workstation",
    os: "macOS",
    kind: "Laptop",
    group: "Work",
    samplePresence: "Sample online",
    battery: "Sample 74%",
    network: "Fictional private LAN",
    limitation:
      "Future signed user-level agent; Homebrew metadata only. Pilot needs separate Accessibility / Screen Recording grants.",
  },
  {
    id: "win-demo",
    name: "Demo developer PC",
    os: "Windows",
    kind: "Laptop",
    group: "Work",
    samplePresence: "Sample offline",
    battery: "Unknown",
    network: "Unknown",
    limitation:
      "Future signed agent and winget adapter; UAC approval separate. No remote service installed.",
  },
  {
    id: "linux-demo",
    name: "Demo research node",
    os: "Linux",
    kind: "Server",
    group: "Lab",
    samplePresence: "Sample online",
    battery: "Not applicable",
    network: "Fictional lab LAN",
    limitation:
      "Future signed distro package, user service and APT/DNF adapters. No inbound shell or provider connection.",
  },
  {
    id: "ipad-demo",
    name: "Demo field tablet",
    os: "iPadOS",
    kind: "Tablet",
    group: "Home",
    samplePresence: "Sample offline",
    battery: "Unknown",
    network: "Unknown",
    limitation:
      "Future companion app: app-specific data / approved notifications only. No systemwide shell, mouse control or desktop parity; enterprise MDM requires separate authority.",
  },
  {
    id: "android-demo",
    name: "Demo companion phone",
    os: "Android",
    kind: "Phone",
    group: "Home",
    samplePresence: "Sample online",
    battery: "Sample 61%",
    network: "Fictional Wi-Fi",
    limitation:
      "Future signed companion app and platform-approved APIs. No root, protection bypass or background monitoring.",
  },
] as const;
export const guardianLayers = [
  {
    name: "Ghost Security",
    short: "Isolate every identity",
    icon: "ghost",
    detail:
      "Device-bound consent, short-lived identities, sandboxed tasks and no public inbound shell.",
    state: "Architecture only · no device certificates issued",
  },
  {
    name: "Iron Defense",
    short: "Verify every boundary",
    icon: "shield",
    detail:
      "Strong account authentication, cross-tenant access checks, trusted software provenance and independent review.",
    state: "Not verified · authentication / signed release gates open",
  },
  {
    name: "Global Eye",
    short: "Observe only with consent",
    icon: "eye",
    detail:
      "Minimized owner-visible signals, incident triage and evidence-led reports for voluntarily enrolled systems only.",
    state: "DEMO scenarios · no telemetry or threat-feed ingestion",
  },
] as const;
export const guardianLaunchGates = [
  {
    id: "identity",
    title: "Account authentication & MFA",
    requirement:
      "Configured sign-in, verified sessions, recovery and tested step-up MFA/passkey support.",
    status: "BLOCKED · account setup pending",
  },
  {
    id: "tenants",
    title: "Tenant / device isolation",
    requirement:
      "Explicit table grants, owner-scoped RLS, org/project/device authorization and negative cross-account tests.",
    status: "BLOCKED · no shared device tables",
  },
  {
    id: "native",
    title: "Signed native / mobile distribution",
    requirement:
      "Verified binaries, pinned signing roots, official platform grants and independently tested adapters.",
    status: "BLOCKED · no installer or companion app",
  },
  {
    id: "jobs",
    title: "Bounded device transport & jobs",
    requirement:
      "Outbound authenticated transport, device-bound short-lived signed manifests, nonce replay defense, typed allowlists, queues and expiry.",
    status: "BLOCKED · no broker or job executor",
  },
  {
    id: "abuse",
    title: "Application / supply-chain defense",
    requirement:
      "Secret and dependency checks, rate/abuse controls, validated requests, session/CSRF defenses, secure headers and authorized penetration testing.",
    status: "NOT VERIFIED · security review required",
  },
  {
    id: "recovery",
    title: "Monitoring & incident recovery",
    requirement:
      "Real minimized telemetry, protected audit retention, notifications, incident response, backups and restoration drills.",
    status: "BLOCKED · no endpoint receipts or recovery proof",
  },
] as const;
export const guardianReviewSurfaces = [
  {
    id: "debrief",
    name: "Agent Debrief / Incident privacy",
    finding:
      "Local identities, pattern checks and review labels cannot establish verified sources, confidential storage or lawful publication.",
    proposal:
      "Keep sensitive intake and external publication disabled. Require verified operator grants, private artifact storage, secret/PII review, licensed media and distinct authenticated human moderation before publishing.",
    tests:
      "Reject secrets, private footage, source instructions and revoked consent; separate observations from hypotheses. Test owner isolation, corrections and takedown before real publication.",
  },
  {
    id: "robotics",
    name: "Robotics & Mobility physical safety",
    finding:
      "Synthetic calculations and declared approvals cannot authorize actuators, vehicle controllers or safety-critical hardware.",
    proposal:
      "Keep all physical adapters disabled; require verified owner/operator scope, independent domain-expert and functional-safety evidence, restricted test area, physical E-stop and signed provenance before any field integration.",
    tests:
      "Reject stale sensors, conflicting commands, unsafe speed/force, unknown payloads and unauthorized scopes; independently validate stability, collision avoidance and physical emergency stop. No weapons, targeting, force automation or unrestricted surveillance.",
  },
  {
    id: "code-exchange",
    name: "Code Exchange capsule intake",
    finding:
      "Untrusted code, evidence links and descriptions must never confer execution authority.",
    proposal:
      "Keep intake as data; add isolated typed-runner boundaries, source/license review and independent human approval before any future execution.",
    tests:
      "Adversarial capsule text cannot change policy, access secrets, fetch arbitrary URLs or authorize a job.",
  },
  {
    id: "care",
    name: "CARE / Update approval",
    finding:
      "Local preferences and historical release references do not establish authenticated consent or signing.",
    proposal:
      "Bind future plans to owner, exact device, artifact hash, adapter, scopes and expiry; verify provenance and require fresh per-action approval.",
    tests:
      "Reject wrong-device, stale, unsigned, replayed and revoked plans; prove adapter-specific backup and recovery.",
  },
  {
    id: "fleet",
    name: "Fleet identity and permissions",
    finding: "Per-device scope must not be inherited from another host or from a group label.",
    proposal:
      "Use short-lived single-use pairing and device keys in an OS vault, authenticated owner confirmation, scoped grants and revocation-aware outbound queues.",
    tests:
      "Reject cross-tenant / cross-device tokens, exhausted codes, expired grants and replayed jobs; pause requires host acknowledgments.",
  },
] as const;
export const guardianFleetTasks = [
  {
    id: "inventory",
    name: "Read-only inventory plan",
    scope: "inventory:read",
    description: "Propose minimal package inventory; no personal file contents or background scan.",
  },
  {
    id: "updates-check",
    name: "Trusted update metadata plan",
    scope: "updates:check",
    description: "Propose an official-manager metadata check; no download, installation or reboot.",
  },
  {
    id: "report",
    name: "Health / security report plan",
    scope: "reports:preview",
    description: "Propose a report from authorized evidence; unsupported checks stay unknown.",
  },
] as const;
export const guardianFleetCli = [
  "evolution devices list",
  "evolution devices enroll --code",
  "evolution devices status",
  "evolution devices group create lab",
  "evolution fleet plan --group lab --task updates-check",
  "evolution fleet run --group lab --task inventory --approve",
  "evolution fleet logs <job-id>",
  "evolution fleet pause",
  "evolution devices revoke <id>",
] as const;

// Robotics: authored fictional research scenarios, never attached equipment or verified tests.
export const roboticsCategories = [
  {
    id: "robotics",
    label: "Robotics Foundry",
    short: "Robotics",
    icon: "robot",
    description: "ROS 2-compatible concepts, synthetic sensing and safe-stop research.",
  },
  {
    id: "mobility",
    label: "Electric & Autonomous Mobility",
    short: "EV / Mobility",
    icon: "car",
    description:
      "Charging, battery explanations and driver-assistance simulations; no road approval.",
  },
  {
    id: "service",
    label: "Protective & Service Robots",
    short: "Protective assistance",
    icon: "access",
    description: "Non-contact escort, accessibility and human-directed emergency-contact concepts.",
  },
  {
    id: "rescue",
    label: "Emergency Response / Search & Rescue",
    short: "Emergency response",
    icon: "rescue",
    description: "Fictional disaster maps and human-in-the-loop coverage planning.",
  },
  {
    id: "aerospace",
    label: "Aerospace Simulations",
    short: "Aerospace",
    icon: "space",
    description: "Virtual inspection and sensing budgets; no flight or spacecraft control.",
  },
  {
    id: "public",
    label: "Public Sector Research",
    short: "Public sector",
    icon: "public",
    description:
      "Civil infrastructure research with authority, procurement, legal and privacy gates.",
  },
] as const;
export interface RoboticsScenario {
  id: string;
  category: (typeof roboticsCategories)[number]["id"];
  title: string;
  problem: string;
  model: "reaction" | "energy" | "coverage";
  contributionId: string;
  domain: (typeof genesisDomains)[number];
  author: string;
  operator: string | null;
  agent: string | null;
  compatibility: string;
  dataset: { name: string; version: string; license: string; provenance: string };
  risks: string[];
  tests: string[];
  oracle: { connection: string; hypothesis: string; evidenceNeeded: string }[];
  resources: { name: string; url: string; rights: string }[];
  acceptance: string;
  limitation: string;
}
const rosResearch = {
  name: "ROS 2 Jazzy documentation",
  url: "https://docs.ros.org/en/jazzy/index.html",
  rights:
    "Public documentation reference; individual package licenses require review. No code copied or runtime installed.",
};
const accessibilityResearch = {
  name: "W3C WCAG 2.2",
  url: "https://www.w3.org/TR/WCAG22/",
  rights: "W3C document license; reference only, not a compliance assessment.",
};
export const roboticsScenarios: RoboticsScenario[] = [
  {
    id: "rover-safe-stop",
    category: "robotics",
    title: "Virtual rover · obstacle & safe stop",
    problem:
      "Explore how a synthetic sensing delay consumes the clearance of a slow virtual rover. Unknown sensors and conflicting commands must trigger proposed safe-stop review.",
    model: "reaction",
    contributionId: "image-contrast",
    domain: "Image processing",
    author: "Luis Ortega",
    operator: "Luis Ortega",
    agent: "Lens Lab · fictional demo agent",
    compatibility:
      "ROS 2 Jazzy / Gazebo integration concept only. Browser arithmetic is not a ROS node, physics simulation or compatible controller. No firmware or hardware supported.",
    dataset: {
      name: "Authored virtual corridor fixture",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Fictional range and delay inputs. No sensor capture, camera frames or people.",
    },
    risks: [
      "Missed obstacle or stale sensor",
      "Conflicting control commands",
      "Unverified braking and physical emergency stop",
    ],
    tests: [
      "Sensor loss and stale timestamps → safe-stop design review",
      "Conflicting commands cannot increase actuation authority",
      "Independent braking, collision, stability and physical E-stop validation required",
    ],
    oracle: [
      {
        connection: "Image processing ↔ Robotics",
        hypothesis:
          "Bounded pixel handling may help define sensing resource limits; it cannot establish obstacle-detection quality.",
        evidenceNeeded:
          "Licensed annotated fixtures, measured perception failures and full-system latency tests.",
      },
      {
        connection: "Guardian ↔ Robotics",
        hypothesis:
          "Typed command allowlists could reduce conflicting instructions; no controller has been implemented.",
        evidenceNeeded: "Independent fail-safe tests and operator-approved command arbitration.",
      },
    ],
    resources: [rosResearch],
    acceptance:
      "Document sensor-loss and command-conflict cases, latency assumptions, restricted test area and physical E-stop evidence gaps. No field actuation.",
    limitation:
      "Reaction travel = speed × sensing delay only. Braking distance, traction, slope, uncertainty and mechanical dynamics are omitted; never use it as safe clearance.",
  },
  {
    id: "ev-charge-budget",
    category: "mobility",
    title: "EV charging · synthetic energy budget",
    problem:
      "Explain a fictional charging session and battery-capacity headroom without connecting a vehicle or diagnosing real battery health.",
    model: "energy",
    contributionId: "private-events",
    domain: "Energy",
    author: "Amara Okafor",
    operator: null,
    agent: null,
    compatibility:
      "Fictional charging-event JSON; future read-only official vehicle/charger APIs require owner and vendor consent. No CAN, OBD, BMS, charger writes or battery health estimation.",
    dataset: {
      name: "Fictional charging-session fixture",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance:
        "Manually chosen energy, duration and capacity. No VIN, location or real charge record.",
    },
    risks: [
      "Thermal behavior omitted",
      "Energy estimate mistaken for diagnosis",
      "Charging interoperability untested",
    ],
    tests: [
      "Reject non-finite and negative energy inputs",
      "Explain excess capacity rather than claim battery improvement",
      "Independent BMS, thermal and charging-protocol validation required",
    ],
    oracle: [
      {
        connection: "Privacy ↔ EV diagnostics",
        hypothesis:
          "Allowlisted event fields may reduce accidental VIN/location disclosure; they do not anonymize timing patterns.",
        evidenceNeeded:
          "Consented licensed records, retention threat model and official charger interoperability tests.",
      },
    ],
    resources: [
      {
        name: "Open Charge Alliance OCPP",
        url: "https://openchargealliance.org/protocols/open-charge-point-protocol/",
        rights:
          "Public protocol reference; obtain specification and software rights separately. No implementation or affiliation.",
      },
    ],
    acceptance:
      "Show arithmetic assumptions, privacy limitations and thermal/BMS test gaps. No controller writes, diagnosis or charging instruction.",
    limitation:
      "Ideal energy = power × duration. Losses, taper, temperature, aging and battery chemistry are omitted. No health score or benefit claim.",
  },
  {
    id: "driver-assistance",
    category: "mobility",
    title: "Driver assistance · delayed-signal study",
    problem:
      "Study synthetic signal-delay budgets with a human-in-the-loop concept. No steering, braking, road navigation or autonomy deployment.",
    model: "reaction",
    contributionId: "keyboard-navigation",
    domain: "Accessibility",
    author: "Aria Morgan",
    operator: "Aria Morgan",
    agent: "Echo · fictional demo agent",
    compatibility:
      "Human-factors UI concept, browser-only slow virtual fixture. Not automotive software, an ADAS stack or road-approved guidance.",
    dataset: {
      name: "Authored delayed-signal fixture",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Fictional low-speed and timing inputs; no road scene, driver data or GPS.",
    },
    risks: [
      "Driver overreliance",
      "Distraction and inaccessible alerts",
      "Real vehicle dynamics absent",
    ],
    tests: [
      "Human-factors and accessible alert tests required",
      "Stale/conflicting signal review",
      "Qualified automotive expert and functional-safety validation required",
    ],
    oracle: [
      {
        connection: "Accessibility ↔ Mobility",
        hypothesis:
          "Predictable interaction patterns could inform non-driving research interfaces, not safety-critical driver controls.",
        evidenceNeeded:
          "Independent human-factors study, hazard analysis and accessible alert testing.",
      },
    ],
    resources: [accessibilityResearch],
    acceptance:
      "Document overreliance, distraction, assistive-technology testing and automotive safety evidence gaps. No road guidance.",
    limitation: "Slow virtual reaction arithmetic only, not stopping-distance or driving advice.",
  },
  {
    id: "accessible-escort",
    category: "service",
    title: "Accessibility aide · non-contact escort",
    problem:
      "Explore a virtual attendant’s clearance budget and accessible pause requests. Assistance remains non-contact, nonweaponized and human-directed.",
    model: "reaction",
    contributionId: "keyboard-navigation",
    domain: "Accessibility",
    author: "Aria Morgan",
    operator: "Aria Morgan",
    agent: "Echo · fictional demo agent",
    compatibility:
      "ROS 2-compatible concept and accessible UI research only. No face identification, location tracking, physical intervention or emergency call.",
    dataset: {
      name: "Fictional accessible corridor",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Synthetic distances only; no identifiable person or captured movement.",
    },
    risks: [
      "Unsafe proximity or physical contact",
      "False protection promises",
      "Missed fall or stop request",
    ],
    tests: [
      "Human-requested stop and sensor-loss scenarios",
      "No face profiling, coercive tracking or force capability",
      "Independent force-limit, stability and accessibility review required",
    ],
    oracle: [
      {
        connection: "Accessibility ↔ Safe stops",
        hypothesis:
          "Predictable keyboard requests may inform an accessible virtual pause control; physical E-stop needs independent hardware validation.",
        evidenceNeeded: "Consented user research and verified physical stop/force-limit design.",
      },
    ],
    resources: [rosResearch, accessibilityResearch],
    acceptance:
      "Non-contact only; document safe speed/force concepts, consent, operator review and human-directed emergency-contact design. No calls made.",
    limitation:
      "Arithmetic does not establish safe proximity, fall detection, collision avoidance or assured protection.",
  },
  {
    id: "rescue-coverage",
    category: "rescue",
    title: "Search & rescue · virtual coverage",
    problem:
      "Compare fictional map-tile coverage and resource budgets for human-directed disaster research. No dispatch, person identification or operational navigation.",
    model: "coverage",
    contributionId: "private-events",
    domain: "Privacy",
    author: "Amara Okafor",
    operator: null,
    agent: null,
    compatibility:
      "Synthetic grid fixture, not a navigation planner or search-and-rescue service. Future datasets need lawful access and mission-owner authorization.",
    dataset: {
      name: "Authored disaster-grid fixture",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Fictional tiles; no coordinates, incident victims or private rescue imagery.",
    },
    risks: [
      "False coverage certainty",
      "Sensitive victim/location data",
      "Operational delay from unvalidated plans",
    ],
    tests: [
      "Uncovered tiles remain explicit",
      "No personal data or emergency dispatch",
      "Independent domain review and communications failure tests required",
    ],
    oracle: [
      {
        connection: "Privacy ↔ Emergency response",
        hypothesis:
          "Minimized summaries could support permissioned research without public victim locations.",
        evidenceNeeded:
          "Authorized datasets, human triage review and communications resilience tests.",
      },
    ],
    resources: [rosResearch],
    acceptance:
      "Show uncovered tiles and unknown real terrain; keep planning under human command with legal dataset review. No emergency service contacted.",
    limitation:
      "Coverage = time × fictional tile rate. It omits terrain, detection probability, communications and rescue effectiveness.",
  },
  {
    id: "orbital-inspection",
    category: "aerospace",
    title: "Orbital inspection · virtual sensor budget",
    problem:
      "Rehearse a fictional inspection-tile budget and uncertainty record. No flight, orbital propagation, spacecraft command or drone connection.",
    model: "coverage",
    contributionId: "dependency-ledger",
    domain: "Developer tooling",
    author: "Kenji Sato",
    operator: null,
    agent: null,
    compatibility:
      "Virtual budget table only; not flight software or space-qualified components. Public research references do not imply agency partnerships.",
    dataset: {
      name: "Authored virtual inspection tiles",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Synthetic count and throughput, not live orbital data or imagery.",
    },
    risks: [
      "Budget estimate mistaken for flight validation",
      "Radiation/communications behavior absent",
      "Unknown dependency provenance",
    ],
    tests: [
      "Explicit unknown orbit and environment",
      "License and dependency inventory review",
      "Independent aerospace safety and hardware qualification required",
    ],
    oracle: [
      {
        connection: "Dependency provenance ↔ Aerospace",
        hypothesis:
          "A declared inventory can highlight missing licenses; it cannot establish flight qualification or supply-chain integrity.",
        evidenceNeeded:
          "Verified component provenance, executed qualification tests and domain-expert review.",
      },
    ],
    resources: [
      {
        name: "NASA software engineering handbook",
        url: "https://swehb.nasa.gov/",
        rights:
          "Public research reference; content-specific rights apply. No endorsement, integration or partnership.",
      },
    ],
    acceptance:
      "Record missing orbital/thermal/radiation evidence and component provenance; no flight or deployment authorization.",
    limitation: "No orbital mechanics, navigation, flight-control or hardware model is evaluated.",
  },
  {
    id: "civil-inspection",
    category: "public",
    title: "Civil infrastructure · permissioned research",
    problem:
      "Explore fictional infrastructure-inspection coverage with strict authority and privacy boundaries, not access to public-sector systems.",
    model: "coverage",
    contributionId: "private-events",
    domain: "Privacy",
    author: "Amara Okafor",
    operator: null,
    agent: null,
    compatibility:
      "Synthetic civic grid only. No police, military, government, public cameras, procurement systems or real infrastructure connected.",
    dataset: {
      name: "Fictional civil-inspection grid",
      version: "demo-1",
      license: "CC0-1.0 · original synthetic numbers",
      provenance: "Authored anonymous tile counts; no addresses, faces or sensitive sites.",
    },
    risks: [
      "Unauthorized institutional access",
      "Surveillance or sensitive locations",
      "Simulation mistaken for procurement/safety clearance",
    ],
    tests: [
      "Authority, procurement, legal and privacy review required",
      "No targeting, weapons, use-of-force or person tracking",
      "Sensitive data segregated with verified authenticated access before intake",
    ],
    oracle: [
      {
        connection: "Privacy ↔ Public infrastructure",
        hypothesis:
          "Research summaries could omit sensitive locations; actual access and public-interest purpose still require independent legal review.",
        evidenceNeeded:
          "Verifiable authority, dataset rights, retention controls and accountable domain oversight.",
      },
    ],
    resources: [accessibilityResearch],
    acceptance:
      "Require verifiable institutional authority, procurement, lawful purpose and privacy review before any real intake. No institutional partnership claimed.",
    limitation:
      "Fictional planning only; no surveillance, tactical capability, inspection certificate or official integration.",
  },
];
export const roboticsSafetyGates = [
  {
    id: "operator",
    title: "Owner, operator & lawful purpose",
    requirement:
      "Verified ownership, separate scoped operator approval and domain/legal authority. Public-sector procurement and privacy rights require review.",
  },
  {
    id: "stop",
    title: "Physical limits & emergency stop",
    requirement:
      "Independent safe speed/force, stability/fall, obstacle/collision and physical E-stop validation in a restricted test area.",
  },
  {
    id: "source",
    title: "Source, dataset & license provenance",
    requirement:
      "Verified author rights, signed artifact and digest, pinned dependencies and licensed consented datasets.",
  },
  {
    id: "expert",
    title: "Functional safety & independent tests",
    requirement:
      "Qualified domain expert, hazard analysis and relevant standards assessment (e.g. ISO 12100 / ISO 13849; ISO 26262 for road vehicles, when applicable). No compliance claimed.",
  },
  {
    id: "release",
    title: "Release, recovery & revocation",
    requirement:
      "Authenticated owner release authority, tested recovery, physical stop and revocation. No field release or signed transport exists.",
  },
] as const;

// Incident Archives are authored fictional teaching cases, not reports or interviews.
export const incidentCategories = [
  "Wild Tech Moments",
  "Robot Malfunctions",
  "Code Postmortems",
  "Lab Lessons",
  "Near Misses",
  "Fixes That Worked",
] as const;
export interface IncidentExample {
  id: string;
  category: (typeof incidentCategories)[number];
  title: string;
  summary: string;
  status: "DEMO" | "REENACTMENT";
  system: string;
  date: string;
  minutes: number;
  intended: string;
  observed: string;
  logs: string;
  facts: string;
  unknowns: string;
  hypotheses: string;
  timeline: string;
  reproduction: string;
  tests: string;
  lessons: string;
  mitigation: string;
  contributionId: string;
}
export const incidentExamples: IncidentExample[] = [
  {
    id: "alphabetical-toast",
    category: "Wild Tech Moments",
    title: "The toaster that sorted breakfast",
    summary:
      "A fictional label sorter put the menu in perfect order. The toast remained entirely virtual.",
    status: "DEMO",
    system: "Fictional menu-label software",
    date: "2026-10-21",
    minutes: 3,
    intended: "Sort a small virtual breakfast menu without changing the recipe.",
    observed: "The fictional fixture sorted labels, not the intended preparation sequence.",
    logs: "Authored fixture: input=[toast, eggs]; output=[eggs, toast]. No device log collected.",
    facts: "The authored example uses label order only; no appliance was attached.",
    unknowns: "Real UI requirements and kitchen behavior are not measured.",
    hypotheses:
      "A label sort may have been mistaken for a task dependency graph; not a confirmed incident cause.",
    timeline:
      "T+0: Fictional menu fixture written.\nT+1: Expected sequence compared with alphabetical output.\nT+2: Proposed explicit ordering review.",
    reproduction:
      "Compare an authored list with a declared dependency sequence in a virtual fixture only.",
    tests: "Proposed dependency-order and empty-menu tests. Not executed here.",
    lessons:
      "A tidy output is not evidence of the right objective. Laugh at the example, not at people.",
    mitigation: "Specify explicit dependencies and review expected outputs.",
    contributionId: "dependency-ledger",
  },
  {
    id: "two-commands-one-rover",
    category: "Robot Malfunctions",
    title: "Two commands. One virtual rover.",
    summary: "An imagined command conflict shows why unknown authority must never become motion.",
    status: "REENACTMENT",
    system: "Closed virtual rover design exercise",
    date: "2026-10-21",
    minutes: 5,
    intended: "Require a single accountable command source and stop on disagreement.",
    observed:
      "In the authored scenario, two proposed commands disagree. No motion or hardware test occurred.",
    logs: "Synthetic transcript: planner=continue; operator=pause; result=STOP_REVIEW_REQUIRED.",
    facts:
      "The transcript was authored for education; no real robot, failure footage or interview exists.",
    unknowns: "Actual control software, braking, traction and actuator behavior are unknown.",
    hypotheses:
      "Concurrency or arbitration could cause conflicts in some systems; this fixture cannot diagnose them.",
    timeline:
      "T+0: Conflicting fictional commands declared.\nT+1: Stop-review condition illustrated.\nT+2: Independent arbitration and physical E-stop tests proposed.",
    reproduction:
      "Use static fictional command records. Do not run physical actuation or hazardous tests.",
    tests:
      "Independent arbitration, sensor-loss and functional-safety tests required; none performed.",
    lessons:
      "Stop authority must be independently validated. Never test dangerous motion around people.",
    mitigation: "Keep physical adapters off; require qualified operator and expert review.",
    contributionId: "image-contrast",
  },
  {
    id: "empty-list-encore",
    category: "Code Postmortems",
    title: "The empty list asked for an encore",
    summary: "A fictional selection bug makes the missing-item case the star of the rehearsal.",
    status: "DEMO",
    system: "Fictional keyboard-selection helper",
    date: "2026-10-21",
    minutes: 4,
    intended: "Return no selection when an authored list contains zero items.",
    observed:
      "The invented earlier draft assumed one item; a proposed revision returns -1 for the empty list.",
    logs: "Authored expected fixture: count=0 → selected=-1. Not a captured execution log.",
    facts: "The linked original demo snippet includes an empty-list branch.",
    unknowns: "No real deployment, user harm or executed accessibility report is documented.",
    hypotheses:
      "A missing boundary case could explain a similar defect; no actual root cause is established.",
    timeline:
      "T+0: Empty fixture specified.\nT+1: Intended sentinel behavior documented.\nT+2: Full-widget review proposed.",
    reproduction: "Inspect zero-count and wraparound fixtures without executing submitted code.",
    tests:
      "Proposed empty-list, Home/End and full-widget screen-reader tests. Not run by this article.",
    lessons:
      "Small helpers need full interaction evidence; do not claim accessibility certification.",
    mitigation: "Document empty behavior, focus model and a reviewed regression test.",
    contributionId: "keyboard-navigation",
  },
  {
    id: "units-left-the-lab",
    category: "Lab Lessons",
    title: "The units left the lab",
    summary:
      "A synthetic delay budget reminds us that numbers need assumptions, not just decimal places.",
    status: "DEMO",
    system: "Educational reaction-travel arithmetic",
    date: "2026-10-21",
    minutes: 4,
    intended: "Explain a synthetic sensing-delay budget with explicit units.",
    observed:
      "A fictional worksheet mixes milliseconds and seconds until a reviewer adds a unit conversion.",
    logs: "Authored fixture: 0.5 m/s × 300 ms / 1000 = 0.15 m. Not stopping-distance evidence.",
    facts: "The numbers are chosen teaching inputs; braking and mechanical dynamics are absent.",
    unknowns: "Real sensor latency, friction and uncertainty remain unknown.",
    hypotheses:
      "Unit confusion could change numeric estimates; it cannot establish hardware failure.",
    timeline:
      "T+0: Synthetic quantities declared.\nT+1: Units compared.\nT+2: Model limitations documented.",
    reproduction: "Compare declared units on a worksheet only; no robot action.",
    tests: "Unit conversion and independent physical-safety validation are separate requirements.",
    lessons: "Arithmetic is not robotics physics or a clearance recommendation.",
    mitigation: "Declare model units and retain expert and hardware-evidence gates.",
    contributionId: "image-contrast",
  },
  {
    id: "payload-almost-overshared",
    category: "Near Misses",
    title: "The payload almost overshared",
    summary: "An entirely fictional telemetry review chooses less data, not a bigger archive.",
    status: "DEMO",
    system: "Synthetic telemetry payload",
    date: "2026-10-21",
    minutes: 4,
    intended: "Retain only a named event and coarse duration.",
    observed:
      "The authored lesson adds unknown fields, then proposes excluding them before any transmission.",
    logs: "Authored fixture: fields=[event,durationMs,extra]; allowed=[event,durationMs]. No personal data or network trace.",
    facts: "No actual exposure, personal record or victim is represented.",
    unknowns: "Real retention, timing re-identification and storage security are untested.",
    hypotheses:
      "Copying arbitrary fields could expose sensitive data in another system; not a verified breach.",
    timeline:
      "T+0: Synthetic field list authored.\nT+1: Allowlist inspected.\nT+2: Retention/privacy review proposed.",
    reproduction: "Use fictional field names, never real credentials or private logs.",
    tests: "Proposed unknown-field rejection and retention/privacy tests; no audit certification.",
    lessons:
      "An allowlist does not anonymize behavioral timings. Respect privacy even in near-miss stories.",
    mitigation: "Minimize fields, stop raw logging and require independent privacy review.",
    contributionId: "private-events",
  },
  {
    id: "unknown-is-an-answer",
    category: "Fixes That Worked",
    title: "UNKNOWN was the useful answer",
    summary:
      "In this fictional example, an honest missing-license label beats an invented clearance.",
    status: "DEMO",
    system: "Authored dependency inventory",
    date: "2026-10-21",
    minutes: 3,
    intended: "Preserve unknown provenance instead of guessing a license.",
    observed: "The authored missing-license fixture expects UNKNOWN and a human follow-up.",
    logs: "Authored expected fixture: missing license → UNKNOWN. Not a registry scan.",
    facts: "The linked demo helper marks absent declared metadata UNKNOWN.",
    unknowns: "Transitive licenses and actual package ownership have not been audited.",
    hypotheses:
      "Explicit missing evidence could prevent a false clearance; effectiveness is not independently measured.",
    timeline:
      "T+0: Missing metadata identified in a fictional fixture.\nT+1: UNKNOWN proposed.\nT+2: Human rights review remains pending.",
    reproduction: "Inspect an authored metadata object; never execute package install scripts.",
    tests: "Proposed missing-field and sorting tests; not evidence of real license clearance.",
    lessons: "A useful fix can be admitting what is not known.",
    mitigation: "Preserve uncertainty and review original license texts before reuse.",
    contributionId: "dependency-ledger",
  },
];
