/**
 * Per-agent OMNI memory server functions. Owner-only (verified email, owner role, aal2).
 * Every call names exactly one agent. Nothing here sends memory to OMNI, Railway,
 * Jackboy or any model; Dread and Draco read their own entries only in chat, and only
 * while the owner's switches below are on.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  memoryChatUseInput,
  memoryDeleteAllInput,
  memorySetChatUseInput,
  memoryDeleteInput,
  memoryErrorMessage,
  memoryListInput,
  memorySaveInput,
  onlyAgent,
  type MemoryRow,
} from "./omni-memory";

async function owner(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
}) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

export const listAgentMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memoryListInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: rows, error } = await context.supabase.rpc("omni_memory_list", {
      _agent: data.agent,
    });
    const message = memoryErrorMessage(error);
    if (message) return { ok: false as const, message };
    const scoped: MemoryRow[] = onlyAgent(rows ?? [], data.agent).map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      source_kind: r.source_kind,
      source_ref: r.source_ref,
      body_sha256: r.body_sha256,
      created_at: r.created_at,
    }));
    return { ok: true as const, rows: scoped };
  });

export const saveAgentMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memorySaveInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: id, error } = await context.supabase.rpc("omni_memory_save", {
      _agent: data.agent,
      _kind: data.kind,
      _title: data.title,
      _body: data.body,
      _source_kind: data.sourceKind,
      _source_ref: data.sourceRef,
    });
    const message = memoryErrorMessage(error);
    if (message || !id) return { ok: false as const, message: message ?? "Not saved. Retry." };
    return { ok: true as const, id };
  });

export const deleteAgentMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memoryDeleteInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } = await context.supabase.rpc("omni_memory_delete", {
      _id: data.id,
      _agent: data.agent,
    });
    const message = memoryErrorMessage(error);
    if (message) return { ok: false as const, message };
    return { ok: true as const };
  });

export const deleteAllAgentMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memoryDeleteAllInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: n, error } = await context.supabase.rpc("omni_memory_delete_all", {
      _agent: data.agent,
    });
    const message = memoryErrorMessage(error);
    if (message) return { ok: false as const, message };
    return { ok: true as const, deleted: typeof n === "number" ? n : 0 };
  });

/** Dread/Draco switches (missing row = both off) and when memory was last read or saved in chat. */
export const getAgentMemoryChatSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memoryChatUseInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const [settings, used, saved] = await Promise.all([
      context.supabase
        .from("omni_agent_memory_settings")
        .select("use_in_chat, save_chats, updated_at")
        .eq("owner_id", context.userId)
        .eq("agent_id", data.agent)
        .maybeSingle(),
      context.supabase
        .from("omni_agent_memory_audit")
        .select("at, item_count")
        .eq("actor_id", context.userId)
        .eq("agent_id", data.agent)
        .eq("event", "used_in_chat")
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("omni_agent_memory_audit")
        .select("at")
        .eq("actor_id", context.userId)
        .eq("agent_id", data.agent)
        .eq("event", "saved_from_chat")
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (settings.error || used.error || saved.error)
      return {
        ok: false as const,
        message: "Memory settings could not be read. Refresh and retry.",
      };
    return {
      ok: true as const,
      useInChat: settings.data?.use_in_chat ?? false,
      saveChats: settings.data?.save_chats ?? false,
      updatedAt: settings.data?.updated_at ?? null,
      lastUsed: used.data ? { at: used.data.at, entries: used.data.item_count } : null,
      lastSavedAt: saved.data?.at ?? null,
    };
  });

export const setAgentMemoryChatSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memorySetChatUseInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { error } =
      data.setting === "use_in_chat"
        ? await context.supabase.rpc("omni_memory_set_chat_use", {
            _agent: data.agent,
            _on: data.on,
          })
        : await context.supabase.rpc("omni_memory_set_save_chats", {
            _agent: data.agent,
            _on: data.on,
          });
    const message = memoryErrorMessage(error);
    if (message) return { ok: false as const, message };
    return { ok: true as const, on: data.on };
  });
