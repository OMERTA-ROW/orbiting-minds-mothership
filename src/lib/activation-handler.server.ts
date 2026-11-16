/**
 * Server-only Steps 9–10 activation handler and shared owner helpers for Activation Approvals.
 * Kept out of `activation-approvals.functions.ts` so client bundles never include server-only code;
 * server functions load this module dynamically inside their handlers. Same gates as before.
 */
import { setResponseHeader } from "@tanstack/react-start/server";
import type { Json } from "@/integrations/supabase/types";
import {
  isMfaFresh,
  isEffectivelyApproved,
  normalizeRows,
  type ActivationCheckDetail,
} from "./activation-approvals";
import { effectiveRows, latestSecurityReset, type SecurityEvent } from "./activation-status";
import { staged } from "./staged-rpc";

export type Ctx = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};
type Detail = ActivationCheckDetail;
type ActivationInput = { confirm: true; attemptId: string };

export async function ownerContext(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
}) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

/** Newest owner security reset (two-step off, recovery, admin removal); fails closed when unreadable. */
export async function securityResetAt(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
  userId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("owner_mfa_recovery_events")
    .select("event,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Account security history could not be read.");
  return latestSecurityReset((data ?? []) as SecurityEvent[]);
}

/** Ledger rows read for today's total; more than this fails closed rather than undercounting. */
const LEDGER_ROWS = 5000;

/** Mothership-side cap and metering checks before Step 10 activation (values are owner caps). */
async function autonomyPreflight(context: Ctx): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [agents, ledger] = await Promise.all([
    context.supabase
      .from("omni_agents")
      .select("id,display_name,status,budget_task_cents,budget_day_cents,budget_total_cents"),
    supabaseAdmin
      .from("omni_spend_ledger")
      .select("cents")
      .gte(
        "created_at",
        new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString(),
      )
      .limit(LEDGER_ROWS + 1),
  ]);
  if (agents.error) return "agent budgets could not be read.";
  const over = (agents.data ?? []).find(
    (a) =>
      a.status === "enrolled" &&
      (a.budget_task_cents > 100 || a.budget_day_cents > 500 || a.budget_total_cents > 1000),
  );
  if (over)
    return `${over.display_name}'s budget exceeds the owner caps ($1 per task, $5 per day, $10 total).`;
  const enrolled = (agents.data ?? []).filter((a) => a.status === "enrolled");
  const combinedDay = enrolled.reduce((sum, a) => sum + (a.budget_day_cents ?? 0), 0);
  const combinedTotal = enrolled.reduce((sum, a) => sum + (a.budget_total_cents ?? 0), 0);
  if (combinedDay > 500)
    return "the enrolled agents' combined daily budgets exceed the $5 daily cap.";
  if (combinedTotal > 1000)
    return "the enrolled agents' combined total budgets exceed the $10 cap.";
  if (ledger.error) return "the spend ledger (metering) could not be read.";
  if ((ledger.data ?? []).length > LEDGER_ROWS)
    return "today's spend ledger is too long to total safely here.";
  const today = (ledger.data ?? []).reduce((sum, r) => sum + (r.cents ?? 0), 0);
  if (today >= 500) return "today's recorded spend has reached the $5 daily limit.";
  return null;
}

async function runActivationFor(context: Ctx, kind: "live_link" | "autonomy", attemptId: string) {
  const { runActivation } = await import("./activation-activate.server");
  const { configuredJackboyLink, JackboyLink, JackboyLinkError } =
    await import("./jackboy-link.server");
  const { recordSafetySnapshot, recordSafetyFailure, safetyFailureReason } =
    await import("./jackboy-safety.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let client: InstanceType<typeof JackboyLink> | null = null;
  const linkClient = async () => {
    if (client) return client;
    const link = await configuredJackboyLink();
    client = new JackboyLink(link, async (event) => {
      const { error } = await supabaseAdmin.from("razul_control_audit").insert({
        actor_id: context.userId,
        action: event,
        record_type: "jackboy_link",
        record_id: process.env["OMNI_LINK_APPROVAL_ID"] || `activation_${kind}`,
      });
      if (error) throw new JackboyLinkError("Live link audit failed.", "audit");
    });
    return client;
  };
  return runActivation(kind, attemptId, {
    preflight: kind === "autonomy" ? () => autonomyPreflight(context) : undefined,
    begin: async (k, attempt) => {
      const { data, error } = await context.supabase.rpc("activation_activation_begin", {
        _kind: k,
        _attempt: attempt,
      });
      if (error) {
        const { classifyBeginError } = await import("./activation-reconcile");
        const reason = classifyBeginError(error);
        // Nonsecret diagnostics only (database error class + classification), so a refusal can be traced.
        console.error("[activation] begin refused", k, error.code ?? "no_code", reason);
        return { ok: false, reason };
      }
      return data as { ok: boolean; duplicate?: boolean; resumed?: boolean; reason?: string };
    },
    finish: async (k, attempt, ok, reason, evidence) => {
      const { data, error } = await supabaseAdmin.rpc("activation_activation_finish", {
        _kind: k,
        _attempt: attempt,
        _ok: ok,
        _reason: reason,
        _evidence: evidence as Json,
      });
      if (error) throw new Error("activation_not_recorded");
      return data as "active" | "failed" | "superseded" | "expired";
    },
    outcome: async (k, attempt) => {
      const result = await staged(supabaseAdmin).rpc("activation_attempt_outcome", {
        _kind: k,
        _attempt: attempt,
      });
      if (result.error) throw new Error("Activation outcome could not be read");
      return result.data;
    },
    actuate: async (k, attempt) => {
      const { readExecutionState, REVIEWED_EXECUTOR_RELEASE } =
        await import("./unified-activation.server");
      const { ActuationError, connectionExpiresAt, verifyThenConfigure } =
        await import("./activation-actuation");
      const window = await context.supabase
        .from("activation_approvals")
        .select("approval_expires_at")
        .eq("step", 7)
        .single();
      if (window.error || !window.data.approval_expires_at)
        throw new ActuationError("window_unavailable", "Current approval window is unavailable");
      // Jackboy refuses a connection that outlasts its own link approval, so ask for the earlier end.
      // Step 10 verifies the executor immediately before configuring (Jackboy's contract).
      const state =
        k === "live_link"
          ? await readExecutionState("connect", {
              operationId: attempt,
              expiresAt: connectionExpiresAt(
                window.data.approval_expires_at,
                Date.parse(process.env["OMNI_LINK_APPROVAL_EXPIRES_AT"] || ""),
                Date.now(),
              ),
            })
          : await verifyThenConfigure((op) => readExecutionState(op), REVIEWED_EXECUTOR_RELEASE);
      if (
        !state.connected ||
        (k === "live_link" && state.operationId !== attempt) ||
        (k === "autonomy" && (!state.configured || state.armed))
      )
        throw new ActuationError("state_mismatch", "Backend actuation did not verify");
      if (k === "autonomy") {
        const live = await context.supabase
          .from("activation_activations")
          .select("attempt_id")
          .eq("kind", "live_link")
          .single();
        if (live.error || state.operationId !== live.data.attempt_id)
          throw new ActuationError("identity_changed", "Backend connection identity changed");
      }
      return { executorRelease: state.executorRelease };
    },
    rollback: async (k) => {
      const state = await (
        await import("./unified-activation.server")
      ).readExecutionState(k === "live_link" ? "revoke" : "unconfigure");
      if (
        state.armed ||
        state.cancellationPending ||
        (k === "live_link" ? state.connected : state.configured)
      )
        throw new Error("Remote rollback is unverified");
      const outcome = await staged(supabaseAdmin).rpc("activation_attempt_outcome", {
        _kind: k,
        _attempt: attemptId,
      });
      if (outcome.error) throw new Error("Local rollback outcome is unavailable");
      if (outcome.data === "active" || outcome.data === "expired") {
        const revoked = await context.supabase.rpc("activation_activation_revoke", { _kind: k });
        if (revoked.error) throw new Error("Remote rollback verified but local revocation failed");
      }
      const confirmed = await staged(supabaseAdmin).rpc("activation_rollback_confirmed", {
        _kind: k,
        _attempt: attemptId,
      });
      if (confirmed.error) throw new Error("Verified rollback could not be recorded");
    },
    verifyCurrent: async (k) => {
      const state = await (await import("./unified-activation.server")).readExecutionState();
      const live = await context.supabase
        .from("activation_activations")
        .select("attempt_id")
        .eq("kind", "live_link")
        .single();
      if (!state.connected || state.cancellationPending || (k === "autonomy" && !state.configured))
        throw new Error("Current backend activation is unverified");
      if (live.error || state.operationId !== live.data.attempt_id)
        throw new Error("Current backend connection identity changed");
    },
    connect: async () => {
      let c;
      try {
        c = await linkClient();
      } catch {
        throw new JackboyLinkError(
          "Link settings are disabled, malformed or outside their window.",
          "contract",
        );
      }
      await c.connect();
    },
    safety: async () => (await linkClient()).safety(),
    recordSafety: (snap) => recordSafetySnapshot(supabaseAdmin, snap),
    recordSafetyFailure: (reason) => recordSafetyFailure(supabaseAdmin, reason),
    safetyFailureReason,
  });
}

/** Exported for the combined activation (`activation-orchestrate.functions.ts`); same gates. */
export function activationHandler(kind: "live_link" | "autonomy") {
  return async ({ context, data }: { context: Ctx; data: ActivationInput }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await ownerContext(context);
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return {
        ok: false as const,
        reason: "mfa" as const,
        message: "Re-verify with your authenticator first. Nothing was sent or activated.",
        details: [] as Detail[],
      };
    // Approvals from before the owner's last security reset never count (TypeScript mirror).
    const { data: rows, error } = await context.supabase
      .from("activation_approvals")
      .select(
        "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
      )
      .order("step");
    let resetAt: string | null;
    try {
      resetAt = await securityResetAt(context.supabase, context.userId);
    } catch {
      resetAt = "unreadable";
    }
    if (error || resetAt === "unreadable")
      return {
        ok: false as const,
        reason: "denied" as const,
        message: "Approval records could not be read; nothing was sent or activated.",
        details: [] as Detail[],
      };
    const last = kind === "live_link" ? 9 : 10;
    const effective = effectiveRows(normalizeRows(rows), resetAt);
    const missing = effective.find((r) => r.step <= last && !isEffectivelyApproved(r, Date.now()));
    if (missing)
      return {
        ok: false as const,
        reason: "rule" as const,
        message: `Step ${missing.step} must be approved (after your last security reset) first. Nothing was activated.`,
        details: [] as Detail[],
      };
    try {
      return await runActivationFor(context, kind, data.attemptId);
    } catch {
      return {
        ok: false as const,
        reason: "not_recorded" as const,
        message:
          "Activation or rollback could not be verified. Keep Stop engaged; refresh and reconcile the existing attempt before another activation.",
        details: [] as Detail[],
      };
    }
  };
}
