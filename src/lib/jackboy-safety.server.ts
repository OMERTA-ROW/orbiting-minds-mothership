/**
 * Jackboy safety sync (server only). Reads Jackboy's session-signed `omni.safety/v1` snapshot and
 * records it, or records a verified signed stop notice. Every failure records "unknown", which halts OMNI
 * autonomy windows and CODE jobs in the database. Nothing here releases a stop, turns a
 * switch, starts a job or sends a CODE request.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  SAFETY_EVENT_MAX_BYTES,
  SAFETY_EVENT_SKEW_S,
  safetyEventMessage,
  safetyEventSchema,
} from "./jackboy-safety";
import type { JackboyLinkOptions, JackboySafetySnapshot } from "./jackboy-link.server";

type Admin = SupabaseClient<Database>;
type Recorded = "clear" | "engaged" | "paused" | "unknown" | "ignored_older";

export type SafetySyncResult = {
  checked: boolean;
  state: Recorded;
  reason: string;
};

export type SafetyDeps = {
  now?: () => number;
  /** Test seam: replaces the session-signed `safety` read. */
  read?: () => Promise<JackboySafetySnapshot>;
  linkOptions?: JackboyLinkOptions;
};

async function record(
  admin: Admin,
  args: Database["public"]["Functions"]["jackboy_safety_record"]["Args"],
): Promise<Recorded> {
  const { data, error } = await admin.rpc("jackboy_safety_record", args);
  if (error) throw new Error("Safety state could not be recorded.");
  return data as Recorded;
}

export const recordSafetyFailure = (admin: Admin, reason: string) =>
  record(admin, {
    _source: "failure",
    _paused: null as never,
    _code_stop: null as never,
    _code_enabled: null as never,
    _cancellation: null as never,
    _observed_at: null as never,
    _expires_at: null as never,
    _proof_digest: null as never,
    _nonce: null as never,
    _reason: reason.slice(0, 120),
  });

/** Records one verified `omni.safety/v1` snapshot (the only way "clear" can be recorded). */
export async function recordSafetySnapshot(
  admin: Admin,
  s: JackboySafetySnapshot,
): Promise<Recorded> {
  const { data, error } = await admin.rpc("jackboy_safety_record_v2", {
    _source: "poll",
    _paused: s.killSwitch,
    _code_stop: s.emergencyStop,
    _code_enabled: s.codeEnabled,
    _autonomous_allowed: s.autonomousAllowed,
    _manual_allowed: s.manualDiagnosticsAllowed,
    _blocked_by: s.blockedBy as string,
    _authorization_expires_at: (s.authorization?.expiresAt ?? null) as string,
    _active_permits: s.activePermits,
    _cancellation: null as never,
    _observed_at: s.checkedAt,
    _expires_at: s.validUntil,
    _proof_digest: s.proofDigest,
    _nonce: null as never,
    _reason: "signed omni.safety/v1 snapshot",
  });
  if (error) throw new Error("Safety state could not be recorded.");
  return data as Recorded;
}

/** Nonsecret reason from a link failure (stage, status, refusal code). */
export function safetyFailureReason(error: unknown): string {
  const e = error as { stage?: string; status?: number; code?: string };
  if (e && typeof e.stage === "string")
    return ["read", e.stage, e.status ? String(e.status) : "", e.code ?? ""]
      .filter(Boolean)
      .join("_");
  return "read_failed";
}

/** The live signed `safety` read with Mothership's configured link (handshake, then snapshot). */
export async function readLiveSafety(options?: JackboyLinkOptions): Promise<JackboySafetySnapshot> {
  const { configuredJackboyLink, JackboyLink } = await import("./jackboy-link.server");
  const link = await configuredJackboyLink();
  // Scheduled reads are not owner actions; their outcome is audited through the safety record.
  const client = new JackboyLink(link, async () => {}, options);
  return client.safety();
}

/**
 * One safety sync: permit lapse + freshness enforcement, then (only while the Step 9 live-link
 * activation is in effect and Mothership's Emergency Stop is released) one signed read.
 */
export async function syncJackboySafety(
  admin: Admin,
  deps: SafetyDeps = {},
): Promise<SafetySyncResult> {
  const result = await syncSafety(admin, deps);
  if (process.env["OMNI_NOOP_WORKER_ENABLED"] === "true") {
    const swept = await admin.rpc("omni_noop_sweep");
    if (swept.error) throw new Error("No-op worker leases could not be enforced.");
  }
  return result;
}

async function syncSafety(admin: Admin, deps: SafetyDeps): Promise<SafetySyncResult> {
  const lapsed = await admin.rpc("jackboy_permits_enforce");
  if (lapsed.error) throw new Error("Permit lapse could not be enforced.");
  const fresh = await admin.rpc("jackboy_safety_enforce_freshness");
  if (fresh.error) throw new Error("Safety freshness could not be enforced.");
  const link = await admin.rpc("activation_effective", { _kind: "live_link" });
  if (link.error || link.data !== true)
    return {
      checked: false,
      state: (fresh.data as Recorded) ?? "unknown",
      reason: "live_link_not_active",
    };
  const controls = await admin
    .from("omni_terminal_controls")
    .select("emergency_stop")
    .eq("id", 1)
    .maybeSingle();
  if (controls.error || controls.data?.emergency_stop !== false)
    return {
      checked: false,
      state: await recordSafetyFailure(admin, "mothership_stop_engaged"),
      reason: "mothership_stop_engaged",
    };
  let reading: JackboySafetySnapshot;
  try {
    reading = deps.read ? await deps.read() : await readLiveSafety(deps.linkOptions);
  } catch (error) {
    const reason = safetyFailureReason(error);
    return { checked: true, state: await recordSafetyFailure(admin, reason), reason };
  }
  const state = await recordSafetySnapshot(admin, reading);
  return { checked: true, state, reason: "verified" };
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Signed stop notice from Jackboy. Verifies HMAC over the exact bytes, clock, nonce and project;
 * can only record a stop or pause (never clear). Returns no state or record contents.
 */
export async function handleSafetyEvent(
  request: Request,
  deps: { admin: () => Promise<Admin>; now?: () => number },
): Promise<Response> {
  const secret = process.env["JACKBOY_SAFETY_EVENT_HMAC_SECRET"] || "";
  const projectId = process.env["OMNI_LINK_PROJECT_ID"] || "";
  if (secret.length < 32 || !projectId) return json(503, { error: "not_configured" });
  if (request.method !== "POST") return json(405, { error: "https_post_required" });
  const ts = request.headers.get("x-jackboy-timestamp") || "";
  const nonce = request.headers.get("x-jackboy-nonce") || "";
  const signature = request.headers.get("x-jackboy-signature") || "";
  if (!/^\d{10}$/.test(ts) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature))
    return json(401, { error: "authentication_failed" });
  const nowS = Math.floor((deps.now ?? Date.now)() / 1000);
  if (Math.abs(nowS - Number(ts)) > SAFETY_EVENT_SKEW_S)
    return json(401, { error: "authentication_failed" });
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > SAFETY_EVENT_MAX_BYTES) return json(413, { error: "invalid_request" });
  const body = await request.text();
  if (body.length > SAFETY_EVENT_MAX_BYTES) return json(413, { error: "invalid_request" });
  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(safetyEventMessage(ts, nonce, body))
      .digest("hex"),
    "utf8",
  );
  const received = Buffer.from(signature, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return json(401, { error: "authentication_failed" });
  let parsed;
  try {
    parsed = safetyEventSchema.safeParse(JSON.parse(body));
  } catch {
    return json(400, { error: "invalid_request" });
  }
  if (!parsed.success) return json(400, { error: "invalid_request" });
  if (parsed.data.projectId !== projectId) return json(403, { error: "project_denied" });
  const admin = await deps.admin();
  const { error } = await admin.rpc("jackboy_safety_record", {
    _source: "event",
    _paused: parsed.data.paused as boolean,
    _code_stop: parsed.data.codeStop as boolean,
    _code_enabled: parsed.data.codeEnabled as boolean,
    _cancellation: parsed.data.cancellation as string,
    _observed_at: parsed.data.observedAt,
    _expires_at: null as never,
    _proof_digest: createHash("sha256").update(signature).digest("hex"),
    _nonce: nonce,
    _reason: parsed.data.event,
  });
  if (error) {
    if (error.code === "23505") return json(409, { error: "replayed" });
    if (error.code === "22023") return json(400, { error: "invalid_request" });
    return json(500, { error: "not_recorded" });
  }
  return json(200, { recorded: true });
}
