/**
 * Service-role dock storage. Only called after the request handler verified
 * the device signature. Optional SQL arguments are sent as explicit nulls
 * (PostgREST needs every key).
 */
import type { DockStore, StoreReply } from "./omni-dock.server";

function asReply(data: unknown, error: unknown): StoreReply {
  if (error || !data || typeof data !== "object") return { ok: false, reason: "unavailable" };
  return data as StoreReply;
}

export async function adminDockStore(): Promise<DockStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    async claim(a) {
      const { data, error } = await db.rpc("omni_dock_claim", {
        _code_hash: a.codeHash,
        _label: a.label,
        _platform: a.platform,
        _public_key: a.publicKey,
        _fingerprint: a.fingerprint,
        _app_version: a.appVersion,
        _capabilities: a.capabilities,
      });
      return asReply(data, error);
    },
    async loadDevice(id) {
      const { data, error } = await db
        .from("omni_dock_devices")
        .select("public_key")
        .eq("id", id)
        .maybeSingle();
      return error ? null : data;
    },
    async touch(a) {
      const { data, error } = await db.rpc("omni_dock_touch", {
        _device: a.device,
        _nonce: a.nonce,
        _event: a.event,
        _capabilities: (a.capabilities ?? null) as unknown as string[],
        _app_version: (a.appVersion ?? null) as unknown as string,
      });
      return asReply(data, error);
    },
    async log(device, event, outcome, detail) {
      await db.rpc("omni_dock_log", {
        _device: device as unknown as string,
        _event: event,
        _outcome: outcome,
        _detail: detail,
      });
    },
    async stopEngaged() {
      const { data, error } = await db
        .from("omni_terminal_controls")
        .select("emergency_stop")
        .eq("id", 1)
        .maybeSingle();
      return Boolean(error) || data?.emergency_stop !== false;
    },
    async engageStop(device) {
      const { data, error } = await db.rpc("omni_dock_engage_stop", { _device: device });
      return !error && data === true;
    },
    async holdTask(device, job) {
      const { data, error } = await db.rpc("omni_dock_hold_task", {
        _device: device,
        _id: job.id,
        _kind: job.kind,
        _agent: job.agent,
        _project: job.project,
        _repository: (job.repository ?? null) as unknown as string,
        _instructions: job.instructions,
      });
      return asReply(data, error);
    },
    async cloudSnapshot(_device, now) {
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      const since = new Date(now - 24 * 3600_000).toISOString();
      const [agents, jobs, code, approvals, windows, ledger, svc] = await Promise.all([
        db.from("omni_agents").select("id,display_name,status"),
        db
          .from("omni_agent_jobs")
          .select("id,agent_id,kind,status,cost_cents,created_at,ended_at")
          .order("created_at", { ascending: false })
          .limit(30),
        db
          .from("omni_code_jobs")
          .select("id,agent_id,kind,status,title,attempts,max_attempts,created_at,ended_at")
          .order("created_at", { ascending: false })
          .limit(30),
        db
          .from("omni_workspace_approvals")
          .select("id,agent_id,action_kind,created_at")
          .eq("status", "pending")
          .order("created_at"),
        db.from("omni_autonomy_windows").select("agent_id,expires_at").is("ended_at", null),
        db.from("omni_spend_ledger").select("cents,created_at"),
        db.from("omni_code_service").select("always_on,always_on_until").eq("id", 1).maybeSingle(),
      ]);
      if (
        agents.error ||
        jobs.error ||
        code.error ||
        approvals.error ||
        windows.error ||
        ledger.error ||
        svc.error
      )
        return null;
      const { GLOBAL_LIMITS } = await import("./omni-workspace");
      const { mobileAlerts } = await import("./omni-dock");
      const spendDay = (ledger.data ?? [])
        .filter((r) => r.created_at >= day.toISOString())
        .reduce((t, r) => t + r.cents, 0);
      const spendTotal = (ledger.data ?? []).reduce((t, r) => t + r.cents, 0);
      const failed =
        (jobs.data ?? []).filter((j) => j.status === "failed" && j.created_at >= since).length +
        (code.data ?? []).filter((j) => j.status === "failed" && j.created_at >= since).length;
      const codeOn = Boolean(
        svc.data?.always_on &&
        svc.data.always_on_until &&
        Date.parse(svc.data.always_on_until) > now,
      );
      const win = (windows.data ?? []).map((w) => ({
        agentId: w.agent_id,
        expiresAt: Date.parse(w.expires_at),
      }));
      return {
        executor: "server",
        agents: (agents.data ?? []).map((a) => ({
          id: a.id,
          name: a.display_name,
          status: a.status,
          autonomyUntil: win.find((w) => w.agentId === a.id)?.expiresAt ?? null,
        })),
        cloudJobs: jobs.data ?? [],
        codeJobs: (code.data ?? []).map((j) => ({ ...j, title: j.title.slice(0, 80) })),
        approvals: (approvals.data ?? []).map((a) => ({
          id: a.id,
          agent: a.agent_id,
          kind: a.action_kind,
          createdAt: a.created_at,
        })),
        approveIn: "https://evoomni.tech/omni-terminal",
        spend: { dayCents: spendDay, totalCents: spendTotal, limits: GLOBAL_LIMITS },
        codeService: { alwaysOn: codeOn },
        alerts: mobileAlerts({
          now,
          emergencyStopEngaged: false,
          pendingApprovals: approvals.data?.length ?? 0,
          failedLast24h: failed,
          spendDayCents: spendDay,
          dayCapCents: GLOBAL_LIMITS.day,
          autonomyWindows: win,
          codeAlwaysOn: codeOn,
        }),
      };
    },
    async auditTail() {
      const { data, error } = await db
        .from("omni_workspace_audit")
        .select("at,actor,event,agent_id")
        .order("at", { ascending: false })
        .limit(50);
      return error ? null : (data ?? []);
    },
    async control(device, c) {
      const now = new Date().toISOString();
      const actor = `device:${device.slice(0, 8)}`;
      const audit = (event: string, agentId: string | null, detail: Record<string, unknown>) =>
        db
          .from("omni_workspace_audit")
          .insert({ actor, event, agent_id: agentId, detail: detail as never });
      const ws = await import("./omni-workspace.server");
      const link = await ws.linkState(db).catch(() => null);
      const remote = async (
        action: "job.stop" | "agent.stop",
        payload: Record<string, unknown>,
      ) => {
        if (!link?.configured) return "not sent (sandbox not configured)";
        return ws
          .relay(link, action, payload)
          .then(() => "confirmed by sandbox")
          .catch((e: unknown) => `not confirmed: ${e instanceof Error ? e.message : "error"}`);
      };
      if (c.action === "stop_job") {
        const [{ data: wj }, { data: cj }] = await Promise.all([
          db
            .from("omni_agent_jobs")
            .update({ status: "stopped", ended_at: now })
            .eq("id", c.jobId)
            .in("status", ["queued", "running"])
            .select("id,agent_id,session_id"),
          db
            .from("omni_code_jobs")
            .update({ status: "stopped", ended_at: now, lease_expires_at: null })
            .eq("id", c.jobId)
            .in("status", [
              "queued",
              "leased",
              "running",
              "awaiting_approval",
              "retry_wait",
              "paused",
            ])
            .select("id,agent_id"),
        ]);
        const hit = wj?.[0] ?? cj?.[0];
        if (!hit) return { ok: false, reason: "not_found" };
        const r = wj?.[0]
          ? await remote("job.stop", { sessionId: wj[0].session_id, jobId: c.jobId })
          : "queue only";
        await audit("device_stop_job", hit.agent_id, { jobId: c.jobId, remote: r });
        await db.rpc("omni_dock_log", {
          _device: device,
          _event: "control_stop_job",
          _outcome: "ok",
          _detail: r.slice(0, 300),
        });
        return { ok: true, stopped: 1, remote: r };
      }
      const { data: agent } = await db
        .from("omni_agents")
        .select("id,status")
        .eq("id", c.agentId)
        .maybeSingle();
      if (!agent) return { ok: false, reason: "not_found" };
      if (c.action === "pause_agent") {
        // Database triggers end its Autonomous Mode window and pause its CODE jobs.
        if (agent.status === "enrolled")
          await db
            .from("omni_agents")
            .update({ status: "paused", updated_at: now })
            .eq("id", agent.id);
        await audit("device_pause_agent", agent.id, {});
        await db.rpc("omni_dock_log", {
          _device: device,
          _event: "control_pause_agent",
          _outcome: "ok",
          _detail: agent.id,
        });
        return { ok: true, paused: agent.id };
      }
      const [{ data: wj }, { data: cj }] = await Promise.all([
        db
          .from("omni_agent_jobs")
          .update({ status: "stopped", ended_at: now })
          .eq("agent_id", agent.id)
          .in("status", ["queued", "running"])
          .select("id"),
        db
          .from("omni_code_jobs")
          .update({ status: "stopped", ended_at: now, lease_expires_at: null })
          .eq("agent_id", agent.id)
          .in("status", [
            "queued",
            "leased",
            "running",
            "awaiting_approval",
            "retry_wait",
            "paused",
          ])
          .select("id"),
      ]);
      await ws.endAutonomy(db, agent.id, "device_stop");
      const r = await remote("agent.stop", { agentId: agent.id });
      const stopped = (wj?.length ?? 0) + (cj?.length ?? 0);
      await audit("device_stop_agent", agent.id, { stopped, remote: r });
      await db.rpc("omni_dock_log", {
        _device: device,
        _event: "control_stop_agent",
        _outcome: "ok",
        _detail: `${agent.id}: ${r}`.slice(0, 300),
      });
      return { ok: true, stopped, remote: r };
    },
    async handoffStatus(device) {
      const { data, error } = await db.rpc("omni_dock_handoff_status", { _device: device });
      return error || !Array.isArray(data) ? null : (data as unknown[]);
    },
  };
}
