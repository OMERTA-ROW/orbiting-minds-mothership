import { assertPublicLinkOrigin } from "./jackboy-link.server";

/**
 * Settings for the separate OMNI cloud sandbox service on Railway. Deliberately not the
 * Jackboy link: commands must never reach the host that holds production keys.
 * Values are read on the server only and never returned to the browser.
 */
export const SANDBOX_SETTINGS = [
  "OMNI_SANDBOX_ORIGIN",
  "OMNI_SANDBOX_CLIENT_ID",
  "OMNI_SANDBOX_HMAC_SECRET",
] as const;
export const SANDBOX_SWITCH = "OMNI_SANDBOX_ENABLED";

export type SandboxLinkConfig = { origin: string; clientId: string; secret: string; projectId: string };

export type SandboxSettingsState = {
  configured: boolean;
  enabled: boolean;
  missing: string[];
  problem: string | null;
};

export function sandboxSettings(env: Record<string, string | undefined> = process.env): {
  state: SandboxSettingsState;
  config: SandboxLinkConfig | null;
} {
  const missing = SANDBOX_SETTINGS.filter((n) => !env[n]);
  const enabled = env[SANDBOX_SWITCH] === "true";
  let problem: string | null = missing.length ? `Missing: ${missing.join(", ")}.` : null;
  const origin = env["OMNI_SANDBOX_ORIGIN"] ?? "";
  const clientId = env["OMNI_SANDBOX_CLIENT_ID"] ?? "";
  const secret = env["OMNI_SANDBOX_HMAC_SECRET"] ?? "";
  if (!problem) {
    try {
      assertPublicLinkOrigin(origin);
    } catch {
      problem = "OMNI_SANDBOX_ORIGIN must be a public HTTPS address.";
    }
  }
  if (!problem && !/^[A-Za-z0-9_.:-]{3,80}$/.test(clientId)) problem = "OMNI_SANDBOX_CLIENT_ID is invalid.";
  if (!problem && secret.length < 32) problem = "OMNI_SANDBOX_HMAC_SECRET must be at least 32 characters.";
  if (!problem && [env["OMNI_LINK_HMAC_SECRET"], env["JACKBOY_HANDOFF_HMAC_SECRET"]].includes(secret))
    problem = "OMNI_SANDBOX_HMAC_SECRET must differ from the Jackboy link secrets.";
  if (!problem && env["JACKBOY_LINK_ORIGIN"] && new URL(origin).host === safeHost(env["JACKBOY_LINK_ORIGIN"]))
    problem = "The sandbox must be a separate service from the Jackboy/production host.";
  const configured = problem === null;
  return {
    state: { configured, enabled, missing, problem },
    config: configured
      ? { origin, clientId, secret, projectId: env["OMNI_SANDBOX_PROJECT_ID"] || "omni" }
      : null,
  };
}

function safeHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}
