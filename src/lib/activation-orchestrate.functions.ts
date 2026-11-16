import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMfaFresh } from "./activation-approvals";
import { earlierOf } from "./activation-actuation";
import { orchestrate, REVIEWED_RELEASE, type ExecutorInspect } from "./activation-orchestration";

type OwnerArgs = Parameters<typeof import("./razul-owner.server").requireRazulOwner>;
type Context = { supabase: OwnerArgs[0]; userId: string; claims: OwnerArgs[2] };

async function owner(context: Context) {
  setResponseHeader("Cache-Control", "private, no-store");
  await (
    await import("./razul-owner.server")
  ).requireRazulOwner(context.supabase, context.userId, context.claims);
}

const BUILD = z.object({
  app: z.literal("jackboy"),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  builtAt: z.string().max(40).nullable(),
});

/** Jackboy's public build marker (fixed configured origin, no redirects, bounded). */
async function jackboyBuild(): Promise<{ commit: string | null; builtAt: string | null } | null> {
  try {
    const { assertPublicLinkOrigin, readCapped } = await import("./jackboy-link.server");
    const origin = process.env["JACKBOY_LINK_ORIGIN"] || "";
    assertPublicLinkOrigin(origin);
    const response = await fetch(new URL("/api/public/version", origin).href, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const parsed = BUILD.safeParse(JSON.parse(await readCapped(response)));
    return parsed.success ? { commit: parsed.data.commit, builtAt: parsed.data.builtAt } : null;
  } catch {
    return null;
  }
}

/**
 * Read-only facts for the combined activation checklist. Sends one signed Jackboy state read,
 * one signed Railway executor `inspect` and one public build read; changes nothing.
 */
export const getActivationReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const { readExecutionState } = await import("./unified-activation.server");
    const { inspectRailwayExecutor } = await import("./unified-activation-control.server");
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    const [build, executor, state, link, auto, step7, stop, safety, sandbox] = await Promise.all([
      jackboyBuild(),
      inspectRailwayExecutor().catch((): ExecutorInspect => ({ ok: false, issue: "unreachable" })),
      readExecutionState().catch(() => null),
      context.supabase.rpc("activation_effective", { _kind: "live_link" }),
      context.supabase.rpc("activation_effective", { _kind: "autonomy" }),
      context.supabase
        .from("activation_approvals")
        .select("approval_expires_at")
        .eq("step", 7)
        .maybeSingle(),
      assertEmergencyStopReleased(context.supabase).then(
        () => false,
        () => true,
      ),
      context.supabase
        .from("jackboy_safety_state")
        .select("state,expires_at,code_enabled,active_permits")
        .eq("id", 1)
        .maybeSingle(),
      (async () => {
        try {
          const { sandboxSettings } = await import("./omni-sandbox-config.server");
          const { state: s } = sandboxSettings();
          return { configured: s.configured, enabled: s.enabled };
        } catch {
          return { configured: false, enabled: false };
        }
      })(),
    ]);
    const envEnd = process.env["OMNI_LINK_APPROVAL_EXPIRES_AT"];
    const fresh =
      !safety.error &&
      safety.data &&
      Date.parse(safety.data.expires_at ?? "") > Date.now() &&
      safety.data.state !== "unknown";
    return {
      checkedAt: new Date().toISOString(),
      jackboyBuild: build,
      executor,
      pinned: process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"] === REVIEWED_RELEASE,
      windowEndsAt: earlierOf(
        step7.error ? null : step7.data?.approval_expires_at,
        Number.isFinite(Date.parse(envEnd ?? "")) ? envEnd : null,
      ),
      linkEffective: !link.error && link.data === true,
      autonomyEffective: !auto.error && auto.data === true,
      mothershipStop: stop,
      jackboy: state
        ? {
            connected: state.connected,
            configured: state.configured,
            armed: state.armed,
            running: state.running,
            emergencyStop: state.emergencyStop,
            killSwitch: state.killSwitch,
            executorRelease: state.executorRelease,
            cancellationPending: state.cancellationPending,
          }
        : null,
      codeEnabled: fresh ? safety.data!.code_enabled : null,
      activePermits: fresh ? safety.data!.active_permits : null,
      sandbox,
    };
  });

/** Owner-facing text for a failed execution-control call (allowlisted facts only). */
async function controlFailure(error: unknown) {
  const e = error as { stage?: unknown } | null;
  if (e && typeof e.stage === "string")
    return new Error(
      (await import("./activation-actuation")).describeActuationFailure(error).message,
    );
  return error instanceof Error ? error : new Error("Jackboy refused or could not be verified");
}

/**
 * One owner click: owner + fresh two-step code + explicit per-scope selection. Runs the selected
 * scopes in order through their own gated, audited activations (Step 9 → Step 10 [verify, then
 * configure] → optional arm). Never releases a stop, enables CODE, changes caps or starts a plan.
 */
export const activateTogether = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        confirm: z.literal(true),
        liveLink: z.boolean(),
        autonomy: z.boolean(),
        arm: z.boolean(),
        attempts: z.object({ live_link: z.string().uuid(), autonomy: z.string().uuid() }).strict(),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    await owner(context);
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return {
        ok: false as const,
        mfa: true as const,
        summary: "Re-verify with your authenticator first. Nothing was sent or activated.",
        stages: [],
        partial: false,
        ownerAction: null,
      };
    const { activationHandler } = await import("./activation-handler.server");
    const { executionControl, inspectRailwayExecutor } =
      await import("./unified-activation-control.server");
    const { readExecutionState } = await import("./unified-activation.server");
    const result = await orchestrate(
      { liveLink: data.liveLink, autonomy: data.autonomy, arm: data.arm },
      data.attempts,
      {
        effective: async (kind) => {
          const r = await context.supabase.rpc("activation_effective", { _kind: kind });
          if (r.error) throw new Error("unreadable");
          return r.data === true;
        },
        activate: async (kind, attemptId) => {
          const r = await activationHandler(kind)({
            context: context as Parameters<ReturnType<typeof activationHandler>>[0]["context"],
            data: { confirm: true, attemptId },
          });
          return r.ok
            ? {
                ok: true,
                already: r.already,
                message: r.blockers.length
                  ? `${r.message} Still blocking execution: ${r.blockers.join(" ")}`
                  : r.message,
              }
            : { ok: false, message: r.message };
        },
        inspectExecutor: inspectRailwayExecutor,
        pinned: () => process.env["OMNI_AUTONOMY_REVIEWED_RELEASE"] === REVIEWED_RELEASE,
        armed: async () => (await readExecutionState()).armed,
        verifyAndArm: async () => {
          try {
            await executionControl(context, "verify");
            await executionControl(context, "arm");
          } catch (error) {
            throw await controlFailure(error);
          }
        },
      },
    );
    return {
      ok: !result.stages.some((s) => s.status === "failed" || s.status === "skipped"),
      mfa: false as const,
      ...result,
    };
  });
