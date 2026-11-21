/**
 * Owner-only server functions for Dread & Draco Fusion sessions (verified owner, aal2; starting a
 * session also needs a two-step code from the last 15 minutes, checked by the database).
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fusionReasonText, fusionSessionIdInput, fusionSessionInput } from "./fusion-duo";
import type { DuoRpc } from "./fusion-duo.server";

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
function dbMessage(error: { code?: string; message: string } | null) {
  if (!error) return null;
  // 22023 messages are written by the Fusion functions; 42501 here means the code is too old.
  if (error.code === "22023") return error.message;
  if (error.code === "42501")
    return "Enter a fresh two-step code (from the last 15 minutes) to approve this session.";
  return "Not confirmed. Refresh and retry.";
}

export type DuoTurnRow = {
  id: string;
  turn_no: number;
  agent_id: string;
  status: string;
  reply: string | null;
  error_reason: string | null;
  started_at: string;
};
export type DuoSessionRow = {
  id: string;
  topic: string;
  first_agent: string;
  max_replies: number;
  status: string;
  created_at: string;
  finished_at: string | null;
  turns: DuoTurnRow[];
};

export const listFusionSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const { data, error } = await context.supabase
      .from("omni_fusion_sessions")
      .select(
        "id, topic, first_agent, max_replies, status, created_at, finished_at, turns:omni_fusion_turns(id, turn_no, agent_id, status, reply, error_reason, started_at)",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error)
      return { ok: false as const, message: "Sessions could not be read. Refresh and retry." };
    const sessions: DuoSessionRow[] = (data ?? []).map((s) => ({
      ...s,
      turns: [...(s.turns ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at)),
    }));
    return { ok: true as const, sessions };
  });

export const createFusionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: id, error } = await context.supabase.rpc("omni_fusion_session_create", {
      _topic: data.topic,
      _first_agent: data.firstAgent,
      _max_replies: data.maxReplies,
    });
    const message = dbMessage(error);
    if (message || !id) return { ok: false as const, message: message ?? "Not started. Retry." };
    return { ok: true as const, id };
  });

export const runFusionReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionIdInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { runDuoTurn } = await import("./fusion-duo.server");
    const ownerRpc: DuoRpc = (fn, args) => (context.supabase.rpc as unknown as DuoRpc)(fn, args);
    const serviceRpc: DuoRpc = async (fn, args) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return (supabaseAdmin.rpc as unknown as DuoRpc)(fn, args);
    };
    const r = await runDuoTurn(data.sessionId, {
      ownerRpc,
      serviceRpc,
      apiKey: process.env["LOVABLE_API_KEY"],
    });
    if (!r.ok) return { ...r, message: fusionReasonText(r.reason) };
    return r;
  });

export const stopFusionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionIdInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: stopped, error } = await context.supabase.rpc("omni_fusion_session_stop", {
      _session_id: data.sessionId,
    });
    const message = dbMessage(error);
    if (message) return { ok: false as const, message };
    return { ok: true as const, stopped: stopped === true };
  });

export const deleteFusionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionIdInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("omni_fusion_session_delete", {
      _session_id: data.sessionId,
    });
    const message = dbMessage(error);
    if (message) return { ok: false as const, message };
    return { ok: true as const };
  });
