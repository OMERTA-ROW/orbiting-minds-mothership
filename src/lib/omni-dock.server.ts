/**
 * omni.dock/v1 request handling for the public dock endpoints. The caller is
 * authenticated by an ECDSA P-256 signature from its docked key (pairing:
 * proof of possession + owner-issued single-use code). Storage is injected so
 * the rules are testable. Nothing here executes or dispatches work.
 */
import {
  DOCK_HEADERS,
  DOCK_MAX_BODY_BYTES,
  DOCK_MAX_SKEW_MS,
  DOCK_PATHS,
  DOCK_PROTOCOL,
  REASON_MESSAGE,
  base64UrlDecode,
  corsHeaders,
  deviceStatus,
  heartbeatBodySchema,
  jobBodySchema,
  keyFingerprint,
  mobileAutonomyBlockers,
  nonceSchema,
  pairBodySchema,
  pairingCodeHash,
  publicJwkSchema,
  safetyCode,
  sha256Hex,
  signingString,
  stopBodySchema,
  type DockPublicJwk,
} from "./omni-dock";

type Reply = { ok?: boolean; reason?: string } & Record<string, unknown>;
export type StoreReply = Reply;

export interface DockStore {
  claim(a: {
    codeHash: string;
    label: string;
    platform: string;
    publicKey: DockPublicJwk;
    fingerprint: string;
    appVersion: string;
    capabilities: string[];
  }): Promise<Reply>;
  loadDevice(id: string): Promise<{ public_key: unknown } | null>;
  touch(a: {
    device: string;
    nonce: string;
    event: string;
    capabilities?: string[];
    appVersion?: string;
  }): Promise<Reply>;
  log(device: string | null, event: string, outcome: "ok" | "refused" | "denied" | "error", detail: string): Promise<void>;
  /** Must return true when the state cannot be read (fail closed). */
  stopEngaged(): Promise<boolean>;
  engageStop(device: string): Promise<boolean>;
  holdTask(device: string, job: import("zod").infer<typeof jobBodySchema>): Promise<Reply>;
}

export type DockResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, reason: string, extra: Record<string, unknown> = {}): DockResult => ({
  status,
  body: { ok: false, protocol: DOCK_PROTOCOL, reason, message: REASON_MESSAGE[reason] ?? reason, ...extra },
});

export function dockResponse(request: Request, result: DockResult): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export function dockPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

async function readBody(request: Request): Promise<string | DockResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > DOCK_MAX_BODY_BYTES) return fail(413, "too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > DOCK_MAX_BODY_BYTES) return fail(413, "too_large");
  return text;
}

function signedHeaders(request: Request, now: number) {
  const h = (n: string) => request.headers.get(n) ?? "";
  const device = h(DOCK_HEADERS.device);
  const timestamp = h(DOCK_HEADERS.timestamp);
  const nonce = h(DOCK_HEADERS.nonce);
  const signature = base64UrlDecode(h(DOCK_HEADERS.signature));
  if (!device || !/^\d{13}$/.test(timestamp) || !nonceSchema.safeParse(nonce).success || signature?.length !== 64)
    return fail(401, "bad_signature_headers");
  if (Math.abs(now - Number(timestamp)) > DOCK_MAX_SKEW_MS) return fail(401, "stale_request");
  return { device, timestamp, nonce, signature };
}

export async function verifyDockSignature(jwk: DockPublicJwk, message: string, signature: Uint8Array) {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new Uint8Array(signature).buffer,
      new TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function handlePair(request: Request, store: DockStore, now: number): Promise<DockResult> {
  const text = await readBody(request);
  if (typeof text !== "string") return text;
  const parsed = pairBodySchema.safeParse(parseJson(text));
  if (!parsed.success) return fail(400, "invalid_body");
  const headers = signedHeaders(request, now);
  if ("status" in headers) return headers;
  if (headers.device !== "pair") return fail(401, "bad_signature_headers");
  const message = signingString({
    method: "POST",
    path: DOCK_PATHS.pair,
    device: "pair",
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    bodySha256: await sha256Hex(text),
  });
  if (!(await verifyDockSignature(parsed.data.publicKey, message, headers.signature)))
    return fail(401, "bad_signature");
  const codeHash = await pairingCodeHash(parsed.data.code);
  if (!codeHash) return fail(403, "code_invalid");
  const fingerprint = await keyFingerprint(parsed.data.publicKey);
  const r = await store.claim({
    codeHash,
    label: parsed.data.label,
    platform: parsed.data.platform,
    publicKey: parsed.data.publicKey,
    fingerprint,
    appVersion: parsed.data.appVersion ?? "",
    capabilities: parsed.data.capabilities ?? [],
  });
  if (!r.ok) return fail(r.reason === "throttled" ? 429 : 403, String(r.reason ?? "code_invalid"));
  return {
    status: 201,
    body: {
      ok: true,
      protocol: DOCK_PROTOCOL,
      deviceId: r["device_id"],
      branchKind: r["branch_kind"],
      status: "awaiting_approval",
      safetyCode: safetyCode(fingerprint),
      message: "Compare this safety code with the Docking Bay. The owner must approve before anything else works.",
    },
  };
}

type SignedKind = "heartbeat" | "jobs" | "stop";
const EVENT: Record<SignedKind, string> = { heartbeat: "heartbeat", jobs: "job_request", stop: "stop_request" };
const SCHEMA = { heartbeat: heartbeatBodySchema, jobs: jobBodySchema, stop: stopBodySchema };

export async function handleSigned(
  request: Request,
  kind: SignedKind,
  store: DockStore,
  now: number,
): Promise<DockResult> {
  const text = await readBody(request);
  if (typeof text !== "string") return text;
  const headers = signedHeaders(request, now);
  if ("status" in headers) return headers;
  if (!/^[0-9a-f-]{36}$/.test(headers.device)) return fail(401, "unknown_device");
  const device = await store.loadDevice(headers.device);
  const jwk = publicJwkSchema.safeParse(device?.public_key);
  if (!device || !jwk.success) return fail(401, "unknown_device");
  const message = signingString({
    method: "POST",
    path: DOCK_PATHS[kind],
    device: headers.device,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    bodySha256: await sha256Hex(text),
  });
  if (!(await verifyDockSignature(jwk.data, message, headers.signature))) {
    await store.log(headers.device, "signature_bad", "denied", EVENT[kind]);
    return fail(401, "bad_signature");
  }
  const body = SCHEMA[kind].safeParse(parseJson(text));
  if (!body.success) return fail(400, "invalid_body");
  const hb = kind === "heartbeat" ? (body.data as { appVersion?: string; capabilities?: string[] }) : {};
  const touched = await store.touch({
    device: headers.device,
    nonce: headers.nonce,
    event: EVENT[kind],
    capabilities: hb.capabilities,
    appVersion: hb.appVersion,
  });
  if (!touched.ok) {
    const reason = String(touched.reason ?? "unknown_device");
    return fail(reason === "replay" ? 409 : 403, reason);
  }
  const permissions = Array.isArray(touched["permissions"]) ? (touched["permissions"] as string[]) : [];
  const paired = touched["status"] === "paired";
  const engaged = await store.stopEngaged();
  const state = {
    ok: true,
    protocol: DOCK_PROTOCOL,
    status: paired ? "paired" : "awaiting_approval",
    permissions,
    serverTime: new Date(now).toISOString(),
  };
  const detail =
    paired && permissions.includes("status.read")
      ? {
          emergencyStop: engaged ? "engaged" : "released",
          autonomy: { device: "off", omniCore: "off", jackboyCode: "off" },
          executor: "none",
        }
      : {};

  if (kind === "heartbeat") return { status: 200, body: { ...state, ...detail } };

  if (kind === "stop") {
    if (!paired || !permissions.includes("stop.engage")) {
      await store.log(headers.device, "stop_engage", "denied", "Not permitted");
      return fail(403, "not_permitted");
    }
    if (!(await store.engageStop(headers.device))) return fail(403, "not_permitted");
    return { status: 200, body: { ...state, emergencyStop: "engaged", message: "Emergency Stop engaged." } };
  }

  const job = body.data as import("zod").infer<typeof jobBodySchema>;
  if (job.autonomous) {
    const blockers = mobileAutonomyBlockers({
      deviceStatus: paired ? deviceStatus({ status: "paired", last_seen_at: state.serverTime }, now) : "awaiting_approval",
      permissions,
      emergencyStopEngaged: engaged,
    });
    await store.log(headers.device, "autonomy_refused", "refused", "Autonomous dispatch is off");
    return fail(409, "autonomy_off", { blockers, message: "Autonomous dispatch is off. Nothing was queued or run." });
  }
  if (!paired) return fail(403, "not_permitted");
  const held = await store.holdTask(headers.device, job);
  if (!held.ok) return fail(held.reason === "daily_limit" ? 429 : held.reason === "id_conflict" ? 409 : 403, String(held.reason));
  return {
    status: 202,
    body: {
      ...state,
      taskId: held["task_id"],
      state: "held",
      duplicate: held["duplicate"] === true,
      message: "Held for the owner in OMNI Terminal. Nothing runs.",
    },
  };
}
