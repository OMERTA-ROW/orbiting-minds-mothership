import { z } from "zod";

/**
 * RAZUL — The Eternal Archivist.
 * Central memory, history and public-internet intelligence for the OMNI ecosystem.
 *
 * Local-first reference implementation: an append-only, hash-chained event
 * archive with provenance, redaction, retention tombstoning and per-project,
 * per-consumer access segregation; a project/agent/dependency knowledge graph;
 * and a public-source intelligence registry with dedupe, corroboration,
 * relevance ranking and routed findings.
 *
 * Honest limits: the chain is a tamper-evident integrity check, not a
 * cryptographic signature. Public discovery here is a registry and scoring
 * layer over owner-entered or allowlisted sources — the only real scheduled
 * collection in this project remains the existing daily knowledge collector.
 * RAZUL never claims to monitor the entire internet, never touches private
 * communications, and rejects secret-looking content at intake.
 */
export const RAZUL_STORE_KEY = "evolution.razul.v1";

export const razulConsumers = ["jackboy", "omni", "guardian", "sabrina", "jax"] as const;
export type RazulConsumer = (typeof razulConsumers)[number];

export const eventKinds = [
  "project-event",
  "agent-report",
  "test-result",
  "code-change",
  "approval",
  "incident",
  "outcome",
] as const;
export type EventKind = (typeof eventKinds)[number];

const SECRET_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY|sk-[a-z0-9_-]{12,}|\b(api[_-]?key|password|secret|token)\s*[:=]\s*\S+/i;

/* ---------------- Project enrollment (opt-in) ---------------- */

export const enrollmentSchema = z.object({
  projectName: z.string().trim().min(2).max(120),
  tags: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
  dependencies: z.array(z.string().trim().min(1).max(120)).max(20),
  retentionDays: z.number().int().min(7).max(365),
  ownerConsent: z.literal(true),
});
export type EnrollmentInput = z.infer<typeof enrollmentSchema>;

export type ProjectEnrollment = EnrollmentInput & { id: string; enrolledAt: string; active: boolean };

export function enrollProject(input: unknown, id: string, now: string): ProjectEnrollment {
  return { ...enrollmentSchema.parse(input), id, enrolledAt: now, active: true };
}

/* ---------------- Append-only event archive ---------------- */

export const eventInputSchema = z.object({
  projectId: z.string().min(1),
  actor: z.string().trim().min(2).max(80),
  kind: z.enum(eventKinds),
  summary: z.string().trim().min(5).max(2000),
  provenance: z.string().trim().min(3).max(500),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export type ArchiveEvent = EventInput & {
  id: string;
  at: string;
  prevHash: string;
  hash: string;
  redacted: boolean;
  redactionReason?: string;
  tombstoned: boolean;
};

/** Deterministic integrity hash (FNV-1a based). Tamper-evident, not a signature. */
export function integrityHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function eventPayload(event: Omit<ArchiveEvent, "hash">): string {
  return [
    event.id,
    event.projectId,
    event.actor,
    event.kind,
    event.redacted ? "[redacted]" : event.summary,
    event.redacted ? (event.redactionReason ?? "") : event.provenance,
    event.at,
    event.prevHash,
    event.tombstoned ? "tombstone" : "live",
  ].join("|");
}

export class RazulRejection extends Error {}

/**
 * Append an event. Enforces: project enrolled and active (opt-in), no
 * secret-looking content, chain linkage to the previous event.
 */
export function appendEvent(
  events: ArchiveEvent[],
  enrollments: ProjectEnrollment[],
  input: unknown,
  id: string,
  now: string,
): ArchiveEvent {
  const parsed = eventInputSchema.parse(input);
  const project = enrollments.find((e) => e.id === parsed.projectId);
  if (!project || !project.active)
    throw new RazulRejection("Project is not enrolled or has been opted out; RAZUL cannot record it.");
  if (SECRET_PATTERN.test(parsed.summary) || SECRET_PATTERN.test(parsed.provenance))
    throw new RazulRejection("Secret-looking content is rejected; RAZUL never logs credentials.");
  const prev = events[events.length - 1];
  const prevHash = prev ? prev.hash : "genesis";
  const draft: Omit<ArchiveEvent, "hash"> = {
    ...parsed,
    id,
    at: now,
    prevHash,
    redacted: false,
    tombstoned: false,
  };
  return { ...draft, hash: integrityHash(eventPayload(draft)) };
}

/** Verify chain linkage and content integrity. Redacted/tombstoned entries verify against their recorded hash. */
export function verifyChain(events: ArchiveEvent[]): { ok: boolean; brokenAt?: string } {
  let prevHash = "genesis";
  for (const event of events) {
    if (event.prevHash !== prevHash) return { ok: false, brokenAt: event.id };
    if (!event.redacted && !event.tombstoned && event.hash !== integrityHash(eventPayload(event)))
      return { ok: false, brokenAt: event.id };
    prevHash = event.hash;
  }
  return { ok: true };
}

/** Redaction clears content but preserves the chain entry and records why. */
export function redactEvent(events: ArchiveEvent[], id: string, reason: string): ArchiveEvent[] {
  if (reason.trim().length < 5) throw new RazulRejection("A redaction reason of at least 5 characters is required.");
  return events.map((event) =>
    event.id === id && !event.redacted
      ? { ...event, summary: "[redacted]", provenance: "[redacted]", redacted: true, redactionReason: reason.trim() }
      : event,
  );
}

/** Retention tombstones expired content per the project's retention window; the chain entry remains. */
export function applyRetention(events: ArchiveEvent[], enrollments: ProjectEnrollment[], now: Date): ArchiveEvent[] {
  return events.map((event) => {
    const project = enrollments.find((e) => e.id === event.projectId);
    if (!project || event.tombstoned) return event;
    const ageMs = now.getTime() - new Date(event.at).getTime();
    if (ageMs > project.retentionDays * 86_400_000)
      return { ...event, summary: "[expired]", provenance: "[expired]", tombstoned: true };
    return event;
  });
}

/* ---------------- Access segregation + retrieval ---------------- */

export type AccessGrant = { projectId: string; consumer: RazulConsumer; grantedAt: string };

export type RetrievalQuery = {
  consumer: RazulConsumer;
  projectId: string;
  kind?: EventKind;
  text?: string;
  limit?: number;
};

/**
 * Retrieval API for Jackboy, OMNI, Guardian, Sabrina and JAX.
 * Denies without an explicit per-project grant for that consumer.
 */
export function retrieveEvents(
  events: ArchiveEvent[],
  grants: AccessGrant[],
  query: RetrievalQuery,
): { allowed: boolean; events: ArchiveEvent[]; denial?: string } {
  const granted = grants.some((g) => g.projectId === query.projectId && g.consumer === query.consumer);
  if (!granted)
    return {
      allowed: false,
      events: [],
      denial: `No RAZUL read grant for ${query.consumer} on this project. Owner grants access per project and per consumer.`,
    };
  const needle = query.text?.trim().toLowerCase();
  const matches = events
    .filter((event) => event.projectId === query.projectId)
    .filter((event) => !query.kind || event.kind === query.kind)
    .filter((event) => !needle || `${event.summary} ${event.actor} ${event.provenance}`.toLowerCase().includes(needle))
    .slice(0, Math.min(query.limit ?? 50, 200));
  return { allowed: true, events: matches };
}

/* ---------------- Knowledge graph ---------------- */

export type GraphNode = { id: string; type: "project" | "agent" | "dependency"; label: string };
export type GraphEdge = { from: string; to: string; relation: string };
export type KnowledgeGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export function buildGraph(enrollments: ProjectEnrollment[], events: ArchiveEvent[]): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (node: GraphNode) => nodes.set(node.id, node);
  const addEdge = (edge: GraphEdge) => edges.set(`${edge.from}|${edge.to}|${edge.relation}`, edge);
  for (const enrollment of enrollments.filter((e) => e.active)) {
    addNode({ id: enrollment.id, type: "project", label: enrollment.projectName });
    for (const dependency of enrollment.dependencies) {
      const depId = `dep:${dependency.toLowerCase()}`;
      addNode({ id: depId, type: "dependency", label: dependency });
      addEdge({ from: enrollment.id, to: depId, relation: "depends-on" });
    }
  }
  for (const event of events) {
    if (event.tombstoned) continue;
    const agentId = `agent:${event.actor.toLowerCase()}`;
    addNode({ id: agentId, type: "agent", label: event.actor });
    addEdge({ from: agentId, to: event.projectId, relation: event.kind });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/* ---------------- Public-internet intelligence ---------------- */

export const sourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().startsWith("https://"),
  kind: z.enum(["rss", "api", "public-page"]),
  termsNote: z.string().trim().min(10).max(500),
  respectsRobots: z.literal(true),
  ownerApproved: z.literal(true),
});
export type SourceInput = z.infer<typeof sourceSchema>;

export type IntelSource = SourceInput & { id: string; addedAt: string };

export function registerSource(input: unknown, id: string, now: string): IntelSource {
  return { ...sourceSchema.parse(input), id, addedAt: now };
}

export const findingSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().trim().min(5).max(240),
  url: z.string().trim().url(),
  summary: z.string().trim().min(10).max(1500),
  category: z.enum(["ai-model", "coding-tool", "api", "vulnerability", "development"]),
});
export type FindingInput = z.infer<typeof findingSchema>;

export type IntelFinding = FindingInput & {
  id: string;
  at: string;
  corroborations: number;
  relevance: number;
  routedTo: RazulConsumer[];
};

function relevanceScore(finding: FindingInput, enrollments: ProjectEnrollment[]): number {
  const text = `${finding.title} ${finding.summary}`.toLowerCase();
  let score = 0;
  for (const enrollment of enrollments.filter((e) => e.active)) {
    for (const tag of enrollment.tags) if (text.includes(tag.toLowerCase())) score += 20;
  }
  if (finding.category === "vulnerability") score += 15;
  return Math.min(100, score);
}

const CATEGORY_ROUTES: Record<FindingInput["category"], RazulConsumer[]> = {
  "ai-model": ["omni", "sabrina"],
  "coding-tool": ["jackboy", "omni"],
  api: ["jackboy", "omni"],
  vulnerability: ["guardian", "jackboy"],
  development: ["sabrina", "jax"],
};

/**
 * Ingest a public finding: dedupe by URL, corroborate repeats from distinct
 * sources, score relevance against enrolled project tags, route by category.
 * Findings only route to consumers holding a grant for at least one enrolled
 * project whose tags matched — no grant, no routing.
 */
export function ingestFinding(
  findings: IntelFinding[],
  sources: IntelSource[],
  enrollments: ProjectEnrollment[],
  grants: AccessGrant[],
  input: unknown,
  id: string,
  now: string,
): { finding?: IntelFinding; updated?: IntelFinding; duplicate: boolean; error?: string } {
  const parsed = findingSchema.parse(input);
  const source = sources.find((s) => s.id === parsed.sourceId);
  if (!source) return { duplicate: false, error: "Unknown source; register an approved source first." };
  if (SECRET_PATTERN.test(parsed.summary) || SECRET_PATTERN.test(parsed.title))
    return { duplicate: false, error: "Secret-looking content is rejected." };
  const existing = findings.find((f) => f.url === parsed.url);
  if (existing) {
    if (existing.sourceId === parsed.sourceId) return { duplicate: true };
    const updated: IntelFinding = {
      ...existing,
      corroborations: existing.corroborations + 1,
      relevance: Math.min(100, existing.relevance + 10),
    };
    return { duplicate: false, updated };
  }
  const relevance = relevanceScore(parsed, enrollments);
  const matchedProjects = enrollments.filter(
    (e) => e.active && e.tags.some((tag) => `${parsed.title} ${parsed.summary}`.toLowerCase().includes(tag.toLowerCase())),
  );
  const routedTo = CATEGORY_ROUTES[parsed.category].filter((consumer) =>
    matchedProjects.some((project) =>
      grants.some((g) => g.projectId === project.id && g.consumer === consumer),
    ),
  );
  return {
    duplicate: false,
    finding: { ...parsed, id, at: now, corroborations: 0, relevance, routedTo },
  };
}

/* ---------------- Store ---------------- */

const storeSchema = z.object({
  version: z.literal(1),
  enrollments: z.array(z.any()),
  events: z.array(z.any()),
  grants: z.array(z.any()),
  sources: z.array(z.any()),
  findings: z.array(z.any()),
});
export type RazulStore = {
  enrollments: ProjectEnrollment[];
  events: ArchiveEvent[];
  grants: AccessGrant[];
  sources: IntelSource[];
  findings: IntelFinding[];
};

export const emptyRazulStore: RazulStore = {
  enrollments: [],
  events: [],
  grants: [],
  sources: [],
  findings: [],
};

export function loadRazulStore(raw: string | null): RazulStore {
  if (!raw) return emptyRazulStore;
  try {
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyRazulStore;
    return {
      enrollments: parsed.data.enrollments as ProjectEnrollment[],
      events: parsed.data.events as ArchiveEvent[],
      grants: parsed.data.grants as AccessGrant[],
      sources: parsed.data.sources as IntelSource[],
      findings: parsed.data.findings as IntelFinding[],
    };
  } catch {
    return emptyRazulStore;
  }
}

export function saveRazulStore(store: RazulStore) {
  return JSON.stringify({ version: 1, ...store });
}
