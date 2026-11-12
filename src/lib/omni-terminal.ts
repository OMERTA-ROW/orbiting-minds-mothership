/**
 * OMNI Terminal: pure status, command and task rules for the owner-only terminal.
 *
 * Readiness (is it configured?) is always kept separate from authorization
 * (did the owner approve it, and is its switch on?). Nothing here executes,
 * dispatches or contacts Railway, Jackboy or CODE. There is no executor or
 * host companion, so autonomous mode cannot be turned on.
 */
import { z } from "zod";
import {
  ACTIVATION_STEPS,
  isEffectivelyApproved,
  noteProblem,
  type ApprovalRow,
} from "./activation-approvals";

/** No executor or host companion exists in this project. Changing this needs a reviewed build. */
export const EXECUTOR_AVAILABLE = false as const;
/** Mothership has no CODE request path; CODE runs on Jackboy's Railway service. */
export const CODE_PATH_IN_MOTHERSHIP = false as const;

export const LINK_REQUIRED_SETTINGS = [
  "OMNI_LINK_CLIENT_ID",
  "OMNI_LINK_PROJECT_ID",
  "OMNI_LINK_OWNER_ID",
  "OMNI_LINK_APPROVAL_ID",
  "OMNI_LINK_BOOTSTRAP_KEY",
  "OMNI_LINK_HMAC_SECRET",
  "JACKBOY_LINK_ORIGIN",
  "JACKBOY_LINK_MOTHERSHIP_OWNER_ID",
] as const;
/** Set only at approval step 7. */
export const LINK_DEFERRED_SETTING = "OMNI_LINK_APPROVAL_EXPIRES_AT";

export const TASK_KINDS = [
  "code.generate",
  "code.edit",
  "code.test",
  "code.debug",
  "agent.handoff",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_AGENTS = ["jackboy", "jax", "razul", "sabrina", "guardian", "hercules"] as const;
export type TaskAgent = (typeof TASK_AGENTS)[number];

export const KIND_LABEL: Record<TaskKind, string> = {
  "code.generate": "CODE · generate",
  "code.edit": "CODE · edit",
  "code.test": "CODE · test",
  "code.debug": "CODE · debug",
  "agent.handoff": "Agent handoff",
};
export const AGENT_LABEL: Record<TaskAgent, string> = {
  jackboy: "Jackboy",
  jax: "JAX",
  razul: "Razul Central Intelligence",
  sabrina: "Sabrina",
  guardian: "Guardian",
  hercules: "Hercules",
};

export const taskInput = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(TASK_KINDS),
    agent: z.enum(TASK_AGENTS),
    project: z.string().trim().min(1, "Name the project.").max(120),
    repository: z
      .string()
      .trim()
      .max(200)
      .regex(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?$/, "Use owner/repository, or leave it empty.")
      .optional()
      .default(""),
    instructions: z.string().trim().min(3, "Describe the task.").max(4000),
  })
  .strict()
  .refine((t) => t.kind === "agent.handoff" || t.agent === "jackboy", {
    message: "CODE tasks go to Jackboy.",
    path: ["agent"],
  })
  .refine((t) => !noteProblem(t.instructions) && !noteProblem(t.project), {
    message: "Remove anything that looks like a key or token.",
    path: ["instructions"],
  });
export type TaskInput = z.infer<typeof taskInput>;

export const commandInput = z
  .object({ sessionId: z.string().uuid(), command: z.string().trim().min(1).max(200) })
  .strict();

export const cancelInput = z.object({ id: z.string().uuid() }).strict();

export const stopInput = z
  .object({ engaged: z.boolean(), reason: z.string().trim().max(280) })
  .strict()
  .refine((s) => s.engaged || s.reason.length >= 3, {
    message: "Give a short reason to release the Emergency Stop.",
    path: ["reason"],
  });

export type TaskRow = {
  id: string;
  kind: string;
  agent: string;
  project_label: string;
  repository: string | null;
  instructions: string;
  state: string;
  created_at: string;
  cancelled_at: string | null;
};
export type LogRow = {
  id: string;
  session_id: string;
  command: string;
  outcome: string;
  summary: string;
  created_at: string;
};
export type AuditRow = {
  id: string;
  action: string;
  record_type: string;
  record_id: string;
  occurred_at: string;
};

export type Snapshot = {
  now: number;
  mfaAgeSeconds: number | null;
  emergencyStop: { engaged: boolean; known: boolean; changedAt: string | null; reason: string };
  settings: { name: string; present: boolean }[];
  expirySet: boolean;
  switches: { linkEnabled: boolean; selfTestEnabled: boolean };
  ownerIdMatches: "match" | "mismatch" | "missing";
  originValid: boolean;
  approvals: ApprovalRow[];
  audit: AuditRow[];
  textAgent: {
    providerConfigured: boolean;
    aiApproved: boolean;
    paused: boolean;
    completedRuns: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
  };
  razul: { lastRunStatus: string | null; lastRunAt: string | null; paused: boolean };
  tasks: TaskRow[];
  log: LogRow[];
  /** Docked branch devices (Docking Bay). `known: false` means the read failed. */
  dock: { paired: number; pending: number; known: boolean };
  /** Agent workspace kill switch: true = terminal enabled; null = missing or unreadable. */
  workspaceEnabled: boolean | null;
  /** Separate OMNI cloud sandbox on Railway (names/state only, never values). */
  sandbox: { configured: boolean; enabled: boolean; problem: string | null; selfTestPassedAt: string | null };
};

/** Fail closed: an unreadable or missing controls row counts as engaged. */
export function stopState(
  row: { emergency_stop: boolean; changed_at: string; reason: string } | null,
  readFailed: boolean,
): Snapshot["emergencyStop"] {
  if (readFailed || !row)
    return { engaged: true, known: !readFailed, changedAt: row?.changed_at ?? null, reason: "" };
  return {
    engaged: row.emergency_stop !== false,
    known: true,
    changedAt: row.changed_at,
    reason: row.reason,
  };
}

export function stopReleased(
  row: { emergency_stop: boolean } | null | undefined,
  readFailed: boolean,
): boolean {
  return !readFailed && row?.emergency_stop === false;
}

export const EMERGENCY_STOP_MESSAGE =
  "Emergency Stop is engaged. Release it in OMNI Terminal with fresh two-factor before any Jackboy request.";

export function approvedThrough(rows: ApprovalRow[], step: number, now: number): boolean {
  return rows.filter((r) => r.step <= step).every((r) => isEffectivelyApproved(r, now));
}

export function nextApprovalStep(rows: ApprovalRow[], now: number): number | null {
  return rows.find((r) => !isEffectivelyApproved(r, now))?.step ?? null;
}

export type Readiness = "ready" | "partial" | "not_ready" | "unknown";
export type Capability = {
  id: "link" | "self_test" | "code" | "autonomy" | "text_agent" | "observatory";
  label: string;
  readiness: Readiness;
  readinessNote: string;
  authorized: boolean;
  authorizationNote: string;
  evidence: string;
  state: "Off" | "Blocked" | "Available" | "Running on schedule" | "Paused";
};

function when(iso: string | null) {
  return iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never";
}

/** Latest link events from the audit trail. A 'connecting' without a later 'connected' did not complete. */
export function linkEvidence(audit: AuditRow[]) {
  const link = audit
    .filter((a) => a.record_type === "jackboy_link")
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const lastAttempt = link.find((a) => a.action === "connecting") ?? null;
  const lastConnected = link.find((a) => a.action === "connected") ?? null;
  const lastSelfTest = link.find((a) => a.action === "self_test_passed") ?? null;
  const completed =
    lastAttempt !== null &&
    lastConnected !== null &&
    lastConnected.occurred_at >= lastAttempt.occurred_at;
  return {
    lastAttemptAt: lastAttempt?.occurred_at ?? null,
    lastConnectedAt: lastConnected?.occurred_at ?? null,
    lastAttemptFailed: lastAttempt !== null && !completed,
    lastSelfTestPassedAt: lastSelfTest?.occurred_at ?? null,
  };
}

export function autonomyBlockers(s: Snapshot): string[] {
  const out: string[] = [];
  if (!EXECUTOR_AVAILABLE) out.push("No executor or host companion is connected.");
  if (!approvedThrough(s.approvals, ACTIVATION_STEPS.length, s.now))
    out.push(
      `Activation steps are not all approved (next: step ${nextApprovalStep(s.approvals, s.now)}).`,
    );
  if (s.emergencyStop.engaged) out.push("Emergency Stop is engaged.");
  if (!s.switches.linkEnabled) out.push("The Jackboy link switch is off.");
  return out;
}

export function capabilities(s: Snapshot): Capability[] {
  const present = (n: string) => s.settings.find((x) => x.name === n)?.present === true;
  const missing = LINK_REQUIRED_SETTINGS.filter((n) => !present(n));
  const ev = linkEvidence(s.audit);
  const linkReady = missing.length === 0 && s.originValid && s.ownerIdMatches === "match";
  const linkAuthorized =
    approvedThrough(s.approvals, 9, s.now) && s.switches.linkEnabled && !s.emergencyStop.engaged;
  const selfTestAuthorized =
    approvedThrough(s.approvals, 7, s.now) &&
    s.switches.linkEnabled &&
    s.switches.selfTestEnabled &&
    !s.emergencyStop.engaged;
  const linkReadinessNote =
    missing.length > 0
      ? `Missing: ${missing.join(", ")}.`
      : !s.originValid
        ? "The Railway address is not a public HTTPS address."
        : s.ownerIdMatches !== "match"
          ? "JACKBOY_LINK_MOTHERSHIP_OWNER_ID does not match your owner account."
          : s.expirySet
            ? "All settings present."
            : `All settings present; ${LINK_DEFERRED_SETTING} waits for step 7.`;
  const stopNote = s.emergencyStop.engaged ? " Emergency Stop engaged." : "";
  const autonomyBlocked = autonomyBlockers(s);
  return [
    {
      id: "link",
      label: "Jackboy link (existing Railway service)",
      readiness: linkReady
        ? "ready"
        : missing.length < LINK_REQUIRED_SETTINGS.length
          ? "partial"
          : "not_ready",
      readinessNote: linkReadinessNote,
      authorized: linkAuthorized,
      authorizationNote: linkAuthorized
        ? "Steps 1–9 approved, switch on, Emergency Stop released."
        : `Needs steps 1–9 approved and JACKBOY_LINK_ENABLED on.${stopNote}`,
      evidence: ev.lastConnectedAt
        ? `Last verified handshake ${when(ev.lastConnectedAt)}.${ev.lastAttemptFailed ? ` A later attempt (${when(ev.lastAttemptAt)}) did not complete.` : ""}`
        : ev.lastAttemptAt
          ? `Attempt ${when(ev.lastAttemptAt)} did not complete. No verified connection.`
          : "No handshake has ever been recorded. Connection not verified.",
      state: linkAuthorized ? "Available" : "Off",
    },
    {
      id: "self_test",
      label: "Protocol self-test",
      readiness: linkReady ? "ready" : "not_ready",
      readinessNote: linkReady ? "Link settings ready." : "Link settings are not ready.",
      authorized: selfTestAuthorized,
      authorizationNote: selfTestAuthorized
        ? "Steps 1–7 approved and both switches on."
        : `Needs steps 1–7 approved, link and self-test switches on.${stopNote}`,
      evidence: "Not run from this terminal. Record the result at approval step 8.",
      state: selfTestAuthorized ? "Available" : "Off",
    },
    {
      id: "code",
      label: "CODE (generate · edit · test · debug)",
      readiness: "unknown",
      readinessNote: "CODE is configured on Railway; its key and switch are not visible here.",
      authorized: false,
      authorizationNote: approvedThrough(s.approvals, 10, s.now)
        ? "Step 10 recorded, but Mothership has no CODE request path yet."
        : "Needs step 10 (with the $10 cap and $5 daily limit) and a CODE request path that is not built yet.",
      evidence: "No CODE request has been sent from Mothership. Tasks are held only.",
      state: "Off",
    },
    {
      id: "autonomy",
      label: "Autonomous mode",
      readiness: EXECUTOR_AVAILABLE ? "partial" : "not_ready",
      readinessNote: EXECUTOR_AVAILABLE ? "Executor connected." : "No executor or host companion.",
      authorized: false,
      authorizationNote: autonomyBlocked.join(" "),
      evidence: "Never turned on. No autonomous job has run.",
      state: "Off",
    },
    {
      id: "text_agent",
      label: "OMNI text agent (Lovable AI)",
      readiness: s.textAgent.providerConfigured ? "ready" : "not_ready",
      readinessNote: s.textAgent.providerConfigured
        ? "AI service connected."
        : "AI service key missing.",
      authorized: s.textAgent.aiApproved && !s.textAgent.paused,
      authorizationNote: s.textAgent.paused
        ? "Your account is paused."
        : s.textAgent.aiApproved
          ? "AI use approved for your account. Each request still needs your consent."
          : "AI use is not approved for your account yet.",
      evidence: s.textAgent.completedRuns
        ? `${s.textAgent.completedRuns} completed run(s); last ${when(s.textAgent.lastRunAt)}.`
        : s.textAgent.lastRunAt
          ? `No completed run. Last attempt ${when(s.textAgent.lastRunAt)} ended ${s.textAgent.lastRunStatus}.`
          : "No run recorded yet.",
      state: s.textAgent.paused
        ? "Paused"
        : s.textAgent.providerConfigured && s.textAgent.aiApproved
          ? "Available"
          : "Blocked",
    },
    {
      id: "observatory",
      label: "Razul public-feed observatory",
      readiness: "ready",
      readinessNote: "Scheduled feed collection is set up.",
      authorized: !s.razul.paused,
      authorizationNote: s.razul.paused
        ? "Paused by you."
        : "Running on its schedule (public feeds only).",
      evidence: s.razul.lastRunAt
        ? `Last run ${when(s.razul.lastRunAt)}: ${s.razul.lastRunStatus}.`
        : "No run recorded.",
      state: s.razul.paused ? "Paused" : "Running on schedule",
    },
  ];
}

export type AgentStatus = {
  id: TaskAgent | "omerta" | "honeycomb";
  name: string;
  status: string;
  note: string;
};

export function agentRegistry(s: Snapshot): AgentStatus[] {
  const caps = capabilities(s);
  const link = caps.find((c) => c.id === "link")!;
  const obs = caps.find((c) => c.id === "observatory")!;
  return [
    { id: "razul", name: AGENT_LABEL.razul, status: obs.state, note: obs.evidence },
    {
      id: "jackboy",
      name: AGENT_LABEL.jackboy,
      status: link.authorized ? "Link available" : "Link off",
      note: `${link.evidence} Readiness: ${link.readinessNote}`,
    },
    {
      id: "jax",
      name: AGENT_LABEL.jax,
      status: "Not enrolled",
      note: "No passport or link. Stays isolated from Honeycomb Vault.",
    },
    {
      id: "sabrina",
      name: AGENT_LABEL.sabrina,
      status: "Concept",
      note: "Browser-only workspace. Sends nothing.",
    },
    {
      id: "guardian",
      name: AGENT_LABEL.guardian,
      status: "Partial",
      note: "Owner/MFA and default-deny checks run on the server; no live Guardian service.",
    },
    {
      id: "hercules",
      name: AGENT_LABEL.hercules,
      status: "Not connected",
      note: "No project node or health address registered.",
    },
    {
      id: "honeycomb",
      name: "Honeycomb Terminal (OMNI mobile branch)",
      status: "Docks via Docking Bay",
      note: "Pairs with a one-time code and its own device key; live state is on the Docking Bay page. Its dock screen is not built yet.",
    },
    {
      id: "omerta",
      name: "Other OMERTA-ROW agents",
      status: "Not enrolled",
      note: "Each needs a passport and a scoped, revocable identity first.",
    },
  ];
}

// ---------------------------------------------------------------- commands

export type CommandResult = {
  outcome: "ok" | "blocked" | "denied" | "error";
  lines: string[];
  effect?: "engage_stop" | "probe";
};

export const HELP_LINES = [
  "help        list commands",
  "status      readiness vs authorization for each capability",
  "health      settings, switches, two-factor and last checks",
  "approvals   activation checklist progress",
  "agents      agent registry",
  "queue       held tasks",
  "history     recent terminal entries",
  "ping        check the Railway service answers (no credentials sent)",
  "stop        engage the Emergency Stop",
  "autonomy    show autonomous mode (on is unavailable)",
  "clear       clear this screen",
];

const SHELL_LIKE =
  /^(sudo|rm|mv|cp|curl|wget|bash|sh|zsh|ssh|scp|git|npm|npx|bun|node|python|pip|chmod|chown|kill|docker|kubectl|railway|eval|exec|cat|ls|cd)\b|[;&|`$<>]/i;
const EXECUTE_LIKE =
  /^(run|start|deploy|publish|release|send|execute|merge|push|enable|activate|unlock|code)\b/i;

export function normalizeCommand(raw: string) {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function respond(raw: string, s: Snapshot): CommandResult {
  const cmd = normalizeCommand(raw);
  if (noteProblem(raw))
    return {
      outcome: "denied",
      lines: ["That looks like a key or token. It was not recorded. Never paste secrets here."],
    };
  if (cmd === "help" || cmd === "?") return { outcome: "ok", lines: HELP_LINES };
  if (cmd === "status")
    return {
      outcome: "ok",
      lines: [
        `Emergency Stop: ${s.emergencyStop.engaged ? "ENGAGED" : "released"}`,
        ...capabilities(s).map(
          (c) =>
            `${c.label}: ${c.state} · ready=${c.readiness} · authorized=${c.authorized ? "yes" : "no"}`,
        ),
      ],
    };
  if (cmd === "health") {
    const present = s.settings.filter((x) => x.present).length;
    const ev = linkEvidence(s.audit);
    const lastPing = s.log.find((l) => normalizeCommand(l.command) === "ping");
    return {
      outcome: "ok",
      lines: [
        `Link settings: ${present}/${s.settings.length} present (names only)${s.expirySet ? "" : `; ${LINK_DEFERRED_SETTING} unset until step 7`}.`,
        `Owner ID setting: ${s.ownerIdMatches}. Railway address: ${s.originValid ? "public HTTPS" : "missing or invalid"}.`,
        `Switches: link ${s.switches.linkEnabled ? "ON" : "off"}, self-test ${s.switches.selfTestEnabled ? "ON" : "off"}.`,
        `Two-factor: ${s.mfaAgeSeconds === null ? "no fresh check" : `verified ${Math.round(s.mfaAgeSeconds / 60)} min ago`}.`,
        `Last handshake: ${ev.lastConnectedAt ? when(ev.lastConnectedAt) : "none recorded"}${ev.lastAttemptFailed ? `; attempt ${when(ev.lastAttemptAt)} did not complete` : ""}.`,
        `Last ping: ${lastPing ? `${when(lastPing.created_at)} — ${lastPing.summary}` : "never"}.`,
      ],
    };
  }
  if (cmd === "approvals") {
    const done = s.approvals.filter((r) => isEffectivelyApproved(r, s.now)).length;
    const next = nextApprovalStep(s.approvals, s.now);
    const meta = ACTIVATION_STEPS.find((m) => m.step === next);
    return {
      outcome: "ok",
      lines: [
        `${done} of ${ACTIVATION_STEPS.length} steps approved.`,
        next ? `Next: step ${next} — ${meta?.title}.` : "All steps approved.",
        "Approvals are recorded on the Activation Approvals page.",
      ],
    };
  }
  if (cmd === "agents")
    return { outcome: "ok", lines: agentRegistry(s).map((a) => `${a.name}: ${a.status}`) };
  if (cmd === "queue") {
    const held = s.tasks.filter((t) => t.state === "held");
    return {
      outcome: "ok",
      lines: [
        `${held.length} held task(s). Held tasks are never sent; no dispatcher exists.`,
        ...held
          .slice(0, 5)
          .map(
            (t) =>
              `${t.id.slice(0, 8)} ${KIND_LABEL[t.kind as TaskKind] ?? t.kind} → ${AGENT_LABEL[t.agent as TaskAgent] ?? t.agent} · ${t.project_label}`,
          ),
      ],
    };
  }
  if (cmd === "history")
    return {
      outcome: "ok",
      lines: s.log.length
        ? s.log.slice(0, 10).map((l) => `${when(l.created_at)} [${l.outcome}] ${l.command}`)
        : ["No terminal entries yet."],
    };
  if (cmd === "ping") return { outcome: "ok", lines: [], effect: "probe" };
  if (cmd === "stop" || cmd === "emergency stop")
    return { outcome: "ok", lines: [], effect: "engage_stop" };
  if (cmd === "autonomy" || cmd === "autonomy off")
    return {
      outcome: "ok",
      lines: ["Autonomous mode: OFF.", ...autonomyBlockers(s).map((b) => `Blocked: ${b}`)],
    };
  if (cmd === "autonomy on")
    return {
      outcome: "blocked",
      lines: ["Autonomous mode stays OFF.", ...autonomyBlockers(s).map((b) => `Blocked: ${b}`)],
    };
  if (cmd === "release" || cmd === "release stop")
    return {
      outcome: "blocked",
      lines: [
        "Release the Emergency Stop with the button above. It needs fresh two-factor and a reason.",
      ],
    };
  if (SHELL_LIKE.test(cmd))
    return {
      outcome: "denied",
      lines: ["This terminal does not run shell or device commands. Nothing was executed."],
    };
  if (EXECUTE_LIKE.test(cmd))
    return {
      outcome: "blocked",
      lines: [
        "Execution is not available. CODE is off, autonomous mode is off and no executor is connected.",
        "Queue a held task in the CODE tab instead. Nothing was run.",
      ],
    };
  return { outcome: "error", lines: [`Unknown command "${cmd.slice(0, 40)}". Type help.`] };
}

/** Short single-line summary for the server log; never contains secrets (checked by caller and database). */
export function summarize(result: CommandResult) {
  return (result.lines[0] ?? "").slice(0, 500);
}

export type ProbeResult = {
  state:
    | "not_configured"
    | "invalid_origin"
    | "reachable"
    | "redirect"
    | "server_error"
    | "timeout"
    | "unreachable";
  status: number | null;
  ms: number | null;
};

export function describeProbe(p: ProbeResult): string {
  const t = p.ms === null ? "" : ` in ${p.ms} ms`;
  switch (p.state) {
    case "not_configured":
      return "Railway address is not set. Nothing was contacted.";
    case "invalid_origin":
      return "Railway address is not a public HTTPS address. Nothing was contacted.";
    case "reachable":
      return `Railway service answered over HTTPS (HTTP ${p.status})${t}. This proves reachability only, not the link, sign-in or approval.`;
    case "redirect":
      return `Railway service answered with a redirect (HTTP ${p.status})${t}; redirects are refused.`;
    case "server_error":
      return `Railway service answered with an error (HTTP ${p.status})${t}.`;
    case "timeout":
      return "Railway service did not answer within 5 seconds.";
    default:
      return "Railway service could not be reached (network or certificate error).";
  }
}

// ---------------------------------------------------------------- readiness

/** Same 24-hour window the agent workspace gate uses. */
export const SELF_TEST_WINDOW_MS = 24 * 3600_000;

export const TERMINAL_STATES = [
  "stopped",
  "unauthorized",
  "disconnected",
  "unpaired",
  "read_only",
] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];
export type PrimaryState = Exclude<TerminalState, "unpaired" | "read_only"> | "ready";
export const TERMINAL_STATE_LABEL: Record<TerminalState | "ready", { title: string; detail: string }> = {
  stopped: {
    title: "Stopped",
    detail: "Emergency Stop is engaged or the terminal kill switch is off. Nothing can be sent.",
  },
  unauthorized: {
    title: "Not authorized",
    detail: "The cloud sandbox switch (OMNI_SANDBOX_ENABLED) is off.",
  },
  disconnected: {
    title: "Not connected",
    detail: "The cloud sandbox is not set up, or its self-test has not passed in the last 24 hours.",
  },
  unpaired: {
    title: "No device docked",
    detail: "No desktop or mobile OMNI branch is paired in the Docking Bay. The web cloud shell does not need one.",
  },
  read_only: {
    title: "Read-only",
    detail: "Commands cannot run yet. This status terminal only reads Mothership records.",
  },
  ready: {
    title: "Cloud shell ready",
    detail: "Commands run in the isolated sandbox on Railway, one at a time, only after you approve each one. Autonomy is off.",
  },
};

export type ReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /** Who can fix it: here in Mothership, in Lovable settings, or outside (Railway/OMNI/device). */
  where: "here" | "settings" | "external";
  link?: "/activation-approvals" | "/omni-dock" | "/account-security";
};

export function terminalReadiness(s: Snapshot): {
  primary: PrimaryState;
  conditions: Record<TerminalState, boolean>;
  items: ReadinessItem[];
} {
  const present = (n: string) => s.settings.find((x) => x.name === n)?.present === true;
  const missing = LINK_REQUIRED_SETTINGS.filter((n) => !present(n));
  const ev = linkEvidence(s.audit);
  const selfTestFresh =
    s.sandbox.selfTestPassedAt !== null &&
    s.now - Date.parse(s.sandbox.selfTestPassedAt) <= SELF_TEST_WINDOW_MS;
  const approved = s.approvals.filter((r) => isEffectivelyApproved(r, s.now)).length;
  const allApproved = approvedThrough(s.approvals, ACTIVATION_STEPS.length, s.now);
  const linkSettingsReady = missing.length === 0 && s.originValid && s.ownerIdMatches === "match";
  const stopped = s.emergencyStop.engaged || s.workspaceEnabled !== true;
  const unauthorized = !s.sandbox.enabled;
  const disconnected = !s.sandbox.configured || !selfTestFresh;
  const conditions: Record<TerminalState, boolean> = {
    stopped,
    unauthorized,
    disconnected,
    unpaired: !s.dock.known || s.dock.paired === 0,
    read_only: stopped || unauthorized || disconnected,
  };
  const primary: PrimaryState = stopped ? "stopped" : unauthorized ? "unauthorized" : disconnected ? "disconnected" : "ready";
  const items: ReadinessItem[] = [
    {
      id: "owner",
      label: "Owner signed in with a two-step code",
      ok: true,
      detail:
        s.mfaAgeSeconds === null
          ? "Signed in at two-step level."
          : `Code confirmed ${Math.round(s.mfaAgeSeconds / 60)} min ago.`,
      where: "here",
    },
    {
      id: "stop",
      label: "Emergency Stop released",
      ok: !s.emergencyStop.engaged,
      detail: s.emergencyStop.engaged
        ? s.emergencyStop.known
          ? "Engaged. Release it above with a fresh code and a reason."
          : "Could not be read, so it counts as engaged."
        : "Released. Releasing turns nothing on by itself.",
      where: "here",
    },
    {
      id: "kill_switch",
      label: "Terminal kill switch enabled",
      ok: s.workspaceEnabled === true,
      detail:
        s.workspaceEnabled === null
          ? "Could not be read, so it counts as off."
          : s.workspaceEnabled
            ? "Enabled with a passkey."
            : "Off. Use “Enable terminal” in the agent workspace (needs your passkey).",
      where: "here",
    },
    {
      id: "sandbox_service",
      label: "Cloud sandbox service deployed on Railway",
      ok: s.sandbox.configured,
      detail: s.sandbox.configured
        ? "Settings present (values never shown)."
        : "Deploy the sandbox service (see the backend guide), then add its settings here.",
      where: "external",
    },
    {
      id: "sandbox_settings",
      label: "Cloud sandbox settings and switch",
      ok: s.sandbox.configured && s.sandbox.enabled,
      detail: s.sandbox.problem
        ? s.sandbox.problem
        : s.sandbox.enabled
          ? "OMNI_SANDBOX_ENABLED is on."
          : "OMNI_SANDBOX_ENABLED is off.",
      where: "settings",
    },
    {
      id: "sandbox_self_test",
      label: "Sandbox self-test passed (last 24 h)",
      ok: selfTestFresh,
      detail: s.sandbox.selfTestPassedAt
        ? `Last passed ${when(s.sandbox.selfTestPassedAt)}${selfTestFresh ? "." : " — older than 24 hours."}`
        : "Never passed. Run it from the agent workspace; it checks isolation, limits and providers.",
      where: "here",
    },
    {
      id: "dock",
      label: "Desktop or mobile branch docked (optional)",
      ok: s.dock.known && s.dock.paired > 0,
      detail: !s.dock.known
        ? "Docking Bay could not be read."
        : s.dock.paired
          ? `${s.dock.paired} paired device(s).`
          : s.dock.pending
            ? `${s.dock.pending} device(s) waiting for your approval.`
            : "None paired. Needed only for the CLI or Honeycomb, not the web cloud shell.",
      where: "here",
      link: "/omni-dock",
    },
    {
      id: "approvals",
      label: `Jackboy/CODE activation approvals (${approved} of ${ACTIVATION_STEPS.length})`,
      ok: allApproved,
      detail: allApproved
        ? "All steps approved."
        : `Next: step ${nextApprovalStep(s.approvals, s.now)}. Needed for Jackboy CODE, not the cloud shell.`,
      where: "here",
      link: "/activation-approvals",
    },
    {
      id: "jackboy_link",
      label: "Jackboy link settings and handshake",
      ok: linkSettingsReady && ev.lastConnectedAt !== null,
      detail: !linkSettingsReady
        ? missing.length
          ? `Missing: ${missing.join(", ")}.`
          : "Jackboy link address or owner ID does not check out."
        : ev.lastConnectedAt
          ? `Last verified handshake ${when(ev.lastConnectedAt)}.`
          : "Settings present; no verified handshake recorded.",
      where: "external",
    },
  ];
  return { primary, conditions, items };
}

export type LockInput = {
  signedIn: boolean;
  emailVerified: boolean;
  /** null = could not be checked */
  isOwner: boolean | null;
  aal: "aal1" | "aal2" | null;
  hasVerifiedTotp: boolean;
};
export type LockReason = {
  id:
    | "signed_out"
    | "email_unverified"
    | "not_owner"
    | "no_authenticator"
    | "code_needed"
    | "server_refused";
  title: string;
  detail: string;
};

/** Why the owner-only terminal refused this browser. Order matters: first failing gate wins. */
export function lockReason(i: LockInput): LockReason {
  if (!i.signedIn)
    return { id: "signed_out", title: "Not signed in", detail: "Sign in with the owner account." };
  if (!i.emailVerified)
    return {
      id: "email_unverified",
      title: "Email not confirmed",
      detail: "Confirm the owner email address from the message you were sent, then sign in again.",
    };
  if (i.isOwner === false)
    return {
      id: "not_owner",
      title: "Not the owner account",
      detail: "This terminal is private to the owner. Sign in with the owner account.",
    };
  if (!i.hasVerifiedTotp)
    return {
      id: "no_authenticator",
      title: "Two-step sign-in not set up",
      detail:
        "Set up an authenticator app on Account security, confirm one code, and save your recovery codes.",
    };
  if (i.aal !== "aal2")
    return {
      id: "code_needed",
      title: "Enter your authenticator code",
      detail: "This session was opened without a two-step code. Enter the 6-digit code below.",
    };
  return {
    id: "server_refused",
    title: "The server did not confirm access",
    detail:
      "Your account checks look right in this browser, but the server refused or could not be reached. Retry; if it persists, sign out and in again.",
  };
}
