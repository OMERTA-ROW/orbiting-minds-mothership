/**
 * OMNI Agent Workspace server functions. Owner-only (verified email, owner role, aal2)
 * plus passkey checks. Commands and chat are relayed only over the signed secure link,
 * and only while the gate is open. Stop is always available.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  agentGrantInput,
  autonomyInput,
  chatInput,
  checkIdInput,
  commandInput,
  decideInput,
  killSwitchInput,
  passkeyNameInput,
  passkeyPurposeInput,
  pollInput,
  prInput,
  startSessionInput,
  stopInput,
  evaluateSandboxHealth,
  stopDrillInput,
  STOP_DRILL_COMMAND,
} from "./omni-workspace";

type Ctx = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};

async function owner(context: Ctx) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ws = await import("./omni-workspace.server");
  const pk = await import("./omni-passkey.server");
  return { db: context.supabase, admin: supabaseAdmin, ws, pk, uid: context.userId };
}

const fail = (e: unknown) => ({
  ok: false as const,
  message: e instanceof Error ? e.message : "Something went wrong. Nothing was sent.",
});

export const readWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        agentFilter: z.string().max(32).optional(),
        sessionId: z.string().uuid().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { db, admin, ws, uid } = await owner(context);
    const { gate, link, controls, passkeyFreshAt } = await ws.gateFor(db, admin, uid);
    let auditQ = db
      .from("omni_workspace_audit")
      .select("*")
      .order("at", { ascending: false })
      .limit(200);
    if (data.agentFilter) auditQ = auditQ.eq("agent_id", data.agentFilter);
    const [agents, sessions, jobs, windows, approvals, auditRows, passkeys, steps, ledger] =
      await Promise.all([
        db.from("omni_agents").select("*").order("id"),
        db
          .from("omni_workspace_sessions")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
        db
          .from("omni_agent_jobs")
          .select("id,agent_id,session_id,kind,origin,input,status,cost_cents,created_at,ended_at")
          .order("created_at", { ascending: false })
          .limit(200),
        db.from("omni_autonomy_windows").select("*").is("ended_at", null),
        db.from("omni_workspace_approvals").select("*").eq("status", "pending").order("created_at"),
        auditQ,
        db
          .from("omni_passkeys")
          .select("id,name,rp_id,created_at,last_used_at")
          .order("created_at"),
        data.sessionId
          ? db
              .from("omni_agent_steps")
              .select("*")
              .eq("session_id", data.sessionId)
              .order("created_at")
              .limit(500)
          : Promise.resolve({ data: [], error: null }),
        ws.spend(db),
      ]);
    const agentSpend = await Promise.all(
      (agents.data ?? []).map(async (a) => [a.id, await ws.spend(db, a.id)] as const),
    );
    const autonomy = await ws.autonomyReadiness(
      admin,
      link,
      controls,
      agents.data ?? [],
      passkeyFreshAt !== null,
    );
    return {
      now: Date.now(),
      gate,
      link: {
        configured: link.configured,
        enabled: link.enabled,
        problem: link.problem,
        selfTestPassedAt: link.selfTestPassedAt,
        lastCheck: link.lastCheck,
      },
      killSwitchEnabled: controls.killSwitchEnabled,
      killSwitchChangedAt: controls.settings?.changed_at ?? null,
      emergencyStopReleased: controls.emergencyStopReleased,
      passkeyFreshAt,
      agents: agents.data ?? [],
      agentSpend: Object.fromEntries(agentSpend),
      autonomy,
      spend: ledger,
      sessions: sessions.data ?? [],
      jobs: jobs.data ?? [],
      windows: windows.data ?? [],
      approvals: approvals.data ?? [],
      audit: auditRows.data ?? [],
      passkeys: passkeys.data ?? [],
      steps: steps.data ?? [],
    };
  });

// ---- Passkeys -------------------------------------------------------------

export const passkeyRegisterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, pk, uid } = await owner(context);
    const { mfaAgeSeconds, FRESH_MFA_SECONDS } = await import("./activation-approvals");
    const age = mfaAgeSeconds(context.claims["amr"], Math.floor(Date.now() / 1000));
    if (age === null || age > FRESH_MFA_SECONDS)
      return {
        ok: false as const,
        message: "Re-verify with your authenticator code before adding a passkey.",
      };
    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : "owner";
    try {
      return { ok: true as const, ...(await pk.registrationOptions(admin, uid, email)) };
    } catch (e) {
      return fail(e);
    }
  });

export const passkeyRegisterVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    checkIdInput.merge(passkeyNameInput).extend({ response: z.any() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { admin, pk, ws, uid } = await owner(context);
    try {
      await pk.verifyRegistration(admin, uid, data.checkId, data.response, data.name);
      await ws.audit(admin, {
        actor: "owner",
        event: "passkey_added",
        detail: { name: data.name },
      });
      return { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });

export const passkeyCheckOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => passkeyPurposeInput.parse(i))
  .handler(async ({ context, data }) => {
    const { admin, pk, uid } = await owner(context);
    try {
      return { ok: true as const, ...(await pk.assertionOptions(admin, uid, data.purpose)) };
    } catch (e) {
      return fail(e);
    }
  });

export const passkeyCheckVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => checkIdInput.extend({ response: z.any() }).parse(i))
  .handler(async ({ context, data }) => {
    const { admin, pk, ws, uid } = await owner(context);
    try {
      await pk.verifyAssertion(admin, uid, data.checkId, data.response);
      await ws.audit(admin, { actor: "owner", event: "passkey_confirmed" });
      return { ok: true as const };
    } catch (e) {
      await ws.audit(admin, { actor: "owner", event: "passkey_failed" }).catch(() => {});
      return fail(e);
    }
  });

// ---- Kill switch ----------------------------------------------------------

export const setKillSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => killSwitchInput.parse(i))
  .handler(async ({ context, data }) => {
    const { admin, pk, ws, uid } = await owner(context);
    try {
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["kill_switch"]);
      const { error } = await admin.from("omni_workspace_settings").upsert({
        id: 1,
        terminal_enabled: data.enabled,
        changed_by: uid,
        changed_at: new Date().toISOString(),
        reason: data.reason,
      });
      if (error) throw new Error("Kill switch change was not saved.");
      if (!data.enabled) {
        await admin
          .from("omni_workspace_sessions")
          .update({ ended_at: new Date().toISOString(), end_reason: "kill_switch" })
          .is("ended_at", null);
        await admin
          .from("omni_agent_jobs")
          .update({ status: "stopped", ended_at: new Date().toISOString() })
          .in("status", ["queued", "running"]);
        await ws.endAutonomy(admin, null, "kill_switch");
      }
      await ws.audit(admin, {
        actor: "owner",
        event: data.enabled ? "kill_switch_enabled_terminal" : "kill_switch_disabled_terminal",
        detail: { reason: data.reason },
      });
      return { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });

// ---- Cloud sandbox self-test ---------------------------------------------

/**
 * Asks the sandbox for its live health probe over the signed link and records the result.
 * Passes only if isolation and limits check out; the reply proof is verified first.
 */
export const runSandboxSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => checkIdInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, pk, ws, uid } = await owner(context);
    try {
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["open"]);
      const c = await ws.controls(db);
      if (!c.emergencyStopReleased) throw new Error("Emergency Stop is engaged.");
      const link = await ws.linkState(admin);
      if (!link.configured) throw new Error(link.problem ?? "Cloud sandbox is not configured.");
      if (!link.enabled) throw new Error("Cloud sandbox switch (OMNI_SANDBOX_ENABLED) is off.");
      let health;
      try {
        const reply = await ws.relay(link, "health.check", {});
        health = reply.health;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "error";
        await ws.audit(admin, {
          actor: "owner",
          event: "sandbox_self_test_failed",
          detail: { failures: [reason] },
        });
        return { ok: false as const, message: reason };
      }
      if (!health) {
        await ws.audit(admin, {
          actor: "owner",
          event: "sandbox_self_test_failed",
          detail: { failures: ["No health report."] },
        });
        return { ok: false as const, message: "The sandbox did not send a health report." };
      }
      const verdict = evaluateSandboxHealth(health);
      await ws.audit(admin, {
        actor: "owner",
        event: verdict.passed ? "sandbox_self_test_passed" : "sandbox_self_test_failed",
        detail: { health, failures: verdict.failures },
      });
      return verdict.passed
        ? { ok: true as const }
        : { ok: false as const, message: `Self-test failed: ${verdict.failures[0]}` };
    } catch (e) {
      return fail(e);
    }
  });

// ---- Sessions, chat, commands --------------------------------------------

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => startSessionInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, pk, ws, uid } = await owner(context);
    try {
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["session", "open"]);
      const { gate, link } = await ws.gateFor(db, admin, uid, true);
      if (!gate.open) throw new Error(gate.blockers[0] ?? "Not connected.");
      const { data: agent } = await db
        .from("omni_agents")
        .select("*")
        .eq("id", data.agentId)
        .maybeSingle();
      if (!agent || agent.status !== "enrolled") throw new Error("This agent is not enrolled.");
      const { data: row, error } = await admin
        .from("omni_workspace_sessions")
        .insert({
          owner_id: uid,
          agent_id: agent.id,
          provider: data.provider,
          repository: data.repository ?? null,
          repo_ref: data.repository ? (data.ref ?? "main") : null,
        })
        .select("*")
        .single();
      if (error || !row) throw new Error("Session could not be created.");
      await ws.audit(admin, {
        actor: "owner",
        event: "session_start_requested",
        agentId: agent.id,
        sessionId: row.id,
      });
      try {
        const reply = await ws.relay(link, "session.start", {
          sessionId: row.id,
          agentId: agent.id,
          allowedActions: agent.allowed_actions,
          provider: data.provider,
        });
        if (!reply.session) throw new Error("OMNI did not report a sandbox.");
        await admin
          .from("omni_workspace_sessions")
          .update({
            sandbox_id: reply.session.sandboxId,
            sandbox_name: reply.session.sandboxName,
            model: reply.session.model,
          })
          .eq("id", row.id);
        await ws.audit(admin, {
          actor: agent.id,
          event: "session_started",
          agentId: agent.id,
          sessionId: row.id,
          detail: reply.session,
        });
      } catch (e) {
        await admin
          .from("omni_workspace_sessions")
          .update({ ended_at: new Date().toISOString(), end_reason: "error" })
          .eq("id", row.id);
        await ws.audit(admin, {
          actor: "system",
          event: "session_start_failed",
          agentId: agent.id,
          sessionId: row.id,
          detail: { error: e instanceof Error ? e.message : "error" },
        });
        throw e;
      }
      if (data.repository) {
        const r = await submit(context, row.id, {
          jobKind: "command",
          need: "edit_files",
          input: `checkout ${data.repository}@${data.ref ?? "main"}`,
          action: "repo.checkout",
          payload: { repository: data.repository, ref: data.ref ?? "main" },
        });
        if (!r.ok)
          return {
            ok: true as const,
            sessionId: row.id,
            warning: `Session started, but checkout was not sent: ${r.message}`,
          };
      }
      return { ok: true as const, sessionId: row.id };
    } catch (e) {
      return fail(e);
    }
  });

type Submit = {
  jobKind: "chat" | "command";
  need: "chat" | "run_commands" | "edit_files";
  input: string;
  action: "chat.send" | "command.run" | "repo.checkout" | "pr.propose";
  payload: Record<string, unknown>;
};
const NEED_LABEL = {
  chat: "chat",
  run_commands: "run commands",
  edit_files: "change repository files",
} as const;

async function submit(context: Ctx, sessionId: string, req: Submit) {
  const { db, admin, ws, uid } = await owner(context);
  try {
    const { gate, link } = await ws.gateFor(db, admin, uid, true);
    if (!gate.open) throw new Error(gate.blockers[0] ?? "Not connected.");
    const { session, agent } = await ws.activeSession(db, admin, sessionId);
    if (!agent.allowed_actions.includes(req.need))
      throw new Error(`${agent.display_name} is not allowed to ${NEED_LABEL[req.need]}.`);
    // Model calls are billed, so they need budget first. Shell, checkout and PR jobs report any cost they incur.
    if (req.jobKind === "chat") {
      const budget = await ws.checkBudget(db, agent);
      if (!budget.allowed) throw new Error(budget.reason!);
    }
    if (req.action === "pr.propose" && !session.repository)
      throw new Error("This session has no repository.");
    // Jackboy's System Kill Switch (when a verified reading reports it) also stops manual work.
    // Its CODE Emergency Stop does not: the manual terminal stays separate from CODE autonomy.
    const { data: manualBlocked, error: manualError } = await db.rpc("jackboy_manual_blocked");
    if (manualError || manualBlocked !== false)
      throw new Error(
        manualError
          ? "Jackboy's Kill Switch state could not be read, so nothing was sent."
          : "Jackboy reports its System Kill Switch on, so OMNI terminal work is refused. It is changed only in Jackboy.",
      );
    const { data: job, error } = await admin
      .from("omni_agent_jobs")
      .insert({
        agent_id: agent.id,
        session_id: session.id,
        kind: req.jobKind,
        origin: "owner",
        input: req.input,
        status: "queued",
      })
      .select("id")
      .single();
    if (error || !job) throw new Error("Job could not be created.");
    await ws.audit(admin, {
      actor: "owner",
      event:
        req.action === "chat.send"
          ? "chat_sent"
          : req.action === "command.run"
            ? "command_sent"
            : req.action.replace(".", "_"),
      agentId: agent.id,
      sessionId,
      jobId: job.id,
      output: req.input,
    });
    await ws.touch(admin, sessionId);
    try {
      // Autonomy stays off: every command waits for the owner on the sandbox side too.
      const reply = await ws.relay(link, req.action, {
        sessionId,
        jobId: job.id,
        agentId: agent.id,
        autonomous: false,
        ...req.payload,
      });
      await ws.ingest(admin, db, agent, sessionId, job.id, reply);
    } catch (e) {
      await admin
        .from("omni_agent_jobs")
        .update({ status: "failed", ended_at: new Date().toISOString() })
        .eq("id", job.id);
      await ws.audit(admin, {
        actor: "system",
        event: "relay_failed",
        agentId: agent.id,
        sessionId,
        jobId: job.id,
        detail: { error: e instanceof Error ? e.message : "error" },
      });
      throw e;
    }
    return { ok: true as const, jobId: job.id };
  } catch (e) {
    return fail(e);
  }
}

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => chatInput.parse(i))
  .handler(({ context, data }) =>
    submit(context, data.sessionId, {
      jobKind: "chat",
      need: "chat",
      input: data.text,
      action: "chat.send",
      payload: { text: data.text },
    }),
  );

export const runCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => commandInput.parse(i))
  .handler(({ context, data }) =>
    submit(context, data.sessionId, {
      jobKind: "command",
      need: "run_commands",
      input: data.command,
      action: "command.run",
      payload: { command: data.command },
    }),
  );

/** Asks the sandbox to prepare a draft pull request; opening it needs a passkey approval. */
export const proposePullRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => prInput.parse(i))
  .handler(({ context, data }) =>
    submit(context, data.sessionId, {
      jobKind: "command",
      need: "edit_files",
      input: `pull request: ${data.title}`,
      action: "pr.propose",
      payload: { title: data.title },
    }),
  );

/** Near-live output: the page asks OMNI for new step events about once a second. */
export const pollSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => pollInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, ws, uid } = await owner(context);
    try {
      const { gate, link } = await ws.gateFor(db, admin, uid, true);
      if (!gate.open) throw new Error(gate.blockers[0] ?? "Not connected.");
      const { agent } = await ws.activeSession(db, admin, data.sessionId);
      const { data: running } = await db
        .from("omni_agent_jobs")
        .select("id,cursor")
        .eq("session_id", data.sessionId)
        .in("status", ["queued", "running"]);
      for (const job of running ?? []) {
        const reply = await ws.relay(link, "events.poll", {
          sessionId: data.sessionId,
          jobId: job.id,
          cursor: job.cursor,
        });
        await ws.ingest(admin, db, agent, data.sessionId, job.id, reply);
        const budget = await ws.checkBudget(db, agent, job.id);
        if (!budget.allowed) {
          await ws
            .relay(link, "job.stop", { sessionId: data.sessionId, jobId: job.id })
            .catch(() => {});
          await admin
            .from("omni_agent_jobs")
            .update({ status: "stopped", ended_at: new Date().toISOString() })
            .eq("id", job.id);
          await ws.endAutonomy(admin, agent.id, "budget");
          await ws.audit(admin, {
            actor: "system",
            event: "budget_stop",
            agentId: agent.id,
            sessionId: data.sessionId,
            jobId: job.id,
            detail: { reason: budget.reason },
          });
        }
      }
      const { data: steps } = await db
        .from("omni_agent_steps")
        .select("*")
        .eq("session_id", data.sessionId)
        .order("created_at")
        .limit(500);
      return { ok: true as const, steps: steps ?? [] };
    } catch (e) {
      return fail(e);
    }
  });

export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => pollInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, ws } = await owner(context);
    const { data: s } = await db
      .from("omni_workspace_sessions")
      .select("agent_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    await admin
      .from("omni_workspace_sessions")
      .update({ ended_at: new Date().toISOString(), end_reason: "owner" })
      .eq("id", data.sessionId)
      .is("ended_at", null);
    const link = await ws.linkState(admin);
    if (link.configured)
      await ws.relay(link, "session.end", { sessionId: data.sessionId }).catch(() => {});
    await ws.audit(admin, {
      actor: "owner",
      event: "session_ended",
      agentId: s?.agent_id,
      sessionId: data.sessionId,
    });
    return { ok: true as const };
  });

/** Always allowed for the owner: stops locally first, then tells OMNI (best effort). */
export const stopWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => stopInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, ws } = await owner(context);
    const now = new Date().toISOString();
    let q = admin
      .from("omni_agent_jobs")
      .update({ status: "stopped", ended_at: now })
      .in("status", ["queued", "running"]);
    if (data.sessionId) q = q.eq("session_id", data.sessionId);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    await q;
    let agentId = data.agentId ?? null;
    if (!agentId && data.sessionId) {
      const { data: s } = await db
        .from("omni_workspace_sessions")
        .select("agent_id")
        .eq("id", data.sessionId)
        .maybeSingle();
      agentId = s?.agent_id ?? null;
    }
    await ws.endAutonomy(admin, agentId, "stop");
    let remote = "not sent (link not configured)";
    const link = await ws.linkState(admin);
    if (link.configured) {
      remote = await ws
        .relay(link, data.agentId ? "agent.stop" : "job.stop", {
          sessionId: data.sessionId,
          agentId,
        })
        .then(() => "confirmed by OMNI")
        .catch((e: unknown) => `not confirmed: ${e instanceof Error ? e.message : "error"}`);
    }
    await ws.audit(admin, {
      actor: "owner",
      event: data.agentId ? "agent_stop" : "stop",
      agentId,
      sessionId: data.sessionId,
      detail: { remote },
    });
    return { ok: true as const, remote };
  });

export const setAutonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => autonomyInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, pk, ws, uid } = await owner(context);
    try {
      if (!data.on) {
        await ws.endAutonomy(admin, data.agentId, "owner");
        await ws.audit(admin, { actor: "owner", event: "autonomy_off", agentId: data.agentId });
        return { ok: true as const };
      }
      if (!data.minutes) throw new Error("Pick 15, 30 or 60 minutes.");
      const { data: agent } = await db
        .from("omni_agents")
        .select("*")
        .eq("id", data.agentId)
        .maybeSingle();
      if (!agent) throw new Error("This agent is not enrolled.");
      // Every readiness gate is checked before the passkey is spent, then again after it.
      const pre = await ws.gateFor(db, admin, uid, true);
      const before = (await ws.autonomyReadiness(admin, pre.link, pre.controls, [agent], true))[
        agent.id
      ]!;
      const missing = before.gates.filter((g) => !g.ok);
      if (missing.length) {
        await ws.audit(admin, {
          actor: "owner",
          event: "autonomy_refused",
          agentId: agent.id,
          detail: { missing: missing.map((g) => g.id) },
        });
        throw new Error(
          `Autonomous Mode stays off: ${missing.length} gate(s) not met — first: ${missing[0]!.label}.`,
        );
      }
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["autonomy"]);
      const { gate } = await ws.gateFor(db, admin, uid, true);
      if (!gate.open) throw new Error(gate.blockers[0] ?? "Not connected.");
      const budget = await ws.checkBudget(db, agent);
      if (!budget.allowed) throw new Error(budget.reason!);
      await ws.endAutonomy(admin, data.agentId, "replaced");
      const start = new Date();
      const { error } = await admin.from("omni_autonomy_windows").insert({
        owner_id: uid,
        agent_id: data.agentId,
        started_at: start.toISOString(),
        expires_at: new Date(start.getTime() + data.minutes * 60_000).toISOString(),
      });
      if (error) throw new Error("Autonomous Mode was not turned on.");
      await ws.audit(admin, {
        actor: "owner",
        event: "autonomy_on",
        agentId: data.agentId,
        detail: { minutes: data.minutes },
      });
      return { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });

export const decideStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => decideInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, pk, ws, uid } = await owner(context);
    try {
      let jobId: string, remoteId: string, sessionId: string, agentId: string;
      if (data.approvalId) {
        await pk.consumePasskeyCheck(admin, uid, data.checkId, ["approval"]);
        const { data: a } = await db
          .from("omni_workspace_approvals")
          .select("*")
          .eq("id", data.approvalId)
          .eq("status", "pending")
          .maybeSingle();
        if (!a) throw new Error("This approval is no longer waiting.");
        ({ job_id: jobId, remote_id: remoteId, session_id: sessionId, agent_id: agentId } = a);
      } else if (data.stepId) {
        const { data: s } = await db
          .from("omni_agent_steps")
          .select("*")
          .eq("id", data.stepId)
          .eq("status", "pending_approval")
          .maybeSingle();
        if (!s) throw new Error("This step is no longer waiting.");
        const { data: gated } = await db
          .from("omni_workspace_approvals")
          .select("id")
          .eq("job_id", s.job_id)
          .eq("remote_id", s.remote_id)
          .maybeSingle();
        if (gated) throw new Error("This step needs a passkey approval in Approvals waiting.");
        ({ job_id: jobId, remote_id: remoteId, session_id: sessionId, agent_id: agentId } = s);
      } else throw new Error("Nothing to decide.");
      const { gate, link } = await ws.gateFor(db, admin, uid, true);
      if (data.approve && !gate.open)
        throw new Error(`Not sent: ${gate.blockers[0] ?? "not connected"}`);
      if (data.approvalId)
        await admin
          .from("omni_workspace_approvals")
          .update({
            status: data.approve ? "approved" : "rejected",
            decided_at: new Date().toISOString(),
            decided_by: uid,
          })
          .eq("id", data.approvalId);
      await admin
        .from("omni_agent_steps")
        .update({
          status: data.approve ? "approved" : "rejected",
          decided_at: new Date().toISOString(),
        })
        .eq("job_id", jobId)
        .eq("remote_id", remoteId);
      await ws.audit(admin, {
        actor: "owner",
        event: data.approve ? "step_approved" : "step_rejected",
        agentId,
        sessionId,
        jobId,
        detail: { remoteId },
      });
      if (gate.open) {
        const { agent } = await ws.activeSession(db, admin, sessionId);
        const reply = await ws.relay(link, "step.decide", {
          sessionId,
          jobId,
          stepId: remoteId,
          approve: data.approve,
        });
        await ws.ingest(admin, db, agent, sessionId, jobId, reply);
      }
      return { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => agentGrantInput.parse(i))
  .handler(async ({ context, data }) => {
    const { admin, pk, ws, uid } = await owner(context);
    try {
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["agent"]);
      const { data: rows, error } = await admin
        .from("omni_agents")
        .update({
          status: data.status,
          allowed_actions: data.allowedActions,
          budget_task_cents: data.budgetTaskCents,
          budget_day_cents: data.budgetDayCents,
          budget_total_cents: data.budgetTotalCents,
          updated_by: uid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.agentId)
        .select("id");
      if (error || !rows?.length) throw new Error("Agent was not updated.");
      if (data.status !== "enrolled") await ws.endAutonomy(admin, data.agentId, "agent_paused");
      await ws.audit(admin, {
        actor: "owner",
        event: "agent_updated",
        agentId: data.agentId,
        detail: { ...data, checkId: undefined },
      });
      return { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });

/**
 * Live stop drill: runs one fixed harmless command (`sleep 30`) in an open sandbox session,
 * stops it, and records a pass only when the sandbox's signed replies show it running and then
 * stopped. Pressing the button with a passkey is the owner's approval of that one command.
 */
export const runStopDrill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => stopDrillInput.parse(i))
  .handler(async ({ context, data }) => {
    const { db, admin, pk, ws, uid } = await owner(context);
    try {
      await pk.consumePasskeyCheck(admin, uid, data.checkId, ["autonomy"]);
      const { gate, link } = await ws.gateFor(db, admin, uid, true);
      if (!gate.open) throw new Error(gate.blockers[0] ?? "Not connected.");
      const { agent } = await ws.activeSession(db, admin, data.sessionId);
      const sessionId = data.sessionId;
      const { data: job, error } = await admin
        .from("omni_agent_jobs")
        .insert({
          agent_id: agent.id,
          session_id: sessionId,
          kind: "command",
          origin: "owner",
          input: STOP_DRILL_COMMAND,
          status: "queued",
        })
        .select("id")
        .single();
      if (error || !job) throw new Error("Stop drill job could not be created.");
      await ws.audit(admin, {
        actor: "owner",
        event: "autonomy_stop_drill_started",
        agentId: agent.id,
        sessionId,
        jobId: job.id,
      });
      const base = { sessionId, jobId: job.id, agentId: agent.id, autonomous: false };
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let failure: string | null = null;
      try {
        await ws.ingest(
          admin,
          db,
          agent,
          sessionId,
          job.id,
          await ws.relay(link, "command.run", { ...base, command: STOP_DRILL_COMMAND }),
        );
        await ws.ingest(
          admin,
          db,
          agent,
          sessionId,
          job.id,
          await ws.relay(link, "step.decide", { ...base, stepId: "cmd", approve: true }),
        );
        await admin
          .from("omni_agent_steps")
          .update({ status: "approved", decided_at: new Date().toISOString() })
          .eq("job_id", job.id)
          .eq("remote_id", "cmd");
        await wait(800);
        const running = await ws.relay(link, "events.poll", base);
        await ws.ingest(admin, db, agent, sessionId, job.id, running);
        if (running.job?.status !== "running")
          failure = `Command was not running before stop (status ${running.job?.status ?? "unknown"}).`;
        await ws.relay(link, "job.stop", base);
        let last = "unknown";
        for (let i = 0; i < 8 && !failure; i++) {
          await wait(400);
          const r = await ws.relay(link, "events.poll", base);
          await ws.ingest(admin, db, agent, sessionId, job.id, r);
          last = r.job?.status ?? "unknown";
          if (last === "stopped") break;
        }
        if (!failure && last !== "stopped")
          failure = `Sandbox did not confirm the stop within 3 seconds (status ${last}).`;
      } catch (e) {
        failure = e instanceof Error ? e.message : "Sandbox request failed.";
      }
      await admin
        .from("omni_agent_jobs")
        .update({ status: failure ? "failed" : "stopped", ended_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["queued", "running"]);
      await ws.audit(admin, {
        actor: "system",
        event: failure ? "autonomy_stop_drill_failed" : "autonomy_stop_drill_passed",
        agentId: agent.id,
        sessionId,
        jobId: job.id,
        detail: failure ? { failure } : {},
      });
      return failure
        ? { ok: false as const, message: `Stop drill failed: ${failure}` }
        : { ok: true as const };
    } catch (e) {
      return fail(e);
    }
  });
