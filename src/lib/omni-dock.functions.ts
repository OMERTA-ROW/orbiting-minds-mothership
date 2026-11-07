/**
 * Docking Bay owner functions (verified email, owner role, aal2). They issue
 * single-use pairing codes, approve/revoke docked devices and change
 * per-device permissions. Device autonomy can only be refused here. Nothing
 * executes, dispatches, or contacts Railway/Jackboy/CODE.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BRANCH_KINDS,
  DOCK_PERMISSIONS,
  deviceStatus,
  formatPairingCode,
  mobileAutonomyBlockers,
  pairingCodeHash,
  safetyCode,
  type DockDeviceStatus,
} from "./omni-dock";
import { mfaAgeSeconds } from "./activation-approvals";

type Ctx = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};

async function owner(context: Ctx) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

function ruleMessage(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return null;
  if (error.message.includes("Fresh two-factor")) return "Re-verify with your authenticator first.";
  if (error.code === "22023") return error.message;
  return fallback;
}

const permissions = z.array(z.enum(DOCK_PERMISSIONS)).max(5);
const id = z.string().uuid();

export type DockDeviceView = {
  id: string;
  label: string;
  branchKind: string;
  platform: string;
  status: DockDeviceStatus;
  safetyCode: string;
  fingerprintShort: string;
  requested: string[];
  permissions: string[];
  capabilities: string[];
  appVersion: string;
  claimedAt: string;
  approvedAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revokeReason: string;
  revision: number;
  heldTasks: number;
  autonomyBlockers: string[];
};

export const readDockingBay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const db = context.supabase;
    const [devices, invites, events, tasks, controls] = await Promise.all([
      db
        .from("omni_dock_devices")
        .select(
          "id,label,branch_kind,platform,status,key_fingerprint,requested_permissions,permissions,reported_capabilities,app_version,claimed_at,approved_at,last_seen_at,revoked_at,revoke_reason,revision",
        )
        .order("claimed_at", { ascending: false })
        .limit(50),
      db
        .from("omni_dock_invites")
        .select("id,branch_kind,requested_permissions,created_at,expires_at,consumed_at,cancelled_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("omni_dock_events")
        .select("id,device_id,invite_id,event,outcome,detail,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("omni_terminal_tasks").select("source_device").eq("state", "held").not("source_device", "is", null),
      db.from("omni_terminal_controls").select("emergency_stop").eq("id", 1).maybeSingle(),
    ]);
    if (devices.error || invites.error || events.error || tasks.error)
      throw new Error("Docking Bay records could not be read.");
    const now = Date.now();
    const engaged = Boolean(controls.error) || controls.data?.emergency_stop !== false;
    const held = new Map<string, number>();
    for (const t of tasks.data) if (t.source_device) held.set(t.source_device, (held.get(t.source_device) ?? 0) + 1);
    const view: DockDeviceView[] = devices.data.map((d) => {
      const status = deviceStatus(d, now);
      return {
        id: d.id,
        label: d.label,
        branchKind: d.branch_kind,
        platform: d.platform,
        status,
        safetyCode: safetyCode(d.key_fingerprint),
        fingerprintShort: d.key_fingerprint.slice(0, 16),
        requested: d.requested_permissions,
        permissions: d.permissions,
        capabilities: d.reported_capabilities,
        appVersion: d.app_version,
        claimedAt: d.claimed_at,
        approvedAt: d.approved_at,
        lastSeenAt: d.last_seen_at,
        revokedAt: d.revoked_at,
        revokeReason: d.revoke_reason,
        revision: d.revision,
        heldTasks: held.get(d.id) ?? 0,
        autonomyBlockers: mobileAutonomyBlockers({
          deviceStatus: status,
          permissions: d.permissions,
          emergencyStopEngaged: engaged,
        }),
      };
    });
    return {
      now,
      mfaAgeSeconds: mfaAgeSeconds(context.claims["amr"], Math.floor(now / 1000)),
      emergencyStopEngaged: engaged,
      devices: view,
      invites: invites.data.map((i) => ({
        id: i.id,
        branchKind: i.branch_kind,
        requested: i.requested_permissions,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
        state: i.consumed_at
          ? ("used" as const)
          : i.cancelled_at
            ? ("cancelled" as const)
            : Date.parse(i.expires_at) <= now
              ? ("expired" as const)
              : ("open" as const),
      })),
      events: events.data,
    };
  });

export const createDockInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(BRANCH_KINDS),
        permissions,
        minutes: z.number().int().min(2).max(15),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    // The code is generated on the server, returned once and only its hash is stored.
    const code = formatPairingCode(crypto.getRandomValues(new Uint8Array(10)));
    const hash = await pairingCodeHash(code);
    const { data: rows, error } = await context.supabase.rpc("omni_dock_create_invite", {
      _code_hash: hash as string,
      _kind: data.kind,
      _requested: data.permissions,
      _minutes: data.minutes,
    });
    const message = ruleMessage(error, "The pairing code was not created. Refresh and retry.");
    if (message) return { ok: false as const, message };
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return { ok: true as const, code, expiresAt: row?.expires_at ?? null };
  });

export const cancelDockInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id }).parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("omni_dock_cancel_invite", { _id: data.id });
    const message = ruleMessage(error, "The code was not cancelled. Refresh and retry.");
    return message ? { ok: false as const, message } : { ok: true as const };
  });

export const approveDockDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id, permissions }).parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: rows, error } = await context.supabase.rpc("omni_dock_approve", {
      _device: data.id,
      _permissions: data.permissions,
    });
    const message = ruleMessage(error, "The device was not approved. Refresh and retry.");
    if (message) return { ok: false as const, message };
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (row?.status !== "paired")
      return { ok: false as const, message: "The 30-minute approval window passed. Pair the device again." };
    return { ok: true as const };
  });

export const setDockPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id, permissions, revision: z.number().int().min(0) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("omni_dock_set_permissions", {
      _device: data.id,
      _permissions: data.permissions,
      _revision: data.revision,
    });
    const message = ruleMessage(error, "Permissions were not changed. Refresh and retry.");
    return message ? { ok: false as const, message } : { ok: true as const };
  });

export const revokeDockDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id, reason: z.string().trim().max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("omni_dock_revoke", {
      _device: data.id,
      _reason: data.reason,
    });
    const message = ruleMessage(error, "The device was not revoked. Refresh and retry.");
    return message ? { ok: false as const, message } : { ok: true as const };
  });

/** The per-device autonomy switch. Off is the only state; On is refused and recorded in the terminal history. */
export const setDockAutonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id, label: z.string().trim().min(1).max(60), on: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    if (!data.on) return { ok: true as const, message: "Mobile autonomy is off." };
    await context.supabase.rpc("omni_terminal_record", {
      _session: crypto.randomUUID(),
      _command: `dock autonomy on ${data.label}`.slice(0, 200),
      _outcome: "blocked",
      _summary: "Refused: no executor or dispatcher exists for docked devices.",
    });
    return {
      ok: false as const,
      message: "Refused. Mobile autonomy stays off: no executor or dispatcher exists for docked devices yet.",
    };
  });
