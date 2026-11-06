import { z } from "zod";

// Autonomous task mode: pure rules. No executor exists in this project, so every
// task stops at "blocked" before any browser/computer action is attempted.
export const AUTONOMY_MAX_STEPS = 25;
export const allowedActions = ["read", "navigate", "click", "type", "download"] as const;
export const protectedActions = [
  "spend",
  "delete",
  "credential_change",
  "public_publish",
  "external_message",
] as const;
export type AllowedAction = (typeof allowedActions)[number];
export type ProtectedAction = (typeof protectedActions)[number];

const host = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/, "Use a plain host like example.com");

export const autonomyTaskInput = z
  .object({
    requestId: z.string().uuid(),
    goal: z.string().trim().min(8).max(1000),
    allowlist: z
      .array(z.object({ host, actions: z.array(z.enum(allowedActions)).min(1).max(5) }).strict())
      .min(1)
      .max(20),
    // Explicit, task-specific authority for otherwise protected actions. Defaults to none.
    grants: z.array(z.enum(protectedActions)).max(5).default([]),
    maxSteps: z.number().int().min(1).max(AUTONOMY_MAX_STEPS).default(10),
  })
  .strict();
export type AutonomyTaskInput = z.infer<typeof autonomyTaskInput>;

export type TaskState =
  | "draft"
  | "awaiting_executor"
  | "blocked"
  | "running"
  | "paused"
  | "stopped"
  | "revoked"
  | "completed"
  | "failed";

const transitions: Record<TaskState, TaskState[]> = {
  draft: ["awaiting_executor", "stopped"],
  awaiting_executor: ["blocked", "running", "stopped", "revoked"],
  blocked: ["stopped", "revoked"],
  running: ["paused", "stopped", "revoked", "completed", "failed"],
  paused: ["running", "stopped", "revoked"],
  stopped: [],
  revoked: [],
  completed: [],
  failed: [],
};
export function canTransition(from: TaskState, to: TaskState) {
  return transitions[from].includes(to);
}
export function transition(from: TaskState, to: TaskState): TaskState {
  if (!canTransition(from, to)) throw new Error(`Task cannot move from ${from} to ${to}.`);
  return to;
}

export type ProposedStep = { host: string; action: AllowedAction | ProtectedAction };
export type StepDecision = { allowed: boolean; reason: string };

/** Decide one proposed executor step against the task's account-scoped policy. */
export function decideStep(
  task: Pick<AutonomyTaskInput, "allowlist" | "grants" | "maxSteps">,
  step: ProposedStep,
  stepsTaken: number,
): StepDecision {
  if (stepsTaken >= task.maxSteps) return { allowed: false, reason: "Step limit reached." };
  const h = step.host.trim().toLowerCase();
  const entry = task.allowlist.find((a) => a.host === h);
  if (!entry) return { allowed: false, reason: `${h} is not on this task's allowlist.` };
  if ((protectedActions as readonly string[]).includes(step.action)) {
    return task.grants.includes(step.action as ProtectedAction)
      ? { allowed: false, reason: `${step.action} granted, but still needs your live approval.` }
      : { allowed: false, reason: `${step.action} needs explicit task-specific approval.` };
  }
  if (!entry.actions.includes(step.action as AllowedAction))
    return { allowed: false, reason: `${step.action} is not allowed on ${h}.` };
  return { allowed: true, reason: "Within allowlist." };
}

/** Phrases in a goal that imply protected actions; they never grant authority. */
export function goalProtectedHints(goal: string): ProtectedAction[] {
  const g = goal.toLowerCase();
  const hits: ProtectedAction[] = [];
  if (/\b(buy|purchase|pay|checkout|order|subscribe)\b/.test(g)) hits.push("spend");
  if (/\b(delete|remove|erase|wipe)\b/.test(g)) hits.push("delete");
  if (/\b(password|credential|2fa|api key|login details)\b/.test(g)) hits.push("credential_change");
  if (/\b(publish|post|tweet|go live)\b/.test(g)) hits.push("public_publish");
  if (/\b(email|message|dm|text|send)\b/.test(g)) hits.push("external_message");
  return hits;
}

export type AutonomyReadiness = {
  signedIn: boolean;
  role: "owner" | "admin" | "tester" | null;
  executor: "not_connected";
  state:
    | "Blocked: sign in"
    | "Blocked: private membership"
    | "Blocked: executor/host companion not connected";
};
export function readinessFor(role: unknown, signedIn: boolean): AutonomyReadiness {
  const r = role === "owner" || role === "admin" || role === "tester" ? role : null;
  return {
    signedIn,
    role: r,
    executor: "not_connected",
    state: !signedIn
      ? "Blocked: sign in"
      : !r
        ? "Blocked: private membership"
        : "Blocked: executor/host companion not connected",
  };
}

export type ActivityEntry = { at: string; state: TaskState; note: string };
export type AutonomyTask = {
  id: string;
  goal: string;
  state: TaskState;
  log: ActivityEntry[];
  hints: ProtectedAction[];
  saved: false;
};
