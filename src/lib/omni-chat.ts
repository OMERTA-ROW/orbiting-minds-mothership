/**
 * OMNI private chat rules. Pure and SSR-safe.
 *
 * Conversation history is the owner's own saved agent runs (already stored per
 * project). Earlier turns reach the model only when the owner picks a number
 * for that one request. Held-task handoffs reuse the OMNI Terminal task queue:
 * held only, nothing runs. Status text never claims a connection that was not
 * read from the server in this session.
 */
import type { AgentState, OmniAgentRun } from "./omni-agent";
import { AGENT_LABEL, KIND_LABEL, type TaskAgent, type TaskKind } from "./omni-terminal";
import type { ProviderState } from "./omni-voice";

export const MAX_CONTEXT_TURNS = 6;
export const CONTEXT_TURN_CHOICES = [0, 2, 4, 6] as const;
/** Each earlier reply is cut to this length before it is used as context. */
export const CONTEXT_REPLY_CHARS = 4000;

export type ContextMessage = { role: "user" | "assistant"; content: string };

/**
 * Earlier completed turns to send with one request, oldest first.
 * Skips the current request, unfinished/failed runs, empty replies and any
 * turn `isSafe` rejects.
 */
export function contextFromRuns(
  runs: readonly OmniAgentRun[],
  excludeId: string,
  max: number,
  isSafe: (text: string) => boolean = () => true,
): { ids: string[]; messages: ContextMessage[] } {
  const limit = Math.max(0, Math.min(MAX_CONTEXT_TURNS, Math.floor(max)));
  if (!limit) return { ids: [], messages: [] };
  const picked = [...runs]
    .filter(
      (r) =>
        r.id !== excludeId &&
        r.status === "completed" &&
        r.message.trim() &&
        r.result.trim() &&
        isSafe(`${r.message}\n${r.result}`),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .reverse();
  return {
    ids: picked.map((r) => r.id),
    messages: picked.flatMap((r) => [
      { role: "user" as const, content: r.message },
      { role: "assistant" as const, content: r.result.slice(0, CONTEXT_REPLY_CHARS) },
    ]),
  };
}

export type ChatTurn = {
  key: string;
  role: "user" | "assistant";
  text: string;
  /** Saved runs come only from the Mothership text agent, which is OMNI. */
  agent: "omni";
  runId: string | null;
  status: AgentState | null;
  at: string | null;
  model: string | null;
  /** True when read back from saved runs rather than this screen session. */
  saved: boolean;
  /** Saved turns that were sent as context with this request. */
  contextIds: string[];
  /** For assistant turns: the request it answered (used for handoff drafts). */
  request?: string;
};

/** Saved runs as chat turns, oldest first, minus any already shown live. */
export function savedTurns(runs: readonly OmniAgentRun[], hide: ReadonlySet<string>): ChatTurn[] {
  return [...runs]
    .filter((r) => !hide.has(r.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .flatMap((r) => [
      {
        key: `${r.id}:u`,
        role: "user" as const,
        text: r.message,
        agent: "omni" as const,
        runId: r.id,
        status: null,
        at: r.created_at,
        model: null,
        saved: true,
        contextIds: [],
      },
      {
        key: `${r.id}:a`,
        role: "assistant" as const,
        text: r.result,
        agent: "omni" as const,
        runId: r.id,
        status: r.status,
        at: r.finished_at ?? r.created_at,
        model: r.model,
        saved: true,
        contextIds: [],
        request: r.message,
      },
    ]);
}

export const RUN_STATUS_LABEL: Record<AgentState, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed · saved",
  cancelled: "Cancelled",
  paused: "Paused",
  failed: "Failed",
  denied: "Denied",
  refused: "Declined by model",
};

export type ChatStatus = {
  provider: string;
  model: string;
  providerConfigured: boolean;
  blockKnown: boolean;
  blocked: { status: number; message: string } | null;
};

/** Fail closed: unread or unknown status is never "ready". */
export function providerState(status: ChatStatus | undefined, readFailed: boolean): ProviderState {
  if (readFailed || !status) return "unknown";
  if (!status.providerConfigured) return "missing";
  if (!status.blockKnown || status.blocked) return "blocked";
  return "ready";
}

/** Models offered in the picker: only ones actually configured on the server. */
export function chatModels(status: ChatStatus | undefined): { id: string; label: string }[] {
  if (!status?.providerConfigured) return [];
  return [{ id: status.model, label: `${status.provider} · ${status.model}` }];
}

export type ConnectionState = "ready" | "blocked" | "not_connected" | "unknown" | "check";
export type ConnectionRow = { id: string; label: string; state: ConnectionState; detail: string };

export function chatConnections(input: {
  provider: ProviderState;
  status: ChatStatus | undefined;
  aiApproved: boolean;
  paused: boolean;
  dictation: boolean;
  voice: boolean;
}): ConnectionRow[] {
  const { provider, status } = input;
  const agentRow: ConnectionRow =
    provider === "unknown"
      ? {
          id: "text-agent",
          label: "OMNI text agent",
          state: "unknown",
          detail: "Status could not be read. Sending is off until it can.",
        }
      : provider === "missing"
        ? {
            id: "text-agent",
            label: "OMNI text agent",
            state: "not_connected",
            detail: "No model provider is set up on the server.",
          }
        : provider === "blocked"
          ? {
              id: "text-agent",
              label: "OMNI text agent",
              state: "blocked",
              detail: status?.blocked?.message ?? "Availability could not be checked.",
            }
          : !input.aiApproved
            ? {
                id: "text-agent",
                label: "OMNI text agent",
                state: "blocked",
                detail: "Waiting for founder AI approval.",
              }
            : input.paused
              ? {
                  id: "text-agent",
                  label: "OMNI text agent",
                  state: "blocked",
                  detail: "Paused by Guardian or account pause.",
                }
              : {
                  id: "text-agent",
                  label: "OMNI text agent",
                  state: "ready",
                  detail: `${status?.provider} · ${status?.model}. Text only, no tools.`,
                };
  return [
    agentRow,
    {
      id: "terminal",
      label: "OMNI terminal (Railway)",
      state: "check",
      detail: "Not checked here. Owner two-step code needed to check.",
    },
    {
      id: "jackboy",
      label: "Jackboy",
      state: "not_connected",
      detail: "Not connected to this chat. Hand off a held task instead.",
    },
    {
      id: "voice-in",
      label: "Voice input",
      state: input.dictation ? "ready" : "not_connected",
      detail: input.dictation
        ? "Browser dictation. Words appear for review; nothing sends itself."
        : "This browser has no dictation.",
    },
    {
      id: "voice-out",
      label: "Voice replies",
      state: input.voice ? "ready" : "not_connected",
      detail: input.voice
        ? "Browser voice, off until you turn it on."
        : "This browser has no voice.",
    },
  ];
}

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  ready: "Ready",
  blocked: "Blocked",
  not_connected: "Not connected",
  unknown: "Unknown",
  check: "Not checked",
};

/** Subset of the owner terminal snapshot this chat reads. */
export type TerminalStatusInput = {
  gate: { open: boolean; blockers: string[] };
  killSwitchEnabled: boolean | null;
  emergencyStopReleased: boolean;
  windows: readonly unknown[];
  spend: { task: number; day: number; total: number };
  agents: readonly {
    display_name: string;
    budget_day_cents: number;
    budget_total_cents: number;
    status: string;
  }[];
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function terminalSummary(s: TerminalStatusInput): { connected: boolean; lines: string[] } {
  const lines = [
    s.gate.open ? "Terminal relay: connected." : "Terminal relay: not connected.",
    ...(s.gate.open ? [] : s.gate.blockers.map((b) => `· ${b}`)),
    `Emergency Stop: ${s.emergencyStopReleased ? "released" : "engaged (nothing can be sent)"}.`,
    `Terminal switch: ${s.killSwitchEnabled === true ? "on" : "off or unreadable"}.`,
    s.windows.length
      ? `Autonomous mode: ${s.windows.length} window(s) open.`
      : "Autonomous mode: off.",
    `Spent: ${dollars(s.spend.day)} today, ${dollars(s.spend.total)} total.`,
    ...s.agents.map(
      (a) =>
        `${a.display_name}: limit ${dollars(a.budget_day_cents)}/day, ${dollars(a.budget_total_cents)} total (${a.status}).`,
    ),
  ];
  return { connected: s.gate.open && s.emergencyStopReleased, lines };
}

const PROJECT_MAX = 120;
const INSTRUCTIONS_MAX = 4000;

/** Editable starting text for a held task built from a chat reply. */
export function handoffDraft(input: { projectName: string; request: string; reply: string }) {
  const head = `From the OMNI chat. Owner request:\n${input.request.trim()}\n\nOMNI reply (suggestion only, not tested):\n`;
  const room = Math.max(0, INSTRUCTIONS_MAX - head.length);
  const reply = input.reply.trim();
  return {
    project: input.projectName.trim().slice(0, PROJECT_MAX) || "OMNI chat",
    instructions:
      head + (reply.length > room ? reply.slice(0, Math.max(0, room - 1)) + "…" : reply),
  };
}

/** CODE tasks always go to Jackboy; only plain handoffs choose the agent. */
export function handoffAgent(kind: TaskKind, agent: TaskAgent): TaskAgent {
  return kind === "agent.handoff" ? agent : "jackboy";
}

export type HeldTask = {
  id: string;
  kind: TaskKind;
  agent: TaskAgent;
  state: string;
  checkedAt: string | null;
  note: string;
};

export function heldTaskTitle(t: Pick<HeldTask, "kind" | "agent">): string {
  return `${KIND_LABEL[t.kind]} → ${AGENT_LABEL[t.agent]}`;
}

export const TASK_STATE_LABEL: Record<string, string> = {
  held: "Held · waiting for owner, nothing runs",
  cancelled: "Cancelled",
};

export function taskStateLabel(state: string): string {
  return TASK_STATE_LABEL[state] ?? state;
}
