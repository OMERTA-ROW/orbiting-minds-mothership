/**
 * Mothership side of the OMNI frontend's `/api/omni/*` contract (OMNI project
 * `docs/MOTHERSHIP_BACKEND.md`). Pure and browser-safe: no network, no secrets.
 *
 * Metadata reads with an owner-issued OMNI API key:
 *   GET /api/omni/health    (key scope "health")
 *   GET /api/omni/manifest  (key scope "health"; truthful service metadata)
 *   GET /api/omni/tasks     (key scope "jobs"; read-only observatory runs, never approvals)
 * Privileged writes with a short-lived owner delegation (docs/OMNI-OWNER-DELEGATION.md):
 *   POST /api/omni/tasks          ("tasks:write"; stores a HELD task, nothing runs)
 *   POST /api/omni/emergency-stop ("safety:emergency-stop"; engage only)
 * An API key never authorizes a write. Chat and task decisions answer 403 with a named reason
 * for every credential; nothing here is simulated.
 */
import type { OmniApiScope } from "./omni-api-keys";
import {
  DELEGATION_AUDIENCE,
  DELEGATION_CLIENT,
  DELEGATION_TOKEN_SECONDS,
  HELD_TASK_AGENTS,
  HELD_TASK_AGENT_NAMES,
  SUPPORTED_DELEGATION_SCOPES,
} from "./omni-delegation";
import { OMNI_MODEL } from "./ai/omni-model";
import {
  CHAT_AGENT,
  CHAT_MODEL_REF,
  CHAT_PROVIDER,
  DELEGATED_CHAT_LIMITS,
} from "./omni-delegated-chat";

export const OMNI_CONTRACT_VERSION = "1.0.0";

/** Scope a key needs for each supported read. */
export const CONTRACT_SCOPE: Record<"health" | "manifest" | "tasks", OmniApiScope> = {
  health: "health",
  manifest: "health",
  tasks: "jobs",
};

/** One observatory run as stored (metadata only: no payloads or source errors). */
export type ObservatoryRun = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  fetched: number | null;
  inserted: number | null;
  alerts: number | null;
};

/**
 * Observatory runs in the OMNI frontend's task shape. They are real scheduled research
 * runs, read-only: requiresApproval is always false, so no decision control is offered,
 * and no agent is named because the run isn't an agent's reply.
 */
export function runsToTasks(runs: readonly ObservatoryRun[]) {
  return runs.map((r) => ({
    id: `observatory-run-${r.id}`,
    title: `Observatory run · ${r.fetched ?? "unknown"} fetched, ${r.inserted ?? "unknown"} saved, ${r.alerts ?? "unknown"} alerts`,
    status: r.status,
    requiresApproval: false as const,
    kind: "observatory-run" as const,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));
}

export type UnsupportedCapability = "chat" | "task-decision";

/** Plain reason and the Mothership page where the owner does it today. */
export const UNSUPPORTED: Record<
  UnsupportedCapability,
  { reason: string; needs: string; page: string }
> = {
  chat: {
    reason: "Chat through OMNI web is not installed on the Mothership.",
    needs:
      "Database change 0066 (owner-approved) and an owner delegation that includes chat:write. API keys can never chat.",
    page: "/beta-omni",
  },
  "task-decision": {
    reason: "Approving or rejecting through OMNI web is not allowed.",
    needs: "Decisions need the owner's two-step sign-in and passkey on the Mothership.",
    page: "/activation-approvals",
  },
};

export function unsupportedBody(capability: UnsupportedCapability, origin: string | null) {
  const u = UNSUPPORTED[capability];
  return {
    ok: false as const,
    error: "not_available",
    capability,
    reason: u.reason,
    needs: u.needs,
    ...(origin ? { ownerPage: origin + u.page } : {}),
  };
}

/** Only an https origin may be advertised as a link (the OMNI frontend refuses others). */
export function httpsOrigin(requestUrl: string): string | null {
  try {
    const u = new URL(requestUrl);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Live facts the manifest reports; read server-side for each request, never from the caller. */
export type ManifestLive = {
  /** LOVABLE_API_KEY is present (the provider the OMNI text agent uses is configured). */
  aiConfigured: boolean;
  /** Migration 0066 (chat:write delegation) is installed. */
  chatInstalled: boolean;
};

const NOT_LIVE: ManifestLive = { aiConfigured: false, chatInstalled: false };

/** Why Fusion is not claimed: no Fusion orchestrator or handshake exists on the Mothership. */
export const FUSION_STATUS = {
  state: "not_available" as const,
  reason:
    "The Mothership has no Fusion orchestrator or Fusion handshake. Held tasks wait on the Mothership until the owner hands them to Jackboy through the signed handoff.",
};

/**
 * Truthful manifest. Providers list only what is configured on the Mothership (the OMNI text
 * agent's Lovable AI model); being listed is configuration, not a verified reply. OMNI is
 * chat-enrolled only when the chat:write delegation is installed and the provider is
 * configured; held-task agents are never chat-enrolled. No spending cap or orchestration is
 * claimed; autonomous is always false. Links point at real owner pages.
 */
export function buildManifest(origin: string | null, live: ManifestLive = NOT_LIVE) {
  const chatEnrolled = live.chatInstalled && live.aiConfigured;
  const supportedScopes: string[] = [...SUPPORTED_DELEGATION_SCOPES];
  if (live.chatInstalled) supportedScopes.unshift("chat:write");
  return {
    version: OMNI_CONTRACT_VERSION,
    agents: [
      {
        id: CHAT_AGENT.id,
        name: CHAT_AGENT.name,
        kind: "omni" as const,
        enrolled: chatEnrolled,
        description: chatEnrolled
          ? "Mothership's private text agent. Chat needs an owner delegation with chat:write; it has no tools and runs nothing."
          : !live.chatInstalled
            ? "Mothership's private text agent. Chat through OMNI web isn't installed yet (database change 0066 awaits owner approval)."
            : "Mothership's private text agent. Lovable AI isn't configured on the Mothership, so chat is unavailable.",
      },
      // OMNI web offers task assignment only to agents present here AND in `taskAgents`, so
      // each held-task agent is listed, never chat-enrolled and with no claimed live status.
      ...HELD_TASK_AGENTS.map((id) => ({
        id,
        name: HELD_TASK_AGENT_NAMES[id],
        kind: "external" as const,
        enrolled: false,
        description:
          "Can be named on a held task through an owner delegation; the task waits on the Mothership and nothing runs. Chat isn't enabled.",
      })),
    ],
    providers: live.aiConfigured
      ? [{ id: CHAT_PROVIDER.id, label: CHAT_PROVIDER.label, models: [OMNI_MODEL] }]
      : ([] as { id: string; label: string; models: string[] }[]),
    autonomous: false as const,
    // {read, write} per resource, as OMNI reads them. Writes need an owner delegation.
    capabilities: {
      chat: { read: false, write: chatEnrolled },
      providers: { read: live.aiConfigured, write: false },
      tasks: { read: true, write: true },
      taskRetry: { read: false, write: false },
      taskDecisions: { read: false, write: false },
      emergencyStop: { read: false, write: true },
      files: { read: false, write: false },
      knowledge: { read: false, write: false },
      automations: { read: false, write: false },
    },
    /** Agents a held task may name. Not chat enrollment: `enrolled` above stays the chat flag. */
    taskAgents: [...HELD_TASK_AGENTS],
    chat: {
      state: chatEnrolled ? ("delegation_required" as const) : ("not_available" as const),
      path: "/api/omni/chat",
      scope: "chat:write",
      agentId: CHAT_AGENT.id,
      model: CHAT_MODEL_REF,
      dailyLimit: DELEGATED_CHAT_LIMITS.daily,
      maxMessages: DELEGATED_CHAT_LIMITS.maxMessages,
      maxInputChars: DELEGATED_CHAT_LIMITS.maxInputChars,
      timeoutMs: DELEGATED_CHAT_LIMITS.timeoutMs,
      verified: false,
    },
    /** `orchestration` is deliberately absent: see FUSION_STATUS. */
    orchestrationStatus: FUSION_STATUS,
    delegation: {
      clientId: DELEGATION_CLIENT.id,
      audience: DELEGATION_AUDIENCE,
      supportedScopes,
      tokenLifetimeSeconds: DELEGATION_TOKEN_SECONDS,
      heldTasksPath: "/api/omni/held-tasks",
      ...(origin
        ? {
            authorizeUrl: `${origin}/omni-authorize`,
            tokenUrl: `${origin}/api/public/omni/delegation/token`,
            statusUrl: `${origin}/api/public/omni/delegation/status`,
            revokeUrl: `${origin}/api/public/omni/delegation/revoke`,
          }
        : {}),
    },
    links: origin
      ? {
          dashboard: `${origin}/omni-api-keys`,
          terminal: `${origin}/omni-terminal`,
          missionControl: `${origin}/activation-approvals`,
        }
      : {},
  };
}
