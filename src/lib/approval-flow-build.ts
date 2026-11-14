/**
 * Which Activation Approvals flow a build carries, and whether the live site matches it.
 * Pure helpers shared by the page, the server check and the public marker route.
 * The marker is a version number only — it proves which screen a site serves, nothing about
 * approvals, checks or readiness.
 */
export const APPROVAL_FLOW_SCHEMA = "evolution.approval-flow/v1";
/** Bump whenever the approvals screen or its server rules change in a way the owner must know about. */
export const APPROVAL_FLOW_VERSION = 7;
export const APPROVAL_FLOW_SUMMARY =
  "Checks only record evidence; the owner approves separately with a fresh two-step code";

export const LIVE_ORIGIN = "https://evoomni.tech";
export const LIVE_HOSTS = ["evoomni.tech", "www.evoomni.tech", "orbiting-minds-mothership.lovable.app"];
export const MARKER_PATH = "/api/public/approval-flow";
export const MARKER_MAX_BYTES = 2048;

export type SiteKind = "live" | "preview" | "local" | "other";

export function siteKind(hostname: string): SiteKind {
  const host = hostname.trim().toLowerCase();
  if (LIVE_HOSTS.includes(host)) return "live";
  if (host === "localhost" || host === "127.0.0.1") return "local";
  if (/^(?:id-preview|preview|project)--[a-z0-9-]+\.(?:lovable\.app|lovableproject\.com)$/.test(host))
    return "preview";
  return "other";
}

export function markerBody() {
  return { schema: APPROVAL_FLOW_SCHEMA, version: APPROVAL_FLOW_VERSION };
}

/** Reads a marker reply; anything that is not exactly the marker shape counts as no marker. */
export function parseMarker(text: string): number | null {
  if (text.length > MARKER_MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const { schema, version } = value as Record<string, unknown>;
    if (schema !== APPROVAL_FLOW_SCHEMA) return null;
    return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : null;
  } catch {
    return null;
  }
}

export type LiveFlowState = "current" | "outdated" | "newer" | "unreachable";
export type LiveFlow = { state: LiveFlowState; version: number | null };

/**
 * `reply` is what the live marker returned: a status and body, or null when it could not be reached.
 * A 404 or a non-marker page means the live site predates the marker, so it runs an earlier flow.
 */
export function compareLive(
  reply: { status: number; body: string } | null,
  thisVersion = APPROVAL_FLOW_VERSION,
): LiveFlow {
  if (!reply || reply.status >= 500 || (reply.status >= 300 && reply.status < 400))
    return { state: "unreachable", version: null };
  const version = reply.status === 200 ? parseMarker(reply.body) : null;
  if (version === null) return { state: "outdated", version: null };
  if (version < thisVersion) return { state: "outdated", version };
  if (version > thisVersion) return { state: "newer", version };
  return { state: "current", version };
}

export type BuildNotice = {
  tone: "ok" | "warn" | "info";
  title: string;
  detail: string;
  /** The open page itself is stale; reloading fixes it. */
  reload?: boolean;
};

/** What the page says about itself and the live site. Never claims more than the marker shows. */
export function buildNotice(input: {
  site: SiteKind;
  /** Version the server functions answering this page were built with. */
  serverVersion: number | null;
  live: LiveFlow | null;
  clientVersion?: number;
}): BuildNotice {
  const client = input.clientVersion ?? APPROVAL_FLOW_VERSION;
  if (input.serverVersion !== null && input.serverVersion !== client)
    return {
      tone: "warn",
      reload: true,
      title: "This page is out of date",
      detail: `This open page uses approval flow v${client}, but the site now runs v${input.serverVersion}. Reload the page before running checks or recording decisions.`,
    };
  const live = input.live;
  if (input.site === "live") {
    if (live?.state === "outdated" || live?.state === "newer")
      return {
        tone: "warn",
        reload: true,
        title: "Live page does not match its own server",
        detail: "Reload the page before running checks or recording decisions.",
      };
    return {
      tone: "ok",
      title: "Live site",
      detail: `You are on the published site, running approval flow v${client}.`,
    };
  }
  const where = input.site === "preview" ? "Preview build" : input.site === "local" ? "Local development build" : "Unrecognised address";
  const base = `${where}: approval flow v${client}. Approvals are shared with the live site because both use the same database.`;
  if (!live) return { tone: "info", title: where, detail: `${base} Checking the live site…` };
  if (live.state === "outdated")
    return {
      tone: "warn",
      title: "The live page uses an outdated approval flow",
      detail: `${base} evoomni.tech ${live.version === null ? "does not report an approval-flow version, so it is running the earlier screen" : `reports v${live.version}`}. It may not show approved steps, failure details or the separate approve step correctly. Record decisions here until the update is published.`,
    };
  if (live.state === "newer")
    return {
      tone: "warn",
      title: "This preview is older than the live site",
      detail: `${base} evoomni.tech reports v${live.version}. Use the live page, or update this preview first.`,
    };
  if (live.state === "unreachable")
    return {
      tone: "info",
      title: where,
      detail: `${base} The live site could not be checked just now, so whether it matches is unknown.`,
    };
  return { tone: "ok", title: where, detail: `${base} The live site runs the same flow.` };
}
