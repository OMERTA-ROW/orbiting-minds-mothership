import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { staged } from "./staged-rpc";

// Server-only code (owner gates, execution control, executor client) is loaded dynamically inside
// handlers so client bundles never include it.
type Context = import("./unified-activation-control.server").Context;
async function owner(context: Context) {
  await (await import("./unified-activation-control.server")).owner(context);
}
async function approved(context: Context, kind: "live_link" | "autonomy") {
  return (await import("./unified-activation-control.server")).approved(context, kind);
}

export const getUnifiedExecutionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const { executorReleaseStatus, readExecutionState } =
      await import("./unified-activation.server");
    try {
      await (await import("./unified-stop.server")).reconcileTerminalStop();
      const state = await readExecutionState();
      const active = await context.supabase.rpc("activation_effective", { _kind: "autonomy" });
      const ready = !active.error && active.data === true && state.executionReady;
      return {
        state: { ...state, executionReady: ready },
        label: ready ? (state.running ? "Running" : "Configured") : "Blocked",
        release: executorReleaseStatus(
          state.executorRelease,
          process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"],
        ),
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
  .handler(async ({ context, data }) =>
    (await import("./unified-activation-control.server")).executionControl(context, data.operation),
  );

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
    const { readExecutionState, REVIEWED_EXECUTOR_RELEASE } =
      await import("./unified-activation.server");
    const current = await readExecutionState();
    const release = process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"];
    if (
      !current.executionReady ||
      current.cancellationPending ||
      release !== REVIEWED_EXECUTOR_RELEASE ||
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
        if (stopped.armed || stopped.running || stopped.cancellationPending)
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
