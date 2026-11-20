/**
 * RA'SUL conversational front door — pure planning logic.
 * Razul Central Intelligence (RA'SUL) is OMNI Mothership's central cross-project speaking agent.
 * Resident watch-agent coordination is staged for scoped owner-enrolled sites/apps;
 * the game is only one participating project. The default conversational agent answers from
 * sourced memory/research, inspects authorized status, discovers specialists
 * via Agent Passports, and prepares scoped dispatches. It never replaces
 * specialist agents, never holds blanket credentials, and every dispatch
 * requires explicit owner approval. States are honest: verified (real backend
 * path) or blocked (missing prerequisite, named). Nothing is simulated, and no
 * dispatch is prepared locally while no specialist path is connected.
 */

/** Conversation selection only; does not activate an agent or confer permissions. */
export const DEFAULT_OMNI_CONVERSATION = "rasul" as const;

export const RASUL_SPECIALISTS = ["jackboy", "omni", "sabrina", "jax", "guardian"] as const;
export type RasulSpecialist = (typeof RASUL_SPECIALISTS)[number];

export type CapabilityStatus = "verified" | "blocked";

export interface SpecialistCapability {
  agent: RasulSpecialist;
  role: string;
  status: CapabilityStatus;
  reason: string;
}

/** Current honest capability map — update only when evidence changes. */
export const SPECIALIST_CAPABILITIES: readonly SpecialistCapability[] = [
  {
    agent: "jackboy",
    role: "Code generation, isolated tests, patch proposals",
    status: "blocked",
    reason: "Sandbox runner and authenticated job API are not connected.",
  },
  {
    agent: "omni",
    role: "Command routing, project orchestration, sandbox jobs",
    status: "blocked",
    reason: "Job runner and Guardian policy engine are not connected.",
  },
  {
    agent: "sabrina",
    role: "Marketing intelligence, campaign drafts, partnerships",
    status: "blocked",
    reason: "Not connected; no marketing or outreach accounts are approved.",
  },
  {
    agent: "jax",
    role: "Autonomous broker workflows (scoped, Vault-isolated)",
    status: "blocked",
    reason: "Not connected; no broker integration exists.",
  },
  {
    agent: "guardian",
    role: "Permissions, audit, emergency revocation",
    status: "blocked",
    reason: "Policy engine not connected; all dispatches default to deny.",
  },
];

export type RasulIntent = "research" | "status" | "agents" | "dispatch";

/** Classify an owner message. Dispatch verbs win over everything else. */
export function classifyIntent(text: string): RasulIntent {
  const t = text.toLowerCase();
  if (/\b(dispatch|assign|send|delegate|hand off|handoff)\b/.test(t)) return "dispatch";
  if (/\b(which agents|what agents|specialists|passports|who can)\b/.test(t)) return "agents";
  if (/\b(status|health|progress|how is|state of)\b/.test(t)) return "status";
  return "research";
}

/** Extract the dispatch target from the message, if one is named. */
export function dispatchTarget(text: string): RasulSpecialist | null {
  const t = text.toLowerCase();
  for (const agent of RASUL_SPECIALISTS) {
    if (t.includes(agent)) return agent;
  }
  return null;
}

export interface HandoffNote {
  agent: RasulSpecialist | "rasul";
  action: string;
  status: CapabilityStatus;
  reason: string;
}

/** Specialist states for an "agents" question; other intents carry no plan. */
export function planHandoffs(intent: RasulIntent): HandoffNote[] {
  if (intent !== "agents") return [];
  return SPECIALIST_CAPABILITIES.map((c) => ({
    agent: c.agent,
    action: c.role,
    status: c.status,
    reason: c.reason,
  }));
}

/** Honest fallback answers when the backend is not connected. */
export function rasulFallbackAnswer(intent: RasulIntent, signedIn: boolean): string {
  if (!signedIn) {
    return "I am Razul Central Intelligence — RA'SUL, The Eternal Archivist and OMNI Mothership's default speaking intelligence. My role is All-Seeing Eye, permissioned historical records for OMNI/Evolution and lawful public-source research across enrolled owned projects. Specialized research workers, scoped watchers and dispatch to resident agents remain proposed; the Itanimulli game server is one participating project, not my home or exclusive assignment. Source policies, permissions and rate limits apply, never blanket surveillance or entire-internet monitoring. My live research answers require verified owner access and strong MFA — sign in. Recommendations cannot bypass Guardian or owner approval; unconnected execution stays blocked.";
  }
  switch (intent) {
    case "status":
      return "Status inspection needs the connected observatory and sentinel history. The query path is live for approved readers; if this failed, the backend reported an error rather than a fabricated status.";
    case "agents":
      return "The list below shows each specialist's role and its current state, with the missing prerequisite named.";
    case "dispatch":
      return "Sending work to specialists isn't connected here, so nothing was prepared or sent. To hold a task for owner review, use OMNI Terminal.";
    default:
      return "I could not reach the research index for that question. No answer was fabricated; try again once the backend connection is confirmed.";
  }
}
