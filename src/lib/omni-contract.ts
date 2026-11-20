/**
 * Mothership side of the OMNI frontend's `/api/omni/*` contract (OMNI project
 * `docs/MOTHERSHIP_BACKEND.md`). Pure and browser-safe: no network, no secrets.
 *
 * What is fully supported today with an owner-issued OMNI API key:
 *   GET /api/omni/health    (key scope "health")
 *   GET /api/omni/manifest  (key scope "health"; truthful service metadata)
 *   GET /api/omni/tasks     (key scope "jobs"; read-only observatory runs, never approvals)
 * Everything else in the contract answers 403 with a named reason: OMNI API keys only
 * carry the "health" and "jobs" scopes, and chat, task decisions and the stop need the
 * owner's own sign-in (two-step code / passkey) on the Mothership. A key never
 * authorizes them, and nothing here is simulated.
 */
import type { OmniApiScope } from "./omni-api-keys";

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

export type UnsupportedCapability = "chat" | "task-decision" | "emergency-stop";

/** Plain reason and the Mothership page where the owner does it today. */
export const UNSUPPORTED: Record<
  UnsupportedCapability,
  { reason: string; needs: string; page: string }
> = {
  chat: {
    reason: "Chat through an API key is not enabled.",
    needs: "A chat scope and a founder-verified chat adapter, which don't exist yet.",
    page: "/beta-omni",
  },
  "task-decision": {
    reason: "Approving or rejecting through an API key is not allowed.",
    needs: "Decisions need the owner's two-step sign-in and passkey on the Mothership.",
    page: "/activation-approvals",
  },
  "emergency-stop": {
    reason: "The Emergency Stop can't be pressed through an API key.",
    needs: "A stop scope, which doesn't exist yet. Use the Emergency Stop in OMNI Terminal.",
    page: "/omni-terminal",
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
 * Truthful manifest. OMNI is listed but not enrolled for this contract (chat is not
 * enabled through keys); no providers, spending cap or orchestration are claimed;
 * autonomous is always false. Links point at real owner pages on this site.
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
    capabilities: {
      health: true,
      manifest: true,
      chat: false,
      tasks: true,
      taskDecisions: false,
      emergencyStop: false,
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
