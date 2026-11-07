/**
 * OMNI Docking Bay — protocol omni.dock/v1 (pure, browser/server safe).
 *
 * OMNI branches (Honeycomb Terminal on phone/tablet, OMNI desktop, OMNI CLI)
 * dock here with an owner-issued single-use code and a device-held ECDSA P-256
 * key. Every later request is signed. Docking grants status, logs, held task
 * proposals and Emergency Stop engagement only. Nothing executes; device
 * autonomy stays off until a reviewed change adds an executor.
 */
import { z } from "zod";

export const DOCK_PROTOCOL = "omni.dock/v1";
export const DOCK_SIGNING_PREFIX = "OMNI-DOCK-V1";
export const DOCK_MAX_BODY_BYTES = 8192;
export const DOCK_MAX_SKEW_MS = 60_000;
export const DOCK_CONNECTED_WINDOW_MS = 120_000;
export const DOCK_HEARTBEAT_INTERVAL_MS = 30_000;

export const DOCK_PATHS = {
  pair: "/api/public/omni/dock/pair",
  heartbeat: "/api/public/omni/dock/heartbeat",
  jobs: "/api/public/omni/dock/jobs",
  stop: "/api/public/omni/dock/stop",
} as const;

/** Honeycomb Terminal origins allowed to call the dock from a browser. Native apps send no Origin. */
export const DOCK_BROWSER_ORIGINS = [
  "https://honeycomb-terminal-companion.lovable.app",
  "https://id-preview--f5dd4092-07a4-4e53-bf40-35c167b9eaac.lovable.app",
] as const;

export const BRANCH_KINDS = ["honeycomb_mobile", "omni_desktop", "omni_cli"] as const;
export type BranchKind = (typeof BRANCH_KINDS)[number];
export const BRANCH_LABEL: Record<BranchKind, string> = {
  honeycomb_mobile: "Honeycomb Terminal (phone/tablet)",
  omni_desktop: "OMNI desktop terminal",
  omni_cli: "OMNI command-line companion",
};

export const PLATFORMS = [
  "ios",
  "ipados",
  "android",
  "web",
  "macos",
  "windows",
  "linux",
  "unknown",
] as const;

export const DOCK_PERMISSIONS = [
  "status.read",
  "log.read",
  "jobs.propose",
  "stop.engage",
  "files.transfer",
] as const;
export type DockPermission = (typeof DOCK_PERMISSIONS)[number];
export const PERMISSION_INFO: Record<DockPermission, { label: string; detail: string }> = {
  "status.read": {
    label: "See status",
    detail: "Its own pairing state, permissions, Emergency Stop and switch states.",
  },
  "log.read": { label: "See its log", detail: "Reserved: no log endpoint exists yet." },
  "jobs.propose": {
    label: "Propose tasks",
    detail: "Hold a CODE or agent task for you in OMNI Terminal. Nothing runs.",
  },
  "stop.engage": {
    label: "Engage Emergency Stop",
    detail: "Turn the stop ON from the device. It can never turn it off.",
  },
  "files.transfer": {
    label: "Selected-file transfer",
    detail: "Reserved for Honeycomb's own transfer feature; no effect here.",
  },
};
export const DEFAULT_MOBILE_PERMISSIONS: DockPermission[] = [
  "status.read",
  "jobs.propose",
  "stop.engage",
];

/* ---------------- Pairing code ---------------- */

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, 5 bits per char

/** 10 characters (50 bits), shown as XXXXX-XXXXX. */
export function formatPairingCode(random: Uint8Array): string {
  if (random.length < 10) throw new Error("Need 10 random bytes");
  const chars = Array.from(random.slice(0, 10), (b) => CODE_ALPHABET[b & 31]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function normalizePairingCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(clean) ? clean : null;
}

export async function sha256Hex(text: string | Uint8Array): Promise<string> {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pairingCodeHash(code: string): Promise<string | null> {
  const n = normalizePairingCode(code);
  return n ? sha256Hex(`${DOCK_PROTOCOL}:code:${n}`) : null;
}

/* ---------------- Device keys ---------------- */

const b64url = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const publicJwkSchema = z
  .object({ kty: z.literal("EC"), crv: z.literal("P-256"), x: b64url, y: b64url })
  .strip();
export type DockPublicJwk = z.infer<typeof publicJwkSchema>;

/** RFC 7638 member order for EC keys. */
export function canonicalJwk(jwk: DockPublicJwk): string {
  return JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
}

export function keyFingerprint(jwk: DockPublicJwk): Promise<string> {
  return sha256Hex(canonicalJwk(jwk));
}

/** Six digits both screens show; the owner compares them before approving. */
export function safetyCode(fingerprint: string): string {
  const n = parseInt(fingerprint.slice(0, 8), 16) % 1_000_000;
  const s = n.toString().padStart(6, "0");
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

/* ---------------- Signed requests ---------------- */

export const DOCK_HEADERS = {
  device: "x-omni-dock-device",
  timestamp: "x-omni-dock-timestamp",
  nonce: "x-omni-dock-nonce",
  signature: "x-omni-dock-signature",
} as const;

export const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export function signingString(p: {
  method: string;
  path: string;
  device: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}): string {
  return [
    DOCK_SIGNING_PREFIX,
    p.method.toUpperCase(),
    p.path,
    p.device,
    p.timestamp,
    p.nonce,
    p.bodySha256,
  ].join("\n");
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const pad = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/* ---------------- Request bodies ---------------- */

const capabilities = z
  .array(z.string().regex(/^[a-z][a-z0-9_.-]{1,39}$/))
  .max(16)
  .optional();
const appVersion = z.string().trim().max(40).optional();

export const pairBodySchema = z.object({
  protocol: z.literal(DOCK_PROTOCOL),
  code: z.string().min(10).max(16),
  label: z.string().trim().min(1).max(60),
  platform: z.enum(PLATFORMS),
  publicKey: publicJwkSchema,
  appVersion,
  capabilities,
});

export const heartbeatBodySchema = z.object({ appVersion, capabilities }).strict();

const TASK_KINDS = [
  "code.generate",
  "code.edit",
  "code.test",
  "code.debug",
  "agent.handoff",
] as const;
const TASK_AGENTS = ["jackboy", "jax", "razul", "sabrina", "guardian", "hercules"] as const;
export const jobBodySchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(TASK_KINDS),
    agent: z.enum(TASK_AGENTS),
    project: z.string().trim().min(1).max(120),
    repository: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .max(200)
      .optional(),
    instructions: z.string().trim().min(3).max(4000),
    autonomous: z.boolean().optional(),
  })
  .strict()
  .refine((j) => j.kind === "agent.handoff" || j.agent === "jackboy", {
    message: "CODE tasks go to Jackboy",
  });

export const stopBodySchema = z.object({}).strict();

/* ---------------- Status and switches ---------------- */

export type DockDeviceStatus =
  "awaiting_approval" | "connected" | "disconnected" | "never_connected" | "revoked";

export function deviceStatus(
  row: { status: string; last_seen_at: string | null },
  now: number,
): DockDeviceStatus {
  if (row.status === "revoked") return "revoked";
  if (row.status !== "paired") return "awaiting_approval";
  if (!row.last_seen_at) return "never_connected";
  const seen = Date.parse(row.last_seen_at);
  return Number.isFinite(seen) && now - seen <= DOCK_CONNECTED_WINDOW_MS
    ? "connected"
    : "disconnected";
}

export const STATUS_LABEL: Record<DockDeviceStatus, string> = {
  awaiting_approval: "Waiting for your approval",
  connected: "Connected",
  disconnected: "Disconnected",
  never_connected: "Paired, not seen yet",
  revoked: "Revoked",
};

/** The three autonomy switches are separate. All are off and cannot be turned on yet. */
export const AUTONOMY_SWITCHES = [
  { id: "omni_core", label: "OMNI core autonomy", where: "OMNI Terminal" },
  { id: "jackboy_code", label: "Jackboy CODE", where: "Railway (Jackboy) + Activation Approvals" },
  { id: "honeycomb_mobile", label: "Honeycomb mobile autonomy", where: "Docking Bay, per device" },
] as const;

export function mobileAutonomyBlockers(s: {
  deviceStatus: DockDeviceStatus;
  permissions: readonly string[];
  emergencyStopEngaged: boolean;
}): string[] {
  const out = [
    "No executor is registered for docked jobs; OMNI only holds them.",
    "Device autonomy is locked off until a reviewed change adds a dispatcher, cost cap and per-job scope.",
  ];
  if (s.deviceStatus === "revoked" || s.deviceStatus === "awaiting_approval")
    out.push("The device is not paired.");
  if (!s.permissions.includes("jobs.propose")) out.push("The device cannot propose tasks.");
  if (s.emergencyStopEngaged) out.push("Emergency Stop is engaged.");
  out.push("OMNI core autonomy and Jackboy CODE are off.");
  return out;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && (DOCK_BROWSER_ORIGINS as readonly string[]).includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    base["Access-Control-Allow-Headers"] = ["content-type", ...Object.values(DOCK_HEADERS)].join(
      ", ",
    );
    base["Access-Control-Max-Age"] = "600";
  }
  return base;
}

export const REASON_MESSAGE: Record<string, string> = {
  code_invalid: "That pairing code is wrong, used, cancelled or expired.",
  key_in_use: "This device key is already docked. Revoke the old device first.",
  throttled: "Too many failed pairing attempts. Wait ten minutes.",
  unknown_device: "This device is not docked.",
  revoked: "This device was revoked by the owner.",
  replay: "Request already used.",
  not_permitted: "The owner has not allowed this for the device.",
  secret_like: "That looks like a key or token. It was not saved.",
  id_conflict: "That task id was used for a different task.",
  daily_limit: "This device has proposed 20 tasks today.",
};
