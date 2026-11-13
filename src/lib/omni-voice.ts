/**
 * Voice chat rules for the OMNI orb dashboard. Pure and SSR-safe.
 *
 * Every speaking agent is identified by its own verified name. A message is
 * only ever routed to an agent that has a real connected chat path on this
 * page; an unconnected agent can be selected to see its status, but nothing
 * typed or spoken is sent anywhere under its name, and OMNI never answers in
 * its place.
 */

export type VoiceAgentId = "omni" | "jackboy";

export interface VoiceAgent {
  id: VoiceAgentId;
  /** Verified display and spoken name. */
  name: string;
  /** Where this agent's chat actually lives. */
  site: string;
  /** Connected chat path on this page, or null when not connected here. */
  chatPath: "/api/omni-agent" | null;
  /** Plain-language reason shown when there is no connected path. */
  unavailableReason: string | null;
}

export const VOICE_AGENTS: readonly VoiceAgent[] = [
  {
    id: "omni",
    name: "OMNI",
    site: "Orbiting Minds Mothership",
    chatPath: "/api/omni-agent",
    unavailableReason: null,
  },
  {
    id: "jackboy",
    name: "Jackboy",
    site: "Jackboy Dev Control",
    chatPath: null,
    unavailableReason:
      "Jackboy's chat runs in Jackboy Dev Control and is not connected to this page. Nothing typed or spoken here reaches Jackboy, and OMNI will not answer as Jackboy.",
  },
] as const;

export function voiceAgent(id: VoiceAgentId): VoiceAgent {
  const agent = VOICE_AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${String(id)}`);
  return agent;
}

/** Label shown above a message: always the agent that actually produced it. */
export function speakerLabel(role: "user" | "assistant", agentId: VoiceAgentId): string {
  return role === "user" ? "YOU" : voiceAgent(agentId).name.toUpperCase();
}

export interface SendGate {
  aiApproved: boolean;
  paused: boolean;
  hasProject: boolean;
  consent: boolean;
}

/** Whether a message may be sent to this agent right now, with the reason if not. */
export function canSendTo(
  agentId: VoiceAgentId,
  gate: SendGate,
): { ok: true } | { ok: false; reason: string } {
  const agent = voiceAgent(agentId);
  if (!agent.chatPath) return { ok: false, reason: agent.unavailableReason ?? "Not connected." };
  if (!gate.aiApproved) return { ok: false, reason: "Waiting for founder AI approval." };
  if (gate.paused) return { ok: false, reason: "Paused by Guardian or account pause." };
  if (!gate.hasProject) return { ok: false, reason: "Select a private project first." };
  if (!gate.consent) return { ok: false, reason: "Tick the consent box to send." };
  return { ok: true };
}

/**
 * Spoken when the active agent changes or voice replies are switched on.
 * An unconnected agent is never voiced as if it were speaking.
 */
export function introFor(agentId: VoiceAgentId): string {
  const agent = voiceAgent(agentId);
  if (!agent.chatPath)
    return `${agent.name} is not connected on this page. Messages here will not reach ${agent.name}.`;
  return `You are now speaking with ${agent.name}, on ${agent.site}.`;
}

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "unavailable";

export function orbState(input: {
  agentConnected: boolean;
  listening: boolean;
  speaking: boolean;
  busy: boolean;
}): OrbState {
  if (!input.agentConnected) return "unavailable";
  if (input.listening) return "listening";
  if (input.speaking) return "speaking";
  if (input.busy) return "thinking";
  return "idle";
}

export const ORB_STATE_TEXT: Record<OrbState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Waiting for the model",
  speaking: "Speaking",
  unavailable: "Not connected here",
};

const MAX_SPOKEN = 1200;

/** Turns a markdown reply into short plain text for the browser voice. */
export function speakableText(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " Code shown on screen. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= MAX_SPOKEN) return text;
  const cut = text.slice(0, MAX_SPOKEN);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${end > 200 ? cut.slice(0, end + 1) : cut} The rest is on screen.`;
}
