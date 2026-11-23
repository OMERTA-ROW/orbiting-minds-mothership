/**
 * Owner-only server functions for Dread & Draco Fusion sessions (verified owner, aal2; starting a
 * session also needs a two-step code from the last 15 minutes, checked by the database).
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_FUSION_ENGINES,
  fusionReasonText,
  fusionSessionIdInput,
  fusionSessionInput,
  speakerFor,
  type FusionDuoAgent,
  type FusionEngines,
} from "./fusion-duo";
import type { DuoRpc } from "./fusion-duo.server";
import { DEFAULT_ENGINE_ID, claudeEngineFor } from "./omni-engines";

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
  // The 5-argument approval (engine per agent) arrives with migration 0075.
  if (error.code === "PGRST202")
    return "Claude for Fusion isn't installed yet (it waits on your approval). Use the current engine.";
  return "Not confirmed. Refresh and retry.";
}

export type DuoTurnRow = {
  id: string;
  turn_no: number;
  agent_id: string;
  /** Engine the reply used (0075); the current engine for older rows. */
  model: string;
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
  engines: FusionEngines;
  turns: DuoTurnRow[];
};

const SESSION_COLS = "id, topic, first_agent, max_replies, status, created_at, finished_at";
const TURN_COLS = "id, turn_no, agent_id, status, reply, error_reason, started_at";
type RawTurn = Omit<DuoTurnRow, "model"> & { model?: string };
type RawSession = Omit<DuoSessionRow, "engines" | "turns"> & {
  dread_engine?: string;
  draco_engine?: string;
  turns: RawTurn[] | null;
};

/** Reads with the 0075 engine columns, falling back to the earlier columns until it is installed. */
async function readSessions(
  supabase: Ctx["supabase"],
  userId: string,
  filter?: { id: string },
): Promise<{ ok: true; rows: RawSession[] } | { ok: false }> {
  const from = (cols: string) => {
    let q = (supabase.from as unknown as (t: string) => ReturnType<Ctx["supabase"]["from"]>)(
      "omni_fusion_sessions",
    )
      .select(cols)
      .eq("owner_id", userId);
    if (filter) q = q.eq("id", filter.id);
    return q.order("created_at", { ascending: false }).limit(10);
  };
  const wide = await from(
    `${SESSION_COLS}, dread_engine, draco_engine, turns:omni_fusion_turns(${TURN_COLS}, model)`,
  );
  if (!wide.error) return { ok: true, rows: (wide.data ?? []) as unknown as RawSession[] };
  const narrow = await from(`${SESSION_COLS}, turns:omni_fusion_turns(${TURN_COLS})`);
  if (narrow.error) return { ok: false };
  return { ok: true, rows: (narrow.data ?? []) as unknown as RawSession[] };
}
function toSession(s: RawSession): DuoSessionRow {
  const { dread_engine, draco_engine, turns, ...rest } = s;
  return {
    ...rest,
    engines: {
      dread: dread_engine ?? DEFAULT_FUSION_ENGINES.dread,
      draco: draco_engine ?? DEFAULT_FUSION_ENGINES.draco,
    },
    turns: [...(turns ?? [])]
      .map((t) => ({ ...t, model: t.model ?? DEFAULT_ENGINE_ID }))
      .sort((a, b) => a.started_at.localeCompare(b.started_at)),
  };
}

export const listFusionSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const read = await readSessions(context.supabase, context.userId);
    if (!read.ok)
      return { ok: false as const, message: "Sessions could not be read. Refresh and retry." };
    return { ok: true as const, sessions: read.rows.map(toSession) };
  });

export const createFusionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const dread = data.dreadEngine ?? DEFAULT_ENGINE_ID;
    const draco = data.dracoEngine ?? DEFAULT_ENGINE_ID;
    // Current engine for both: the installed 3-argument approval. Any Claude: the 0075 approval, which
    // also checks the agent's Claude switch and fresh prices and binds the engines for the whole session.
    const { data: id, error } =
      dread === DEFAULT_ENGINE_ID && draco === DEFAULT_ENGINE_ID
        ? await context.supabase.rpc("omni_fusion_session_create", {
            _topic: data.topic,
            _first_agent: data.firstAgent,
            _max_replies: data.maxReplies,
          })
        : await (context.supabase.rpc as unknown as DuoRpc)("omni_fusion_session_create", {
            _topic: data.topic,
            _first_agent: data.firstAgent,
            _max_replies: data.maxReplies,
            _dread_engine: dread,
            _draco_engine: draco,
          }).then((r) => ({ data: r.data as string | null, error: r.error }));
    const message = dbMessage(error);
    if (message || !id) return { ok: false as const, message: message ?? "Not started. Retry." };
    return { ok: true as const, id };
  });

export const runFusionReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fusionSessionIdInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    // Refuse before using an attempt when the next speaker's engine has no key on the server.
    const read = await readSessions(context.supabase, context.userId, { id: data.sessionId });
    if (!read.ok)
      return {
        ok: false as const,
        reason: "check_unavailable",
        message: fusionReasonText("check_unavailable"),
      };
    const session = read.rows[0] ? toSession(read.rows[0]) : null;
    if (session) {
      const done = session.turns.filter((t) => t.status === "completed").length;
      const next = speakerFor(session.first_agent as FusionDuoAgent, done + 1);
      const needsClaude = claudeEngineFor(session.engines[next]) !== null;
      if (needsClaude ? !anthropicKey : !lovableKey)
        return {
          ok: false as const,
          reason: "provider_not_configured",
          message: fusionReasonText("provider_not_configured"),
        };
    }
    const { runDuoTurn } = await import("./fusion-duo.server");
    const ownerRpc: DuoRpc = (fn, args) => (context.supabase.rpc as unknown as DuoRpc)(fn, args);
    const serviceRpc: DuoRpc = async (fn, args) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return (supabaseAdmin.rpc as unknown as DuoRpc)(fn, args);
    };
    const r = await runDuoTurn(data.sessionId, {
      ownerRpc,
      serviceRpc,
      apiKey: lovableKey,
      anthropicKey,
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
