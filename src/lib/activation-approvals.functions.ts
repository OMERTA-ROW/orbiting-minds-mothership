/**
 * Owner-only Activation Approvals. Checks use server-side configuration and
 * the existing signed Jackboy client; decisions never actuate switches,
 * deploy, queue the protocol self-test or make paid calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ACTIVATION_CHECK_VERSION,
  DEFERRED_SETTING,
  LINK_SETTING_NAMES,
  blockingStep,
  deploymentConfiguration,
  decisionInput,
  isMfaFresh,
  isTechnicalStep,
  mfaAgeSeconds,
  isEffectivelyApproved,
  normalizeRows,
  type ActivationCheck,
  type ActivationCheckDetail,
  type CheckStatus,
} from "./activation-approvals";
import type { Json } from "@/integrations/supabase/types";
import { probeFailureDetails } from "./activation-probe";
import {
  accessReason,
  approvedBeforeReset,
  effectiveRows,
  isMissingObject,
  latestSecurityReset,
  type SecurityEvent,
} from "./activation-status";

/**
 * The check store (`activation_approval_checks`, `activation_approval_record_check`) comes from
 * database update 0051, which is absent from the generated types until it is applied. Only these two
 * calls go through this narrow untyped view; results are validated before use.
 */
type CheckRowRaw = {
  step: number;
  status: string;
  evidence_version: number;
  checked_at: string;
  summary: string;
  details: unknown;
};
type DbError = { code?: string; message: string } | null;
type CheckStoreClient = {
  from(table: "activation_approval_checks"): {
    select(columns: string): {
      order(column: string): PromiseLike<{ data: CheckRowRaw[] | null; error: DbError }>;
    };
  };
  rpc(
    fn: "activation_approval_record_check",
    args: Record<string, unknown>,
  ): PromiseLike<{
    error: DbError;
  }>;
};
const checkStore = (admin: unknown) => admin as CheckStoreClient;

const STORE_MISSING =
  "Check results can't be saved yet: database update 0051 (approval check store) has not been applied. Nothing was approved.";

const checkDetailSchema = z
  .object({
    label: z.string().max(100),
    status: z.enum(["passed", "failed", "needs_attention"]),
    detail: z.string().max(280),
  })
  .strict();

const checkInput = z
  .object({ step: z.number().int().min(1).max(10).refine(isTechnicalStep) })
  .strict();

const SELF_TEST_VALID_MS = 24 * 60 * 60 * 1000;

function currentDeployment() {
  return deploymentConfiguration({
    jackboyOrigin: process.env["JACKBOY_LINK_ORIGIN"],
    runnerOrigin: process.env["JACKBOY_LINK_RUNNER_ORIGIN"],
  });
}

function checked(
  step: number,
  status: CheckStatus,
  summary: string,
  details: ActivationCheckDetail[],
): ActivationCheck {
  return {
    step,
    status,
    evidenceVersion: ACTIVATION_CHECK_VERSION,
    checkedAt: new Date().toISOString(),
    summary,
    details,
  };
}

function decodeDetails(value: unknown): ActivationCheckDetail[] {
  const parsed = z.array(checkDetailSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function safeLinkFailure() {
  return "The signed HTTPS configuration exchange did not verify. Confirm the Jackboy Lovable origin and server-side link settings.";
}

function timestampFresh(iso: string, windowMs: number): boolean {
  const age = Date.now() - Date.parse(iso);
  return Number.isFinite(age) && age >= -60_000 && age <= windowMs;
}

async function ownerContext(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
}) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

/** Newest owner security reset (two-step off, recovery, admin removal); fails closed when unreadable. */
async function securityResetAt(
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

async function selfTestEvents(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
) {
  const { data, error } = await db
    .from("razul_control_audit")
    .select("action,occurred_at")
    .eq("record_type", "jackboy_link")
    .in("action", ["self_test_passed", "self_test_failed"])
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Protocol self-test evidence could not be read.");
  return data[0] ?? null;
}

async function runnerConfigurationProof(context: { userId: string }) {
  const { configuredJackboyConfiguration, checkJackboyRunnerConfiguration } =
    await import("./jackboy-link.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return checkJackboyRunnerConfiguration(configuredJackboyConfiguration(), async (action) => {
    const { error } = await supabaseAdmin.from("razul_control_audit").insert({
      actor_id: context.userId,
      action,
      record_type: "jackboy_link",
      record_id: process.env["OMNI_LINK_PROJECT_ID"] || "configuration",
    });
    if (error) {
      const { JackboyLinkError } = await import("./jackboy-link.server");
      throw new JackboyLinkError("Runner configuration audit failed.", "audit");
    }
  });
}

async function evaluateCheck(
  step: number,
  context: {
    supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
    userId: string;
  },
): Promise<{ check: ActivationCheck; deploymentMode: "runner_only" | "unknown" | "inconsistent" }> {
  const deployment = currentDeployment();

  if (step === 1) {
    const details: ActivationCheckDetail[] = LINK_SETTING_NAMES.filter(
      (name) => name !== DEFERRED_SETTING,
    ).map((name) => ({
      label: name,
      status: process.env[name]?.trim() ? "passed" : "failed",
      detail: process.env[name]?.trim()
        ? "Configured; value not exposed."
        : "Missing on this server.",
    }));
    try {
      const { assertPublicLinkOrigin } = await import("./jackboy-link.server");
      assertPublicLinkOrigin(process.env["JACKBOY_LINK_ORIGIN"] || "");
    } catch {
      details.push({
        label: "JACKBOY_LINK_ORIGIN",
        status: "failed",
        detail: "Must be a public HTTPS origin.",
      });
    }
    const passed = details.every((detail) => detail.status === "passed");
    return {
      deploymentMode: deployment.mode,
      check: checked(
        step,
        passed ? "passed" : "failed",
        passed
          ? "Required Mothership link settings are present."
          : "Some Mothership link settings need attention.",
        details,
      ),
    };
  }

  if (step === 2) {
    const unavailable = (detail: string, extra: ActivationCheckDetail[] = []) => ({
      deploymentMode: deployment.mode,
      check: checked(step, "needs_attention", "Railway runner configuration is not yet attested.", [
        { label: "Verification path", status: "needs_attention", detail },
        ...extra,
        {
          label: "Existing Railway settings",
          status: "needs_attention",
          detail:
            "Unverified does not mean missing. Do not repeat setup or copy the runner secret into Mothership.",
        },
      ]),
    });
    if (deployment.mode !== "runner_only")
      return unavailable(
        "Confirm separate JACKBOY_LINK_ORIGIN and nonsecret JACKBOY_LINK_RUNNER_ORIGIN references on Mothership.",
      );
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    try {
      await assertEmergencyStopReleased(context.supabase);
    } catch {
      return unavailable("Emergency Stop is engaged or unreadable; no runner probe was sent.");
    }
    if (process.env["JACKBOY_LINK_MOTHERSHIP_OWNER_ID"] !== context.userId)
      return unavailable("The configured Mothership link owner does not match the verified owner.");
    try {
      const proof = await runnerConfigurationProof(context);
      if (!proof)
        return unavailable(
          "Jackboy answered (signed) but could not attest its Railway runner: the runner did not answer Jackboy within 5 s (for example while waking), or Jackboy's runner URL/enabled flag/secret differ. Retrying is safe.",
        );
      const details: ActivationCheckDetail[] = [
        {
          label: "OMNI_LINK_RUNNER_MODE",
          status: proof.runnerMode ? "passed" : "failed",
          detail: proof.runnerMode
            ? "Effective runner-only mode attested by Railway."
            : "The attested runner-only mode is disabled.",
        },
        {
          label: "OMNI_LINK_NODE_RUNNER_ENABLED",
          status: proof.nodeRunnerEnabled ? "passed" : "failed",
          detail: proof.nodeRunnerEnabled
            ? "Effective Node runner flag attested by Railway."
            : "The attested Node runner flag is disabled.",
        },
        {
          label: "OMNI_LINK_REMOTE_RUNNER_SECRET",
          status: proof.remoteRunnerSecretConfigured ? "passed" : "failed",
          detail: "Presence and shared authentication attested; no secret value returned.",
        },
        {
          label: "Node runtime",
          status: proof.runtimeAvailable ? "passed" : "failed",
          detail: "Node 26+ and permission-model availability; the self-test was not run.",
        },
      ];
      const passed = details.every((detail) => detail.status === "passed");
      return {
        deploymentMode: deployment.mode,
        check: checked(
          step,
          passed ? "passed" : "failed",
          passed
            ? "Existing Railway runner configuration verified through Jackboy."
            : "Signed runner configuration reports a failed check.",
          details,
        ),
      };
    } catch (error) {
      return unavailable(
        "The signed configuration probe did not complete, so the Railway runner was not reached through Jackboy.",
        probeFailureDetails(error),
      );
    }
  }

  if (step === 4) {
    if (deployment.mode !== "runner_only") {
      const status = deployment.mode === "unknown" ? "needs_attention" : "failed";
      return {
        deploymentMode: deployment.mode,
        check: checked(
          step,
          status,
          "Confirm the runner-only deployment before checking the link.",
          [
            {
              label: "Deployment",
              status,
              detail:
                "The configured Jackboy origin is checked only after runner-only mode is confirmed.",
            },
          ],
        ),
      };
    }
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    try {
      await assertEmergencyStopReleased(context.supabase);
    } catch {
      return {
        deploymentMode: deployment.mode,
        check: checked(
          step,
          "needs_attention",
          "Emergency Stop is engaged or its state cannot be verified; refusing the Jackboy handshake.",
          [
            {
              label: "Emergency Stop",
              status: "needs_attention",
              detail:
                "Confirm it is readable and released in OMNI Terminal. If engaged, release it with fresh two-factor, then retry.",
            },
          ],
        ),
      };
    }
    try {
      if (process.env["JACKBOY_LINK_MOTHERSHIP_OWNER_ID"] !== context.userId)
        throw new Error("Configured link owner does not match.");
      const proof = await runnerConfigurationProof(context);
      if (!proof) throw new Error("Jackboy runner configuration is unresolved.");
      const host = new URL(process.env["JACKBOY_LINK_ORIGIN"] || "").hostname;
      return {
        deploymentMode: deployment.mode,
        check: checked(step, "passed", "Signed HTTPS configuration exchange verified.", [
          {
            label: "Jackboy origin",
            status: "passed",
            detail: `${host} · public HTTPS and signed response verified.`,
          },
          {
            label: "Runner endpoint",
            status: "passed",
            detail: "Railway is separate; this handshake targets Jackboy on Lovable.",
          },
        ]),
      };
    } catch (error) {
      return {
        deploymentMode: deployment.mode,
        check: checked(step, "failed", safeLinkFailure(), [
          {
            label: "Jackboy origin",
            status: "failed",
            detail: safeLinkFailure(),
          },
          ...probeFailureDetails(error),
        ]),
      };
    }
  }

  if (deployment.mode !== "runner_only") {
    const status = deployment.mode === "unknown" ? "needs_attention" : "failed";
    return {
      deploymentMode: deployment.mode,
      check: checked(step, status, "Confirm runner-only mode before checking live runner proof.", [
        {
          label: "Deployment",
          status,
          detail:
            "The separately gated protocol self-test is not evidence until the deployment is identified.",
        },
      ]),
    };
  }

  const event = await selfTestEvents(context.supabase);
  const occurredAt = event ? Date.parse(event.occurred_at) : NaN;
  const age = Date.now() - occurredAt;
  const recent = Number.isFinite(occurredAt) && age >= -60_000 && age <= SELF_TEST_VALID_MS;
  const passed = recent && event?.action === "self_test_passed";
  const failed = recent && event?.action === "self_test_failed";
  const status: CheckStatus = passed ? "passed" : failed ? "failed" : "needs_attention";
  return {
    deploymentMode: deployment.mode,
    check: checked(
      step,
      status,
      passed
        ? "A signed protocol self-test pass is recorded within the last 24 hours."
        : failed
          ? "The latest protocol self-test failed; rerun it through the separately gated flow."
          : "No fresh passing protocol self-test is recorded.",
      [
        {
          label: "Signed runner proof",
          status,
          detail: passed
            ? `Verified pass at ${new Date(occurredAt).toISOString()}.`
            : failed
              ? "The latest recorded test result is failed."
              : "Use the existing, separately gated protocol self-test flow, then run this check again.",
        },
      ],
    ),
  };
}

export const listActivationApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await ownerContext(context);
    } catch (error) {
      // A specific reason, never record contents: lets the owner see exactly what to do next.
      let reason = accessReason(error instanceof Error ? error.message : "");
      // The owner check needs aal2, so an owner whose sign-in has not passed the code yet would
      // read as "not the owner". The own role row only picks the message; it grants nothing.
      if (reason === "not_owner" && context.claims["aal"] !== "aal2") {
        const role = await context.supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .eq("role", "owner")
          .maybeSingle();
        if (!role.error && role.data?.role === "owner") reason = "needs_code";
      }
      return { denied: true as const, reason };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [steps, audit, checks, selfTest, resetAt] = await Promise.all([
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
      checkStore(supabaseAdmin)
        .from("activation_approval_checks")
        .select("step,status,evidence_version,checked_at,summary,details")
        .order("step"),
      selfTestEvents(context.supabase),
      securityResetAt(context.supabase, context.userId),
    ]);
    if (steps.error || audit.error) throw new Error("Approval records could not be read.");
    // The approvals stay visible even when the check store is missing or unreadable;
    // technical steps then cannot be approved (fail closed).
    const checksStore: "ready" | "missing" | "unreadable" = !checks.error
      ? "ready"
      : isMissingObject(checks.error)
        ? "missing"
        : "unreadable";
    const checkRows = checks.error ? [] : (checks.data ?? []);
    const deployment = currentDeployment();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const latestSelfTest = selfTest
      ? {
          action: selfTest.action,
          occurred_at: selfTest.occurred_at,
          fresh: timestampFresh(selfTest.occurred_at, SELF_TEST_VALID_MS),
        }
      : null;
    return {
      viewerId: context.userId,
      rows: normalizeRows(steps.data),
      audit: audit.data,
      checksStore,
      securityResetAt: resetAt,
      checks: checkRows.map((row) => ({
        step: row.step,
        status:
          row.evidence_version === ACTIVATION_CHECK_VERSION
            ? (row.status as CheckStatus)
            : ("needs_attention" as const),
        evidenceVersion: row.evidence_version,
        checkedAt: row.checked_at,
        summary:
          row.evidence_version === ACTIVATION_CHECK_VERSION
            ? row.summary
            : "Fresh signed evidence is required for the updated check.",
        details:
          row.evidence_version === ACTIVATION_CHECK_VERSION ? decodeDetails(row.details) : [],
      })),
      settings: LINK_SETTING_NAMES.map((name) => ({
        name,
        present: Boolean(process.env[name]?.trim()),
        deferred: name === DEFERRED_SETTING,
      })),
      deployment,
      selfTest: latestSelfTest,
      mfaAgeSeconds: mfaAgeSeconds(context.claims["amr"], nowSeconds),
    };
  });

export const runActivationApprovalCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return {
        ok: false as const,
        reason: "mfa" as const,
        message: "Re-verify with your authenticator first.",
      };

    const { data: rows, error: rowsError } = await context.supabase
      .from("activation_approvals")
      .select(
        "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
      )
      .order("step");
    if (rowsError)
      return {
        ok: false as const,
        reason: "denied" as const,
        message: "Approval prerequisites could not be read; no check was run.",
      };
    let resetAt: string | null;
    try {
      resetAt = await securityResetAt(context.supabase, context.userId);
    } catch {
      return {
        ok: false as const,
        reason: "denied" as const,
        message: "Account security history could not be read; no check was run.",
      };
    }
    const effective = effectiveRows(normalizeRows(rows), resetAt);
    const blocker = blockingStep(effective, data.step, Date.now());
    if (blocker !== null)
      return {
        ok: false as const,
        reason: "rule" as const,
        message: `Step ${blocker} must be approved first.`,
      };
    // A repeat check on an approved step would silently re-approve (or fail and reset later steps).
    const current = effective.find((r) => r.step === data.step);
    if (current && isEffectivelyApproved(current, Date.now()))
      return {
        ok: false as const,
        reason: "already_approved" as const,
        message: `Step ${data.step} is already approved. Nothing was rerun; revoke it first to check again.`,
      };

    const evaluated = await evaluateCheck(data.step, {
      supabase: context.supabase,
      userId: context.userId,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: evidenceError } = await checkStore(supabaseAdmin).rpc(
      "activation_approval_record_check",
      {
        _step: data.step,
        _status: evaluated.check.status,
        _version: evaluated.check.evidenceVersion,
        _summary: evaluated.check.summary,
        _details: evaluated.check.details.map((detail): Json => ({
          label: detail.label,
          status: detail.status,
          detail: detail.detail,
        })),
        _mode: evaluated.deploymentMode,
        _actor: context.userId,
      },
    );
    if (evidenceError)
      return {
        ok: false as const,
        reason: isMissingObject(evidenceError) ? ("store_missing" as const) : ("denied" as const),
        message: isMissingObject(evidenceError)
          ? STORE_MISSING
          : "The check evidence and audit could not be stored; no approval was recorded.",
      };

    // A pass is evidence only: the owner approves it separately (the database requires a
    // passed check from the last 15 minutes). A failure is recorded so later steps stay locked.
    if (evaluated.check.status === "passed")
      return { ok: true as const, check: evaluated.check, approvalNeeded: true as const };
    const { error } = await context.supabase.rpc("activation_approval_decide", {
      _step: data.step,
      _action: "fail",
      _note: "",
      // NULL is valid for every step except 7; the generated type omits nullability.
      _expires_at: null as unknown as string,
      _cap_confirmed: false,
      _daily_confirmed: false,
    });
    if (error) {
      if (error.message.includes("Fresh two-factor"))
        return {
          ok: false as const,
          reason: "mfa" as const,
          message: "Re-verify with your authenticator first.",
        };
      return {
        ok: false as const,
        reason: error.code === "22023" ? ("rule" as const) : ("denied" as const),
        message:
          error.code === "22023"
            ? error.message
            : "The check was not recorded as an approval. Refresh and retry.",
      };
    }
    return { ok: true as const, check: evaluated.check, approvalNeeded: false as const };
  });

export const decideActivationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    // Technical steps are failed only by a recorded check; approving one needs a passed
    // check from the last 15 minutes, which the database verifies.
    if (isTechnicalStep(data.step) && data.action === "fail")
      return {
        ok: false as const,
        reason: "rule" as const,
        message: "Technical steps are marked failed only by a server-side check.",
      };
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return {
        ok: false as const,
        reason: "mfa" as const,
        message: "Re-verify with your authenticator first.",
      };
    if (data.action === "approve") {
      // Approvals from before the owner's last security reset no longer unlock later steps.
      const [{ data: rows, error: rowsError }, resetAt] = await Promise.all([
        context.supabase
          .from("activation_approvals")
          .select(
            "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
          )
          .order("step"),
        securityResetAt(context.supabase, context.userId).catch(() => undefined),
      ]);
      if (rowsError || resetAt === undefined)
        return {
          ok: false as const,
          reason: "denied" as const,
          message: "Approval prerequisites could not be read; nothing was recorded.",
        };
      const normalized = normalizeRows(rows);
      const blocker = blockingStep(effectiveRows(normalized, resetAt), data.step, Date.now());
      if (blocker !== null)
        return {
          ok: false as const,
          reason: "rule" as const,
          message: `Step ${blocker} must be approved first.`,
        };
      const target = normalized.find((r) => r.step === data.step);
      // Owner steps must be revoked first; a technical step is re-approved after a fresh passed check.
      if (target && approvedBeforeReset(target, resetAt) && !isTechnicalStep(data.step))
        return {
          ok: false as const,
          reason: "rule" as const,
          message:
            "Approved before your last security reset. Revoke this step, then approve it again.",
        };
      const effectiveTarget = effectiveRows(normalized, resetAt).find((r) => r.step === data.step);
      if (effectiveTarget && isEffectivelyApproved(effectiveTarget, Date.now()))
        return {
          ok: false as const,
          reason: "already_approved" as const,
          message: `Step ${data.step} is already approved. Nothing was recorded twice.`,
        };
    }
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
        return {
          ok: false as const,
          reason: "mfa" as const,
          message: "Re-verify with your authenticator first.",
        };
      if (error.code === "22023")
        return {
          ok: false as const,
          reason: "rule" as const,
          message: error.message.includes("Fresh server-side check")
            ? "This step needs a passing check from the last 15 minutes. Run the check again, then approve."
            : error.message,
        };
      return {
        ok: false as const,
        reason: "denied" as const,
        message: "The decision was not recorded. Check owner access and refresh.",
      };
    }
    return { ok: true as const };
  });
