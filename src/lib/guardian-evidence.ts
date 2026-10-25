import { z } from "zod";

// Offline evidence display only, never imported as policy or authentication.
const eventSchema = z.object({
  version: z.literal(1), sequence: z.number().int().positive(), at: z.string().datetime({ offset: true }),
  project: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), severity: z.enum(["info", "warning", "critical"]),
  rule: z.string().regex(/^[a-z-]{1,80}$/), action: z.enum(["DENIED", "ADVISORY", "AUTHORIZED", "PASSED", "FAILED", "TIMED OUT", "CANCELLED", "COULD NOT START"]),
  evidence: z.string().max(700).refine(s => !/[\r\n]/.test(s)), previous: z.string().regex(/^(?:[a-f0-9]{64})?$/), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GuardianEvidenceEvent = z.infer<typeof eventSchema>;
export const maxGuardianEvidenceBytes = 2 * 1024 * 1024;

export async function validateGuardianEvidence(raw: string, expectedHead = ""): Promise<GuardianEvidenceEvent[]> {
  if (new TextEncoder().encode(raw).byteLength > maxGuardianEvidenceBytes) throw new Error("Evidence exceeds 2 MiB.");
  if (expectedHead && !/^[a-f0-9]{64}$/.test(expectedHead)) throw new Error("Saved head must be a 64-character SHA-256 fingerprint.");
  const events = z.array(eventSchema).max(10000).parse(JSON.parse(raw));
  let previous = "", project = "";
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1 || event.previous !== previous || (project && event.project !== project)) throw new Error("Evidence order, project or previous fingerprint mismatch. Preserve the original.");
    const payload = [event.version, event.sequence, event.at, event.project, event.severity, event.rule, event.action, event.evidence, event.previous].join("\n");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== event.sha256) throw new Error("Evidence fingerprint mismatch. Preserve the original.");
    project = event.project; previous = actual;
  }
  if (expectedHead && previous !== expectedHead) throw new Error("Evidence does not match the independently saved head.");
  return events;
}