import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export interface EyeIdentity {
  callerId: string;
  verifiedUserId: string | null;
  emailConfirmed: boolean;
  assurance: string | null;
}
export function assertEyeOwner(identity: EyeIdentity, owner: boolean) {
  if (!identity.verifiedUserId || identity.verifiedUserId !== identity.callerId || !identity.emailConfirmed)
    throw new Error("Verified owner identity is required.");
  if (!owner) throw new Error("All-Seeing Eye infrastructure is available only to the configured owner.");
  if (identity.assurance !== "aal2") throw new Error("Complete owner multi-factor verification before inspecting infrastructure.");
}

export interface EyeRecords {
  checks?: Pick<Row<"razul_source_checks">, "id" | "source_id" | "checked_at" | "status" | "fetched" | "inserted" | "error_code">[];
  audit?: Pick<Row<"razul_control_audit">, "id" | "action" | "record_type" | "occurred_at">[];
  sources: Pick<Row<"razul_sources">, "id" | "name" | "kind" | "category" | "active" | "added_at">[];
  runs: Pick<Row<"razul_runs">, "id" | "status" | "started_at" | "finished_at" | "fetched" | "inserted" | "alerts">[];
  state: Pick<Row<"razul_job_state">, "lease_until" | "paused_at" | "retention_days" | "updated_at"> & Partial<Pick<Row<"razul_job_state">, "alert_threshold" | "coverage" | "blocked_sources">> | null;
  sentinels: Pick<Row<"razul_sentinels">, "id" | "name" | "scopes" | "status" | "expires_at" | "last_seen_at">[];
  queue: Pick<Row<"razul_dispatch_queue">, "id" | "scout_type" | "status" | "guardian_status" | "created_at" | "updated_at">[];
  events: Pick<Row<"razul_sentinel_events">, "id" | "sentinel_id" | "kind" | "created_at">[];
  projects: Pick<Row<"razul_project_passports">, "id" | "project" | "resident_agent" | "status" | "version" | "updated_at">[];
  findings: Pick<Row<"razul_findings">, "id" | "title" | "url" | "source_name" | "source_id" | "collected_at" | "published_at" | "evidence_class"> & Partial<Pick<Row<"razul_findings">, "revision" | "category" | "topic" | "evidence_strength">> extends infer Finding ? Finding[] : never;
  feeds: Pick<Row<"razul_agent_feeds">, "agent" | "categories" | "min_relevance" | "alerts_enabled">[];
}
export interface EyeHistoryEntry { id: string; at: string; kind: string; label: string }
export interface EyeSnapshot extends EyeRecords { readAt: string; history: EyeHistoryEntry[] }

// Project names/titles remain untrusted text, never instructions or capabilities.
export function eyeLabel(value: string) {
  if (/(?:bearer\s|api[_ -]?key|password|secret|token\s*[=:]|-----BEGIN)/i.test(value)) return "[restricted text omitted]";
  return value.replace(/[\u0000-\u001f]/g, " ").slice(0, 160);
}
export function eyeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || /(?:token|key|secret|password|auth)=/i.test(url.search)) return null;
    return url.href;
  } catch { return null; }
}
export function makeEyeSnapshot(records: EyeRecords, readAt: string): EyeSnapshot {
  const sources = records.sources.map((r) => ({ ...r, name: eyeLabel(r.name) }));
  const sentinels = records.sentinels.map((r) => ({ ...r, name: eyeLabel(r.name) }));
  const projects = records.projects.map((r) => ({ ...r, project: eyeLabel(r.project), resident_agent: eyeLabel(r.resident_agent), status: eyeLabel(r.status) }));
  const findings = records.findings.map((r) => ({ ...r, title: eyeLabel(r.title), source_name: eyeLabel(r.source_name), url: eyeSourceUrl(r.url) ?? "" }));
  const history = [
    ...(records.checks ?? []).map((r) => ({ id: `check:${r.id}`, at: r.checked_at, kind: "Source check receipt", label: `${eyeLabel(r.source_id)} · ${r.status} · ${r.fetched} fetched / ${r.inserted} stored${r.error_code ? ` · ${r.error_code}` : ""}` })),
    ...(records.audit ?? []).map((r) => ({ id: `audit:${r.id}`, at: r.occurred_at, kind: "Control change metadata", label: `${eyeLabel(r.record_type)} · ${eyeLabel(r.action)}` })),
    ...records.events.map((r) => ({ id: `event:${r.id}`, at: r.created_at, kind: "Sentinel report metadata", label: `${eyeLabel(r.kind)} · ${r.sentinel_id}` })),
    ...records.runs.map((r) => ({ id: `run:${r.id}`, at: r.finished_at ?? r.started_at, kind: "Ingestion run", label: `${eyeLabel(r.status)} · ${r.fetched} fetched / ${r.inserted} stored` })),
    ...records.queue.map((r) => ({ id: `queue:${r.id}`, at: r.updated_at, kind: "Dispatch record", label: `${eyeLabel(r.scout_type)} · ${eyeLabel(r.status)} / Guardian: ${eyeLabel(r.guardian_status)}` })),
    ...findings.map((r) => ({ id: `finding:${r.id}`, at: r.collected_at, kind: "Sourced finding", label: r.title })),
    ...projects.map((r) => ({ id: `project:${r.id}`, at: r.updated_at, kind: "Passport declaration", label: `${r.project} · v${r.version}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  return { ...records, sources, sentinels, projects, findings, readAt, history };
}

/** Authorize before any infrastructure query; injectable boundaries keep denial tests meaningful. */
export async function readEyeSnapshot(deps: {
  identity: () => Promise<EyeIdentity>;
  owner: () => Promise<boolean>;
  records: () => Promise<EyeRecords>;
  now: () => string;
}) {
  const identity = await deps.identity();
  if (!identity.verifiedUserId || identity.verifiedUserId !== identity.callerId || !identity.emailConfirmed)
    throw new Error("Verified owner identity is required.");
  assertEyeOwner(identity, await deps.owner());
  return makeEyeSnapshot(await deps.records(), deps.now());
}