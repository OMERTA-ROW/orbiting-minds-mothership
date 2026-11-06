/**
 * RAZUL Project Knowledge Passports — validation and freshness logic.
 * A passport is a structured, versioned knowledge record for one enrolled
 * project and its resident agent. Passports carry knowledge, never secrets
 * or database dumps; every write records provenance and bumps the version.
 */

export const PASSPORT_LIMITS = {
  maxListItems: 50,
  maxItemLength: 300,
  maxFieldLength: 2000,
  /** A passport older than this is reported stale, never silently trusted. */
  staleAfterHours: 24 * 7,
} as const;

export interface PassportInput {
  project: string;
  residentAgent: string;
  purpose: string;
  features: string[];
  architecture: string;
  documentationUrl?: string | undefined;
  permissions: string[];
  tools: string[];
  pendingTasks: string[];
  verifiedTests: string[];
  status: string;
  lessons: string[];
  provenance: string;
}

const SECRET_PATTERN = /(api[_-]?key|secret|password|token|bearer|private[_-]?key)/i;

function cleanList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > PASSPORT_LIMITS.maxListItems) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > PASSPORT_LIMITS.maxItemLength) return null;
    if (SECRET_PATTERN.test(item)) return null; // passports never carry secrets
    out.push(item);
  }
  return out;
}

/** Validate a passport snapshot; returns an error message or null. */
export function validatePassport(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Passport must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b["project"] !== "string" || !b["project"].trim() || b["project"].length > 80)
    return "project is required (max 80 chars)";
  if (typeof b["residentAgent"] !== "string" || !b["residentAgent"].trim())
    return "residentAgent is required";
  for (const field of ["purpose", "architecture", "status", "provenance"] as const) {
    const v = b[field];
    if (typeof v !== "string" || v.length > PASSPORT_LIMITS.maxFieldLength)
      return `${field} must be a string within the size limit`;
    if (SECRET_PATTERN.test(v) && field !== "provenance")
      return `${field} must not contain secret-like values`;
  }
  if (b["documentationUrl"] !== undefined && b["documentationUrl"] !== null) {
    const u = b["documentationUrl"];
    if (typeof u !== "string" || !/^https:\/\//.test(u)) return "documentationUrl must be HTTPS";
  }
  for (const list of [
    "features",
    "permissions",
    "tools",
    "pendingTasks",
    "verifiedTests",
    "lessons",
  ] as const) {
    if (cleanList(b[list]) === null)
      return `${list} must be a bounded list of short non-secret strings`;
  }
  return null;
}

/** Freshness state for a passport timestamp. */
export function passportFreshness(updatedAt: Date, now: Date): "fresh" | "stale" {
  return now.getTime() - updatedAt.getTime() <= PASSPORT_LIMITS.staleAfterHours * 3600_000
    ? "fresh"
    : "stale";
}

/** One-line status summary for the front door and routing decisions. */
export function passportSummary(
  p: {
    project: string;
    residentAgent: string;
    status: string;
    version: number;
    pendingTasks: string[];
    updatedAt: Date;
  },
  now: Date,
): string {
  const freshness = passportFreshness(p.updatedAt, now);
  return `${p.project} (agent ${p.residentAgent}) — ${p.status}, v${p.version}, ${p.pendingTasks.length} pending task(s), ${freshness}`;
}
