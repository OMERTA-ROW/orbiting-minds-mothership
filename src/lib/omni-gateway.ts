import { z } from "zod";

/**
 * OMNI coding gateway for Jackboy integration.
 * Browser-local planning records only. No authenticated job API, service
 * identity, sandbox runner, model inference, repository write, merge or
 * deploy exists in this project, so every job stops at "blocked" before any
 * code is generated or executed. Nothing here runs untrusted code.
 */
export const OMNI_GATEWAY_STORE_KEY = "evolution.omni-gateway.v1";

export const projectScopes = [
  "read-source",
  "propose-patch",
  "run-sandbox-tests",
  "submit-review",
] as const;
export type ProjectScope = (typeof projectScopes)[number];

const shortText = z.string().trim().min(2).max(240);
const longText = z.string().trim().min(10).max(4000);

export const enrollmentInputSchema = z
  .object({
    name: shortText,
    origin: shortText.max(500),
    scopes: z.array(z.enum(projectScopes)).min(1).max(projectScopes.length),
    ownerConfirmed: z.literal(true),
  })
  .strict();
export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>;

export type EnrolledProject = EnrollmentInput & {
  id: string;
  enrolledAt: string;
  status: "enrolled" | "revoked";
  history: string[];
};

export function enrollProject(input: unknown, id: string, now: string): EnrolledProject {
  const parsed = enrollmentInputSchema.parse(input);
  return {
    ...parsed,
    id,
    enrolledAt: now,
    status: "enrolled",
    history: [`${now} · enrolled with scopes: ${parsed.scopes.join(", ")}`],
  };
}

export function revokeProject(project: EnrolledProject, now: string): EnrolledProject {
  if (project.status === "revoked") return project;
  return {
    ...project,
    status: "revoked",
    history: [...project.history, `${now} · enrollment revoked; all scopes withdrawn`],
  };
}

export const gatewayJobStates = [
  "received",
  "proposing",
  "proposed",
  "testing",
  "tested",
  "in-review",
  "changes-requested",
  "approved",
  "blocked",
  "cancelled",
] as const;
export type GatewayJobState = (typeof gatewayJobStates)[number];

const jobTransitions: Record<GatewayJobState, GatewayJobState[]> = {
  received: ["proposing", "blocked", "cancelled"],
  proposing: ["proposed", "blocked", "cancelled"],
  proposed: ["testing", "blocked", "cancelled"],
  testing: ["tested", "blocked", "cancelled"],
  tested: ["in-review", "blocked", "cancelled"],
  "in-review": ["changes-requested", "approved", "cancelled"],
  "changes-requested": ["proposing", "cancelled"],
  approved: [],
  blocked: ["cancelled"],
  cancelled: [],
};
export function canJobTransition(from: GatewayJobState, to: GatewayJobState) {
  return jobTransitions[from].includes(to);
}
export function transitionJob(from: GatewayJobState, to: GatewayJobState): GatewayJobState {
  if (!canJobTransition(from, to)) throw new Error(`Job cannot move from ${from} to ${to}.`);
  return to;
}

export const gatewayTaskInputSchema = z
  .object({
    projectId: z.string().uuid(),
    goal: longText,
    targetHint: shortText.max(500).optional(),
    jackboyApproved: z.literal(true),
    approvalNote: shortText.max(500),
    // Owner attests the task does not ask OMNI to run scraped/untrusted code.
    noUntrustedCode: z.literal(true),
  })
  .strict();
export type GatewayTaskInput = z.infer<typeof gatewayTaskInputSchema>;

export type JobLogEntry = { at: string; state: GatewayJobState; note: string };

export type GatewayJob = GatewayTaskInput & {
  id: string;
  createdAt: string;
  state: GatewayJobState;
  log: JobLogEntry[];
  patchProposal: string | null;
  testEvidence: string | null;
  saved: false;
};

/** Words that would imply authority the gateway never holds. */
export function forbiddenGoalHints(goal: string): string[] {
  const g = goal.toLowerCase();
  const hits: string[] = [];
  if (/\b(merge|auto-?merge|commit|push)\b/.test(g)) hits.push("merge/push");
  if (/\b(deploy|release|publish|ship)\b/.test(g)) hits.push("deploy/release");
  if (/\b(secret|credential|token|api key|password)\b/.test(g)) hits.push("secrets");
  if (/\b(delete|drop|wipe|rm -rf)\b/.test(g)) hits.push("destructive");
  return hits;
}

/** Create a job. Without a connected runner it is immediately blocked. */
export function receiveJob(
  input: unknown,
  project: EnrolledProject,
  id: string,
  now: string,
): GatewayJob {
  const parsed = gatewayTaskInputSchema.parse(input);
  if (project.status !== "enrolled") throw new Error("Project enrollment is revoked.");
  if (parsed.projectId !== project.id) throw new Error("Task does not match this project.");
  const hints = forbiddenGoalHints(parsed.goal);
  const log: JobLogEntry[] = [
    { at: now, state: "received", note: "Jackboy-approved task received; nothing executed." },
  ];
  if (hints.length)
    log.push({
      at: now,
      state: "received",
      note: `Goal mentions ${hints.join(", ")} — never performed by the gateway; owner review required.`,
    });
  log.push({
    at: now,
    state: "blocked",
    note: "Blocked: sandbox runner and authenticated job API not connected. No patch generated, no tests run.",
  });
  return {
    ...parsed,
    id,
    createdAt: now,
    state: "blocked",
    log,
    patchProposal: null,
    testEvidence: null,
    saved: false,
  };
}

export const feedbackChannels = ["angeltech-quality", "demontech-security"] as const;
export type FeedbackChannel = (typeof feedbackChannels)[number];

export const feedbackInputSchema = z
  .object({
    jobId: z.string().uuid(),
    channel: z.enum(feedbackChannels),
    note: longText.max(2000),
  })
  .strict();
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export type FeedbackEntry = FeedbackInput & { id: string; at: string; advisory: true };

/** Feedback is advisory only; it never changes job state or grants authority. */
export function addFeedback(input: unknown, id: string, now: string): FeedbackEntry {
  return { ...feedbackInputSchema.parse(input), id, at: now, advisory: true };
}

export type GatewayReadiness = {
  state: "Blocked";
  blockers: string[];
};
export function gatewayReadiness(): GatewayReadiness {
  return {
    state: "Blocked",
    blockers: [
      "Private account/member setup is not activated on the shared backend.",
      "No least-privilege service identity or scoped project tokens exist.",
      "No isolated sandbox runner is connected; untrusted code must never run without one.",
      "No model inference path is activated for patch generation.",
      "Repository writes, merge and deploy stay disabled pending owner approval.",
    ],
  };
}

export type GatewayStore = {
  version: 1;
  projects: EnrolledProject[];
  jobs: GatewayJob[];
  feedback: FeedbackEntry[];
};
export const emptyGatewayStore: GatewayStore = { version: 1, projects: [], jobs: [], feedback: [] };

export function loadGatewayStore(raw: string | null): GatewayStore {
  if (!raw) return emptyGatewayStore;
  try {
    const parsed = JSON.parse(raw) as Partial<GatewayStore>;
    return {
      version: 1,
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return emptyGatewayStore;
  }
}
