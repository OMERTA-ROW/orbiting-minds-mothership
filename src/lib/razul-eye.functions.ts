import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readEyeSnapshot } from "./razul-eye";

export const getRazulEye = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const db = context.supabase;
    return readEyeSnapshot({
      identity: async () => {
        const bearer = getRequestHeader("authorization");
        const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined;
        if (!token) throw new Error("Verified owner identity is required.");
        const { data, error } = await db.auth.getUser(token);
        return {
          callerId: context.userId,
          verifiedUserId: error ? null : data.user?.id ?? null,
          emailConfirmed: !!data.user?.email_confirmed_at,
          assurance: typeof context.claims["aal"] === "string" ? context.claims["aal"] : null,
        };
      },
      owner: async () => {
        const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "owner" });
        if (error) throw new Error("Owner authorization could not be verified.");
        return data === true;
      },
      records: async () => {
        // Caller-scoped RLS reads only, never admin. Do not select tokens, payloads, tasks or private source errors.
        const [sources, runs, state, sentinels, queue, events, projects, findings, feeds] = await Promise.all([
          db.from("razul_sources").select("id,name,kind,category,active,added_at").order("added_at", { ascending: false }).limit(100),
          db.from("razul_runs").select("id,status,started_at,finished_at,fetched,inserted,alerts").order("started_at", { ascending: false }).limit(30),
          db.from("razul_job_state").select("lease_until,paused_at,retention_days,updated_at").eq("id", 1).maybeSingle(),
          db.from("razul_sentinels").select("id,name,scopes,status,expires_at,last_seen_at").order("created_at", { ascending: false }).limit(50),
          db.from("razul_dispatch_queue").select("id,scout_type,status,guardian_status,created_at,updated_at").order("updated_at", { ascending: false }).limit(50),
          db.from("razul_sentinel_events").select("id,sentinel_id,kind,created_at").order("created_at", { ascending: false }).limit(100),
          db.from("razul_project_passports").select("id,project,resident_agent,status,version,updated_at").order("updated_at", { ascending: false }).limit(50),
          db.from("razul_findings").select("id,title,url,source_name,source_id,collected_at,published_at,evidence_class").order("collected_at", { ascending: false }).limit(50),
          db.from("razul_agent_feeds").select("agent,categories,min_relevance,alerts_enabled").limit(50),
        ]);
        if ([sources, runs, state, sentinels, queue, events, projects, findings, feeds].some((r) => r.error))
          throw new Error("Infrastructure records could not all be verified. No partial readiness claim is available.");
        return { sources: sources.data ?? [], runs: runs.data ?? [], state: state.data, sentinels: sentinels.data ?? [], queue: queue.data ?? [], events: events.data ?? [], projects: projects.data ?? [], findings: findings.data ?? [], feeds: feeds.data ?? [] };
      },
      now: () => new Date().toISOString(),
    });
  });