/**
 * Per-agent OMNI memory server functions. Owner-only (verified email, owner role, aal2).
 * Every call names exactly one agent. Nothing here sends memory to OMNI, Railway,
 * Jackboy or any model.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
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
