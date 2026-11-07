import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { stopReleased } from "./omni-terminal";
import { passkeyFreshAt } from "./omni-passkey.server";
import type { WorkspaceAction } from "./omni-workspace-link.server";
import {
  autonomyActive,
  budgetDecision,
  capHead,
  needsOwnerDecision,
  sessionEndReason,
  workspaceGate,
  type RemoteReply,
  type Spend,
} from "./omni-workspace";

type Db = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];
type Agent = Tables["omni_agents"]["Row"];
type Session = Tables["omni_workspace_sessions"]["Row"];

export async function audit(
  admin: Db,
  e: {
    actor: string;
    event: string;
    agentId?: string | null;
    sessionId?: string | null;
    jobId?: string | null;
    detail?: Record<string, unknown>;
    output?: string;
  },
) {
  const { error } = await admin.from("omni_workspace_audit").insert({
    actor: e.actor,
    event: e.event,
    agent_id: e.agentId ?? null,
    session_id: e.sessionId ?? null,
    job_id: e.jobId ?? null,
    detail: (e.detail ?? {}) as never,
    output_sha256: e.output ? createHash("sha256").update(e.output).digest("hex") : null,
    output_head: e.output ? capHead(e.output) : null,
  });
  if (error) throw new Error("Audit write failed; nothing was sent.");
}

export async function linkState(admin: Db) {
  let configured = false;
  let config = null as Awaited<ReturnType<typeof import("./jackboy-link.server").configuredJackboyLink>> | null;
  try {
    const { configuredJackboyLink } = await import("./jackboy-link.server");
    config = await configuredJackboyLink();
    configured = true;
  } catch {
    configured = false;
  }
  const approvalValid = configured && Boolean(process.env["OMNI_LINK_APPROVAL_ID"]);
  const { data } = await admin
    .from("razul_control_audit")
    .select("occurred_at")
    .eq("record_type", "jackboy_link")
    .eq("action", "self_test_passed")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    configured,
    approvalValid,
    config,
    selfTestPassedAt: data?.occurred_at ? Date.parse(data.occurred_at) : null,
  };
}

export async function controls(db: Db) {
  const [settings, stop] = await Promise.all([
    db.from("omni_workspace_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("omni_terminal_controls").select("emergency_stop").eq("id", 1).maybeSingle(),
  ]);
  return {
    killSwitchEnabled: settings.error ? null : settings.data ? settings.data.terminal_enabled : false,
    settings: settings.data,
    emergencyStopReleased: stopReleased(stop.data, Boolean(stop.error)),
  };
}

export async function gateFor(db: Db, admin: Db, ownerId: string, passkeyFresh?: boolean) {
  const [link, c, freshAt] = await Promise.all([linkState(admin), controls(db), passkeyFreshAt(admin, ownerId)]);
  const gate = workspaceGate({
    linkConfigured: link.configured,
    selfTestPassedAt: link.selfTestPassedAt,
    killSwitchEnabled: c.killSwitchEnabled,
    emergencyStopReleased: c.emergencyStopReleased,
    linkApprovalValid: link.approvalValid,
    passkeyFresh: passkeyFresh ?? freshAt !== null,
    now: Date.now(),
  });
  return { gate, link, controls: c, passkeyFreshAt: freshAt };
}

export async function relay(link: Awaited<ReturnType<typeof linkState>>, action: WorkspaceAction, payload: Record<string, unknown>) {
  if (!link.config) throw new Error("Secure link is not configured.");
  const { workspaceRequest } = await import("./omni-workspace-link.server");
  return workspaceRequest(link.config, action, payload);
}

const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function spend(db: Db, agentId?: string, jobId?: string): Promise<Spend> {
  let all = db.from("omni_spend_ledger").select("cents,created_at,job_id");
  if (agentId) all = all.eq("agent_id", agentId);
  const { data, error } = await all;
  if (error) throw new Error("Spend could not be read; nothing was sent.");
  const today = dayStart();
  const rows = data ?? [];
  return {
    total: rows.reduce((s, r) => s + r.cents, 0),
    day: rows.filter((r) => r.created_at >= today).reduce((s, r) => s + r.cents, 0),
    task: jobId ? rows.filter((r) => r.job_id === jobId).reduce((s, r) => s + r.cents, 0) : 0,
  };
}

export async function checkBudget(db: Db, agent: Agent, jobId?: string) {
  const [all, mine] = await Promise.all([spend(db, undefined, jobId), spend(db, agent.id, jobId)]);
  return budgetDecision(all, mine, {
    task: agent.budget_task_cents,
    day: agent.budget_day_cents,
    total: agent.budget_total_cents,
  });
}

export async function openWindow(db: Db, agentId: string) {
  const { data } = await db
    .from("omni_autonomy_windows")
    .select("*")
    .eq("agent_id", agentId)
    .is("ended_at", null)
    .maybeSingle();
  return data;
}

export async function endAutonomy(admin: Db, agentId: string | null, reason: string) {
  let q = admin.from("omni_autonomy_windows").update({ ended_at: new Date().toISOString(), end_reason: reason }).is("ended_at", null);
  if (agentId) q = q.eq("agent_id", agentId);
  await q;
}

/** Loads an active session, ending it if idle or too old. */
export async function activeSession(db: Db, admin: Db, sessionId: string): Promise<{ session: Session; agent: Agent }> {
  const { data: session } = await db.from("omni_workspace_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Session not found.");
  const reason = sessionEndReason(
    {
      startedAt: Date.parse(session.started_at),
      lastActivityAt: Date.parse(session.last_activity_at),
      endedAt: session.ended_at ? Date.parse(session.ended_at) : null,
    },
    Date.now(),
  );
  if (reason === "ended") throw new Error("This session has ended. Start a new one.");
  if (reason) {
    await admin.from("omni_workspace_sessions").update({ ended_at: new Date().toISOString(), end_reason: reason }).eq("id", sessionId);
    await audit(admin, { actor: "system", event: `session_${reason}`, agentId: session.agent_id, sessionId });
    throw new Error(reason === "timeout" ? "Session locked after 10 minutes idle. Confirm your passkey to start again." : "Session reached 60 minutes. Start a new one.");
  }
  const { data: agent } = await db.from("omni_agents").select("*").eq("id", session.agent_id).maybeSingle();
  if (!agent || agent.status !== "enrolled") throw new Error("This agent is not enrolled.");
  return { session, agent };
}

export async function touch(admin: Db, sessionId: string) {
  await admin.from("omni_workspace_sessions").update({ last_activity_at: new Date().toISOString() }).eq("id", sessionId);
}

/** Stores validated remote steps; costs go to the append-only ledger. */
export async function ingest(admin: Db, db: Db, agent: Agent, sessionId: string, jobId: string, reply: RemoteReply) {
  const windowRow = await openWindow(db, agent.id);
  const autonomous = autonomyActive(windowRow ? { expiresAt: Date.parse(windowRow.expires_at), endedAt: null } : null, Date.now());
  for (const s of reply.steps) {
    const gate = needsOwnerDecision({ kind: s.kind, gated: s.gated }, autonomous);
    const status = s.status === "pending_approval" || gate && s.status !== "failed" ? (gate ? "pending_approval" : "done") : s.status;
    const { data: row, error } = await admin
      .from("omni_agent_steps")
      .upsert(
        {
          job_id: jobId,
          agent_id: agent.id,
          session_id: sessionId,
          remote_id: s.id,
          kind: s.kind,
          status,
          title: s.title,
          body: s.body,
          stream: s.stream ?? null,
          exit_code: s.exitCode ?? null,
          cost_cents: s.costCents,
          model: s.model ?? null,
          body_sha256: createHash("sha256").update(s.body).digest("hex"),
        },
        { onConflict: "job_id,remote_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error("OMNI steps could not be saved.");
    if (!row?.length) continue; // already stored
    if (s.costCents > 0)
      await admin.from("omni_spend_ledger").insert({ agent_id: agent.id, session_id: sessionId, job_id: jobId, cents: s.costCents, note: s.model ?? s.kind });
    if (s.gated)
      await admin.from("omni_workspace_approvals").insert({
        agent_id: agent.id,
        session_id: sessionId,
        job_id: jobId,
        remote_id: s.id,
        action_kind: s.gated,
        description: (s.title + "\n" + s.body).slice(0, 2000),
      });
    await audit(admin, {
      actor: agent.id,
      event: `step_${s.kind}`,
      agentId: agent.id,
      sessionId,
      jobId,
      detail: { title: s.title, status, exitCode: s.exitCode ?? null, costCents: s.costCents, gated: s.gated },
      output: s.body,
    });
  }
  if (reply.job) {
    const done = ["done", "failed", "stopped"].includes(reply.job.status);
    const { data: job } = await admin.from("omni_agent_jobs").select("cost_cents").eq("id", jobId).single();
    const added = reply.steps.reduce((t, s) => t + s.costCents, 0);
    await admin
      .from("omni_agent_jobs")
      .update({
        status: reply.job.status,
        cursor: reply.job.cursor ?? null,
        cost_cents: (job?.cost_cents ?? 0) + added,
        ...(done ? { ended_at: new Date().toISOString() } : {}),
      })
      .eq("id", jobId);
  }
}
