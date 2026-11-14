import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMfaFresh } from "./activation-approvals";
import { readExecutionState } from "./unified-activation.server";
import { latestSecurityReset } from "./activation-status";

type Context = Parameters<typeof import("./razul-owner.server").requireRazulOwner>;
async function owner(context: { supabase: Context[0]; userId: string; claims: Context[2] }) {
  setResponseHeader("Cache-Control", "private, no-store");
  await (
    await import("./razul-owner.server")
  ).requireRazulOwner(context.supabase, context.userId, context.claims);
}
async function approvals(
  context: { supabase: Context[0]; userId: string; claims: Context[2] },
  through: number,
) {
  await owner(context);
  if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
    throw new Error("Fresh owner authentication is required");
  const [rows, security] = await Promise.all([
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
  if (rows.error || security.error) throw new Error("Owner approval evidence is unreadable");
  const reset = latestSecurityReset(security.data ?? []);
  const expiry = Date.parse(rows.data.find((row) => row.step === 7)?.approval_expires_at ?? "");
  if (
    !Number.isFinite(expiry) ||
    rows.data.length !== through ||
    rows.data.some(
      (row) =>
        row.status !== "approved" ||
        (reset && (!row.decided_at || Date.parse(row.decided_at) <= Date.parse(reset))),
    ) ||
    expiry <= Date.now()
  )
    throw new Error("Current ordered activation approvals are required");
}

export const getUnifiedExecutionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    try {
      const state = await readExecutionState();
      return {
        state,
        label: state.executionReady ? (state.running ? "Running" : "Configured") : "Blocked",
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
    if (data.operation === "disarm" || data.operation === "reconcile") await owner(context);
    else await approvals(context, data.operation === "verify" ? 9 : 10);
    if (data.operation === "reconcile") {
      if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
        throw new Error("Fresh owner authentication is required");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { activationStore } = await import("./unified-activation.server");
      const pending = await supabaseAdmin
        .from("activation_operations")
        .select("id,step")
        .eq("actor_id", context.userId)
        .eq("state", "pending");
      if (pending.error) throw new Error("Pending activation could not be read");
      const operations = z
        .array(z.object({ id: z.string().uuid(), step: z.union([z.literal(9), z.literal(10)]) }))
        .parse(pending.data);
      for (const operation of operations) {
        const stopped = await readExecutionState(operation.step === 9 ? "revoke" : "unconfigure");
        if (
          stopped.armed ||
          stopped.cancellationPending ||
          (operation.step === 9 ? stopped.connected : stopped.configured)
        )
          throw new Error("Remote rollback remains unverified; keep the pending attempt");
        const result = await activationStore(supabaseAdmin).rpc("activation_finalize", {
          _actor: context.userId,
          _id: operation.id,
          _state: "failed",
          _note: "",
          _cap: false,
          _daily: false,
        });
        if (result.error)
          throw new Error("Rollback verified, but reconciliation could not be saved");
      }
      return readExecutionState();
    }
    const release = process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"];
    if (data.operation === "arm" && !release)
      throw new Error("No independently reviewed autonomous executor release is configured");
    return readExecutionState(data.operation, data.operation === "arm" ? { release } : {});
  });

const commands = z
  .array(
    z
      .object({
        argv: z
          .array(
            z
              .string()
              .max(2048)
              .refine((value) => !value.includes("\0")),
          )
          .min(1)
          .max(16),
        timeoutMs: z.number().int().min(100).max(10_000),
      })
      .strict(),
  )
  .min(1)
  .max(5);

export const runAuthorizedPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        commands,
        confirm: z.literal(true),
        expiresAt: z.string().datetime(),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    await approvals(context, 10);
    const current = await readExecutionState();
    if (
      !current.armed ||
      current.emergencyStop ||
      current.killSwitch ||
      !current.connected ||
      !current.configured
    )
      throw new Error("Autonomous execution is blocked by Jackboy");
    const release = process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"];
    if (release !== "omni-bounded-plan-1" || current.executorRelease !== release)
      throw new Error("Executor release has not been reviewed");
    const binaries = [
      "/usr/bin/true",
      "/usr/bin/false",
      "/usr/bin/sleep",
      "/usr/bin/printf",
      "/usr/bin/python3",
    ];
    if (
      data.commands.some((command) => !binaries.includes(command.argv[0] ?? "")) ||
      data.commands.reduce((sum, command) => sum + command.timeoutMs, 0) > 30_000 ||
      Date.parse(data.expiresAt) <= Date.now() ||
      Date.parse(data.expiresAt) > Date.now() + 60_000
    )
      throw new Error("Bounded plan policy refused");
    const origin = process.env["OMNI_EXECUTOR_ORIGIN"];
    const secret = process.env["OMNI_EXECUTOR_CONTROL_SECRET"];
    if (!origin || !secret || secret.length < 32)
      throw new Error("Separate executor is not configured");
    const { assertPublicLinkOrigin } = await import("./jackboy-link.server");
    assertPublicLinkOrigin(origin);
    if (
      origin === process.env["JACKBOY_LINK_ORIGIN"] ||
      origin === process.env["OMNI_SANDBOX_ORIGIN"]
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
    const planSha256 = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    await readExecutionState("authorize", {
      jobId: data.jobId,
      planSha256,
      expiresAt: data.expiresAt,
      release,
    });
    const { signedExecutorRequest } = await import("./omni-executor-client");
    try {
      return z
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
    } catch {
      try {
        const stopped = await readExecutionState("disarm");
        if (stopped.armed || stopped.cancellationPending)
          throw new Error("Cancellation remains pending");
      } catch {
        throw new Error(
          "Plan outcome and cancellation are unverified. Keep Stop engaged and reconcile Jackboy; do not replay the plan.",
        );
      }
      throw new Error(
        "Plan response was not verified. Autonomy was disarmed and cancellation confirmed; no automatic retry.",
      );
    }
  });
