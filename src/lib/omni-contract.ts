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
  SUPPORTED_DELEGATION_SCOPES,
} from "./omni-delegation";

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
    reason: "Chat through OMNI web is not enabled.",
    needs:
      "A founder-verified chat adapter, which doesn't exist yet. Neither API keys nor owner delegations can chat.",
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

/**
 * Truthful manifest. OMNI is listed but not enrolled (chat is not enabled); no providers,
 * spending cap or orchestration are claimed; autonomous is always false. Task writes and the
 * Stop are declared because owner delegations can do them; links point at real owner pages.
 */
export function buildManifest(origin: string | null) {
  return {
    version: OMNI_CONTRACT_VERSION,
    agents: [
      {
        id: "omni",
        name: "OMNI",
        kind: "omni" as const,
        enrolled: false,
        description:
          "Mothership's private text agent. Chat through this connection isn't enabled; use OMNI chat on the Mothership.",
      },
    ],
    providers: [] as { id: string; label: string; models: string[] }[],
    autonomous: false as const,
    // {read, write} per resource, as OMNI reads them. Writes need an owner delegation.
    capabilities: {
      chat: { read: false, write: false },
      providers: { read: false, write: false },
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
    delegation: {
      clientId: DELEGATION_CLIENT.id,
      audience: DELEGATION_AUDIENCE,
      supportedScopes: [...SUPPORTED_DELEGATION_SCOPES],
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
