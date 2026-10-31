/**
 * RA'SUL conversational front door — pure planning logic.
 * Razul is the default active agent of the OMNI dashboard: it answers from
 * sourced memory/research, inspects authorized status, discovers specialists
 * via Agent Passports, and prepares scoped dispatches. It never replaces
 * specialist agents, never holds blanket credentials, and every dispatch
 * requires explicit owner approval. Execution is honestly labeled:
 * verified (real backend path), simulated (local concept), or blocked
 * (missing prerequisite, named).
 */

export const RASUL_SPECIALISTS = [
  "jackboy",
  "omni",
  "sabrina",
  "jax",
  "guardian",
] as const;
export type RasulSpecialist = (typeof RASUL_SPECIALISTS)[number];

export type CapabilityStatus = "verified" | "simulated" | "blocked";

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
    status: "simulated",
    reason: "Local concept workspace only; no live discovery or outreach.",
  },
  {
    agent: "jax",
    role: "Autonomous broker workflows (scoped, Vault-isolated)",
    status: "simulated",
    reason: "Declaration-stage broker rules; no live integration.",
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

/** Transparent handoff plan for a turn — always shown to the owner. */
export function planHandoffs(intent: RasulIntent, text: string): HandoffNote[] {
  if (intent === "dispatch") {
    const target = dispatchTarget(text);
    const cap = target ? SPECIALIST_CAPABILITIES.find((c) => c.agent === target) : null;
    return [
      {
        agent: "rasul",
        action: "Prepare scoped dispatch request for owner approval",
        status: "verified",
        reason: "Runs locally; nothing is sent.",
      },
      {
        agent: target ?? "omni",
        action: cap ? cap.role : "Route the task to the right specialist",
        status: cap?.status ?? "blocked",
        reason: cap?.reason ?? "No specialist named; routing requires the connected job API.",
      },
    ];
  }
  if (intent === "agents") {
    return SPECIALIST_CAPABILITIES.map((c) => ({
      agent: c.agent,
      action: c.role,
      status: c.status,
      reason: c.reason,
    }));
  }
  if (intent === "status") {
    return [
      {
        agent: "rasul",
        action: "Read authorized project status from the observatory and sentinel history",
        status: "verified",
        reason: "Requires the signed-in owner account; otherwise reported as not connected.",
      },
    ];
  }
  return [
    {
      agent: "rasul",
      action: "Answer from sourced observatory memory with citations and evidence class",
      status: "verified",
      reason: "Authenticated Ask Razul retrieval; local fallback when not signed in.",
    },
  ];
}

export interface DispatchRequest {
  id: string;
  target: RasulSpecialist;
  task: string;
  status: "pending-approval" | "approved" | "blocked";
  blockedReason: string | null;
}

/**
 * Build a dispatch request. Always starts pending owner approval; approving
 * never executes — execution is blocked until Guardian and the job runner are
 * connected, and production changes/external actions always need separate
 * explicit owner approval.
 */
export function buildDispatchRequest(id: string, text: string): DispatchRequest | null {
  const target = dispatchTarget(text);
  if (!target) return null;
  const cap = SPECIALIST_CAPABILITIES.find((c) => c.agent === target);
  return {
    id,
    target,
    task: text.trim().slice(0, 500),
    status: "pending-approval",
    blockedReason: cap?.status === "verified" ? null : (cap?.reason ?? "Specialist not connected."),
  };
}

/** Honest fallback answers when the backend is not connected. */
export function rasulFallbackAnswer(intent: RasulIntent, signedIn: boolean): string {
  if (!signedIn) {
    return "I am RA'SUL, the archivist front door of this Mothership. My live memory and research answers require the verified owner account — sign in to activate them. Everything I can do without it is labeled simulated or blocked, never faked.";
  }
  switch (intent) {
    case "status":
      return "Status inspection needs the connected observatory and sentinel history. The query path is live for approved readers; if this failed, the backend reported an error rather than a fabricated status.";
    case "agents":
      return "The specialist registry above shows each agent's passport role and its honest current state — verified, simulated, or blocked with the named prerequisite.";
    case "dispatch":
      return "Dispatch requests are prepared for your explicit approval. Execution stays blocked until the Guardian policy engine and the isolated job runner are connected — I will not simulate a finished job.";
    default:
      return "I could not reach the research index for that question. No answer was fabricated; try again once the backend connection is confirmed.";
  }
}
