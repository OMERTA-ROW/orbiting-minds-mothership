import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const readKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await context.supabase
      .from("beta_access")
      .select("ai_approved, paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (access.error) throw new Error("Access could not be checked. Please sign in again.");
    const allowed = Boolean(access.data?.ai_approved && !access.data.paused);
    if (!allowed) return { allowed, briefs: [], items: [], runs: [], state: null };
    const [briefs, items, runs, state] = await Promise.all([
      context.supabase
        .from("knowledge_briefs")
        .select("*")
        .order("brief_date", { ascending: false })
        .limit(7),
      context.supabase
        .from("knowledge_items")
        .select("id, source_name, title, url, summary, categories, published_at, collected_at")
        .order("collected_at", { ascending: false })
        .limit(60),
      context.supabase
        .from("knowledge_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(14),
      context.supabase
        .from("knowledge_job_state")
        .select("paused_reason, paused_at, brief_attempt_pending")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    const error = briefs.error || items.error || runs.error || state.error;
    if (error) throw new Error("Stored knowledge could not be read.");
    return { allowed, briefs: briefs.data, items: items.data, runs: runs.data, state: state.data };
  });
