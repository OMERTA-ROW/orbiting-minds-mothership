/**
 * jackboy.omni-handoff/v1 — Mothership asks Jackboy to create a QUEUED job from a
 * held OMNI Terminal task. Mirrors Jackboy's src/lib/omni-handoff-v1.ts exactly.
 * Jackboy keeps per-job passkey approval, Kill Switch, project authorization,
 * spend caps and execution; Mothership never dispatches to OMNI. SSR-safe.
 */
import { z } from "zod";

export const HANDOFF_CONTRACT = "jackboy.omni-handoff/v1";
export const HANDOFF_PATH = "/api/public/omni-handoff/v1";
export const HANDOFF_MAX_BODY_BYTES = 8192;
export const HANDOFF_MAX_SKEW_MS = 60_000;
export const HANDOFF_MIN_SECRET_LENGTH = 32;

/** Every status Jackboy may report (its KNOWN_STATUSES plus "unknown"). */
export const JACKBOY_STATUSES = [
  "queued",
  "sent",
  "prepared",
  "approved",
  "quarantined",
  "running",
  "completed",
  "failed",
  "expired",
  "cancel_requested",
  "cancelled",
  "unknown",
] as const;
export type JackboyStatus = (typeof JACKBOY_STATUSES)[number];

/**
 * The saved handoff row only allows a fixed set of statuses, so the exact Jackboy
 * status is kept in the row's detail as `jackboy:<status>` and this coarse value
 * goes in the status column. "unknown" is saved as "error" so the owner can retry
 * (a repeated create returns the existing Jackboy job).
 */
export const STORED_STATUS: Record<JackboyStatus, StoredStatus> = {
  queued: "queued",
  sent: "queued",
  prepared: "queued",
  approved: "approved",
  quarantined: "quarantined",
  running: "running",
  cancel_requested: "running",
  completed: "completed",
  failed: "failed",
  expired: "refused",
  cancelled: "refused",
  unknown: "error",
};
export type StoredStatus =
  | "sending"
  | "queued"
  | "approved"
  | "quarantined"
  | "running"
  | "completed"
  | "failed"
  | "refused"
  | "error";
export type HandoffStatus = StoredStatus;

/** Mothership's Test/Build choice → Jackboy's wire kind. */
export const handoffKind = z.enum(["test", "build"]);
export const WIRE_KIND = { test: "test", build: "code" } as const;

const uuid = z.string().uuid();
export const sendInput = z
  .object({ taskId: uuid, kind: handoffKind, jackboyProjectId: uuid })
  .strict();
export const refreshInput = z.object({ taskId: uuid }).strict();

/**
 * Owner-confirmed Jackboy agent project ids by repository. Only a prefill; the
 * owner can change it, and nothing is sent without an explicit uuid.
 */
export const KNOWN_JACKBOY_PROJECTS: Record<string, string> = {
  "OMERTA-ROW/jackboy-dev-control": "6e320e65-08ec-450b-8a26-61206b604513",
};

export type HandoffJob = {
  taskId: string;
  /** Jackboy's agent project id (not a Mothership id). */
  projectId: string;
  repo: string;
  kind: "test" | "build";
  instructions: string;
};

/** Exact create body fields and order Jackboy validates (strict, no extra keys). */
export function createBody(job: HandoffJob, digest: string) {
  return JSON.stringify({
    action: "create",
    taskId: job.taskId,
    projectId: job.projectId,
    repo: job.repo,
    kind: WIRE_KIND[job.kind],
    instructions: job.instructions,
    digest,
  });
}

export function statusBody(taskId: string) {
  return JSON.stringify({ action: "status", taskId });
}

/** Mothership-side idempotency fingerprint: same task, project, repo, kind and text. */
export function canonicalJob(job: HandoffJob) {
  return JSON.stringify({
    taskId: job.taskId,
    projectId: job.projectId,
    repo: job.repo,
    kind: WIRE_KIND[job.kind],
    instructions: job.instructions,
  });
}

/** Exact bytes signed for x-jackboy-signature. */
export function requestSigningString(client: string, timestamp: string, nonce: string, body: string) {
  return `${HANDOFF_CONTRACT}\nPOST\n${HANDOFF_PATH}\n${client}\n${timestamp}\n${nonce}\n${body}`;
}

/** Exact bytes Jackboy signs for the X-Jackboy-Proof response header. */
export function responseSigningString(nonce: string, httpStatus: number, body: string) {
  return `${HANDOFF_CONTRACT}\nresponse\n${nonce}\n${httpStatus}\n${body}`;
}

export const replyOkSchema = z
  .object({
    contract: z.literal(HANDOFF_CONTRACT),
    requestNonce: z.string().regex(/^[a-f0-9]{32}$/),
    jackboyJobId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    status: z.enum(JACKBOY_STATUSES),
  })
  .strict();

export const replyErrorSchema = z
  .object({
    contract: z.literal(HANDOFF_CONTRACT),
    requestNonce: z.string().regex(/^[a-f0-9]{32}$/),
    error: z.string().regex(/^[a-z_]{1,64}$/),
  })
  .strict();

export const STATUS_LABEL: Record<HandoffStatus | "not_sent", string> = {
  not_sent: "Held · not sent",
  sending: "Sending to Jackboy",
  queued: "Queued in Jackboy · needs your passkey",
  approved: "Approved in Jackboy",
  quarantined: "Quarantined by OMNI",
  running: "Running (reported by Jackboy)",
  completed: "Completed (reported by Jackboy)",
  failed: "Failed (reported by Jackboy)",
  refused: "Ended in Jackboy",
  error: "Not confirmed · retry",
};

/** Exact Jackboy status badges. */
export const JACKBOY_STATUS_LABEL: Record<JackboyStatus, string> = {
  queued: "Queued in Jackboy · needs your passkey",
  sent: "Sent by Jackboy",
  prepared: "Prepared in Jackboy",
  approved: "Approved in Jackboy",
  quarantined: "Quarantined by OMNI",
  running: "Running (reported by Jackboy)",
  completed: "Completed (reported by Jackboy)",
  failed: "Failed (reported by Jackboy)",
  expired: "Expired in Jackboy",
  cancel_requested: "Cancel requested in Jackboy",
  cancelled: "Cancelled in Jackboy",
  unknown: "Unknown in Jackboy · retry",
};

/** Badge text for a saved row: the exact Jackboy status when recorded, else the coarse one. */
export function handoffBadge(status: string, detail: string | null | undefined) {
  const exact = detail?.startsWith("jackboy:") ? detail.slice(8) : "";
  if ((JACKBOY_STATUSES as readonly string[]).includes(exact))
    return JACKBOY_STATUS_LABEL[exact as JackboyStatus];
  return STATUS_LABEL[status as HandoffStatus | "not_sent"] ?? status;
}

/** Map a task to a job kind default; owner can change it. */
export function defaultKind(taskKind: string): "test" | "build" {
  return taskKind === "code.test" || taskKind === "code.debug" ? "test" : "build";
}
