/**
 * OMNI CODE supervised task queue (pure model). OMNI is the motor; CODE is its terminal/coding
 * engine. "Always on" means the service may pick up already-authorized jobs continuously, inside
 * bounded concurrency, rate and spend limits, idle scheduling and a renewable (≤24 h) owner
 * authorization. It never grants shell privileges, standing approval of destructive steps, or any
 * authority over Jackboy, whose autonomous mode stays off independently.
 *
 * Nothing here executes: a worker (Railway sandbox / Mac companion) that implements this contract
 * is required, and none is connected.
 */
import { z } from "zod";

export const CODE_QUEUE_LIMITS = {
  maxConcurrent: 3,
  maxConcurrentCeiling: 5,
  maxPerAgent: 2,
  maxPerAgentCeiling: 3,
  maxAttempts: 3,
  maxAttemptsCeiling: 5,
  leaseSeconds: 120,
  jobsPerAgentPerHour: 20,
  jobsPerAgentPerHourCeiling: 60,
  backoffBaseSec: 30,
  backoffMaxSec: 900,
  companionHeartbeatSec: 60,
  alwaysOnMaxHours: 24,
} as const;

/** Jackboy keeps its own CODE gatekeeper; its autonomous mode stays off independently of OMNI. */
export const CODE_EXCLUDED_AGENTS = ["jackboy"] as const;

export const CODE_JOB_KINDS = [
  "code_task",
  "file_inventory",
  "file_plan",
  "file_apply",
  "file_undo",
] as const;
export type CodeJobKind = (typeof CODE_JOB_KINDS)[number];
/** Kinds that change files on the owner's Mac. Each needs an explicit owner approval before any lease. */
export const APPROVAL_KINDS: readonly CodeJobKind[] = ["file_apply", "file_undo"];
/** Kinds that need the Mac companion connected. */
export const COMPANION_KINDS: readonly CodeJobKind[] = [
  "file_inventory",
  "file_plan",
  "file_apply",
  "file_undo",
];

export const CODE_JOB_STATUSES = [
  "queued",
  "leased",
  "running",
  "awaiting_approval",
  "retry_wait",
  "paused",
  "succeeded",
  "failed",
  "stopped",
  "cancelled",
] as const;
export type CodeJobStatus = (typeof CODE_JOB_STATUSES)[number];
export const TERMINAL_STATUSES: readonly CodeJobStatus[] = [
  "succeeded",
  "failed",
  "stopped",
  "cancelled",
];

export type CodeJob = {
  id: string;
  agentId: string;
  kind: CodeJobKind;
  status: CodeJobStatus;
  attempts: number;
  maxAttempts: number;
  /** Destructive jobs are never retried automatically. */
  destructive: boolean;
  approvedAt: number | null;
  notBefore: number | null;
  leaseExpiresAt: number | null;
  /** Opaque resume point reported by the worker; a resumed job continues from here. */
  checkpoint: string | null;
  createdAt: number;
};

export type CodeEvent =
  | { type: "lease"; leaseSeconds?: number }
  | { type: "start" }
  | { type: "checkpoint"; checkpoint: string }
  | { type: "need_approval" }
  | { type: "approve" }
  | { type: "fail"; retryable: boolean }
  | { type: "succeed" }
  | { type: "lease_expired" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "cancel" };

export const backoffSeconds = (attempt: number) =>
  Math.min(
    CODE_QUEUE_LIMITS.backoffMaxSec,
    CODE_QUEUE_LIMITS.backoffBaseSec * 2 ** Math.max(0, attempt - 1),
  );

/** Strict state machine. Returns an error string for any transition not listed. */
export function transition(job: CodeJob, ev: CodeEvent, now: number): CodeJob | string {
  const s = job.status;
  const done = TERMINAL_STATUSES.includes(s);
  if (done) return `Job already ${s}.`;
  switch (ev.type) {
    case "lease":
      if (s !== "queued" && !(s === "retry_wait" && (job.notBefore ?? 0) <= now))
        return `Cannot lease a ${s} job.`;
      if (APPROVAL_KINDS.includes(job.kind) && job.approvedAt === null)
        return "This job changes files and needs your approval first.";
      return {
        ...job,
        status: "leased",
        leaseExpiresAt: now + (ev.leaseSeconds ?? CODE_QUEUE_LIMITS.leaseSeconds) * 1000,
        notBefore: null,
      };
    case "start":
      if (s !== "leased") return `Cannot start a ${s} job.`;
      return { ...job, status: "running", attempts: job.attempts + 1 };
    case "checkpoint":
      if (s !== "running") return "Only a running job can checkpoint.";
      return {
        ...job,
        checkpoint: ev.checkpoint.slice(0, 2000),
        leaseExpiresAt: now + CODE_QUEUE_LIMITS.leaseSeconds * 1000,
      };
    case "need_approval":
      if (s !== "running" && s !== "leased") return `Cannot ask for approval from ${s}.`;
      return { ...job, status: "awaiting_approval", leaseExpiresAt: null, approvedAt: null };
    case "approve":
      if (s !== "awaiting_approval" && !(s === "queued" && APPROVAL_KINDS.includes(job.kind)))
        return "Nothing is waiting for approval.";
      return { ...job, status: "queued", approvedAt: now };
    case "fail": {
      if (s !== "running" && s !== "leased") return `Cannot fail a ${s} job.`;
      const canRetry = ev.retryable && !job.destructive && job.attempts < job.maxAttempts;
      return canRetry
        ? {
            ...job,
            status: "retry_wait",
            leaseExpiresAt: null,
            notBefore: now + backoffSeconds(job.attempts) * 1000,
          }
        : { ...job, status: "failed", leaseExpiresAt: null };
    }
    case "succeed":
      if (s !== "running") return `Cannot finish a ${s} job.`;
      return { ...job, status: "succeeded", leaseExpiresAt: null };
    case "lease_expired": {
      // Worker vanished: resume from the last checkpoint, counting the attempt. Destructive jobs stop for review.
      if (s !== "leased" && s !== "running") return `No lease on a ${s} job.`;
      if ((job.leaseExpiresAt ?? Infinity) > now) return "Lease has not expired.";
      if (job.destructive && s === "running")
        return { ...job, status: "awaiting_approval", leaseExpiresAt: null, approvedAt: null };
      if (job.attempts >= job.maxAttempts)
        return { ...job, status: "failed", leaseExpiresAt: null };
      return { ...job, status: "queued", leaseExpiresAt: null };
    }
    case "pause":
      if (s === "paused") return "Already paused.";
      return { ...job, status: "paused", leaseExpiresAt: null };
    case "resume":
      if (s !== "paused") return "Job is not paused.";
      return { ...job, status: "queued" };
    case "stop":
      return { ...job, status: "stopped", leaseExpiresAt: null };
    case "cancel":
      if (s === "running" || s === "leased") return "Stop a running job instead of cancelling it.";
      return { ...job, status: "cancelled" };
  }
}

// ---------------------------------------------------------------- service state

export type CodeServiceSettings = {
  alwaysOn: boolean;
  alwaysOnUntil: number | null;
  maxConcurrent: number;
  maxPerAgent: number;
  jobsPerAgentPerHour: number;
  idleOnly: boolean;
  minIdleMinutes: number;
  /** Optional local-time window [startHour, endHour) when the service may start jobs. */
  windowStartHour: number | null;
  windowEndHour: number | null;
};

export const DEFAULT_CODE_SERVICE: CodeServiceSettings = {
  alwaysOn: false,
  alwaysOnUntil: null,
  maxConcurrent: CODE_QUEUE_LIMITS.maxConcurrent,
  maxPerAgent: CODE_QUEUE_LIMITS.maxPerAgent,
  jobsPerAgentPerHour: CODE_QUEUE_LIMITS.jobsPerAgentPerHour,
  idleOnly: true,
  minIdleMinutes: 10,
  windowStartHour: null,
  windowEndHour: null,
};

export type CodeServiceContext = {
  now: number;
  /** Local hour 0–23 on the device that will do the work. */
  localHour: number;
  settings: CodeServiceSettings;
  /** All Autonomous-Mode readiness gates (live sandbox, signed link, stop drill, spend meter…) passed. */
  readinessPassed: boolean;
  emergencyStopReleased: boolean | null;
  killSwitchEnabled: boolean | null;
  pausedAgents: ReadonlySet<string>;
  /** Last signed heartbeat from the Mac companion, or null when none is docked. */
  companionHeartbeatAt: number | null;
  /** Seconds the Mac has been idle, as reported by the companion; null = unknown. */
  companionIdleSeconds: number | null;
};

export function inWindow(hour: number, start: number | null, end: number | null) {
  if (start === null || end === null) return true;
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Why the service is (not) taking jobs. Fails closed on missing or unreadable state. */
export function codeServiceStatus(c: CodeServiceContext): {
  processing: boolean;
  companion: boolean;
  reasons: string[];
} {
  const r: string[] = [];
  if (c.emergencyStopReleased !== true) r.push("Emergency Stop is engaged or unreadable.");
  if (c.killSwitchEnabled !== true) r.push("The terminal kill switch is off.");
  if (!c.readinessPassed)
    r.push(
      "Readiness gates have not all passed (live sandbox, signed link, stop drill, spend meter).",
    );
  if (!c.settings.alwaysOn) r.push("CODE always-on is off.");
  else if (c.settings.alwaysOnUntil === null || c.settings.alwaysOnUntil <= c.now)
    r.push("CODE always-on authorization expired; renew with your passkey.");
  if (!inWindow(c.localHour, c.settings.windowStartHour, c.settings.windowEndHour))
    r.push("Outside the allowed hours.");
  const companion =
    c.companionHeartbeatAt !== null &&
    c.now - c.companionHeartbeatAt <= CODE_QUEUE_LIMITS.companionHeartbeatSec * 1000;
  return { processing: r.length === 0, companion, reasons: r };
}

/**
 * Picks which queued jobs a worker may lease now: oldest first, bounded globally and per agent,
 * rate limited per agent, never Jackboy, never a paused agent, never an unapproved file change,
 * and Mac jobs only while the companion is connected (and the Mac idle, when required).
 */
export function pickLeasable(
  jobs: CodeJob[],
  c: CodeServiceContext,
  startsLastHour: Readonly<Record<string, number>>,
): string[] {
  const st = codeServiceStatus(c);
  if (!st.processing) return [];
  const active = jobs.filter((j) => j.status === "leased" || j.status === "running");
  const perAgent = new Map<string, number>();
  for (const j of active) perAgent.set(j.agentId, (perAgent.get(j.agentId) ?? 0) + 1);
  const max = Math.min(c.settings.maxConcurrent, CODE_QUEUE_LIMITS.maxConcurrentCeiling);
  const maxAgent = Math.min(c.settings.maxPerAgent, CODE_QUEUE_LIMITS.maxPerAgentCeiling);
  const rate = Math.min(
    c.settings.jobsPerAgentPerHour,
    CODE_QUEUE_LIMITS.jobsPerAgentPerHourCeiling,
  );
  const idleOk =
    !c.settings.idleOnly ||
    (c.companionIdleSeconds !== null && c.companionIdleSeconds >= c.settings.minIdleMinutes * 60);
  let slots = max - active.length;
  const picked: string[] = [];
  const started = { ...startsLastHour };
  const ready = jobs
    .filter(
      (j) => j.status === "queued" || (j.status === "retry_wait" && (j.notBefore ?? 0) <= c.now),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const j of ready) {
    if (slots <= 0) break;
    if ((CODE_EXCLUDED_AGENTS as readonly string[]).includes(j.agentId)) continue;
    if (c.pausedAgents.has(j.agentId)) continue;
    if (APPROVAL_KINDS.includes(j.kind) && j.approvedAt === null) continue;
    if (COMPANION_KINDS.includes(j.kind) && (!st.companion || !idleOk)) continue;
    if ((perAgent.get(j.agentId) ?? 0) >= maxAgent) continue;
    if ((started[j.agentId] ?? 0) >= rate) continue;
    picked.push(j.id);
    perAgent.set(j.agentId, (perAgent.get(j.agentId) ?? 0) + 1);
    started[j.agentId] = (started[j.agentId] ?? 0) + 1;
    slots--;
  }
  return picked;
}

export const alwaysOnInput = z.object({
  hours: z.union([z.literal(1), z.literal(4), z.literal(8), z.literal(24)]),
});
