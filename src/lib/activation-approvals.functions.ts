/**
 * Owner-only Activation Approvals. Checks use server-side configuration and
 * the existing signed Jackboy client; decisions never actuate switches,
 * deploy or make paid calls. Only `runStep8SelfTest` sends the fixed protocol
 * self-test, after the owner's explicit confirmation and fresh two-step code.
 */
import { createServerFn } from "@tanstack/react-start";
import { readinessEvidence, type PermitRecord } from "./readiness-evidence";
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
import { safetyView, type SafetyRow } from "./jackboy-safety";
import {
  SELF_TEST_IN_FLIGHT_MS,
  SELF_TEST_SERVER_BUDGET_MS,
  attemptStage,
  classifySelfTestError,
  isUnfinished,
  otherAttemptInFlight,
  selfTestAuditAction,
  selfTestInput,
  selfTestReadiness,
  type ReadinessItem,
} from "./activation-self-test";
import {
  accessReason,
  approvedBeforeReset,
  effectiveRows,
  isMissingObject,
  latestSecurityReset,
  type SecurityEvent,
} from "./activation-status";
import { classifyLiveLinkError, liveLinkStatus, systemStates } from "./live-link";
import { staged } from "./staged-rpc";

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
    .select("action,record_id,occurred_at")
    .eq("record_type", "jackboy_link")
    .in("action", ["self_test_passed", "self_test_failed"])
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Protocol self-test evidence could not be read.");
  return data[0] ?? null;
}

/** Newest signed-link handshake attempt and verified connection; unreadable reads as none. */
async function latestLinkEvents(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
): Promise<{ lastConnectedAt: string | null; lastAttemptAt: string | null }> {
  const { data, error } = await db
    .from("razul_control_audit")
    .select("action,occurred_at")
    .eq("record_type", "jackboy_link")
    .in("action", ["connecting", "connected"])
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (error || !data) return { lastConnectedAt: null, lastAttemptAt: null };
  return {
    lastConnectedAt: data.find((r) => r.action === "connected")?.occurred_at ?? null,
    lastAttemptAt: data.find((r) => r.action === "connecting")?.occurred_at ?? null,
  };
}

/** Latest recorded Jackboy safety state (owner-readable row); unreadable reads as unknown. */
async function jackboySafetyRow(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
): Promise<SafetyRow | null> {
  try {
    const { data, error } = await db
      .from("jackboy_safety_state")
      .select(
        "state,paused,code_stop,code_enabled,cancellation,observed_at,expires_at,source,reason,recorded_at,autonomous_allowed,manual_allowed,blocked_by,authorization_expires_at,active_permits",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return data as SafetyRow;
  } catch {
    return null;
  }
}

export type ActivationRowView = {
  kind: "live_link" | "autonomy";
  status: "inactive" | "activating" | "active" | "failed" | "revoked";
  reason: string;
  activatedAt: string | null;
  updatedAt: string;
  effective: boolean;
};

/** Step 9/10 activation rows plus the database's own "in effect" verdict (fails closed). */
async function activationInfo(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
): Promise<ActivationRowView[]> {
  try {
    const [rows, link, auto] = await Promise.all([
      db.from("activation_activations").select("kind,status,reason,activated_at,updated_at"),
      db.rpc("activation_effective", { _kind: "live_link" }),
      db.rpc("activation_effective", { _kind: "autonomy" }),
    ]);
    if (rows.error) return [];
    return (rows.data ?? []).map((r) => ({
      kind: r.kind as ActivationRowView["kind"],
      status: r.status as ActivationRowView["status"],
      reason: r.reason,
      activatedAt: r.activated_at,
      updatedAt: r.updated_at,
      effective: r.kind === "live_link" ? link.data === true : auto.data === true,
    }));
  } catch {
    return [];
  }
}

/** What is actually running and Mothership's own stop (service-role counts; owner already verified). */
async function runtimeCounts(): Promise<{
  windows: number;
  agentJobs: number;
  codeJobs: number;
  readable: boolean;
  mothershipStop: boolean | null;
  mothershipStopChangedAt: string | null;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [w, a, c, stop] = await Promise.all([
      supabaseAdmin
        .from("omni_autonomy_windows")
        .select("id", { count: "exact", head: true })
        .is("ended_at", null),
      supabaseAdmin
        .from("omni_agent_jobs")
        .select("id", { count: "exact", head: true })
        .neq("origin", "owner")
        .in("status", ["queued", "running"]),
      supabaseAdmin
        .from("omni_code_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["leased", "running"]),
      supabaseAdmin
        .from("omni_terminal_controls")
        .select("emergency_stop,changed_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    return {
      windows: w.count ?? 0,
      agentJobs: a.count ?? 0,
      codeJobs: c.count ?? 0,
      readable: !w.error && !a.error && !c.error,
      mothershipStop: stop.error || !stop.data ? null : stop.data.emergency_stop,
      mothershipStopChangedAt: stop.error || !stop.data ? null : stop.data.changed_at,
    };
  } catch {
    return {
      windows: 0,
      agentJobs: 0,
      codeJobs: 0,
      readable: false,
      mothershipStop: null,
      mothershipStopChangedAt: null,
    };
  }
}

/** Latest mirrored Jackboy permit (owner-readable); null = none, "unreadable" = read failed. */
async function latestPermit(
  db: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0],
): Promise<PermitRecord | null | "unreadable"> {
  try {
    const { data, error } = await db
      .from("jackboy_permits")
      .select("kind,status,issued_at,expires_at,closed_at,closed_reason")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return "unreadable";
    if (!data) return null;
    return {
      kind: data.kind,
      status: data.status,
      issuedAt: data.issued_at,
      expiresAt: data.expires_at,
      closedAt: data.closed_at,
      closedReason: data.closed_reason,
    };
  } catch {
    return "unreadable";
  }
}

/** Cloud sandbox (manual OMNI Terminal workspace) settings: presence booleans only. */
async function sandboxPresence(): Promise<{ configured: boolean; enabled: boolean }> {
  try {
    const { sandboxSettings } = await import("./omni-sandbox-config.server");
    const { state } = sandboxSettings();
    return { configured: state.configured, enabled: state.enabled };
  } catch {
    return { configured: false, enabled: false };
  }
}

/** Step 8 send preconditions: booleans only, never setting values. */
async function currentSelfTestReadiness(context: {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
}): Promise<ReadinessItem[]> {
  let stopReleased = false;
  try {
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    await assertEmergencyStopReleased(context.supabase);
    stopReleased = true;
  } catch {
    stopReleased = false;
  }
  let identityValid = false;
  let identityIssues: Awaited<
    ReturnType<typeof import("./jackboy-link.server").configuredLinkIdentityIssues>
  > = [];
  try {
    const { configuredLinkIdentityValid } = await import("./jackboy-link.server");
    identityValid = configuredLinkIdentityValid();
  } catch {
    identityValid = false;
  }
  if (!identityValid) {
    try {
      const { configuredLinkIdentityIssues } = await import("./jackboy-link.server");
      identityIssues = configuredLinkIdentityIssues();
    } catch {
      identityIssues = [];
    }
  }
  return selfTestReadiness({
    deploymentMode: currentDeployment().mode,
    stopReleased,
    ownerMatches: process.env["JACKBOY_LINK_MOTHERSHIP_OWNER_ID"] === context.userId,
    linkEnabled: process.env["JACKBOY_LINK_ENABLED"] === "true",
    selfTestEnabled: process.env["JACKBOY_LINK_SELF_TEST_ENABLED"] === "true",
    approvalExpiresAt: Date.parse(process.env["OMNI_LINK_APPROVAL_EXPIRES_AT"] || ""),
    identityValid,
    identityIssues,
    now: Date.now(),
  });
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
          ? "The latest protocol self-test failed; run it again with “Run protocol self-test & verify”."
          : "No fresh passing protocol self-test is recorded.",
      [
        {
          label: "Signed runner proof",
          status,
          detail: passed
            ? `Verified pass at ${new Date(occurredAt).toISOString()} (job ${event?.record_id ?? "?"}).`
            : failed
              ? "The latest recorded test result is failed."
              : "Use “Run protocol self-test & verify” on this step; it runs the fixed test once and verifies its signed result.",
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
    const [
      steps,
      audit,
      checks,
      selfTest,
      resetAt,
      readiness,
      linkEvents,
      safetyRow,
      activations,
      counts,
      permit,
    ] = await Promise.all([
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
      currentSelfTestReadiness(context),
      latestLinkEvents(context.supabase),
      jackboySafetyRow(context.supabase),
      activationInfo(context.supabase),
      runtimeCounts(),
      latestPermit(context.supabase),
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
    const liveLink = liveLinkStatus({
      rows: effectiveRows(normalizeRows(steps.data), resetAt),
      readiness,
      now: Date.now(),
      lastConnectedAt: linkEvents.lastConnectedAt,
      lastAttemptAt: linkEvents.lastAttemptAt,
    });
    const safety = safetyView(safetyRow, Date.now());
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
      selfTestReadiness: readiness,
      liveLink,
      safety,
      activations,
      system: systemStates({
        linkEffective: activations.some((a) => a.kind === "live_link" && a.effective),
        autonomyEffective: activations.some((a) => a.kind === "autonomy" && a.effective),
        liveLink,
        safety,
        mothershipStop: counts.mothershipStop,
        running: counts,
        now: Date.now(),
      }),
      readinessEvidence: readinessEvidence({
        now: Date.now(),
        handshake: linkEvents,
        safety,
        permit,
        approvals: effectiveRows(normalizeRows(steps.data), resetAt),
        activations: activations.length ? activations : null,
        selfTest: selfTest ? { action: selfTest.action, occurred_at: selfTest.occurred_at } : null,
        mothershipStop: { engaged: counts.mothershipStop, changedAt: counts.mothershipStopChangedAt },
      }),
      sandbox: await sandboxPresence(),
      mfaAgeSeconds: mfaAgeSeconds(context.claims["amr"], nowSeconds),
    };
  });

type Ctx = {
  supabase: Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];
  userId: string;
  claims: Record<string, unknown>;
};

/** Fresh MFA, earlier steps approved, this step not approved. Null when the step may be checked. */
async function checkGate(context: Ctx, step: number) {
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
  const blocker = blockingStep(effective, step, Date.now());
  if (blocker !== null)
    return {
      ok: false as const,
      reason: "rule" as const,
      message: `Step ${blocker} must be approved first.`,
    };
  // A repeat check on an approved step would silently re-approve (or fail and reset later steps).
  const current = effective.find((r) => r.step === step);
  if (current && isEffectivelyApproved(current, Date.now()))
    return {
      ok: false as const,
      reason: "already_approved" as const,
      message: `Step ${step} is already approved. Nothing was rerun; revoke it first to check again.`,
    };
  return null;
}

/** Stores check evidence; a non-pass also marks the step failed. A pass never approves. */
async function storeCheck(
  context: Ctx,
  evaluated: { check: ActivationCheck; deploymentMode: "runner_only" | "unknown" | "inconsistent" },
) {
  const step = evaluated.check.step;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: evidenceError } = await checkStore(supabaseAdmin).rpc(
    "activation_approval_record_check",
    {
      _step: step,
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
    _step: step,
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
}

export const runActivationApprovalCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const gate = await checkGate(context, data.step);
    if (gate) return gate;
    const evaluated = await evaluateCheck(data.step, {
      supabase: context.supabase,
      userId: context.userId,
    });
    return storeCheck(context, evaluated);
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
    if (!data.activate) return { ok: true as const, activation: null };
    // Steps 9–10: the owner's approval click also runs the real activation (handshake / signed
    // safety read). The approval stays recorded even if activation fails; activation fails closed.
    const kind = data.step === 9 ? ("live_link" as const) : ("autonomy" as const);
    const activation = await activationHandler(kind)({
      context,
      data: { confirm: true, attemptId: data.activate.attemptId },
    });
    return { ok: true as const, activation: { kind, ...activation } };
  });

type Detail = ActivationCheckDetail;
type SelfTestFailure = {
  ok: false;
  reason:
    | "mfa"
    | "rule"
    | "already_approved"
    | "denied"
    | "store_missing"
    | "not_ready"
    | "safety_denial"
    | "timeout"
    | "refused"
    | "link_failure"
    | "invalid_reply"
    | "busy"
    | "pending"
    | "closed";
  message: string;
  details: Detail[];
  /** True when this attempt is over: the next click starts a new attempt (new job). */
  attemptFinal: boolean;
  /** Whether any request for this attempt may have reached Jackboy. */
  sent: boolean;
};

/**
 * Step 8: run the fixed protocol self-test once through the existing signed link, wait a bounded
 * time, verify the signed result and record it as Step 8 evidence. Never approves Step 8, never
 * releases a stop or switch; every guard fails closed. Retrying with the same `attemptId` only
 * continues that job (status read), so a job is never submitted or run twice.
 */
export const runStep8SelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => selfTestInput.parse(input))
  .handler(async ({ context, data }) => {
    await ownerContext(context);
    const started = Date.now();
    const fail = (
      reason: SelfTestFailure["reason"],
      message: string,
      extra: { details?: Detail[]; attemptFinal?: boolean; sent?: boolean } = {},
    ): SelfTestFailure => ({
      ok: false,
      reason,
      message,
      details: extra.details ?? [],
      attemptFinal: extra.attemptFinal ?? false,
      sent: extra.sent ?? false,
    });

    const gate = await checkGate(context, 8);
    if (gate) return fail(gate.reason, gate.message);

    const readiness = await currentSelfTestReadiness(context);
    const missing = readiness.filter((item) => !item.ok);
    if (missing.length > 0) {
      const stop = missing.some((item) => item.key === "stop");
      return fail(
        stop ? "safety_denial" : "not_ready",
        stop
          ? "Safety denial: Mothership's Emergency Stop is engaged or unreadable, so nothing was sent. It was not released."
          : "Not sent: a required Mothership setting is off, missing or expired. Nothing was run or approved.",
        {
          details: missing.map((item) => ({
            label: item.label,
            status: "needs_attention" as const,
            detail: item.detail,
          })),
          attemptFinal: true,
        },
      );
    }

    const [own, recent] = await Promise.all([
      context.supabase
        .from("razul_control_audit")
        .select("action,record_id,occurred_at")
        .eq("record_type", "jackboy_link")
        .eq("record_id", data.attemptId)
        .order("occurred_at", { ascending: true })
        .limit(100),
      context.supabase
        .from("razul_control_audit")
        .select("action,record_id,occurred_at")
        .eq("record_type", "jackboy_link")
        .gte("occurred_at", new Date(started - SELF_TEST_IN_FLIGHT_MS).toISOString())
        .order("occurred_at", { ascending: true })
        .limit(200),
    ]);
    if (own.error || recent.error)
      return fail("denied", "The self-test audit trail could not be read, so nothing was sent.");
    const stage = attemptStage((own.data ?? []).map((row) => row.action));

    if (stage === "finished_passed" || stage === "finished_failed") {
      // Already decided: re-verify from the recorded result, never contact Jackboy again.
      const evaluated = await evaluateCheck(8, context);
      const stored = await storeCheck(context, evaluated);
      if (!stored.ok) return fail(stored.reason, stored.message, { sent: true });
      return {
        ok: true as const,
        outcome: stage === "finished_passed" ? ("passed" as const) : ("failed" as const),
        resumed: true,
        job: null,
        startedAt: null,
        finishedAt: own.data?.find((r) => r.action.startsWith("self_test_"))?.occurred_at ?? null,
        check: stored.check,
        approvalNeeded: stored.approvalNeeded,
        attemptFinal: true as const,
      };
    }
    if (stage === "closed")
      return fail(
        "closed",
        "Jackboy reports this self-test job as cancelled or closed without a result. Start a new attempt.",
        { attemptFinal: true, sent: true },
      );

    const busy = otherAttemptInFlight(recent.data ?? [], data.attemptId, started);
    if (busy)
      return fail(
        "busy",
        "Another protocol self-test was asked to run in the last few minutes and has no result yet. Nothing new was sent; wait, then use Refresh status.",
      );

    const { configuredJackboyLink, JackboyLink, JackboyLinkError } =
      await import("./jackboy-link.server");
    const { driveSelfTest } = await import("./activation-self-test.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let link;
    try {
      link = await configuredJackboyLink();
    } catch {
      return fail(
        "not_ready",
        "Not sent: the link settings are disabled, malformed or outside their approval window.",
        { attemptFinal: true },
      );
    }
    const client = new JackboyLink(link, async (event) => {
      const { error } = await supabaseAdmin.from("razul_control_audit").insert({
        actor_id: context.userId,
        action: event,
        record_type: "jackboy_link",
        record_id: data.attemptId,
      });
      if (error) throw new JackboyLinkError("Self-test audit failed.", "audit");
    });

    let runSent = stage === "run_requested";
    let job;
    try {
      ({ job } = await driveSelfTest(client, stage, data.attemptId, {
        deadline: started + SELF_TEST_SERVER_BUDGET_MS,
        onRunSent: () => {
          runSent = true;
        },
      }));
    } catch (error) {
      const c = classifySelfTestError(error, runSent);
      return fail(c.kind, c.message, { details: c.details, sent: true });
    }

    if (isUnfinished(job.status))
      return fail(
        "pending",
        `Jackboy still reports the self-test as ${job.status} after ${Math.round((Date.now() - started) / 1000)} s. Nothing was approved. Retrying only reads this job's status.`,
        { sent: true },
      );
    const action = selfTestAuditAction(job);
    if (!action)
      return fail(
        "closed",
        "Jackboy reports this self-test job as cancelled without a result. Nothing is evidence; start a new attempt.",
        { attemptFinal: true, sent: true },
      );
    const { error: auditError } = await supabaseAdmin.from("razul_control_audit").insert({
      actor_id: context.userId,
      action,
      record_type: "jackboy_link",
      record_id: data.attemptId,
    });
    if (auditError)
      return fail(
        "denied",
        "Jackboy answered, but the result could not be written to the audit log. Retrying reads the same job's status and records it; it does not run it again.",
        { sent: true },
      );

    const finishedAt = new Date().toISOString();
    const passed = action === "self_test_passed";
    const result = job.result;
    const details: Detail[] = [
      {
        label: "Signed runner proof",
        status: passed ? "passed" : "failed",
        detail: `Job ${job.id} · ${job.status}${
          result
            ? ` · ${result.passed ? "passed" : "failed"} ${result.checks} check(s) · ${result.runner}`
            : " · no result"
        } · reply signature verified.`,
      },
      {
        label: "Run window",
        status: passed ? "passed" : "failed",
        detail: `Started ${new Date(started).toISOString()} · finished ${finishedAt}.`,
      },
    ];
    const stored = await storeCheck(context, {
      deploymentMode: currentDeployment().mode,
      check: checked(
        8,
        passed ? "passed" : "failed",
        passed
          ? "Protocol self-test passed now and its signed result was verified."
          : "The protocol self-test ran and reported a failure.",
        details,
      ),
    });
    if (!stored.ok) return fail(stored.reason, stored.message, { sent: true, attemptFinal: true });
    return {
      ok: true as const,
      outcome: passed ? ("passed" as const) : ("failed" as const),
      resumed: false,
      job: result
        ? { id: job.id, status: job.status, checks: result.checks, runner: result.runner }
        : { id: job.id, status: job.status, checks: 0, runner: "" },
      startedAt: new Date(started).toISOString(),
      finishedAt,
      check: stored.check,
      approvalNeeded: stored.approvalNeeded,
      attemptFinal: true as const,
    };
  });

const liveLinkInput = z.object({ confirm: z.literal(true) }).strict();

type LiveLinkFailure = {
  ok: false;
  reason:
    | "mfa"
    | "denied"
    | "not_ready"
    | "safety_denial"
    | "timeout"
    | "refused"
    | "link_failure"
    | "invalid_reply";
  message: string;
  details: Detail[];
};

/**
 * Step 9: one connection-only signed handshake with Jackboy (no job, no self-test, no CODE).
 * Needs owner + fresh MFA + per-click confirm, Steps 1–9 effectively approved and every
 * Mothership link gate (Emergency Stop released, link switch, owner, approval window, identity).
 * Changes no switch or approval; a refusal is reported, never worked around.
 */
export const checkLiveLinkConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => liveLinkInput.parse(input))
  .handler(
    async ({
      context,
    }): Promise<LiveLinkFailure | { ok: true; verifiedAt: string; message: string }> => {
      await ownerContext(context);
      const fail = (
        reason: LiveLinkFailure["reason"],
        message: string,
        details: Detail[] = [],
      ): LiveLinkFailure => ({
        ok: false,
        reason,
        message,
        details,
      });
      if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
        return fail("mfa", "Re-verify with your authenticator first. Nothing was sent.");
      const { data: rows, error } = await context.supabase
        .from("activation_approvals")
        .select(
          "step,status,approver_id,decided_at,note,approval_expires_at,spend_confirmations,revision",
        )
        .order("step");
      if (error) return fail("denied", "Approval records could not be read; nothing was sent.");
      let resetAt: string | null;
      try {
        resetAt = await securityResetAt(context.supabase, context.userId);
      } catch {
        return fail("denied", "Account security history could not be read; nothing was sent.");
      }
      const readiness = await currentSelfTestReadiness(context);
      const status = liveLinkStatus({
        rows: effectiveRows(normalizeRows(rows), resetAt),
        readiness,
        now: Date.now(),
        lastConnectedAt: null,
        lastAttemptAt: null,
      });
      if (!status.canCheck) {
        const stop = status.items.some((i) => i.key === "stop" && !i.ok);
        return fail(
          stop ? "safety_denial" : "not_ready",
          stop
            ? "Safety denial: Mothership's Emergency Stop is engaged or unreadable, so nothing was sent. It was not released."
            : `Not sent: ${status.blocker ?? "a requirement is not met."}`,
          status.items
            .filter((i) => !i.ok)
            .map((i) => ({ label: i.label, status: "needs_attention" as const, detail: i.detail })),
        );
      }
      const { configuredJackboyLink, JackboyLink, JackboyLinkError } =
        await import("./jackboy-link.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let link;
      try {
        link = await configuredJackboyLink();
      } catch {
        return fail(
          "not_ready",
          "Not sent: the link settings are disabled, malformed or outside their approval window.",
        );
      }
      const client = new JackboyLink(link, async (event) => {
        const { error: auditError } = await supabaseAdmin.from("razul_control_audit").insert({
          actor_id: context.userId,
          action: event,
          record_type: "jackboy_link",
          record_id: process.env["OMNI_LINK_APPROVAL_ID"] || "live_link_check",
        });
        if (auditError) throw new JackboyLinkError("Live link audit failed.", "audit");
      });
      try {
        await client.connect();
      } catch (e) {
        const c = classifyLiveLinkError(e);
        return fail(c.kind, c.message, c.details);
      }
      return {
        ok: true as const,
        verifiedAt: new Date().toISOString(),
        message:
          "Live link verified: Jackboy answered a signed handshake with a ready session. No job, self-test or CODE request was sent.",
      };
    },
  );

/**
 * Owner refresh of Jackboy's safety state: freshness and permit-lapse enforcement plus, once the
 * Step 9 live link is activated, one handshake and one session-signed `safety` read. Never releases a stop, turns a switch or starts work;
 * any failure records "unknown", which keeps OMNI autonomy and CODE halted.
 */
export const refreshJackboySafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await ownerContext(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncJackboySafety } = await import("./jackboy-safety.server");
    let result;
    try {
      result = await syncJackboySafety(supabaseAdmin);
    } catch {
      return {
        ok: false as const,
        message: "The safety state could not be refreshed; autonomy and CODE stay halted.",
      };
    }
    const row = await jackboySafetyRow(context.supabase);
    const view = safetyView(row, Date.now());
    const message = !result.checked
      ? result.reason === "live_link_not_active"
        ? "Not sent: activate the Step 9 live link first. Freshness and permit expiry were enforced."
        : "Not sent: Mothership's Emergency Stop is engaged or unreadable, so the state is recorded as unknown."
      : result.reason === "verified"
        ? `Verified signed reading recorded: ${view.label}.`
        : `Jackboy did not return a verified safety reading (${result.reason}); recorded as unknown, so autonomy and CODE stay halted.`;
    return { ok: true as const, checked: result.checked, message, safety: view };
  });

const activationInput = z
  .object({
    confirm: z.literal(true),
    attemptId: z.string().uuid(),
  })
  .strict();

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
        if (error.message.includes("Fresh two-factor")) return { ok: false, reason: "mfa" };
        // Nonsecret diagnostics only (database error class), so a silent refusal can be traced.
        console.error("[activation] begin refused", k, error.code ?? "no_code");
        return { ok: false, reason: error.code === "42501" ? "denied" : "begin_error" };
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
      const { readExecutionState } = await import("./unified-activation.server");
      const window = await context.supabase
        .from("activation_approvals")
        .select("approval_expires_at")
        .eq("step", 7)
        .single();
      if (window.error || !window.data.approval_expires_at)
        throw new Error("Current approval window is unavailable");
      const state = await readExecutionState(
        k === "live_link" ? "connect" : "configure",
        k === "live_link"
          ? { operationId: attempt, expiresAt: window.data.approval_expires_at }
          : {},
      );
      if (
        !state.connected ||
        (k === "live_link" && state.operationId !== attempt) ||
        (k === "autonomy" && (!state.configured || state.armed))
      )
        throw new Error("Backend actuation did not verify");
      if (k === "autonomy") {
        const live = await context.supabase
          .from("activation_activations")
          .select("attempt_id")
          .eq("kind", "live_link")
          .single();
        if (live.error || state.operationId !== live.data.attempt_id)
          throw new Error("Backend connection identity changed");
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

function activationHandler(kind: "live_link" | "autonomy") {
  return async ({ context, data }: { context: Ctx; data: z.infer<typeof activationInput> }) => {
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

/**
 * Step 9 activation: owner + fresh MFA + per-click confirm. The database checks Steps 1–9, Step 7's
 * window, a fresh Step 8 proof and Mothership's Emergency Stop; then one signed handshake and one
 * signed Jackboy safety read. A failed handshake leaves nothing active. Sends no job or CODE request.
 */
export const activateLiveLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activationInput.parse(input))
  .handler(({ context, data }) => activationHandler("live_link")({ context, data }));

/**
 * Step 10 activation: owner + fresh MFA + per-click confirm; owner caps and metering checked here,
 * the live link and cap confirmations in the database, and Jackboy's own authorization in its signed
 * safety snapshot. Authorization only: execution stays blocked while any stop applies.
 */
export const activateAutonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activationInput.parse(input))
  .handler(({ context, data }) => activationHandler("autonomy")({ context, data }));

/** Owner deactivation (safer, so no fresh code): ends the activation and halts autonomous work. */
export const deactivateActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ kind: z.enum(["live_link", "autonomy"]) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await ownerContext(context);
    const { error } = await context.supabase.rpc("activation_activation_revoke", {
      _kind: data.kind,
    });
    if (error)
      return {
        ok: false as const,
        message: "Deactivation was not recorded. Refresh and try again.",
      };
    try {
      const state = await (
        await import("./unified-activation.server")
      ).readExecutionState(data.kind === "live_link" ? "revoke" : "unconfigure");
      if (
        state.armed ||
        state.cancellationPending ||
        (data.kind === "live_link" ? state.connected : state.configured)
      )
        throw new Error("Cancellation remains pending");
      const current = await context.supabase
        .from("activation_activations")
        .select("attempt_id")
        .eq("kind", data.kind)
        .single();
      if (current.error) throw new Error("Current deactivation scope is unavailable");
      if (current.data.attempt_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const confirmed = await staged(supabaseAdmin).rpc("activation_rollback_confirmed", {
          _kind: data.kind,
          _attempt: current.data.attempt_id,
        });
        if (confirmed.error) throw new Error("Verified deactivation could not be recorded");
      }
    } catch {
      return {
        ok: false as const,
        message:
          "Local activation was revoked, but remote cancellation is unverified. Keep Stop engaged and reconcile Jackboy.",
      };
    }
    return {
      ok: true as const,
      message:
        data.kind === "live_link"
          ? "Live link deactivated (autonomy authorization ended too). Autonomous work was halted."
          : "Autonomy authorization deactivated. Autonomous work was halted.",
    };
  });
