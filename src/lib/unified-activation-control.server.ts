/**
 * Server-only owner execution control and Railway executor inspection. Kept out of
 * `unified-activation.functions.ts` so client bundles never include server-only code; server
 * functions load this module dynamically inside their handlers. Same gates as before.
 */
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { isMfaFresh } from "./activation-approvals";
import { latestSecurityReset } from "./activation-status";
import { upstreamNotInEffect } from "./activation-reconcile";
import {
  REVIEWED_EXECUTOR_RELEASE,
  readExecutionState,
  verifiedExecutorRelease,
} from "./unified-activation.server";
import { staged } from "./staged-rpc";

type OwnerArgs = Parameters<typeof import("./razul-owner.server").requireRazulOwner>;
export type Context = { supabase: OwnerArgs[0]; userId: string; claims: OwnerArgs[2] };
export async function owner(context: Context) {
  setResponseHeader("Cache-Control", "private, no-store");
  await (
    await import("./razul-owner.server")
  ).requireRazulOwner(context.supabase, context.userId, context.claims);
}
export async function approved(context: Context, kind: "live_link" | "autonomy") {
  await owner(context);
  if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
    throw new Error("Fresh owner authentication is required");
  const through = kind === "live_link" ? 9 : 10;
  const [effective, rows, history] = await Promise.all([
    context.supabase.rpc("activation_effective", { _kind: kind }),
    context.supabase
      .from("activation_approvals")
      .select("step,status,decided_at,approval_expires_at")
      .lte("step", through),
    context.supabase
      .from("owner_mfa_recovery_events")
      .select("event,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (effective.error || rows.error || history.error)
    throw new Error(
      "Current upstream activation and approvals could not be read, so nothing was sent",
    );
  if (effective.data !== true) {
    const row = await context.supabase
      .from("activation_activations")
      .select("status,evidence,started_at")
      .eq("kind", kind)
      .maybeSingle();
    if (row.error)
      throw new Error("Current upstream activation could not be read, so nothing was sent");
    throw new Error(upstreamNotInEffect(kind, row.data, Date.now()));
  }
  const reset = latestSecurityReset(history.data ?? []);
  const expiry = Date.parse(rows.data.find((row) => row.step === 7)?.approval_expires_at ?? "");
  if (
    rows.data.length !== through ||
    rows.data.some(
      (row) =>
        row.status !== "approved" ||
        (reset && (!row.decided_at || Date.parse(row.decided_at) <= Date.parse(reset))),
    ) ||
    !Number.isFinite(expiry) ||
    expiry <= Date.now()
  )
    throw new Error("Ordered approvals or account security changed");
  return expiry;
}

/**
 * Owner execution control (verify / arm / disarm / reconcile) with the same gates as the button.
 * Used by `controlUnifiedExecution` and the combined activation; verify disarms at Jackboy (its contract).
 */
export async function executionControl(
  context: Context,
  operation: "verify" | "arm" | "disarm" | "reconcile",
) {
  const data = { operation };
  {
    if (data.operation === "verify" || data.operation === "arm")
      await approved(context, data.operation === "verify" ? "live_link" : "autonomy");
    else await owner(context);
    if (data.operation === "reconcile") {
      if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
        throw new Error("Fresh owner authentication is required");
      const attempts = await context.supabase
        .from("activation_activations")
        .select("kind,status,attempt_id")
        .in("status", ["activating", "failed", "revoked"]);
      if (attempts.error) throw new Error("Upstream activation attempts could not be read");
      for (const attempt of attempts.data) {
        const kind = z.enum(["live_link", "autonomy"]).parse(attempt.kind);
        const stopped = await readExecutionState(kind === "live_link" ? "revoke" : "unconfigure");
        if (
          stopped.armed ||
          stopped.cancellationPending ||
          (kind === "live_link" ? stopped.connected : stopped.configured)
        )
          throw new Error("Rollback or cancellation remains unverified");
        const result = await context.supabase.rpc("activation_activation_revoke", { _kind: kind });
        if (result.error)
          throw new Error("Remote rollback verified but upstream reconciliation was not recorded");
        if (attempt.attempt_id) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const confirmed = await staged(supabaseAdmin).rpc("activation_rollback_confirmed", {
            _kind: kind,
            _attempt: attempt.attempt_id,
          });
          if (confirmed.error) throw new Error("Verified reconciliation could not be recorded");
        }
      }
      return readExecutionState();
    }
    const release = process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"];
    if (data.operation === "arm" && release !== REVIEWED_EXECUTOR_RELEASE)
      throw new Error("No independently reviewed executor release is configured");
    if (data.operation === "disarm") {
      const local = await context.supabase.rpc("activation_activation_revoke", {
        _kind: "autonomy",
      });
      if (local.error) throw new Error("Local autonomy revocation could not be recorded");
    }
    const state = await readExecutionState(
      data.operation,
      data.operation === "arm" ? { release } : {},
    );
    if (data.operation === "verify") verifiedExecutorRelease(state);
    if (data.operation === "disarm") {
      if (state.armed || state.cancellationPending)
        throw new Error("Disarming or cancellation remains unverified");
      const current = await context.supabase
        .from("activation_activations")
        .select("attempt_id")
        .eq("kind", "autonomy")
        .single();
      if (current.error) throw new Error("Current disarm scope is unavailable");
      if (current.data.attempt_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const confirmed = await staged(supabaseAdmin).rpc("activation_rollback_confirmed", {
          _kind: "autonomy",
          _attempt: current.data.attempt_id,
        });
        if (confirmed.error) throw new Error("Verified disarm could not be recorded");
      }
    }
    return state;
  }
}

/**
 * Signed, read-only `inspect` of the separate Railway executor (Mothership's executor settings):
 * whether autonomous execution is enabled there and which release it reviews. Never runs anything.
 */
export async function inspectRailwayExecutor(): Promise<
  | { ok: true; release: string; enabled: boolean; reviewedRelease: string | null }
  | { ok: false; issue: "not_configured" | "unreachable" | "invalid_reply" }
> {
  const origin = process.env["OMNI_EXECUTOR_ORIGIN"];
  const secret = process.env["OMNI_EXECUTOR_CONTROL_SECRET"];
  if (!origin || !secret || secret.length < 32) return { ok: false, issue: "not_configured" };
  let raw: unknown;
  try {
    const { assertPublicLinkOrigin } = await import("./jackboy-link.server");
    assertPublicLinkOrigin(origin);
    const { signedExecutorRequest } = await import("./omni-executor-client");
    raw = await signedExecutorRequest(origin, secret, "inspect", {}, 8000);
  } catch {
    return { ok: false, issue: "unreachable" };
  }
  const parsed = z
    .object({
      release: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
      enabled: z.boolean(),
      reviewedRelease: z.string().max(80).nullable(),
    })
    .strict()
    .safeParse(raw);
  return parsed.success ? { ok: true, ...parsed.data } : { ok: false, issue: "invalid_reply" };
}
