/**
 * OMNI CODE service status (read-only). Owner-only (verified email, owner role, aal2).
 * Reports the supervised queue, folder permissions and why the service is (not) processing.
 * Nothing here leases, runs or moves anything; no worker or Mac companion is connected.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_CODE_SERVICE,
  codeServiceStatus,
  type CodeServiceSettings,
} from "./omni-code-queue";

export const readCodeService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ws = await import("./omni-workspace.server");
    const db = context.supabase;
    const [svc, jobs, grants, plans, agents, link, controls] = await Promise.all([
      db.from("omni_code_service").select("*").eq("id", 1).maybeSingle(),
      db
        .from("omni_code_jobs")
        .select(
          "id,agent_id,kind,status,title,attempts,max_attempts,destructive,approved_at,created_at,ended_at,error",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("omni_mac_folder_grants")
        .select("id,path,mode,expires_at,revoked_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("omni_file_plans")
        .select("id,grant_id,status,summary,created_at,approved_at,applied_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("omni_agents").select("*").eq("id", "omni"),
      ws.linkState(supabaseAdmin),
      ws.controls(db),
    ]);
    const omni = agents.data?.[0];
    const readiness = omni
      ? (await ws.autonomyReadiness(supabaseAdmin, link, controls, [omni], true))[omni.id]
      : null;
    const s = svc.data;
    const settings: CodeServiceSettings = s
      ? {
          alwaysOn: s.always_on,
          alwaysOnUntil: s.always_on_until ? Date.parse(s.always_on_until) : null,
          maxConcurrent: s.max_concurrent,
          maxPerAgent: s.max_per_agent,
          jobsPerAgentPerHour: s.jobs_per_agent_hour,
          idleOnly: s.idle_only,
          minIdleMinutes: s.min_idle_minutes,
          windowStartHour: s.window_start_hour,
          windowEndHour: s.window_end_hour,
        }
      : DEFAULT_CODE_SERVICE;
    const now = Date.now();
    const status = codeServiceStatus({
      now,
      localHour: new Date(now).getUTCHours(),
      settings,
      readinessPassed: Boolean(readiness?.allowed),
      emergencyStopReleased: controls.emergencyStopReleased,
      killSwitchEnabled: controls.killSwitchEnabled,
      pausedAgents: new Set(),
      // No docked device implements the omni.files/v1 companion contract yet: always disconnected.
      companionHeartbeatAt: null,
      companionIdleSeconds: null,
    });
    return {
      now,
      settings,
      status,
      readinessMissing: (readiness?.gates ?? [])
        .filter((g) => !g.ok && g.id !== "passkey")
        .map((g) => g.label),
      companion: {
        connected: false,
        reason: "No Mac companion implementing omni.files/v1 is docked.",
      },
      jobs: jobs.data ?? [],
      grants: grants.data ?? [],
      plans: plans.data ?? [],
      readable: !svc.error && !jobs.error,
    };
  });
