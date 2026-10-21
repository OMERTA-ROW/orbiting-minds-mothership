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

// Code Exchange examples contain executable original snippets, NOT integrated repos.
// People, reviews, outcomes and project compatibility below are fictional demo records.
export type ExchangeLocale = "en" | "es";
export type LocalizedText = Record<ExchangeLocale, string>;
export type ExchangeState = "Proposed" | "Researching" | "In Review" | "Tested" | "Approved" | "Released";
export interface CodeContribution {
  id: string; title: LocalizedText; description: LocalizedText; compatibility: LocalizedText;
  industry: "Banking" | "Image processing" | "Privacy" | "Accessibility" | "Developer tooling";
  language: "TypeScript" | "Python" | "JavaScript";
  readiness: "Sandbox only" | "Review ready" | "Experimental";
  license: "MIT" | "Apache-2.0"; authorType: "Human" | "AI-assisted";
  author: string; operator?: string; agent?: string; reviewers: { name: string; note: LocalizedText }[];
  state: ExchangeState; risk: "Low" | "Medium" | "High"; security: LocalizedText;
  version: string; filename: string; code: string;
  tests: { name: LocalizedText; procedure: LocalizedText }[];
  dependencies: string[]; rollback: LocalizedText; changelog: LocalizedText[];
  reference: { repository: string; commit: string; license: string; purpose: LocalizedText };
}
const text = (en: string, es: string): LocalizedText => ({ en, es });
export const exchangeStates: ExchangeState[] = ["Proposed", "Researching", "In Review", "Tested", "Approved", "Released"];
export const codeContributions: CodeContribution[] = [
  {
    id: "sandbox-transfer", title: text("Replay-safe transfer validation", "Validación de transferencias sin repetición"),
    description: text("Checks a synthetic transfer request before it reaches a sandbox. Rejects invalid amounts and flags an already-used request key. It does not move money or replace a banking security system.", "Comprueba una transferencia ficticia antes de llegar al entorno de pruebas. Rechaza importes inválidos y claves usadas. No mueve dinero ni sustituye la seguridad bancaria."),
    compatibility: text("TypeScript runtimes with a caller-supplied Set. A real banking API needs authenticated callers, durable atomic idempotency, authorization, rate limits and an independent security audit. No production-bank compatibility is certified.", "Requiere TypeScript y un Set proporcionado por el llamador. Una API real necesita autenticación, idempotencia atómica persistente, autorización, límites y auditoría. No hay compatibilidad bancaria certificada."),
    industry: "Banking", language: "TypeScript", readiness: "Sandbox only", license: "Apache-2.0", authorType: "Human", author: "Maya Chen", state: "In Review", risk: "High", version: "0.1.0", filename: "validate-transfer.ts",
    security: text("Sandbox pattern only. The in-memory Set cannot prevent cross-process races and is not an audit ledger. Never send real accounts, credentials or funds to this sample.", "Solo para pruebas. El Set en memoria no evita carreras entre procesos ni es un registro de auditoría. No use cuentas, credenciales o fondos reales."),
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
    reviewers: [{ name: "Jonah Patel", note: text("Use a transactional store before any real financial workflow. Demo review, not an audit.", "Use almacenamiento transaccional antes de operar con dinero. Revisión demo, no auditoría.") }],
    tests: [{ name: text("Reject invalid amounts", "Rechazar importes inválidos"), procedure: text("Try zero, negative, fractional and unsafe integer amounts; expect invalid_amount.", "Pruebe cero, negativos, fracciones y enteros inseguros; espere invalid_amount.") }, { name: text("Reject replay in one sandbox", "Rechazar repetición en una prueba"), procedure: text("Submit the same valid key twice to one Set; accept once, reject once. Cross-process protection is out of scope.", "Envíe la misma clave dos veces al mismo Set; acepte una y rechace otra. La protección entre procesos queda fuera del alcance.") }],
    dependencies: ["TypeScript standard library · no third-party dependencies"],
    rollback: text("Remove the sandbox validator and restore the prior request handler. Preserve any real audit records outside this example.", "Quite el validador de prueba y restaure el manejador anterior. Conserve los registros reales fuera de este ejemplo."),
    changelog: [text("0.1.0 · Added integer amount and replay-key checks; no money movement.", "0.1.0 · Validación de importes enteros y claves repetidas; sin movimiento de dinero.")],
    reference: { repository: "OWASP/CheatSheetSeries", commit: "c366393214da5ae186a7a06a27dade7617987304", license: "CC-BY-SA-4.0", purpose: text("Public security documentation for independent evaluation; not the source of this original snippet.", "Documentación pública de seguridad para evaluación independiente; no es el origen del fragmento.") },
  },
  {
    id: "image-contrast", title: text("Bounded grayscale contrast", "Contraste limitado de escala de grises"),
    description: text("Adjusts a small list of grayscale pixel values and clamps output to 0–255. No camera is accessed, no images are uploaded, and no image-quality improvement is claimed.", "Ajusta una lista pequeña de píxeles y limita la salida a 0–255. No accede a cámaras, sube imágenes ni afirma mejoras de calidad."),
    compatibility: text("Python 3.11+; accepts integer grayscale samples, not RGB frames or encoded files. A camera pipeline needs format conversion, memory limits and measured quality/latency tests.", "Python 3.11+; admite enteros en escala de grises, no RGB ni archivos codificados. Una cámara necesita conversión, límites de memoria y mediciones de calidad y latencia."),
    industry: "Image processing", language: "Python", readiness: "Experimental", license: "MIT", authorType: "AI-assisted", author: "Luis Ortega", operator: "Luis Ortega", agent: "Lens Lab · demo agent", state: "Proposed", risk: "Medium", version: "0.2.0", filename: "contrast.py",
    security: text("Only small in-memory samples. Bound frame sizes in a real pipeline and strip private image metadata before sharing. AI operator identity is fictional and unverified.", "Solo muestras pequeñas en memoria. Limite el tamaño de las imágenes reales y quite metadatos privados. El operador de IA es ficticio y no verificado."),
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
    reviewers: [{ name: "Amara Okafor", note: text("Check the target camera's histogram and noise. No quality benchmark has been run here.", "Revise histograma y ruido de la cámara. Aquí no se ha medido la calidad.") }],
    tests: [{ name: text("Pixel bounds", "Límites de píxeles"), procedure: text("Pass [0, 128, 255] with factor 2; expect [0, 128, 255]. Reject out-of-range pixels and non-finite factors.", "Pruebe [0, 128, 255] con factor 2; espere [0, 128, 255]. Rechace píxeles fuera de rango y factores no finitos.") }],
    dependencies: ["Python standard library · math · no third-party dependencies"], rollback: text("Restore the original pixel-processing stage and compare a local reference image before reuse.", "Restaure el procesamiento anterior y compare una imagen local de referencia antes de reutilizar."),
    changelog: [text("0.2.0 · Finite-factor validation and output bounds added.", "0.2.0 · Validación de factor finito y límites de salida.")],
    reference: { repository: "python-pillow/Pillow", commit: "1ee8db96376c1e63f90dae7b8bef071ede6c4b80", license: "MIT-CMU", purpose: text("Public image-processing reference. Pillow is not imported; this sample is original and does not reproduce Pillow code.", "Referencia pública de procesamiento de imágenes. No se importa Pillow; el ejemplo es original.") },
  },
  {
    id: "private-events", title: text("Allowlisted event payloads", "Eventos con campos permitidos"),
    description: text("Builds a new telemetry object containing only an event name and duration. Unknown fields are dropped rather than copied. Nothing is sent to a telemetry provider.", "Crea un objeto con solo el nombre del evento y su duración. Descarta otros campos. No envía nada a un proveedor."),
    compatibility: text("TypeScript applications with a known event vocabulary. This reduces accidental field exposure; it is not anonymization, consent collection, encryption or regulatory certification.", "Aplicaciones TypeScript con vocabulario conocido. Reduce exposición accidental; no anonimiza ni obtiene consentimiento, cifra o certifica cumplimiento."),
    industry: "Privacy", language: "TypeScript", readiness: "Review ready", license: "MIT", authorType: "Human", author: "Amara Okafor", state: "Tested", risk: "Medium", version: "0.1.1", filename: "safe-event.ts",
    security: text("Allowlisting is only one layer. Event timing can still reveal behavior; retention, consent and threat modeling remain required.", "La lista permitida es solo una capa. Los tiempos pueden revelar comportamiento; aún se necesitan retención, consentimiento y análisis de amenazas."),
    code: `export function safeEvent(input: Record<string, unknown>) {
  const allowed = ["page_view", "action_completed"];
  if (typeof input.event !== "string" || !allowed.includes(input.event)) {
    throw new Error("unsupported_event");
  }
  const durationMs = typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs)) : 0;
  return { event: input.event, durationMs };
}`,
    reviewers: [{ name: "Maya Chen", note: text("Consider coarsening timings. Tested is a simulated board state, not a privacy certification.", "Considere agrupar tiempos. Tested es un estado simulado, no certificación de privacidad.") }],
    tests: [{ name: text("Drop identifying fields", "Descartar datos identificadores"), procedure: text("Include email, token and unknown properties; output must contain only event and durationMs. Reject unsupported events.", "Incluya correo, token y campos desconocidos; la salida solo debe tener event y durationMs. Rechace eventos no admitidos.") }],
    dependencies: ["TypeScript standard library · no third-party dependencies"], rollback: text("Disable this telemetry path entirely until the previous privacy-reviewed schema is restored; do not re-enable raw payload logging.", "Desactive estos eventos hasta restaurar el esquema anterior revisado; no reactive registros sin filtrar."),
    changelog: [text("0.1.1 · Closed event vocabulary; no network transport.", "0.1.1 · Vocabulario cerrado; sin transporte de red.")],
    reference: { repository: "OWASP/CheatSheetSeries", commit: "c366393214da5ae186a7a06a27dade7617987304", license: "CC-BY-SA-4.0", purpose: text("Public privacy/security reference, separate from the original sample's MIT license.", "Referencia pública de privacidad y seguridad, separada de la licencia MIT del ejemplo original.") },
  },
  {
    id: "keyboard-navigation", title: text("Predictable keyboard selection", "Selección predecible por teclado"),
    description: text("Calculates the next selected index for arrow, Home and End keys. It is a small building block for an accessible list, not a complete accessibility solution.", "Calcula la siguiente selección con flechas, Inicio y Fin. Es una parte de una lista accesible, no una solución completa."),
    compatibility: text("TypeScript UI frameworks. The host must manage focus, semantic roles, aria-selected, announcements and disabled items, and test with keyboard and screen readers.", "Interfaces TypeScript. La aplicación debe gestionar foco, roles, aria-selected, anuncios y elementos desactivados, y probar teclado y lectores de pantalla."),
    industry: "Accessibility", language: "TypeScript", readiness: "Review ready", license: "MIT", authorType: "AI-assisted", author: "Aria Morgan", operator: "Aria Morgan", agent: "Echo · demo agent", state: "In Review", risk: "Low", version: "0.3.0", filename: "next-index.ts",
    security: text("This helper does not certify accessibility. Keep focus visible and verify the full interaction with assistive technology.", "No certifica accesibilidad. Mantenga foco visible y pruebe la interacción completa con tecnología de asistencia."),
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
    reviewers: [{ name: "Kenji Sato", note: text("Define the parent widget's focus model before adoption. Agent approval is not a human approval gate.", "Defina el modelo de foco antes de adoptar. La aprobación de un agente no sustituye a la humana.") }],
    tests: [{ name: text("Navigation boundaries", "Límites de navegación"), procedure: text("Check wraparound, Home/End, empty lists and invalid counts. A full screen-reader test is still planned.", "Pruebe extremos, Inicio/Fin, listas vacías y cantidades inválidas. La prueba completa con lector de pantalla sigue pendiente.") }],
    dependencies: ["TypeScript standard library · no third-party dependencies"], rollback: text("Restore the former keyboard handler and recheck focus order; no project files are modified by this preview.", "Restaure el manejador anterior y revise el orden del foco; esta vista no modifica archivos del proyecto."),
    changelog: [text("0.3.0 · Added empty-list handling and Home/End selection.", "0.3.0 · Listas vacías y selección con Inicio/Fin.")],
    reference: { repository: "mdn/content", commit: "05c1aed375bab88f322b15319e45fb326e4a341c", license: "CC-BY-SA 2.5+ prose · CC0/MIT samples (see source)", purpose: text("Public keyboard and accessibility documentation. No MDN code was copied into this original sample.", "Documentación pública de teclado y accesibilidad. El ejemplo original no copia código de MDN.") },
  },
  {
    id: "dependency-ledger", title: text("Dependency license inventory", "Inventario de licencias de dependencias"),
    description: text("Summarizes declared dependency versions and license labels from a supplied object. Missing licenses are marked UNKNOWN for human investigation; there is no package registry scan.", "Resume versiones y licencias declaradas de un objeto. Marca UNKNOWN cuando faltan licencias para revisión humana; no consulta registros de paquetes."),
    compatibility: text("Modern JavaScript, browsers or server runtimes. Callers must supply the inventory. Declared license strings are not a legal clearance or transitive-dependency audit.", "JavaScript moderno en navegador o servidor. El llamador aporta el inventario. Las licencias declaradas no son aprobación legal ni auditoría transitiva."),
    industry: "Developer tooling", language: "JavaScript", readiness: "Review ready", license: "Apache-2.0", authorType: "Human", author: "Kenji Sato", state: "Approved", risk: "Low", version: "0.1.0", filename: "license-inventory.js",
    security: text("Do not execute package scripts to collect metadata. Approved is a fictional demo state; licenses and dependencies still require a real human review.", "No ejecute scripts para recopilar metadatos. Approved es un estado demo ficticio; se requiere revisión real de licencias y dependencias."),
    code: `export function licenseInventory(packages) {
  return Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, metadata]) => ({
      name,
      version: typeof metadata?.version === "string" ? metadata.version : "UNKNOWN",
      license: typeof metadata?.license === "string" && metadata.license.trim()
        ? metadata.license.trim() : "UNKNOWN",
    }));
}`,
    reviewers: [{ name: "Luis Ortega", note: text("Demo approval of the concept only. Review full license texts and transitive dependencies before reuse.", "Aprobación demo del concepto. Revise textos completos y dependencias transitivas antes de reutilizar.") }],
    tests: [{ name: text("Unknown license gate", "Control de licencias desconocidas"), procedure: text("Omit a license and version; expect UNKNOWN rather than invented values. Check deterministic name sorting.", "Omita licencia y versión; espere UNKNOWN, no valores inventados. Compruebe el orden por nombre.") }],
    dependencies: ["JavaScript standard library · no third-party dependencies"], rollback: text("Remove the inventory helper and restore the prior approved dependency list. No dependency is installed by this sample.", "Quite el ayudante y restaure el inventario aprobado anterior. El ejemplo no instala dependencias."),
    changelog: [text("0.1.0 · Sorted inventory and explicit UNKNOWN license labels.", "0.1.0 · Inventario ordenado y licencias UNKNOWN explícitas.")],
    reference: { repository: "mdn/content", commit: "05c1aed375bab88f322b15319e45fb326e4a341c", license: "CC-BY-SA 2.5+ prose · CC0/MIT samples (see source)", purpose: text("Public JavaScript documentation; original sample, not an MDN contribution or partnership.", "Documentación pública de JavaScript; ejemplo original, no contribución a MDN ni asociación.") },
  },
];

// Genesis seeds are fictional examples, never accounts, funded bounties or activity.
export const genesisDomains = ["Accessibility", "Privacy", "Image processing", "Developer tooling", "Energy", "Banking"] as const;
export const genesisRoles = ["Explorer", "Researcher", "Critic", "Architect", "Builder"] as const;
export const genesisScopes = ["submit_capsules", "simulate_twins", "review_proposals"] as const;
export const genesisChallenges = [
  { id: "challenge-focus", title: "Make keyboard navigation predictable", domain: "Accessibility" as const, problem: "Design a documented selection pattern that handles empty lists and wraparound without losing visible focus.", acceptance: "Document arrow, Home and End behavior; provide a reproducible test plan and full-widget accessibility limitations.", ownerName: "Fictional demo challenge sponsor", visibility: "Open" as const, bountyUsd: 500, funding: "DEMO_PROPOSAL" as const, state: "Open" as const, createdAt: "2026-10-20T00:00:00.000Z", ownerId: null, demo: true as const, contributionId: "keyboard-navigation" },
  { id: "challenge-privacy", title: "Reduce accidental telemetry exposure", domain: "Privacy" as const, problem: "Create an allowlisted event capsule that never carries account identifiers or secrets.", acceptance: "Document allowed fields, retention assumptions, threat model and tests rejecting unsupported events.", ownerName: "Fictional demo challenge sponsor", visibility: "Private" as const, bountyUsd: null, funding: "DEMO_PROPOSAL" as const, state: "Open" as const, createdAt: "2026-10-20T00:00:00.000Z", ownerId: null, demo: true as const, contributionId: "private-events" },
  { id: "challenge-camera", title: "Bound an image-processing pipeline", domain: "Image processing" as const, problem: "Propose a bounded grayscale transformation with explicit latency and memory budgets. No camera connection.", acceptance: "Identify pixel bounds, invalid inputs, format limitations and a future hardware benchmark procedure.", ownerName: "Fictional demo challenge sponsor", visibility: "Open" as const, bountyUsd: 750, funding: "DEMO_PROPOSAL" as const, state: "Open" as const, createdAt: "2026-10-20T00:00:00.000Z", ownerId: null, demo: true as const, contributionId: "image-contrast" },
];
export const genesisTrustRules = [
  { key: "provenance", title: "Traceable provenance", requirement: "Named human author or responsible operator, versioned source and rights declaration.", limitation: "Names and links are self-declared; identity and source ownership are not verified." },
  { key: "license", title: "License and author rights", requirement: "Declared capsule license, dependency inventory and permission to share.", limitation: "Declarations are not legal clearance; independent license review is required." },
  { key: "tests", title: "Reproducible evidence", requirement: "Configuration, baseline, benchmark target, model version and test procedure.", limitation: "Synthetic model results are not execution of submitted code or hardware evidence." },
  { key: "approval", title: "Independent human decision", requirement: "Reviewer distinct from submitting identity, documented decision and rollback plan.", limitation: "Local identities are not authenticated; demo decisions confer no certification or release authority." },
];
export const genesisComputeArchitecture = ["Explicit node-owner opt-in", "Authenticated, revocable project grants", "Signed allowlisted task artifact", "Isolated runner with no host credentials", "Egress allowlist and resource limits", "USD spend cap and owner approval", "Provenance-bound result and audit log"];


// CARE inventory is fictional. Published release references are historical, not live catalog matches.
export const careModules = [
  { id: "care", name: "Evolution CARE", description: "Read-only inventory and virtual storage review", permission: "Future local inventory grant" },
  { id: "updates", name: "Update Engine", description: "Trusted-source checks and dry-run plans", permission: "Future metadata access; installation separate" },
  { id: "guardian", name: "Guardian", description: "Review gates and visible pause controls", permission: "No monitoring in this demo" },
  { id: "pilot", name: "Evolution Pilot", description: "Scoped, user-approved action previews", permission: "Future screen / accessibility / browser grants" },
  { id: "voice", name: "Mothership Voice", description: "Original persona and private push-to-talk concept", permission: "Future microphone consent; none requested" },
  { id: "developer", name: "Developer tools", description: "Read-only CLI and adapter architecture reference", permission: "No shell or commands executed" },
] as const;
export const careDevices = [
  { id: "mac-demo", name: "Demo creative workstation", os: "macOS", architecture: "arm64", platform: "Homebrew", diskUsedGb: 268, diskTotalGb: 512, memoryUsedGb: 9, memoryTotalGb: 16, cpuPercent: 23, backup: "Unknown · not checked", sampleAt: "2026-10-20T00:00:00.000Z" },
  { id: "win-demo", name: "Demo developer PC", os: "Windows", architecture: "x64", platform: "winget", diskUsedGb: 710, diskTotalGb: 1024, memoryUsedGb: 14, memoryTotalGb: 32, cpuPercent: 41, backup: "Unknown · not checked", sampleAt: "2026-10-20T00:00:00.000Z" },
  { id: "linux-demo", name: "Demo research node", os: "Linux", architecture: "x64", platform: "apt / dnf", diskUsedGb: 92, diskTotalGb: 256, memoryUsedGb: 3, memoryTotalGb: 8, cpuPercent: 12, backup: "Unknown · not checked", sampleAt: "2026-10-20T00:00:00.000Z" },
] as const;
export const careStorage = [
  { id: "temp", path: "SAMPLE:/Temp/export-preview.tmp", sizeMb: 240, kind: "Temporary preview", reason: "Fictional temporary export; owner and app review required", reversible: "Not assessed · no restore promise", locked: false, protected: false },
  { id: "cache", path: "SAMPLE:/Cache/image-thumbnails", sizeMb: 640, kind: "App cache", reason: "Regeneration may use bandwidth and time; use app-supported cleanup only", reversible: "Not assessed", locked: true, protected: true },
  { id: "document", path: "SAMPLE:/Documents/design-notes.pdf", sizeMb: 18, kind: "Personal document", reason: "Protected personal content · excluded from cleanup", reversible: "Never moved or deleted", locked: false, protected: true },
  { id: "backup", path: "SAMPLE:/Backups/project-archive", sizeMb: 4096, kind: "Backup", reason: "Protected backup · do not infer redundant data", reversible: "Never moved or deleted", locked: false, protected: true },
] as const;
export const carePilotScopes = ["Screen inspection", "Mouse actions", "Browser inspection"] as const;
export const careVoices = [
  { id: "navigator", name: "Mothership Navigator", line: "The next step is yours. I can prepare a plan for your review.", description: "Measured, precise and quietly optimistic" },
  { id: "steward", name: "Mothership Steward", line: "Your files stay where they are. We review before we change.", description: "Warm, reassuring and consent-first" },
  { id: "analyst", name: "Mothership Analyst", line: "The evidence is incomplete. This proposal needs verification.", description: "Clear, evidence-led and direct" },
] as const;

export const careUpdates = [
  { id: "git", name: "Git", vendor: "Git project", installed: "2.45.0", available: "2.45.1", released: "2024-05-14", risk: "Medium", category: "Developer tool", source: "https://github.com/git/git/blob/v2.45.1/Documentation/RelNotes/2.45.1.txt", changelog: "Security fixes for CVE-2024-32002, 32004, 32020, 32021 and 32465 in cloning and submodule handling.", compatibility: "Hardening may change untrusted repository workflows. Platform, filesystem and packaging need independent validation.", signatures: "Upstream source archive provides detached signature; no binary or signer verified here.", rollback: "Prior package availability and retained configuration required; no guaranteed downgrade or data restore.", dependency: "Package-manager dependencies and filesystem behavior need review.", tests: "Future clone/submodule regression tests, source provenance and local workflow checks.", size: "Unknown · no package fetched", downtime: "Unknown · check active Git jobs", platforms: ["macOS", "Windows", "Linux"] },
  { id: "python", name: "Python", vendor: "Python Software Foundation", installed: "3.12.3", available: "3.12.4", released: "2024-06-06", risk: "Medium", category: "Runtime", source: "https://www.python.org/downloads/release/python-3124/", changelog: "Windows directory-permission fix for CVE-2024-4030; bundled libexpat 2.6.2 and interpreter fixes.", compatibility: "Validate native extensions and virtual environments. Windows permission behavior and bundled libraries vary by build.", signatures: "Upstream artifacts list OpenPGP / Sigstore evidence; verification has not been performed.", rollback: "Environment snapshot and prior supported installer required; application migrations are not undone.", dependency: "Native extensions, interpreter pinning and libexpat build provenance require checks.", tests: "Future environment, extension and application regression checks; none run in this demo.", size: "Unknown · no package fetched", downtime: "Unknown · active interpreters need review", platforms: ["macOS", "Windows", "Linux"] },
  { id: "curl", name: "curl", vendor: "curl project", installed: "8.10.0", available: "8.10.1", released: "2024-09-18", risk: "Low", category: "Network tool", source: "https://curl.se/ch/8.10.1.html", changelog: "HTTP/2 upload end-of-stream, connection timing and rustls cipher-selection fixes; rustls-ffi 0.14.0.", compatibility: "TLS/backend and HTTP/2 configuration must be tested; distributor builds may differ. Not a blanket low-risk guarantee.", signatures: "Official source release provides detached signatures; no downloaded artifact, hash or signer verified.", rollback: "Prior supported package and dependencies must remain available; no guaranteed system rollback.", dependency: "TLS backend and rustls-ffi when applicable; distro-patched versions may not match upstream.", tests: "Future HTTP/2, TLS and application compatibility checks; no execution here.", size: "Unknown · no package fetched", downtime: "Unknown · active network tasks need review", platforms: ["macOS", "Windows", "Linux"] },
] as const;
export const careAdapters = [
  { os: "macOS / Homebrew", command: "HOMEBREW_NO_AUTO_UPDATE=1 brew list --versions\nHOMEBREW_NO_AUTO_UPDATE=1 brew outdated --json=v2", source: "https://docs.brew.sh/Manpage", notes: "Formulae/casks only, not whole-device inventory. Cached indexes may be stale. Hashes are not publisher signatures; verify notarization separately. Kegs/casks do not guarantee rollback." },
  { os: "Windows / winget", command: "winget list\nwinget list --upgrade-available", source: "https://learn.microsoft.com/en-us/windows/package-manager/winget/list", notes: "Matching and version detection can be incomplete. Source refresh may use network or ask for agreements. Installer hashes are not Authenticode publisher checks. Never bypass either; downgrade support varies." },
  { os: "Linux / APT", command: "apt list --installed\napt list --upgradable", source: "https://manpages.debian.org/bookworm/apt/apt.8.en.html", notes: "Existing indexes only; do not run apt update during inventory-only consent. For automation prefer dedicated APT APIs. Signed repository metadata and hashes authenticate packages, not individual package signatures. Downgrades do not reverse data migrations." },
  { os: "Linux / DNF 4", command: "dnf --cacheonly list --installed\ndnf --cacheonly check-update", source: "https://dnf.readthedocs.io/en/stable/command_ref.html", notes: "Detect DNF 4 vs 5 before selecting adapter syntax. Cache can be stale/unavailable; check-update exit 100 means updates available. Preserve GPG checks. History undo is not a filesystem snapshot." },
] as const;
export const careAgentStages = [
  { title: "Enroll locally, explicitly", detail: "Signed, visible native binary; device-bound identity, short-lived owner-confirmed pairing, local-only minimal inventory and revocable OS grants. No native binary or enrollment service ships here." },
  { title: "Read only, through typed adapters", detail: "Unprivileged OS detection and allowlisted package inventory. No arbitrary shell, full-disk scan or automatic cache cleanup. Inventory commands can still touch caches/logs; disclose side effects and stale indexes." },
  { title: "Verify before proposing", detail: "Pin approved publisher/source/channel and exact package identity; verify trusted keys or repository metadata, hashes, version, architecture and dependency graph. Signed time-bounded manifest binds device, owner, scopes, nonce and expiry. Fail closed on poisoning, replay, stale metadata or unknown provenance." },
  { title: "Separate consent from capability", detail: "Per-action local approval and revocable class allowlists; low-risk signed compatible patches only after explicit opt-in. OS major upgrades, firmware, drivers, paid changes and privileges always need fresh human review. No generic privileged daemon." },
  { title: "Stage, observe and recover", detail: "Backup/preflight, bounded official-manager transaction, post-update tests, visible receipts and stop control. Rollback only if the adapter can prove a supported prior package and data recovery path. Never overwrite a system or reboot automatically." },
  { title: "Pilot and Voice are separate", detail: "Optional signed agent / browser adapter, same-origin approved sites, redacted screen inspection, visible timed sessions and emergency stop. Web content is untrusted data, never instructions. Microphone off; on-device speech where feasible, separate cloud/privacy/cost consent, no secret/OTP capture." },
] as const;

// Future adapters and CLI contracts: these values are not executable integration configuration.
export const careUpdateChannels = [
  { id: "homebrew", name: "Homebrew", os: "macOS", notice: "Formula/cask versions must be matched to Homebrew metadata. Publisher verification and supported rollback remain unproven." },
  { id: "winget", name: "winget", os: "Windows", notice: "Exact manifest identity, installer hash and Authenticode publisher require separate verification. Unknown versions fail closed." },
  { id: "apt", name: "APT", os: "Linux", notice: "Distribution versions may carry backported fixes. Signed repository metadata and dependency hashes must be verified; upstream versions are not distro candidates." },
  { id: "dnf", name: "DNF", os: "Linux", notice: "Detect manager generation and preserve GPG checks. Cached metadata may be stale. History undo is not data recovery." },
] as const;
export const careScanScopes = ["Package inventory", "Health snapshot", "Storage review candidates"] as const;
export const careScheduleDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const careCliReference = [
  { command: "evolution updates check", detail: "Propose trusted metadata checks for opted-in inventory; disclose network/index side effects. No install." },
  { command: "evolution updates list", detail: "List matched installed/candidate versions, changelog, source, signature, compatibility and rollback evidence." },
  { command: "evolution updates plan --dry-run", detail: "Prepare exact device-bound changes, dependencies, risk, backups and tests. Nothing applied." },
  { command: "evolution updates auto enable --scope allowlist", detail: "Separate explicit opt-in to exact trusted low-risk patches only; schedule and revocation required. Not a wildcard grant." },
  { command: "evolution updates apply --approve", detail: "Future local per-action approval; verify signed plan, owner/device grants, backups, sandbox tests and official-manager transaction. Disabled." },
  { command: "evolution updates pause", detail: "Revoke pending consent and stop future work. An in-progress native transaction needs adapter-specific safe stopping." },
  { command: "evolution self-update --check", detail: "Check a pinned Evolution release channel and trusted signing key. No binary/channel exists in this prototype; fail closed." },
  { command: "evolution care scan", detail: "Future explicitly consented read-only minimal inventory. No personal file contents, monitoring or cache cleanup." },
  { command: "evolution care review", detail: "Show per-file review queue; review is not move/delete approval. Restore only with proven supported recovery." },
] as const;

// Guardian/Fleet: fictional owner devices and threat exercises, not detected telemetry.
export const guardianDeviceScopes = ["inventory:read", "updates:check", "reports:preview"] as const;
export const guardianDeviceFixtures = [
 { id: "mac-demo", name: "Demo creative workstation", os: "macOS", kind: "Laptop", group: "Work", samplePresence: "Sample online", battery: "Sample 74%", network: "Fictional private LAN", limitation: "Future signed user-level agent; Homebrew metadata only. Pilot needs separate Accessibility / Screen Recording grants." },
 { id: "win-demo", name: "Demo developer PC", os: "Windows", kind: "Laptop", group: "Work", samplePresence: "Sample offline", battery: "Unknown", network: "Unknown", limitation: "Future signed agent and winget adapter; UAC approval separate. No remote service installed." },
 { id: "linux-demo", name: "Demo research node", os: "Linux", kind: "Server", group: "Lab", samplePresence: "Sample online", battery: "Not applicable", network: "Fictional lab LAN", limitation: "Future signed distro package, user service and APT/DNF adapters. No inbound shell or provider connection." },
 { id: "ipad-demo", name: "Demo field tablet", os: "iPadOS", kind: "Tablet", group: "Home", samplePresence: "Sample offline", battery: "Unknown", network: "Unknown", limitation: "Future companion app: app-specific data / approved notifications only. No systemwide shell, mouse control or desktop parity; enterprise MDM requires separate authority." },
 { id: "android-demo", name: "Demo companion phone", os: "Android", kind: "Phone", group: "Home", samplePresence: "Sample online", battery: "Sample 61%", network: "Fictional Wi-Fi", limitation: "Future signed companion app and platform-approved APIs. No root, protection bypass or background monitoring." },
] as const;
export const guardianLayers = [
 { name: "Ghost Security", short: "Isolate every identity", icon: "ghost", detail: "Device-bound consent, short-lived identities, sandboxed tasks and no public inbound shell.", state: "Architecture only · no device certificates issued" },
 { name: "Iron Defense", short: "Verify every boundary", icon: "shield", detail: "Strong account authentication, cross-tenant access checks, trusted software provenance and independent review.", state: "Not verified · authentication / signed release gates open" },
 { name: "Global Eye", short: "Observe only with consent", icon: "eye", detail: "Minimized owner-visible signals, incident triage and evidence-led reports for voluntarily enrolled systems only.", state: "DEMO scenarios · no telemetry or threat-feed ingestion" },
] as const;
export const guardianLaunchGates = [
 { id: "identity", title: "Account authentication & MFA", requirement: "Configured sign-in, verified sessions, recovery and tested step-up MFA/passkey support.", status: "BLOCKED · account setup pending" },
 { id: "tenants", title: "Tenant / device isolation", requirement: "Explicit table grants, owner-scoped RLS, org/project/device authorization and negative cross-account tests.", status: "BLOCKED · no shared device tables" },
 { id: "native", title: "Signed native / mobile distribution", requirement: "Verified binaries, pinned signing roots, official platform grants and independently tested adapters.", status: "BLOCKED · no installer or companion app" },
 { id: "jobs", title: "Bounded device transport & jobs", requirement: "Outbound authenticated transport, device-bound short-lived signed manifests, nonce replay defense, typed allowlists, queues and expiry.", status: "BLOCKED · no broker or job executor" },
 { id: "abuse", title: "Application / supply-chain defense", requirement: "Secret and dependency checks, rate/abuse controls, validated requests, session/CSRF defenses, secure headers and authorized penetration testing.", status: "NOT VERIFIED · security review required" },
 { id: "recovery", title: "Monitoring & incident recovery", requirement: "Real minimized telemetry, protected audit retention, notifications, incident response, backups and restoration drills.", status: "BLOCKED · no endpoint receipts or recovery proof" },
] as const;
export const guardianReviewSurfaces = [
 { id: "code-exchange", name: "Code Exchange capsule intake", finding: "Untrusted code, evidence links and descriptions must never confer execution authority.", proposal: "Keep intake as data; add isolated typed-runner boundaries, source/license review and independent human approval before any future execution.", tests: "Adversarial capsule text cannot change policy, access secrets, fetch arbitrary URLs or authorize a job." },
 { id: "care", name: "CARE / Update approval", finding: "Local preferences and historical release references do not establish authenticated consent or signing.", proposal: "Bind future plans to owner, exact device, artifact hash, adapter, scopes and expiry; verify provenance and require fresh per-action approval.", tests: "Reject wrong-device, stale, unsigned, replayed and revoked plans; prove adapter-specific backup and recovery." },
 { id: "fleet", name: "Fleet identity and permissions", finding: "Per-device scope must not be inherited from another host or from a group label.", proposal: "Use short-lived single-use pairing and device keys in an OS vault, authenticated owner confirmation, scoped grants and revocation-aware outbound queues.", tests: "Reject cross-tenant / cross-device tokens, exhausted codes, expired grants and replayed jobs; pause requires host acknowledgments." },
] as const;
export const guardianFleetTasks = [
 { id: "inventory", name: "Read-only inventory plan", scope: "inventory:read", description: "Propose minimal package inventory; no personal file contents or background scan." },
 { id: "updates-check", name: "Trusted update metadata plan", scope: "updates:check", description: "Propose an official-manager metadata check; no download, installation or reboot." },
 { id: "report", name: "Health / security report plan", scope: "reports:preview", description: "Propose a report from authorized evidence; unsupported checks stay unknown." },
] as const;
export const guardianFleetCli = ["evolution devices list", "evolution devices enroll --code", "evolution devices status", "evolution devices group create lab", "evolution fleet plan --group lab --task updates-check", "evolution fleet run --group lab --task inventory --approve", "evolution fleet logs <job-id>", "evolution fleet pause", "evolution devices revoke <id>"] as const;
