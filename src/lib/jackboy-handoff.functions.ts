/**
 * Owner-only handoff of a held OMNI Terminal task to Jackboy as a QUEUED job.
 * Requires owner + aal2 + TOTP within 15 minutes (checked in SQL), and a
 * released Emergency Stop. Never dispatches to OMNI and never approves the
 * Jackboy job; Jackboy's own passkey approval still applies.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalJob, refreshInput, sendInput, type HandoffJob } from "./jackboy-handoff";

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

async function stopIsEngaged(context: Ctx) {
  const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
  try {
    await assertEmergencyStopReleased(context.supabase);
    return false;
  } catch {
    return true;
  }
}

function fail(message: string) {
  return { ok: false as const, message };
}

async function loadJob(context: Ctx, taskId: string, kind?: "test" | "build") {
  const { data: t } = await context.supabase
    .from("omni_terminal_tasks")
    .select("id,agent,state,project_label,repository,instructions")
    .eq("id", taskId)
    .maybeSingle();
  if (!t || t.agent !== "jackboy" || !t.repository) return null;
  const { data: h } = await context.supabase
    .from("omni_task_handoffs")
    .select("job_kind")
    .eq("task_id", taskId)
    .maybeSingle();
  const job: HandoffJob = {
    taskId: t.id,
    project: t.project_label,
    repository: t.repository,
    kind: (h?.job_kind as "test" | "build" | undefined) ?? kind ?? "test",
    instructions: t.instructions,
  };
  return { job, state: t.state, sent: Boolean(h) };
}

async function record(taskId: string, actor: string, job: string | null, status: string, detail: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("omni_task_handoff_record", {
    _task: taskId,
    _job: job as unknown as string,
    _status: status,
    _detail: detail,
    _actor: actor,
  });
  return !error && data === true;
}

const REASON: Record<string, string> = {
  unreachable: "Jackboy could not be reached. Nothing was queued; retry later.",
  redirect_refused: "Jackboy answered with a redirect, which is refused.",
  reply_unsigned: "Jackboy's reply was not signed correctly, so it was not trusted.",
  reply_invalid: "Jackboy's reply was not in the expected format.",
};

export const sendTaskToJackboy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    const { handoffConfig, sendHandoff, sha256Hex } = await import("./jackboy-handoff.server");
    const config = handoffConfig(process.env);
    if (!config) return fail("The Jackboy handoff is not configured or is turned off.");
    if (await stopIsEngaged(context)) return fail("Emergency Stop is engaged; nothing was sent.");
    const loaded = await loadJob(context, data.taskId, data.kind);
    if (!loaded) return fail("Only Jackboy tasks with a repository can be sent.");
    if (loaded.sent && loaded.job.kind !== data.kind)
      return fail("This task was already sent as a different job type.");
    const digest = await sha256Hex(canonicalJob(loaded.job));
    // SQL re-checks owner, fresh two-factor, Emergency Stop and held state.
    const { error } = await context.supabase.rpc("omni_task_handoff_begin", {
      _task: data.taskId,
      _kind: loaded.job.kind,
      _digest: digest,
    });
    if (error) {
      if (error.message.includes("Fresh two-factor")) return fail("Re-verify with your authenticator first.");
      return fail(error.code === "22023" ? error.message : "The handoff was not recorded. Refresh and retry.");
    }
    const reply = await sendHandoff(config, "create", loaded.job);
    if (!reply.ok) {
      await record(data.taskId, context.userId, null, "error", reply.reason);
      return fail(REASON[reply.reason] ?? "Not confirmed by Jackboy.");
    }
    const saved = await record(data.taskId, context.userId, reply.jackboyJobId, reply.status, "");
    if (!saved) return fail("Jackboy replied, but the status could not be saved. Refresh.");
    return { ok: true as const, status: reply.status };
  });

export const refreshTaskHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refreshInput.parse(input))
  .handler(async ({ context, data }) => {
    await owner(context);
    if (await stopIsEngaged(context)) return fail("Emergency Stop is engaged; status checks are paused.");
    const { handoffConfig, sendHandoff } = await import("./jackboy-handoff.server");
    const config = handoffConfig(process.env);
    if (!config) return fail("The Jackboy handoff is not configured or is turned off.");
    const loaded = await loadJob(context, data.taskId);
    if (!loaded?.sent) return fail("This task has not been sent to Jackboy.");
    const reply = await sendHandoff(config, "status", loaded.job);
    if (!reply.ok) return fail(REASON[reply.reason] ?? "Not confirmed by Jackboy.");
    const saved = await record(data.taskId, context.userId, reply.jackboyJobId, reply.status, "");
    if (!saved) return fail("Jackboy reported a different job for this task; status not saved.");
    return { ok: true as const, status: reply.status };
  });

export const readTaskHandoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const { handoffSettingNames, handoffConfig } = await import("./jackboy-handoff.server");
    const { data, error } = await context.supabase
      .from("omni_task_handoffs")
      .select("task_id,job_kind,jackboy_job_id,status,detail,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    return {
      handoffs: error ? [] : data,
      readable: !error,
      settings: handoffSettingNames(process.env),
      configured: Boolean(handoffConfig(process.env)),
    };
  });
