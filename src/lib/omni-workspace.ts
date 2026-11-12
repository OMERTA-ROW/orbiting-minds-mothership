/**
 * OMNI Agent Workspace — pure rules shared by server and browser.
 * Nothing here executes anything; it decides whether the server may relay.
 */
import { z } from "zod";

export const WORKSPACE_CONTRACT = "omni.workspace/v1";
export const PASSKEY_FRESH_SECONDS = 300;
export const IDLE_LIMIT_MS = 10 * 60_000;
export const SESSION_MAX_MS = 60 * 60_000;
export const SELF_TEST_VALID_MS = 24 * 3600_000;
export const AUTONOMY_MINUTES = [15, 30, 60] as const;
/**
 * Set to a reviewed release note ID only after a live Railway end-to-end run (isolated shell,
 * signed link, spend meter, stop drill, audit, per-agent isolation, approval gates) is recorded
 * and reviewed. While null, Autonomous Mode cannot be turned on, whatever else passes.
 */
export const AUTONOMY_VERIFIED_RELEASE: string | null = null;
/** Kept for callers/tests: true only once a verified release is recorded. */
export const AUTONOMY_ENABLED = AUTONOMY_VERIFIED_RELEASE !== null;
/** Jackboy CODE keeps its own passkey/spend gatekeeper; Mothership never grants it autonomy. */
export const AUTONOMY_EXCLUDED_AGENTS = ["jackboy"] as const;
export const STOP_DRILL_VALID_MS = 24 * 3600_000;
export const AUDIT_HEAD_BYTES = 4096;
/** Owner-wide caps in cents: $1 per task, $5 per day, $10 lifetime. */
export const GLOBAL_LIMITS = { task: 100, day: 500, total: 1000 } as const;
export const AGENT_ACTIONS = ["chat", "edit_files", "run_commands"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];
/** Always need an owner decision, even in Autonomous Mode. */
export const GATED_ACTIONS = [
  "merge",
  "deploy",
  "publish",
  "secrets",
  "github_permissions",
  "network",
  "pull_request",
] as const;
export type GatedAction = (typeof GATED_ACTIONS)[number];
export const FUTURE_AGENTS = [
  { id: "jax", name: "JAX" },
  { id: "razul", name: "Razul" },
  { id: "hercules", name: "Hercules" },
] as const;

/** Model providers the cloud sandbox can use. Keys live only on the Railway sandbox service. */
export const PROVIDERS = ["none", "openai", "anthropic"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<Provider, string> = {
  none: "Shell only (no model)",
  openai: "OpenAI (Codex models)",
  anthropic: "Claude (Anthropic)",
};
export const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const GIT_REF = /^[A-Za-z0-9._/-]{1,100}$/;

const uuid = z.string().uuid();
const agentId = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/);
export const checkIdInput = z.object({ checkId: uuid });
export const killSwitchInput = z.object({
  checkId: uuid,
  enabled: z.boolean(),
  reason: z.string().trim().min(3).max(200),
});
export const startSessionInput = z
  .object({
    checkId: uuid,
    agentId,
    provider: z.enum(PROVIDERS).default("none"),
    repository: z.string().trim().regex(REPOSITORY, "Use owner/repository.").max(200).optional(),
    ref: z.string().trim().regex(GIT_REF, "Use a branch name.").optional(),
  })
  .refine((s) => !s.ref || s.repository, {
    message: "Pick a repository for that branch.",
    path: ["ref"],
  });
export const prInput = z.object({ sessionId: uuid, title: z.string().trim().min(3).max(120) });
export const chatInput = z.object({ sessionId: uuid, text: z.string().trim().min(1).max(4000) });
export const commandInput = z.object({
  sessionId: uuid,
  command: z.string().trim().min(1).max(2000),
});
export const pollInput = z.object({ sessionId: uuid });
export const stopInput = z.object({ sessionId: uuid.optional(), agentId: agentId.optional() });
export const STOP_DRILL_COMMAND = "sleep 30";
export const stopDrillInput = z.object({ sessionId: uuid, checkId: uuid });
export const autonomyInput = z.object({
  agentId,
  checkId: uuid.optional(),
  on: z.boolean(),
  minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
});
export const decideInput = z.object({
  checkId: uuid.optional(),
  approvalId: uuid.optional(),
  stepId: uuid.optional(),
  approve: z.boolean(),
});
export const agentGrantInput = z.object({
  checkId: uuid,
  agentId,
  status: z.enum(["enrolled", "paused", "revoked"]),
  allowedActions: z.array(z.enum(AGENT_ACTIONS)).max(3),
  budgetTaskCents: z.number().int().min(0).max(GLOBAL_LIMITS.task),
  budgetDayCents: z.number().int().min(0).max(GLOBAL_LIMITS.day),
  budgetTotalCents: z.number().int().min(0).max(GLOBAL_LIMITS.total),
});
export const passkeyNameInput = z.object({ name: z.string().trim().min(1).max(60) });
export const passkeyPurposeInput = z.object({
  purpose: z.enum(["open", "session", "kill_switch", "autonomy", "approval", "agent"]),
});

export type GateInput = {
  linkConfigured: boolean;
  selfTestPassedAt: number | null;
  killSwitchEnabled: boolean | null; // null = missing/unreadable
  emergencyStopReleased: boolean | null;
  sandboxEnabled: boolean;
  passkeyFresh: boolean;
  now: number;
};
export type Gate = { open: boolean; blockers: string[] };

/** Every item must be true. Missing or unreadable state counts as closed. */
export function workspaceGate(g: GateInput): Gate {
  const blockers: string[] = [];
  if (!g.linkConfigured) blockers.push("Cloud sandbox settings are missing or invalid.");
  if (!g.sandboxEnabled) blockers.push("Cloud sandbox switch (OMNI_SANDBOX_ENABLED) is off.");
  if (g.selfTestPassedAt === null || g.now - g.selfTestPassedAt > SELF_TEST_VALID_MS)
    blockers.push("Cloud sandbox self-test has not passed in the last 24 hours.");
  if (g.killSwitchEnabled !== true) blockers.push("Kill switch has the terminal disabled.");
  if (g.emergencyStopReleased !== true) blockers.push("Emergency Stop is engaged.");
  if (!g.passkeyFresh) blockers.push("Fresh passkey check needed.");
  return { open: blockers.length === 0, blockers };
}

export type SessionTimes = { startedAt: number; lastActivityAt: number; endedAt: number | null };
export function sessionEndReason(
  s: SessionTimes,
  now: number,
): null | "timeout" | "max_age" | "ended" {
  if (s.endedAt !== null) return "ended";
  if (now - s.startedAt >= SESSION_MAX_MS) return "max_age";
  if (now - s.lastActivityAt >= IDLE_LIMIT_MS) return "timeout";
  return null;
}

export type Spend = { task: number; day: number; total: number };
export type AgentBudget = { task: number; day: number; total: number };
/** Whichever limit is hit first stops the job. Zero budget means no spending. */
export function budgetDecision(
  spent: Spend,
  agentSpent: Spend,
  budget: AgentBudget,
): { allowed: boolean; reason: string | null } {
  const checks: [number, number, string][] = [
    [spent.task, GLOBAL_LIMITS.task, "Overall $1 per-task limit reached."],
    [spent.day, GLOBAL_LIMITS.day, "Overall $5 daily limit reached."],
    [spent.total, GLOBAL_LIMITS.total, "Overall $10 total limit reached."],
    [agentSpent.task, budget.task, "This agent's per-task budget is used up."],
    [agentSpent.day, budget.day, "This agent's daily budget is used up."],
    [agentSpent.total, budget.total, "This agent's total budget is used up."],
  ];
  for (const [used, cap, reason] of checks) if (used >= cap) return { allowed: false, reason };
  return { allowed: true, reason: null };
}

export function autonomyActive(
  w: { expiresAt: number; endedAt: number | null } | null,
  now: number,
): boolean {
  return Boolean(w && w.endedAt === null && w.expiresAt > now);
}

/** Does this step require the owner, given autonomy? Gated actions always do. */
export function needsOwnerDecision(
  step: { kind: string; gated: string | null },
  autonomous: boolean,
): boolean {
  if (step.gated) return true;
  if (autonomous) return false;
  return step.kind === "diff" || step.kind === "command";
}

export function capHead(text: string, bytes = AUDIT_HEAD_BYTES): string {
  const enc = new TextEncoder().encode(text);
  if (enc.byteLength <= bytes) return text;
  return new TextDecoder().decode(enc.slice(0, bytes)).replace(/\uFFFD+$/, "");
}

/** Remote replies are untrusted: validated strictly before anything is stored. */
export const remoteStep = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  kind: z.enum(["plan", "diff", "command", "result", "message", "output"]),
  title: z.string().max(200).default(""),
  body: z.string().max(16384).default(""),
  stream: z.enum(["stdout", "stderr", "system"]).optional(),
  exitCode: z.number().int().min(-1).max(255).optional(),
  costCents: z.number().int().min(0).max(1000).default(0),
  model: z.string().max(80).optional(),
  gated: z.enum(GATED_ACTIONS).nullable().default(null),
  status: z.enum(["pending_approval", "done", "failed"]).default("done"),
});
const limit = (max: number) => z.number().int().min(0).max(max);
/** Reported by the sandbox in reply to health.check. Untrusted until the reply proof checks out. */
export const sandboxHealth = z.object({
  service: z.literal("omni-sandbox"),
  version: z.string().max(40),
  isolation: z.object({
    network: z.enum(["isolated", "open"]),
    uid: z.number().int(),
    perSessionUser: z.boolean(),
    envNames: z.array(z.string().max(40)).max(64),
    probeExitCode: z.number().int(),
  }),
  limits: z.object({
    commandTimeoutSec: limit(100000),
    cpuSec: limit(100000),
    memoryMb: limit(1000000),
    maxProcesses: limit(100000),
    fileSizeMb: limit(1000000),
    outputCapBytes: limit(100000000),
    maxSessions: limit(1000),
    idleMinutes: limit(100000),
    sessionMinutes: limit(100000),
  }),
  providers: z
    .array(
      z.object({
        id: z.enum(["openai", "anthropic"]),
        configured: z.boolean(),
        verified: z.boolean(),
        model: z.string().max(80).nullable(),
        pricing: z.boolean(),
        checkedAt: z.string().max(40).nullable(),
      }),
    )
    .max(4),
  github: z.object({
    configured: z.boolean(),
    repositories: z
      .array(z.object({ fullName: z.string().regex(REPOSITORY).max(200), access: z.boolean() }))
      .max(20),
    checkedAt: z.string().max(40).nullable(),
  }),
  /** "windowed" = the sandbox implements time-bounded autonomy (contract v0.2). */
  autonomy: z.enum(["off", "windowed"]),
  merge: z.literal("never"),
});
export type SandboxHealth = z.infer<typeof sandboxHealth>;

/** Names a sandboxed command may see in its environment. Anything else could be a leaked setting. */
export const SANDBOX_ENV_ALLOWED = ["HOME", "LANG", "OLDPWD", "PATH", "TERM"] as const;
/** Hard ceilings Mothership accepts from a sandbox, whatever it is configured with. */
export const SANDBOX_CEILINGS = {
  commandTimeoutSec: 300,
  cpuSec: 300,
  memoryMb: 8192,
  maxProcesses: 512,
  fileSizeMb: 2048,
  outputCapBytes: 1_048_576,
  maxSessions: 5,
  idleMinutes: 10,
  sessionMinutes: 60,
} as const;

/** Self-test passes only when isolation is proven by the live probe and every limit is within ceilings. */
export function evaluateSandboxHealth(h: SandboxHealth): { passed: boolean; failures: string[] } {
  const f: string[] = [];
  if (h.isolation.network !== "isolated")
    f.push("Commands can reach the network; isolation is required.");
  if (h.isolation.uid <= 0) f.push("Commands run as root.");
  if (!h.isolation.perSessionUser) f.push("Sessions share one user account.");
  if (h.isolation.probeExitCode !== 0) f.push("The sandbox probe command did not finish cleanly.");
  const extra = h.isolation.envNames.filter(
    (n) => !(SANDBOX_ENV_ALLOWED as readonly string[]).includes(n),
  );
  if (extra.length) f.push(`Commands can see extra settings: ${extra.slice(0, 5).join(", ")}.`);
  for (const [k, max] of Object.entries(SANDBOX_CEILINGS)) {
    const v = h.limits[k as keyof typeof SANDBOX_CEILINGS];
    if (v <= 0 || v > max) f.push(`Limit ${k} is ${v}; allowed 1–${max}.`);
  }
  return { passed: f.length === 0, failures: f };
}

export const remoteReply = z.object({
  contract: z.literal(WORKSPACE_CONTRACT),
  requestNonce: z.string(),
  error: z.string().max(400).optional(),
  health: sandboxHealth.optional(),
  session: z
    .object({
      sandboxId: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
      sandboxName: z.string().max(80),
      model: z.string().max(80).nullable().default(null),
    })
    .optional(),
  job: z
    .object({
      status: z.enum(["queued", "running", "done", "failed", "stopped"]),
      cursor: z.string().max(128).optional(),
    })
    .optional(),
  steps: z.array(remoteStep).max(200).default([]),
});
export type RemoteReply = z.infer<typeof remoteReply>;

export const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;

// ---------------------------------------------------------------- autonomy readiness

export type AutonomyEvidence = {
  now: number;
  verifiedRelease: string | null;
  sandboxSelfTestPassedAt: number | null;
  sandboxHealth: SandboxHealth | null;
  stopDrillPassedAt: number | null;
  emergencyStopReleased: boolean | null;
  killSwitchEnabled: boolean | null;
  passkeyFresh: boolean;
  agent: { id: string; status: string; budget: AgentBudget };
};
export type AutonomyGate = { id: string; label: string; ok: boolean; detail: string };

/** Every gate must pass, at the moment of turning on. Missing evidence counts as failed. */
export function autonomyGates(e: AutonomyEvidence): { allowed: boolean; gates: AutonomyGate[] } {
  const fresh = (t: number | null, ms: number) => t !== null && e.now - t <= ms;
  const h = e.sandboxHealth;
  const verdict = h ? evaluateSandboxHealth(h) : null;
  const pricedProvider = Boolean(h?.providers.some((p) => p.verified && p.pricing));
  const b = e.agent.budget;
  const gates: AutonomyGate[] = [
    {
      id: "verified_release",
      label: "Live end-to-end run recorded in a reviewed build",
      ok: e.verifiedRelease !== null,
      detail: e.verifiedRelease
        ? `Release ${e.verifiedRelease}.`
        : "Not yet. Needs a live Railway run of every gate below, reviewed, then a new build.",
    },
    {
      id: "signed_self_test",
      label: "Signed sandbox connection and self-test (last 24 h)",
      ok: fresh(e.sandboxSelfTestPassedAt, SELF_TEST_VALID_MS),
      detail: e.sandboxSelfTestPassedAt
        ? "Recorded from a proof-checked reply."
        : "No passing self-test recorded.",
    },
    {
      id: "isolation",
      label: "Isolated shell: no network, per-session user, no leaked settings",
      ok: Boolean(verdict?.passed && h?.isolation.perSessionUser),
      detail: verdict
        ? verdict.passed
          ? "Live probe passed."
          : verdict.failures[0]!
        : "No health report.",
    },
    {
      id: "sandbox_autonomy",
      label: "Sandbox implements time-bounded autonomy (contract v0.2)",
      ok: h?.autonomy === "windowed",
      detail: h
        ? h.autonomy === "windowed"
          ? "Reported by the sandbox."
          : "Sandbox reports autonomy off (reference v0.1 always waits for approval)."
        : "No health report.",
    },
    {
      id: "stop_drill",
      label: "Live stop drill passed (last 24 h)",
      ok: fresh(e.stopDrillPassedAt, STOP_DRILL_VALID_MS),
      detail: e.stopDrillPassedAt
        ? "A running sandbox command was stopped and confirmed."
        : "Run the stop drill in an open session.",
    },
    {
      id: "spend_meter",
      label: "Spend meter: agent budget set and provider prices reported",
      ok: b.task > 0 && b.day > 0 && b.total > 0 && pricedProvider,
      detail: `Agent budget ${fmtCents(b.task)}/task, ${fmtCents(b.day)}/day, ${fmtCents(b.total)} total (overall caps ${fmtCents(GLOBAL_LIMITS.task)}, ${fmtCents(GLOBAL_LIMITS.day)}, ${fmtCents(GLOBAL_LIMITS.total)}). ${pricedProvider ? "Provider prices reported." : "No verified provider with prices."}`,
    },
    {
      id: "agent",
      label: "Agent enrolled, not paused, and not Jackboy",
      ok:
        e.agent.status === "enrolled" &&
        !(AUTONOMY_EXCLUDED_AGENTS as readonly string[]).includes(e.agent.id),
      detail: (AUTONOMY_EXCLUDED_AGENTS as readonly string[]).includes(e.agent.id)
        ? "Jackboy CODE keeps its own controls; Mothership never grants it autonomy."
        : `Status: ${e.agent.status}.`,
    },
    {
      id: "approval_gates",
      label: "Merge, deploy, publish, secrets, GitHub, network and PRs still need you",
      ok:
        [
          "merge",
          "deploy",
          "publish",
          "secrets",
          "github_permissions",
          "network",
          "pull_request",
        ].every((g) => (GATED_ACTIONS as readonly string[]).includes(g)) && h?.merge === "never",
      detail: "Gated steps always wait for your passkey, even in Autonomous Mode.",
    },
    {
      id: "controls",
      label: "Emergency Stop released and terminal enabled",
      ok: e.emergencyStopReleased === true && e.killSwitchEnabled === true,
      detail:
        e.emergencyStopReleased !== true
          ? "Emergency Stop engaged or unreadable."
          : e.killSwitchEnabled !== true
            ? "Kill switch has the terminal off."
            : "OK.",
    },
    {
      id: "passkey",
      label: "Fresh passkey confirmation",
      ok: e.passkeyFresh,
      detail: "Asked for when you press Turn on.",
    },
  ];
  return { allowed: gates.every((g) => g.ok), gates };
}
