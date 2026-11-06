/**
 * Owner-only Activation Approvals. These functions read and record decisions
 * only. They never flip switches, write secrets, deploy, run the self-test,
 * contact Railway/Jackboy/OpenAI or make paid calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFERRED_SETTING,
  LINK_SETTING_NAMES,
  decisionInput,
  isMfaFresh,
  mfaAgeSeconds,
  normalizeRows,
  type ApprovalRow,
} from "./activation-approvals";

export const listActivationApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const [steps, audit] = await Promise.all([
      context.supabase
        .from("activation_approvals")
        .select(
          "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
        )
        .order("step"),
      context.supabase
        .from("razul_control_audit")
        .select("id,actor_id,action,record_id,occurred_at")
        .eq("record_type", "activation_approval")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);
    if (steps.error || audit.error) throw new Error("Approval records could not be read.");
    // Presence by name only. Values are never read into the response.
    const settings = LINK_SETTING_NAMES.map((name) => ({
      name,
      present: Boolean(process.env[name]),
      deferred: name === DEFERRED_SETTING,
    }));
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      viewerId: context.userId,
      rows: normalizeRows(steps.data as Partial<ApprovalRow>[]),
      audit: audit.data,
      settings,
      mfaAgeSeconds: mfaAgeSeconds(context.claims["amr"], nowSeconds),
    };
  });

export const decideActivationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return { ok: false as const, reason: "mfa" as const, message: "Re-verify with your authenticator first." };
    const { error } = await context.supabase.rpc("activation_approval_decide", {
      _step: data.step,
      _action: data.action,
      _note: data.note,
      // NULL is valid for every step except 7; the generated type omits nullability.
      _expires_at: (data.expiresAt ?? null) as unknown as string,
      _cap_confirmed: data.capConfirmed,
      _daily_confirmed: data.dailyConfirmed,
    });
    if (error) {
      if (error.message.includes("Fresh two-factor"))
        return { ok: false as const, reason: "mfa" as const, message: "Re-verify with your authenticator first." };
      // 22023 messages are written by the approval function itself and contain no data.
      if (error.code === "22023")
        return { ok: false as const, reason: "rule" as const, message: error.message };
      return {
        ok: false as const,
        reason: "denied" as const,
        message: "The decision was not recorded. Check owner access and refresh.",
      };
    }
    return { ok: true as const };
  });
