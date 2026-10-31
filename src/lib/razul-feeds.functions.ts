/**
 * RAZUL per-agent intelligence feeds — authenticated, scoped retrieval and
 * feedback. Every call requires a signed-in approved reader (the same gate as
 * the knowledge collector); each agent only receives the categories and
 * relevance floor configured in razul_agent_feeds.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AGENTS = ["jackboy", "jax", "omni", "sabrina", "guardian"] as const;
export type RazulAgent = (typeof AGENTS)[number];

async function requireApprovedReader(supabase: {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}) {
  const { data, error } = await supabase.rpc("is_knowledge_reader", {});
  if (error) throw new Error("Access could not be verified.");
  if (data !== true)
    throw new Error("Razul intelligence feeds require an approved owner or member account.");
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
