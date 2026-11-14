import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMfaFresh } from "./activation-approvals";
import { latestSecurityReset } from "./activation-status";
import { readExecutionState } from "./unified-activation.server";
import { staged } from "./staged-rpc";

type OwnerArgs = Parameters<typeof import("./razul-owner.server").requireRazulOwner>;
type Context = { supabase: OwnerArgs[0]; userId: string; claims: OwnerArgs[2] };
async function owner(context: Context) {
  setResponseHeader("Cache-Control", "private, no-store");
  await (
    await import("./razul-owner.server")
  ).requireRazulOwner(context.supabase, context.userId, context.claims);
}
async function approved(context: Context, kind: "live_link" | "autonomy") {
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
  if (effective.error || effective.data !== true || rows.error || history.error)
    throw new Error("Current upstream activation and approvals are required");
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

export const getUnifiedExecutionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    try {
      await (await import("./unified-stop.server")).reconcileTerminalStop();
      const state = await readExecutionState();
      const active = await context.supabase.rpc("activation_effective", { _kind: "autonomy" });
      const ready = !active.error && active.data === true && state.executionReady;
      return {
        state: { ...state, executionReady: ready },
        label: ready ? (state.running ? "Running" : "Configured") : "Blocked",
      };
    } catch {
      return {
        state: null,
        label: "Blocked",
        reason: "Authenticated fresh safety state could not be verified",
      };
    }
  });

export const controlUnifiedExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        operation: z.enum(["verify", "arm", "disarm", "reconcile"]),
        confirm: z.literal(true),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ context, data }) => {
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
    if (data.operation === "arm" && release !== "omni-bounded-plan-1")
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
  });

const command = z
  .object({
    argv: z
      .array(
        z
          .string()
          .max(2048)
          .refine(
            (value) => !value.includes("\0") && new TextEncoder().encode(value).byteLength <= 2048,
          ),
      )
      .min(1)
      .max(16),
    timeoutMs: z.number().int().min(100).max(10_000),
  })
  .strict();
export const runAuthorizedPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        expiresAt: z.string().datetime(),
        commands: z.array(command).min(1).max(5),
        confirm: z.literal(true),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const approvalExpiry = await approved(context, "autonomy");
    const current = await readExecutionState();
    const release = process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"];
    if (
      !current.executionReady ||
      current.cancellationPending ||
      release !== "omni-bounded-plan-1" ||
      current.executorRelease !== release
    )
      throw new Error("Jackboy blocks this executor or its reviewed release");
    const binaries = [
      "/usr/bin/true",
      "/usr/bin/false",
      "/usr/bin/sleep",
      "/usr/bin/printf",
      "/usr/bin/python3",
    ];
    if (
      data.commands.some((item) => !binaries.includes(item.argv[0] ?? "")) ||
      data.commands.reduce((sum, item) => sum + item.timeoutMs, 0) > 30_000 ||
      Date.parse(data.expiresAt) <= Date.now() ||
      Date.parse(data.expiresAt) > approvalExpiry ||
      Date.parse(data.expiresAt) > Date.now() + 60_000
    )
      throw new Error("Bounded plan policy refused");
    const origin = process.env["OMNI_EXECUTOR_ORIGIN"];
    const secret = process.env["OMNI_EXECUTOR_CONTROL_SECRET"];
    if (!origin || !secret || secret.length < 32)
      throw new Error("Separate executor is not configured");
    const { configuredJackboyLink, JackboyLink, assertPublicLinkOrigin } =
      await import("./jackboy-link.server");
    assertPublicLinkOrigin(origin);
    if (
      !current.executorOrigin ||
      new URL(current.executorOrigin).origin !== new URL(origin).origin
    )
      throw new Error("Dispatch endpoint differs from Jackboy's verified executor");
    if (
      [
        process.env["JACKBOY_LINK_ORIGIN"],
        process.env["OMNI_SANDBOX_ORIGIN"],
        process.env["JACKBOY_LINK_RUNNER_ORIGIN"],
      ].includes(origin)
    )
      throw new Error("Autonomous executor must be a separate service");
    const plan = {
      jobId: data.jobId,
      projectId: current.projectId,
      expiresAt: data.expiresAt,
      release,
      commands: data.commands,
    };
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PermitHolder, databasePermitStore } = await import("./jackboy-permit.server");
    const { recordSafetySnapshot } = await import("./jackboy-safety.server");
    const { signedExecutorRequest } = await import("./omni-executor-client");
    const link = new JackboyLink(await configuredJackboyLink(), async (event) => {
      const result = await supabaseAdmin.from("razul_control_audit").insert({
        actor_id: context.userId,
        action: event,
        record_type: "bounded_plan",
        record_id: data.jobId,
      });
      if (result.error) throw new Error("Permit transport audit failed");
    });
    const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as Parameters<
      typeof databasePermitStore
    >[0]["rpc"];
    let cancellation: Promise<unknown> | null = null;
    let halted = false;
    let monitor: ReturnType<typeof setInterval> | undefined;
    const halt = () => {
      if (halted) return;
      halted = true;
      cancellation = readExecutionState("disarm").then((state) => {
        if (state.armed || state.running || state.cancellationPending)
          throw new Error("Cancellation remains unverified");
      });
      void cancellation.catch(() => {});
    };
    const holder = new PermitHolder(
      { jobId: data.jobId, kind: "autonomous", digest, estimateUsd: 0.01 },
      {
        link,
        store: databasePermitStore({ rpc }),
        approvalId: process.env["OMNI_LINK_APPROVAL_ID"] ?? null,
        onHalt: halt,
      },
    );
    try {
      await readExecutionState("authorize", {
        jobId: data.jobId,
        planSha256: digest,
        expiresAt: data.expiresAt,
        release,
      });
      await recordSafetySnapshot(supabaseAdmin, await link.safety());
      await holder.acquire();
      if (!holder.usable()) throw new Error("Upstream job permit is not usable");
      const lease = async () => {
        const local = await staged(supabaseAdmin)
          .rpc("omni_execution_permit_live", { _job: data.jobId })
          .abortSignal(AbortSignal.timeout(750));
        if (local.error || local.data !== true || halted || !holder.usable())
          throw new Error("Mothership Stop or permit blocks execution");
        const state = await readExecutionState("lease", {
          jobId: data.jobId,
          planSha256: digest,
        });
        if (!state.allowed || !state.executionReady)
          throw new Error("Mothership execution lease was refused");
      };
      await lease();
      let checking = false;
      monitor = setInterval(() => {
        if (checking || halted) return;
        checking = true;
        void lease()
          .catch(halt)
          .finally(() => {
            checking = false;
          });
      }, 250);
      const result = z
        .object({
          jobId: z.literal(data.jobId),
          outcome: z.enum(["completed", "failed", "cancelled"]),
          providerCostUsd: z.literal(0),
          outputs: z
            .array(
              z.object({
                exitCode: z.number().nullable(),
                output: z.string().max(8192),
                exceeded: z.boolean(),
                cancelled: z.boolean(),
              }),
            )
            .max(5),
        })
        .parse(await signedExecutorRequest(origin, secret, "run", plan));
      clearInterval(monitor);
      halted = true;
      if (cancellation) await cancellation;
      await holder.release();
      return result;
    } catch {
      try {
        const stopped = await readExecutionState("disarm");
        if (stopped.armed || stopped.cancellationPending)
          throw new Error("Cancellation remains pending");
        await holder.release();
      } catch {
        throw new Error(
          "Plan outcome and cancellation are unverified. Keep Stop engaged and reconcile Jackboy; do not replay the plan.",
        );
      }
      throw new Error(
        "Plan response was not verified. Autonomy was disarmed and cancellation confirmed; no automatic retry.",
      );
    } finally {
      clearInterval(monitor);
      halted = true;
      await holder.release();
    }
  });
