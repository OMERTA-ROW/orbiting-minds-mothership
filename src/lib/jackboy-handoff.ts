/**
 * omni.handoff/v1 — Mothership asks Jackboy to create a QUEUED job from a held
 * OMNI Terminal task. Jackboy keeps per-job passkey approval, spend caps and
 * execution; Mothership never dispatches to OMNI. Pure helpers (SSR-safe).
 */
import { z } from "zod";

export const HANDOFF_CONTRACT = "omni.handoff/v1";
export const HANDOFF_PATH = "/api/public/omni-handoff/v1";
export const HANDOFF_MAX_SKEW_MS = 60_000;
export const HANDOFF_STATUSES = [
  "queued",
  "approved",
  "quarantined",
  "running",
  "completed",
  "failed",
  "refused",
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number] | "sending" | "error";

export const handoffKind = z.enum(["test", "build"]);
export const sendInput = z
  .object({ taskId: z.string().uuid(), kind: handoffKind })
  .strict();
export const refreshInput = z.object({ taskId: z.string().uuid() }).strict();

export type HandoffJob = {
  taskId: string;
  project: string;
  repository: string;
  kind: "test" | "build";
  instructions: string;
};

/** Stable digest input: field order fixed, so retries match exactly. */
export function canonicalJob(job: HandoffJob) {
  return JSON.stringify({
    taskId: job.taskId,
    project: job.project,
    repository: job.repository,
    kind: job.kind,
    instructions: job.instructions,
  });
}

export function requestSigningString(a: {
  clientId: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}) {
  return [HANDOFF_CONTRACT, "request", a.clientId, a.timestamp, a.nonce, a.bodySha256].join("\n");
}

export function replySigningString(a: { nonce: string; bodySha256: string }) {
  return [HANDOFF_CONTRACT, "reply", a.nonce, a.bodySha256].join("\n");
}

export const replySchema = z
  .object({
    contract: z.literal(HANDOFF_CONTRACT),
    taskId: z.string().uuid(),
    jackboyJobId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    status: z.enum(HANDOFF_STATUSES),
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
  refused: "Refused by Jackboy",
  error: "Not confirmed · retry",
};

/** Map a task to a job kind default; owner can change it. */
export function defaultKind(taskKind: string): "test" | "build" {
  return taskKind === "code.test" || taskKind === "code.debug" ? "test" : "build";
}
