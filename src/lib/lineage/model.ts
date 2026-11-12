/**
 * Code Lineage Library (pure model). Curated, provenance-aware records of historical languages,
 * protocols, algorithms and software beside their modern descendants. Rules:
 * - every record carries citations; a relationship claim needs evidence matching its strength;
 * - "derived_from" / "influenced_by" / "supersedes" / "implements" need citations and a
 *   documented or attributed confidence; "conceptually_similar" is never a derivation claim;
 * - code text is stored only for redistributable licenses; everything else is link-only;
 * - historical code is never run here — at most in the isolated OMNI sandbox; only modern code
 *   written in this repository runs in local comparison tests.
 */
import { z } from "zod";
import { noteProblem } from "../activation-approvals";

export const ENTRY_KINDS = ["language", "protocol", "algorithm", "software", "component"] as const;
export const RELATIONS = ["derived_from", "influenced_by", "supersedes", "implements", "conceptually_similar"] as const;
export const CONFIDENCE = ["documented", "attributed", "conceptual"] as const;
export const CITATION_KINDS = ["primary", "standard", "secondary", "repository"] as const;
/** Licenses under which this library may store code text. Anything else is link-only. */
export const STORABLE_LICENSES = ["project-owned", "MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "CC0-1.0", "Unlicense"] as const;
export const RUNNABLE = ["not_runnable", "sandbox_only", "local_test"] as const;

export type Relation = (typeof RELATIONS)[number];
export type Confidence = (typeof CONFIDENCE)[number];

export const RELATION_LABEL: Record<Relation, string> = {
  derived_from: "Derived from",
  influenced_by: "Influenced by",
  supersedes: "Supersedes",
  implements: "Implements",
  conceptually_similar: "Conceptually similar (not a derivation claim)",
};
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  documented: "Documented by a primary source or standard",
  attributed: "Stated by a named person or project; not independently confirmed",
  conceptual: "Similarity of idea only; no ancestry claimed",
};

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/, "Use lowercase letters, numbers and dashes.");
const httpsUrl = z.string().url().max(500).refine((u) => u.startsWith("https://"), "Use an https link.");
const clean = (v: string) => !noteProblem(v);

export const citation = z
  .object({
    id: slug,
    title: z.string().trim().min(2).max(300),
    url: httpsUrl,
    publisher: z.string().trim().min(2).max(120),
    year: z.number().int().min(-3000).max(2100).nullable(),
    kind: z.enum(CITATION_KINDS),
    accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type Citation = z.infer<typeof citation>;

export const entry = z
  .object({
    id: slug,
    kind: z.enum(ENTRY_KINDS),
    name: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(10).max(600),
    eraStart: z.number().int().min(-3000).max(2100).nullable(),
    dateNote: z.string().max(200).default(""),
    version: z.string().max(80).default(""),
    license: z.string().min(1).max(120),
    licenseStatus: z.enum(["redistributable", "reference_only", "unknown"]),
    origin: httpsUrl,
    capabilities: z.array(slug).max(12),
    languages: z.array(slug).max(8).default([]),
    citations: z.array(slug).min(1, "Every record needs at least one citation.").max(10),
    securityNote: z.string().max(300).default(""),
  })
  .strict()
  .refine((e) => [e.name, e.summary, e.dateNote, e.securityNote].every(clean), "Remove anything that looks like a key or token.");
export type Entry = z.infer<typeof entry>;

export const relation = z
  .object({
    from: slug,
    to: slug,
    relation: z.enum(RELATIONS),
    confidence: z.enum(CONFIDENCE),
    statement: z.string().trim().min(10).max(400),
    citations: z.array(slug).max(5),
  })
  .strict();
export type RelationRecord = z.infer<typeof relation>;

export const example = z
  .object({
    id: slug,
    entry: slug,
    title: z.string().trim().min(2).max(160),
    role: z.enum(["historical", "modern"]),
    language: z.string().max(40),
    license: z.string().min(1).max(120),
    source: httpsUrl.nullable(),
    code: z.string().max(8000).nullable(),
    runnable: z.enum(RUNNABLE),
    implementation: z.string().nullable().default(null),
    note: z.string().max(300).default(""),
  })
  .strict();
export type Example = z.infer<typeof example>;

export const vector = z
  .object({
    id: slug,
    entry: slug,
    input: z.string().max(400),
    expected: z.string().max(400),
    origin: z.enum(["published", "derived"]),
    citation: slug.nullable(),
    note: z.string().max(200).default(""),
  })
  .strict();
export type Vector = z.infer<typeof vector>;

export type Library = { citations: Citation[]; entries: Entry[]; relations: RelationRecord[]; examples: Example[]; vectors: Vector[] };

/** Evidence rule for one relationship. Returns a problem, or null when the claim is allowed. */
export function relationProblem(r: RelationRecord, citations: Map<string, Citation>): string | null {
  if (r.from === r.to) return "A record cannot relate to itself.";
  const cites = r.citations.map((c) => citations.get(c));
  if (cites.some((c) => !c)) return "Unknown citation.";
  if (r.relation === "conceptually_similar") {
    return r.confidence === "conceptual" ? null : "Conceptual similarity must be marked conceptual; it is never a derivation claim.";
  }
  if (r.confidence === "conceptual") return `"${RELATION_LABEL[r.relation]}" is an ancestry or standards claim; use conceptually similar instead.`;
  if (!cites.length) return "This claim needs at least one citation.";
  if (r.confidence === "documented" && !cites.some((c) => c!.kind === "primary" || c!.kind === "standard"))
    return "Documented claims need a primary source or a standard.";
  return null;
}

export function exampleProblem(e: Example): string | null {
  const storable = (STORABLE_LICENSES as readonly string[]).includes(e.license);
  if (e.code !== null && !storable) return "Code under this license is link-only; store the source link, not the code.";
  if (e.code === null && !e.source) return "Link-only examples need a source link.";
  if (e.role === "historical" && e.runnable === "local_test") return "Historical code never runs here; at most in the isolated sandbox.";
  if (e.runnable === "local_test" && (e.implementation === null || e.license !== "project-owned"))
    return "Only modern code written in this repository runs in local comparison tests.";
  if (e.code !== null && e.code.includes("\u0000")) return "Binary content is not accepted.";
  return null;
}

/** Validates a whole library; returns every problem found (empty = consistent). */
export function validateLibrary(lib: Library): string[] {
  const p: string[] = [];
  const cites = new Map(lib.citations.map((c) => [c.id, c]));
  const ids = new Set<string>();
  for (const c of lib.citations) if (!citation.safeParse(c).success) p.push(`citation ${c.id}: invalid`);
  for (const e of lib.entries) {
    const r = entry.safeParse(e);
    if (!r.success) p.push(`entry ${e.id}: ${r.error.issues[0]?.message}`);
    if (ids.has(e.id)) p.push(`entry ${e.id}: duplicate`);
    ids.add(e.id);
    for (const c of e.citations) if (!cites.has(c)) p.push(`entry ${e.id}: unknown citation ${c}`);
  }
  for (const r of lib.relations) {
    if (!ids.has(r.from) || !ids.has(r.to)) p.push(`relation ${r.from}→${r.to}: unknown record`);
    const problem = relationProblem(r, cites);
    if (problem) p.push(`relation ${r.from}→${r.to}: ${problem}`);
  }
  for (const e of lib.examples) {
    if (!ids.has(e.entry)) p.push(`example ${e.id}: unknown record`);
    const problem = exampleProblem(e);
    if (problem) p.push(`example ${e.id}: ${problem}`);
  }
  for (const v of lib.vectors) {
    if (!ids.has(v.entry)) p.push(`vector ${v.id}: unknown record`);
    if (v.origin === "published" && (!v.citation || !cites.has(v.citation))) p.push(`vector ${v.id}: published vectors need their citation`);
  }
  return p;
}

// ------------------------------------------------------------------ search and lineage

export type SearchQuery = {
  text?: string;
  kind?: (typeof ENTRY_KINDS)[number];
  capability?: string;
  language?: string;
  eraFrom?: number;
  eraTo?: number;
};

export function search(lib: Library, q: SearchQuery): Entry[] {
  const words = (q.text ?? "").toLowerCase().match(/[a-z0-9+#]{2,}/g) ?? [];
  return lib.entries
    .filter((e) => !q.kind || e.kind === q.kind)
    .filter((e) => !q.capability || e.capabilities.includes(q.capability))
    .filter((e) => !q.language || e.languages.includes(q.language) || e.id === q.language)
    .filter((e) => (q.eraFrom === undefined || (e.eraStart ?? Infinity) >= q.eraFrom) && (q.eraTo === undefined || (e.eraStart ?? -Infinity) <= q.eraTo))
    .filter((e) => {
      if (!words.length) return true;
      const hay = `${e.id} ${e.name} ${e.summary} ${e.capabilities.join(" ")} ${e.languages.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (a.eraStart ?? 9999) - (b.eraStart ?? 9999) || a.name.localeCompare(b.name));
}

/**
 * Ancestors of a record. With `provenOnly`, follows only documented derived_from/supersedes edges —
 * never influences or similarities — so the result is an ancestry the sources actually state.
 */
export function ancestors(lib: Library, id: string, provenOnly: boolean): { id: string; via: RelationRecord }[] {
  const out: { id: string; via: RelationRecord }[] = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of lib.relations) {
      if (r.from !== cur || seen.has(r.to)) continue;
      if (r.relation === "conceptually_similar") continue;
      if (provenOnly && (r.confidence !== "documented" || !["derived_from", "supersedes"].includes(r.relation))) continue;
      seen.add(r.to);
      out.push({ id: r.to, via: r });
      queue.push(r.to);
    }
  }
  return out;
}

// ------------------------------------------------------------------ comparison and packaging

export type ComparisonResult = { entry: string; implementation: string; passed: number; total: number; failures: { vector: string; expected: string; got: string }[] };

export function compare(entryId: string, implementation: string, fn: (input: string) => string, vectors: Vector[]): ComparisonResult {
  const vs = vectors.filter((v) => v.entry === entryId);
  const failures: ComparisonResult["failures"] = [];
  for (const v of vs) {
    let got: string;
    try {
      got = fn(v.input);
    } catch (e) {
      got = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }
    if (got !== v.expected) failures.push({ vector: v.id, expected: v.expected, got });
  }
  return { entry: entryId, implementation, passed: vs.length - failures.length, total: vs.length, failures };
}

/** A component Jackboy may package: modern, repository-owned, has code, every vector passes, at least one published vector. */
export function packageProblem(lib: Library, ex: Example, result: ComparisonResult): string | null {
  if (ex.role !== "modern") return "Only modern components can be packaged.";
  if (ex.license !== "project-owned" || ex.code === null) return "Only code written and owned in this repository can be packaged.";
  if (result.total === 0) return "No comparison tests for this record.";
  if (result.passed !== result.total) return `${result.total - result.passed} comparison test(s) fail.`;
  if (!lib.vectors.some((v) => v.entry === ex.entry && v.origin === "published"))
    return "Needs at least one published (not self-derived) test vector.";
  return null;
}
