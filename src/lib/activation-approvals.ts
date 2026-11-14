/**
 * Activation Approvals: the owner's ordered go-live checklist for the
 * OMNI–Jackboy link and CODE. Approving a step only records the decision.
 * Nothing here flips switches, sets secrets, deploys, runs the self-test or
 * makes paid calls. The database RPC enforces the same rules server-side.
 */
import { z } from "zod";

export type ApprovalStatus = "pending" | "approved" | "failed";
export type ApprovalAction = "approve" | "fail" | "revoke";
export type DeploymentMode = "runner_only" | "unknown" | "inconsistent";
export type CheckStatus = "passed" | "failed" | "needs_attention";

export const ACTIVATION_CHECK_VERSION = 2;
export const ACTIVATION_CHECK_STEPS = [1, 2, 4, 8] as const;

export interface DeploymentConfiguration {
  mode: DeploymentMode;
  jackboyOriginConfigured: boolean;
  runnerOriginConfigured: boolean;
  attention: string[];
}

export interface ActivationCheckDetail {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ActivationCheck {
  step: number;
  status: CheckStatus;
  evidenceVersion: number;
  checkedAt: string;
  summary: string;
  details: ActivationCheckDetail[];
}

export function isTechnicalStep(step: number): boolean {
  return (ACTIVATION_CHECK_STEPS as readonly number[]).includes(step);
}

/** Target selection only. Remote readiness requires the signed Step 2 probe. */
export function deploymentConfiguration(input: {
  jackboyOrigin: string | undefined;
  runnerOrigin: string | undefined;
}): DeploymentConfiguration {
  const jackboyOriginConfigured = Boolean(input.jackboyOrigin?.trim());
  const runnerOriginConfigured = Boolean(input.runnerOrigin?.trim());
  let distinctOrigins = false;
  try {
    const jackboy = new URL(input.jackboyOrigin || "");
    const runner = new URL(input.runnerOrigin || "");
    distinctOrigins =
      jackboy.protocol === "https:" &&
      runner.protocol === "https:" &&
      jackboy.origin !== runner.origin;
  } catch {
    // Missing or malformed references select no verified deployment target.
  }
  const mode: DeploymentMode =
    !jackboyOriginConfigured && !runnerOriginConfigured
      ? "unknown"
      : distinctOrigins
        ? "runner_only"
        : "inconsistent";
  const attention: string[] = [];
  if (!jackboyOriginConfigured) attention.push("Confirm JACKBOY_LINK_ORIGIN on Mothership.");
  if (!runnerOriginConfigured)
    attention.push("Confirm the nonsecret JACKBOY_LINK_RUNNER_ORIGIN on Mothership.");
  if (jackboyOriginConfigured && runnerOriginConfigured && !distinctOrigins)
    attention.push("Jackboy and Railway runner must have distinct HTTPS origins.");
  attention.push("Railway flags and its secret belong on the runner, not on Mothership.");

  return {
    mode,
    jackboyOriginConfigured,
    runnerOriginConfigured,
    attention,
  };
}

export const ACTIVATION_STEPS = [
  {
    step: 1,
    title: "Mothership link settings verified",
    detail: "Server-side setting names and public HTTPS origin; secret values stay private",
    kind: "check",
  },
  {
    step: 2,
    title: "Railway runner settings verified",
    detail: "Runner-only mode, Node runner enabled and shared runner secret configured",
    kind: "check",
  },
  {
    step: 3,
    title: "Node 26 pinned on the runner",
    detail: "Owner confirms the Railway runner runtime",
    kind: "owner",
  },
  {
    step: 4,
    title: "Jackboy HTTPS link verified",
    detail:
      "Signed configuration exchange with Jackboy on Lovable; Railway runner is a separate endpoint",
    kind: "check",
  },
  {
    step: 5,
    title: "Jackboy database migration confirmed",
    detail: "Jackboy's Lovable deployment owns the database; verify migration 0030 there",
    kind: "owner",
  },
  {
    step: 6,
    title: "Final readiness review",
    detail: "Owner reviews the checks and remaining attention items",
    kind: "owner",
  },
  { step: 7, title: "Approval expiry set", detail: "At most 24 hours ahead", kind: "owner" },
  {
    step: 8,
    title: "Protocol self-test proof verified",
    detail:
      "Runs the fixed self-test once on your explicit authorization, then verifies its signed result",
    kind: "check",
  },
  {
    step: 9,
    title: "Live link switches approved",
    detail: "Owner decision only; no switch is changed here",
    kind: "owner",
  },
  {
    step: 10,
    title: "CODE production switch",
    detail: "$10 OpenAI cap and $5 daily limit confirmed",
    kind: "owner",
  },
] as const;

export const STEP_COUNT = ACTIVATION_STEPS.length;
export const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const FRESH_MFA_SECONDS = 15 * 60;
export const NOTE_MAX = 280;

/** Setting names checked by presence only on step 1; values are never read out. */
export const LINK_SETTING_NAMES = [
  "JACKBOY_LINK_ENABLED",
  "JACKBOY_LINK_MOTHERSHIP_OWNER_ID",
  "JACKBOY_LINK_ORIGIN",
  "OMNI_LINK_CLIENT_ID",
  "OMNI_LINK_PROJECT_ID",
  "OMNI_LINK_APPROVAL_ID",
  "OMNI_LINK_BOOTSTRAP_KEY",
  "OMNI_LINK_HMAC_SECRET",
  "OMNI_LINK_APPROVAL_EXPIRES_AT",
] as const;
/** Intentionally left unset until step 7 is approved. */
export const DEFERRED_SETTING = "OMNI_LINK_APPROVAL_EXPIRES_AT";

export interface ApprovalRow {
  step: number;
  status: ApprovalStatus;
  approver_id: string | null;
  decided_at: string | null;
  note: string;
  approval_expires_at: string | null;
  spend_confirmations: SpendConfirmations | null;
  revision: number;
}

export interface SpendConfirmations {
  openai_cap_usd: number;
  daily_limit_usd: number;
  confirmed_at: string;
}

/** Fill missing rows as pending so the checklist always has 10 steps. */
export function normalizeRows(
  rows: Array<
    Partial<Omit<ApprovalRow, "spend_confirmations" | "status">> & {
      status?: string;
      spend_confirmations?: unknown;
    }
  >,
): ApprovalRow[] {
  return ACTIVATION_STEPS.map(({ step }) => {
    const found = rows.find((r) => r.step === step);
    return {
      step,
      status: (["pending", "approved", "failed"] as const).includes(found?.status as ApprovalStatus)
        ? (found!.status as ApprovalStatus)
        : "pending",
      approver_id: found?.approver_id ?? null,
      decided_at: found?.decided_at ?? null,
      note: found?.note ?? "",
      approval_expires_at: found?.approval_expires_at ?? null,
      spend_confirmations: (found?.spend_confirmations as SpendConfirmations | null) ?? null,
      revision: found?.revision ?? 0,
    };
  });
}

/** A step counts as approved for unlocking; an expired step-7 window does not. */
export function isEffectivelyApproved(row: ApprovalRow, now: number): boolean {
  if (row.status !== "approved") return false;
  if (row.step === 7) {
    const at = row.approval_expires_at ? Date.parse(row.approval_expires_at) : NaN;
    return Number.isFinite(at) && at > now;
  }
  return true;
}

/** First earlier step that is not approved, or null when this step is unlocked. */
export function blockingStep(rows: ApprovalRow[], step: number, now: number): number | null {
  for (const row of rows) {
    if (row.step >= step) break;
    if (!isEffectivelyApproved(row, now)) return row.step;
  }
  return null;
}

export function allowedActions(rows: ApprovalRow[], step: number, now: number): ApprovalAction[] {
  const row = rows.find((r) => r.step === step);
  if (!row) return [];
  const actions: ApprovalAction[] = [];
  const unlocked = blockingStep(rows, step, now) === null;
  if (unlocked && row.status !== "approved") actions.push("approve");
  if (unlocked && row.status !== "failed") actions.push("fail");
  if (row.status !== "pending") actions.push("revoke");
  return actions;
}

/** Mirror of the database rule: revoke/fail resets this step's later decisions. */
export function applyDecision(
  rows: ApprovalRow[],
  step: number,
  action: ApprovalAction,
  actor: string,
  now: number,
  extra: { expiresAt?: string | null } = {},
): ApprovalRow[] {
  const at = new Date(now).toISOString();
  return rows.map((row) => {
    if (row.step === step) {
      return {
        ...row,
        status: action === "approve" ? "approved" : action === "fail" ? "failed" : "pending",
        approver_id: actor,
        decided_at: at,
        approval_expires_at: action === "approve" && step === 7 ? (extra.expiresAt ?? null) : null,
        revision: row.revision + 1,
      };
    }
    if (row.step > step && action !== "approve" && row.status !== "pending") {
      return {
        ...row,
        status: "pending",
        approver_id: actor,
        decided_at: at,
        note: "",
        approval_expires_at: null,
        spend_confirmations: null,
        revision: row.revision + 1,
      };
    }
    return row;
  });
}

export function validateExpiry(value: string | null | undefined, now: number): string | null {
  if (!value) return "Choose an expiry date and time.";
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "Choose a valid expiry date and time.";
  if (at <= now) return "The expiry must be in the future.";
  if (at > now + MAX_EXPIRY_MS) return "The expiry can be at most 24 hours ahead.";
  return null;
}

const SECRET_LIKE =
  /(sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}|omni_[0-9a-f]{4,8}_[A-Za-z0-9_-]{8,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/_=-]{40,})/;

export function noteProblem(note: string): string | null {
  const clean = note.trim();
  if (clean.length > NOTE_MAX) return `Notes are limited to ${NOTE_MAX} characters.`;
  if (SECRET_LIKE.test(clean)) return "This note looks like a key or token. Remove it.";
  return null;
}

/** Seconds since the most recent authenticator check on this session, or null if none. */
export function mfaAgeSeconds(amr: unknown, nowSeconds: number): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method !== "totp" || typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  if (latest === null || latest > nowSeconds + 60) return null;
  return Math.max(0, nowSeconds - latest);
}

export function isMfaFresh(amr: unknown, nowSeconds: number): boolean {
  const age = mfaAgeSeconds(amr, nowSeconds);
  return age !== null && age <= FRESH_MFA_SECONDS;
}

export const decisionInput = z
  .object({
    step: z.number().int().min(1).max(STEP_COUNT),
    action: z.enum(["approve", "fail", "revoke"]),
    note: z.string().max(NOTE_MAX).default(""),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
    capConfirmed: z.boolean().default(false),
    dailyConfirmed: z.boolean().default(false),
  })
  .strict();
export type DecisionInput = z.infer<typeof decisionInput>;
