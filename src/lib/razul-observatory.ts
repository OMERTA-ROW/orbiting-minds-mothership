/**
 * RAZUL Internet Observatory — pure scoring, taxonomy, evidence, routing, and
 * source-filtering logic. Shared by the scheduled job (server) and tests; no
 * server-only imports here. Public permitted sources only; no private
 * communications ever enter this pipeline, and no exhaustive-coverage claim.
 */

export type EvidenceClass = "established" | "preliminary" | "hypothesis" | "speculation";

export interface ObservatorySource {
  id: string;
  name: string;
  url: string;
  kind: string;
  category: string;
  active: boolean;
}

export interface ObservatoryControls {
  alertThreshold: number;
  coverage: readonly string[];
  blockedSources: readonly string[];
}

const CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  "ai-model": [
    "model", "gpt", "claude", "gemini", "llm", "release", "launch", "benchmark",
    "reasoning", "multimodal", "frontier", "open-weight", "fine-tun",
  ],
  vulnerability: [
    "cve", "vulnerab", "exploit", "advisory", "patch", "rce", "zero-day",
    "remote code execution", "privilege escalation", "mitigat", "severity",
  ],
  development: [
    "api", "sdk", "release", "deprecat", "breaking", "changelog", "version",
    "runtime", "framework", "tooling",
  ],
  research: [
    "paper", "benchmark", "study", "arxiv", "preprint", "evaluation",
    "dataset", "alignment", "survey",
  ],
  space: [
    "nasa", "spacex", "rocket", "launch", "orbit", "satellite", "mission",
    "spacecraft", "iss", "lunar", "starship",
  ],
  astronomy: [
    "exoplanet", "black hole", "galaxy", "telescope", "webb", "hubble",
    "supernova", "nebula", "star", "cosmic", "dark matter", "asteroid",
  ],
  "earth-science": [
    "earthquake", "volcano", "geology", "seismic", "tsunami", "magnitude",
    "tectonic", "ocean", "glacier",
  ],
  climate: [
    "climate", "warming", "emission", "carbon", "temperature record",
    "wildfire", "hurricane", "drought", "sea level", "renewable",
  ],
  biology: [
    "gene", "crispr", "protein", "cell", "species", "evolution", "genome",
    "bacteria", "virus", "brain", "neuron",
  ],
  physics: [
    "quantum", "particle", "fusion", "photon", "superconduct", "neutrino",
    "laser", "plasma", "relativity",
  ],
  papers: [
    "preprint", "study", "paper", "arxiv", "authors", "abstract", "we show",
    "we present", "we propose",
  ],
  "government-data": [
    "magnitude", "earthquake", "dataset", "census", "survey", "official",
    "agency", "report",
  ],
  news: ["breaking", "report", "announced", "says", "according"],
};

/** Keyword-based relevance 0–100: title hits weigh double, capped. */
export function scoreRelevance(
  entry: { title: string; summary: string },
  category: string,
): number {
  const keywords = CATEGORY_KEYWORDS[category] ?? [];
  if (!keywords.length) return 0;
  const title = entry.title.toLowerCase();
  const summary = entry.summary.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) score += 18;
    else if (summary.includes(kw)) score += 8;
  }
  return Math.min(100, score);
}

/** Topic taxonomy: first matching subtopic, else the category itself. */
const TOPIC_KEYWORDS: Record<string, readonly string[]> = {
  mars: ["mars", "martian"],
  exoplanet: ["exoplanet", "habitable zone"],
  "black-hole": ["black hole"],
  quantum: ["quantum"],
  fusion: ["fusion"],
  geneediting: ["crispr", "gene edit"],
  neuroscience: ["brain", "neuron"],
  earthquake: ["earthquake", "seismic"],
  volcano: ["volcano", "eruption"],
  storm: ["hurricane", "typhoon", "cyclone"],
  ransomware: ["ransomware"],
  "ai-release": ["gpt", "claude", "gemini", "llm"],
  "space-launch": ["launch", "rocket", "starship"],
};

export function assignTopic(entry: { title: string; summary: string }, category: string): string {
  const text = `${entry.title} ${entry.summary}`.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return topic;
  }
  return category;
}

const ENTITY_STOP = new Set([
  "The", "New", "How", "Why", "What", "This", "That", "After", "Before",
  "Could", "Would", "Study", "Scientists", "Researchers", "According",
]);

/**
 * Heuristic entity extraction: CVE identifiers plus capitalized multiword
 * names from the title. Bounded to 8, stopword-filtered. Heuristic only —
 * not a knowledge-graph guarantee.
 */
export function extractEntities(title: string): string[] {
  const entities = new Set<string>();
  for (const match of title.matchAll(/CVE-\d{4}-\d{4,7}/g)) entities.add(match[0]);
  for (const match of title.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/g)) {
    const name = match[1];
    if (!name) continue;
    const firstWord = name.split(" ")[0] ?? "";
    if (!ENTITY_STOP.has(firstWord) && name.length > 3) entities.add(name);
    if (entities.size >= 8) break;
  }
  return [...entities].slice(0, 8);
}

/**
 * Evidence classification. Deterministic and conservative: preprint feeds are
 * preliminary; speculative language lowers the class; official government
 * sources are established. Never upgrades a weak text to established.
 */
export function classifyEvidence(
  entry: { title: string; summary: string },
  source: { category: string; id: string },
): { evidenceClass: EvidenceClass; strength: number } {
  const text = `${entry.title} ${entry.summary}`.toLowerCase();
  const official = ["cisa", "usgs", "nasa", "esa"].some((k) => source.id.startsWith(k));
  if (/speculat|hypothesi|might one day|could one day/.test(text))
    return { evidenceClass: "speculation", strength: 20 };
  if (/preliminary|early results|suggests|may indicate|propose/.test(text))
    return { evidenceClass: "hypothesis", strength: 30 };
  if (source.category === "papers" || source.id.startsWith("arxiv"))
    return { evidenceClass: "preliminary", strength: 40 };
  if (official) return { evidenceClass: "established", strength: 80 };
  return { evidenceClass: "established", strength: 55 };
}

const CATEGORY_ROUTES: Record<string, readonly string[]> = {
  vulnerability: ["guardian", "omni", "jackboy"],
  "ai-model": ["omni", "sabrina", "jackboy"],
  development: ["jackboy", "omni"],
  research: ["sabrina", "omni"],
  space: ["sabrina", "omni"],
  astronomy: ["sabrina", "omni"],
  "earth-science": ["omni", "sabrina"],
  climate: ["omni", "sabrina"],
  biology: ["sabrina", "omni"],
  physics: ["sabrina", "omni"],
  papers: ["sabrina", "omni"],
  "government-data": ["omni", "jackboy"],
  news: ["sabrina"],
};

/**
 * Actionable routing: a finding is routed to consumers only when its relevance
 * meets the owner's alert threshold. Below threshold it stays in searchable
 * history without alerting anyone.
 */
export function routeFinding(
  category: string,
  relevance: number,
  threshold: number,
): string[] {
  if (relevance < threshold) return [];
  return [...(CATEGORY_ROUTES[category] ?? ["omni"])];
}

/**
 * Owner controls applied to the registry: active sources, not blocked,
 * whose category is inside the configured coverage. Sources rotate by
 * `rotation` so a registry larger than maxSources is covered across runs.
 */
export function filterSources<T extends ObservatorySource>(
  sources: readonly T[],
  controls: ObservatoryControls,
  maxSources = 5,
  rotation = 0,
): T[] {
  const blocked = new Set(controls.blockedSources);
  const coverage = new Set(controls.coverage);
  const eligible = sources.filter(
    (s) => s.active && !blocked.has(s.id) && coverage.has(s.category),
  );
  if (eligible.length <= maxSources) return eligible;
  const offset = ((rotation % eligible.length) + eligible.length) % eligible.length;
  const rotated = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  return rotated.slice(0, maxSources);
}
