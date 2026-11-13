import { z } from "zod";
import { liveOmniInput } from "./beta";

/** Earlier saved turns the owner may attach to one request. Keep in sync with omni-chat MAX_CONTEXT_TURNS. */
const MAX_CONTEXT = 6;
export const omniAgentInput = liveOmniInput
  .extend({
    requestId: z.string().uuid(),
    contextTurns: z.number().int().min(0).max(MAX_CONTEXT).default(0),
  })
  .strict();
export const agentStates = [
  "queued",
  "running",
  "completed",
  "cancelled",
  "paused",
  "failed",
  "denied",
  "refused",
] as const;
export type AgentState = (typeof agentStates)[number];
export type OmniAgentRun = {
  id: string;
  project_id: string;
  status: AgentState;
  message: string;
  result: string;
  error_message: string | null;
  error_status: number | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  gateway_run_id: string | null;
  created_at: string;
  finished_at: string | null;
};
export type AgentEvent =
  | { type: "state"; id: string; status: AgentState }
  | { type: "text" | "thinking"; text: string }
  | { type: "result"; run: OmniAgentRun }
  /** Saved run IDs actually sent as context with this request. */
  | { type: "context"; ids: string[] }
  | { type: "error"; status: number; message: string };
export function assertAgentMembership(role: unknown) {
  if (role !== "owner" && role !== "admin" && role !== "tester")
    throw new Error(
      "An assigned private membership is required. Owner setup cannot be bypassed by AI approval.",
    );
}
export function isAgentTerminal(status: AgentState) {
  return status !== "queued" && status !== "running";
}
