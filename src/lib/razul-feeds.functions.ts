/**
 * RAZUL per-agent intelligence feeds — authenticated, scoped retrieval and
 * feedback. Every call requires a signed-in approved reader (the same gate as
 * the knowledge collector); each agent only receives the categories and
 * relevance floor configured in razul_agent_feeds.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { setResponseHeader } from "@tanstack/react-start/server";

const AGENTS = ["jackboy", "jax", "omni", "sabrina", "guardian", "hercules"] as const;
export type RazulAgent = (typeof AGENTS)[number];

type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function requireApprovedReader(supabase: { rpc: unknown }) {
  setResponseHeader("Cache-Control", "private, no-store");
  const rpc = (supabase.rpc as unknown as Rpc).bind(supabase);
  const { data, error } = await rpc("is_razul_owner", {});
  if (error) throw new Error("Access could not be verified.");
  if (data !== true)
    throw new Error("Razul workspace requires the verified owner with strong MFA.");
}

export const getRazulAgentFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ agent: z.enum(AGENTS), limit: z.number().int().min(1).max(50).default(20) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedReader(context.supabase);
    const feed = await context.supabase
      .from("razul_agent_feeds")
      .select("agent, categories, min_relevance, alerts_enabled")
      .eq("agent", data.agent)
      .maybeSingle();
    if (feed.error) throw new Error("Agent feed configuration could not be read.");
    if (!feed.data) return { agent: data.agent, configured: false as const, findings: [] };
    const categories = feed.data.categories.length
      ? feed.data.categories
      : ["__none__"]; // empty config means the agent follows nothing
    const findings = await context.supabase
      .from("razul_findings")
      .select(
        "id, title, url, source_name, category, topic, evidence_class, evidence_strength, relevance, routed_to, entities, collected_at",
      )
      .in("category", categories)
      .gte("relevance", feed.data.min_relevance)
      .order("collected_at", { ascending: false })
      .limit(data.limit);
    if (findings.error) throw new Error("Findings could not be read.");
    return {
      agent: data.agent,
      configured: true as const,
      alertsEnabled: feed.data.alerts_enabled,
      minRelevance: feed.data.min_relevance,
      findings: findings.data,
    };
  });

export const submitRazulFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        findingId: z.string().uuid(),
        agent: z.enum(AGENTS),
        verdict: z.enum(["useful", "not-useful"]),
        note: z.string().max(500).default(""),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedReader(context.supabase);
    const { error } = await context.supabase.from("razul_agent_feedback").insert({
      finding_id: data.findingId,
      agent: data.agent,
      verdict: data.verdict,
      note: data.note,
      created_by: context.userId,
    });
    if (error) throw new Error("Feedback could not be recorded.");
    return { ok: true };
  });

/**
 * Ask Razul: authenticated shared research query. Retrieval is lexical-semantic
 * over the observatory index (deterministic, no AI calls); answers carry cited
 * sources with timestamps, evidence class and confidence. The raw question is
 * never stored — only its hash, for cache and the privacy-safe query log.
 */
export const askRazul = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        question: z.string().trim().min(3).max(500),
        agent: z.enum(AGENTS),
        scopeCategories: z.array(z.string().max(40)).max(22).optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedReader(context.supabase);
    const { answerRazulQuery } = await import("@/lib/razul-ask.server");
    const feed = await context.supabase.from("razul_agent_feeds").select("categories").eq("agent", data.agent).maybeSingle();
    if (feed.error || !feed.data) throw new Error("Existing agent subscription required.");
    const categories = data.scopeCategories
      ? feed.data.categories.filter((category) => data.scopeCategories?.includes(category))
      : feed.data.categories;
    return answerRazulQuery(
      { admin: context.supabase, now: () => new Date() },
      { question: data.question, agent: data.agent, scopeCategories: categories },
    );
  });

/** Proactive alerts: an agent polls its own unread alert events. */
export const listRazulAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ agent: z.enum(AGENTS), unreadOnly: z.boolean().default(true) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedReader(context.supabase);
    let query = context.supabase
      .from("razul_alert_events")
      .select(
        "id, agent, relevance, created_at, read_at, razul_findings(title, url, source_name, category, topic, evidence_class)",
      )
      .eq("agent", data.agent)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.unreadOnly) query = query.is("read_at", null);
    const { data: events, error } = await query;
    if (error) throw new Error("Alert events could not be read.");
    return { events };
  });

export const markRazulAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    await requireApprovedReader(context.supabase);
    const { error } = await context.supabase
      .from("razul_alert_events")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("read_at", null);
    if (error) throw new Error("Alert could not be marked read.");
    return { ok: true };
  });
