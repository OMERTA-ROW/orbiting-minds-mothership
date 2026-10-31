import { z } from "zod";

/**
 * OMNI multi-agent registry and collaboration conventions.
 * Browser-local registry records only. No agent is live: there is no runner,
 * model inference path, or backend membership activation in this project.
 * Registry entries declare roles and capabilities; they never grant authority.
 */
export const OMNI_AGENTS_STORE_KEY = "evolution.omni-agents.v1";

export const agentCategories = [
  "angeltech", // constructive research, creation and quality
  "demontech", // authorized defensive security / risk testing
  "guardian", // permissions and audit
  "omni-core", // coordination and drafting
] as const;
export type AgentCategory = (typeof agentCategories)[number];

export const agentCapabilities = [
  "autonomous-discovery",
  "drafting",
  "code-generation",
  "isolated-testing",
  "security-review",
  "quality-review",
  "audit-logging",
] as const;
export type AgentCapability = (typeof agentCapabilities)[number];

/** Actions that always need owner/human approval regardless of declarations. */
export const approvalBoundaries = [
  "irreversible",
  "high-impact",
  "private-data",
  "production",
] as const;
export type ApprovalBoundary = (typeof approvalBoundaries)[number];

const shortText = z.string().trim().min(2).max(240);
const longText = z.string().trim().min(10).max(2000);

export const agentRegistrationSchema = z
  .object({
    name: shortText,
    category: z.enum(agentCategories),
    mission: longText.max(1000),
    capabilities: z.array(z.enum(agentCapabilities)).min(1).max(agentCapabilities.length),
    projectIds: z.array(z.string().uuid()).min(1).max(20),
    ownerConfirmed: z.literal(true),
  })
  .strict();
export type AgentRegistrationInput = z.infer<typeof agentRegistrationSchema>;

export type RegisteredAgent = AgentRegistrationInput & {
  id: string;
  registeredAt: string;
  paused: boolean;
  live: false;
  history: string[];
};

/** Register an agent scoped to opted-in projects. Declaration only — never live. */
export function registerAgent(input: unknown, id: string, now: string): RegisteredAgent {
  const parsed = agentRegistrationSchema.parse(input);
  return {
    ...parsed,
    id,
    registeredAt: now,
    paused: false,
    live: false,
    history: [`${now} · registered as ${parsed.category}; declaration only, not live`],
  };
}

/** Owner pause control: pausing is always allowed and immediate. */
export function pauseAgent(agent: RegisteredAgent, now: string): RegisteredAgent {
  if (agent.paused) return agent;
  return { ...agent, paused: true, history: [...agent.history, `${now} · paused by owner`] };
}
export function resumeAgent(agent: RegisteredAgent, now: string): RegisteredAgent {
  if (!agent.paused) return agent;
  return { ...agent, paused: false, history: [...agent.history, `${now} · resumed by owner`] };
}

export const reportKinds = ["task", "result", "coordination"] as const;
export type ReportKind = (typeof reportKinds)[number];

export const agentReportSchema = z
  .object({
    agentId: z.string().uuid(),
    kind: z.enum(reportKinds),
    summary: longText,
    toAgentId: z.string().uuid().optional(),
    boundary: z.enum(approvalBoundaries).optional(),
  })
  .strict();
export type AgentReportInput = z.infer<typeof agentReportSchema>;

export type AgentReport = AgentReportInput & {
  id: string;
  at: string;
  executed: false;
};

/**
 * Record a task/result/coordination report. Reports are records of intent or
 * outcome — they never execute anything. A report touching an approval
 * boundary is flagged for owner review.
 */
export function fileReport(
  input: unknown,
  agents: RegisteredAgent[],
  id: string,
  now: string,
): AgentReport {
  const parsed = agentReportSchema.parse(input);
  const from = agents.find((a) => a.id === parsed.agentId);
  if (!from) throw new Error("Reporting agent is not registered.");
  if (from.paused) throw new Error(`${from.name} is paused by the owner.`);
  if (parsed.toAgentId && !agents.some((a) => a.id === parsed.toAgentId))
    throw new Error("Coordination target is not registered.");
  return { ...parsed, id, at: now, executed: false };
}

/**
 * Whether a declared capability may run autonomously once a real runner
 * exists. Anything touching an approval boundary always requires owner/human
 * approval first; a paused agent may do nothing.
 */
export function autonomyDecision(
  agent: RegisteredAgent,
  capability: AgentCapability,
  boundary?: ApprovalBoundary,
): { allowed: boolean; reason: string } {
  if (agent.paused) return { allowed: false, reason: "Agent is paused by the owner." };
  if (boundary)
    return {
      allowed: false,
      reason: `${boundary} actions always need owner/human approval first.`,
    };
  if (!agent.capabilities.includes(capability))
    return {
      allowed: false,
      reason: `${capability} is not a declared capability of ${agent.name}.`,
    };
  return { allowed: true, reason: "Declared capability; still requires a connected runner." };
}

export type AgentRegistryReadiness = { state: "Blocked"; blockers: string[] };
export function agentRegistryReadiness(): AgentRegistryReadiness {
  return {
    state: "Blocked",
    blockers: [
      "No agent runner or model inference path is activated; registrations are declarations only.",
      "Private account/member setup is not activated on the shared backend.",
      "Isolated sandbox testing requires the runner from the coding gateway prerequisites.",
      "Guardian permissions/audit decisions default to deny until a live policy engine is connected.",
      "Irreversible, high-impact, private-data and production actions always need owner approval.",
    ],
  };
}

export type AgentRegistryStore = {
  version: 1;
  agents: RegisteredAgent[];
  reports: AgentReport[];
};
export const emptyAgentRegistry: AgentRegistryStore = { version: 1, agents: [], reports: [] };

export function loadAgentRegistry(raw: string | null): AgentRegistryStore {
  if (!raw) return emptyAgentRegistry;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentRegistryStore>;
    return {
      version: 1,
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch {
    return emptyAgentRegistry;
  }
}
