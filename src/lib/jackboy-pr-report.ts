/**
 * Validates a draft-PR report for a Jackboy CODE job before it is shown here. Only https GitHub
 * pull-request links in the allowlisted repository pass. Nothing here merges, deploys or runs code.
 * Wiring to a signed Jackboy callback waits on Jackboy's report format.
 */
import { z } from "zod";

export const PR_STATUSES = ["draft", "open", "merged", "closed"] as const;

export const prReport = z.object({
  taskId: z.string().uuid(),
  prUrl: z.string().max(300),
  prStatus: z.enum(PR_STATUSES),
});

export function parsePrReport(input: unknown, allowedRepo: string) {
  const p = prReport.safeParse(input);
  if (!p.success) return { ok: false as const, reason: "invalid_report" };
  let url: URL;
  try {
    url = new URL(p.data.prUrl);
  } catch {
    return { ok: false as const, reason: "invalid_report" };
  }
  const m = /^\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d{1,9})$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.host !== "github.com" || url.search || url.hash || !m)
    return { ok: false as const, reason: "invalid_report" };
  if (m[1] !== allowedRepo) return { ok: false as const, reason: "repo_not_allowed" };
  return { ok: true as const, report: p.data };
}
