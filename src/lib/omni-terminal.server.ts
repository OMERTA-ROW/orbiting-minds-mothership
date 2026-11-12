import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { mfaAgeSeconds, normalizeRows } from "./activation-approvals";
import { assertPublicLinkOrigin } from "./jackboy-link.server";
import {
  EMERGENCY_STOP_MESSAGE,
  LINK_DEFERRED_SETTING,
  LINK_REQUIRED_SETTINGS,
  stopReleased,
  stopState,
  type Snapshot,
} from "./omni-terminal";

type Db = SupabaseClient<Database>;

/** Shared fail-closed gate for every outbound or granting Jackboy action. */
export async function assertEmergencyStopReleased(db: Db) {
  const { data, error } = await db
    .from("omni_terminal_controls")
    .select("emergency_stop")
    .eq("id", 1)
    .maybeSingle();
  if (!stopReleased(data, Boolean(error))) throw new Error(EMERGENCY_STOP_MESSAGE);
}

function originIsPublic(origin: string | undefined) {
  if (!origin) return false;
  try {
    assertPublicLinkOrigin(origin);
    return true;
  } catch {
    return false;
  }
}

/** Read-only owner snapshot. Setting values are never returned; only presence and identity match. */
export async function loadTerminalSnapshot(
  db: Db,
  userId: string,
  claims: Record<string, unknown>,
): Promise<Snapshot> {
  const [controls, tasks, log, approvals, audit, access, runs, razulRun, razulState, dock, ws] =
    await Promise.all([
      db
        .from("omni_terminal_controls")
        .select("emergency_stop,changed_at,reason")
        .eq("id", 1)
        .maybeSingle(),
      db
        .from("omni_terminal_tasks")
        .select("id,kind,agent,project_label,repository,instructions,state,created_at,cancelled_at")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("omni_terminal_log")
        .select("id,session_id,command,outcome,summary,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("activation_approvals")
        .select(
          "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
        )
        .order("step"),
      db
        .from("razul_control_audit")
        .select("id,action,record_type,record_id,occurred_at")
        .in("record_type", ["jackboy_link", "omni_terminal", "activation_approval"])
        .order("occurred_at", { ascending: false })
        .limit(100),
      db.from("beta_access").select("ai_approved,paused").eq("user_id", userId).maybeSingle(),
      db
        .from("omni_agent_runs")
        .select("status,created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("razul_runs")
        .select("status,started_at,finished_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("razul_job_state").select("paused_at").limit(1).maybeSingle(),
      db.from("omni_dock_devices").select("status").limit(500),
      db.from("omni_workspace_settings").select("terminal_enabled").eq("id", 1).maybeSingle(),
    ]);
  if (tasks.error || log.error || approvals.error || audit.error)
    throw new Error("Terminal records could not be read.");
  const env = process.env;
  const ownerSetting = env["JACKBOY_LINK_MOTHERSHIP_OWNER_ID"];
  const runRows = runs.data ?? [];
  return {
    now: Date.now(),
    mfaAgeSeconds: mfaAgeSeconds(claims["amr"], Math.floor(Date.now() / 1000)),
    emergencyStop: stopState(controls.data, Boolean(controls.error)),
    settings: LINK_REQUIRED_SETTINGS.map((name) => ({ name, present: Boolean(env[name]) })),
    expirySet: Boolean(env[LINK_DEFERRED_SETTING]),
    switches: {
      linkEnabled: env["JACKBOY_LINK_ENABLED"] === "true",
      selfTestEnabled: env["JACKBOY_LINK_SELF_TEST_ENABLED"] === "true",
    },
    ownerIdMatches: !ownerSetting ? "missing" : ownerSetting === userId ? "match" : "mismatch",
    originValid: originIsPublic(env["JACKBOY_LINK_ORIGIN"]),
    approvals: normalizeRows(approvals.data),
    audit: audit.data,
    textAgent: {
      providerConfigured: Boolean(env["LOVABLE_API_KEY"]),
      aiApproved: access.data?.ai_approved === true,
      paused: access.data?.paused === true,
      completedRuns: runRows.filter((r) => r.status === "completed").length,
      lastRunAt: runRows[0]?.created_at ?? null,
      lastRunStatus: runRows[0]?.status ?? null,
    },
    razul: {
      lastRunStatus: razulRun.data?.status ?? null,
      lastRunAt: razulRun.data?.finished_at ?? razulRun.data?.started_at ?? null,
      paused: Boolean(razulState.data?.paused_at),
    },
    tasks: tasks.data,
    log: log.data,
    dock: {
      paired: (dock.data ?? []).filter((d) => d.status === "paired").length,
      pending: (dock.data ?? []).filter((d) => d.status === "pending").length,
      known: !dock.error,
    },
    workspaceEnabled: ws.error ? null : ws.data ? ws.data.terminal_enabled === true : false,
    sandbox: await sandboxSnapshot(db),
  };
}

async function sandboxSnapshot(db: Db): Promise<Snapshot["sandbox"]> {
  const { sandboxSettings } = await import("./omni-sandbox-config.server");
  const { state } = sandboxSettings();
  const { data } = await db
    .from("omni_workspace_audit")
    .select("at")
    .eq("event", "sandbox_self_test_passed")
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    configured: state.configured,
    enabled: state.enabled,
    problem: state.problem,
    selfTestPassedAt: data?.at ?? null,
  };
}
