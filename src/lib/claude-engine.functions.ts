/** Owner-only (verified owner, aal2) Claude engine controls and usage view. No key is ever returned. */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLAUDE_ENGINE_IDS } from "./omni-engines";

async function owner(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
}) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

const sourceOf = (v: unknown): "chat" | "agent" | "fusion" =>
  v === "agent" || v === "fusion" ? v : "chat";

export const readClaudeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const sb = context.supabase;
    const [settings, prices, usage] = await Promise.all([
      sb.from("claude_engine_settings").select("agent_id, model, enabled, updated_at"),
      sb.from("claude_prices").select("model, in_cents_per_mtok, out_cents_per_mtok, confirmed_at"),
      sb
        .from("claude_usage")
        // "*" also returns `source` once migration 0075 is installed (earlier rows are chat).
        .select("*")
        .order("reserved_at", { ascending: false })
        .limit(50),
    ]);
    if (settings.error || prices.error || usage.error)
      return { ok: false as const, message: "The Claude ledger could not be read." as string };
    const since = Date.now() - 24 * 3600 * 1000;
    const todayCents = (usage.data ?? [])
      .filter((u) => Date.parse(u.reserved_at) > since)
      .reduce(
        (n, u) =>
          n + (u.status === "reserved" ? u.estimate_cents : (u.actual_cents ?? u.estimate_cents)),
        0,
      );
    return {
      ok: true as const,
      keyConfigured: Boolean(process.env["ANTHROPIC_API_KEY"]),
      settings: settings.data ?? [],
      prices: (prices.data ?? []).map((p) => ({
        ...p,
        in_cents_per_mtok: Number(p.in_cents_per_mtok),
        out_cents_per_mtok: Number(p.out_cents_per_mtok),
      })),
      usage: (usage.data ?? []).map((u) => ({
        run_id: u.run_id,
        agent_id: u.agent_id,
        model: u.model,
        status: u.status,
        estimate_cents: u.estimate_cents,
        actual_cents: u.actual_cents,
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        reserved_at: u.reserved_at,
        source: sourceOf((u as { source?: unknown }).source),
      })),
      todayCents,
    };
  });

export const setClaudePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        model: z.enum(CLAUDE_ENGINE_IDS),
        inCents: z.number().positive().max(1e6),
        outCents: z.number().positive().max(1e6),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: r, error } = await context.supabase.rpc("claude_owner_set_price", {
      _model: data.model,
      _in: data.inCents,
      _out: data.outCents,
    });
    const res = r as { ok?: boolean; reason?: string } | null;
    return error || !res?.ok
      ? { ok: false as const, message: res?.reason ?? "Not saved." }
      : { ok: true as const };
  });

export const setClaudeEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agent: z.enum(["omni", "dread", "draco"]),
        model: z.enum(CLAUDE_ENGINE_IDS),
        enabled: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    const { data: r, error } = await context.supabase.rpc("claude_owner_set_engine", {
      _agent: data.agent,
      _model: data.model,
      _enabled: data.enabled,
    });
    const res = r as { ok?: boolean; reason?: string } | null;
    return error || !res?.ok
      ? { ok: false as const, message: res?.reason ?? "Not saved." }
      : { ok: true as const };
  });
