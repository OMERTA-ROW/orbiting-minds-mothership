import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  autonomyTaskInput,
  goalProtectedHints,
  readinessFor,
  transition,
  type AutonomyTask,
} from "./omni-autonomy";

type Rpc = (name: string) => Promise<{ data: unknown; error: { message: string } | null }>;
async function callerRole(client: { rpc: unknown }) {
  const r = await (client.rpc as Rpc).call(client, "caller_role");
  return r.error ? null : r.data;
}

export const readAutonomyReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readinessFor(await callerRole(context.supabase), true));

// Server-side: authenticates, checks private membership, validates policy, then stops
// at "blocked" because no executor/host companion exists. Nothing is executed or saved.
export const submitAutonomyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => autonomyTaskInput.parse(input))
  .handler(async ({ data, context }): Promise<AutonomyTask> => {
    const ready = readinessFor(await callerRole(context.supabase), true);
    if (!ready.role) throw new Error("An assigned private membership is required. No task started.");
    const now = new Date().toISOString();
    let state = transition("draft", "awaiting_executor");
    const log = [{ at: now, state, note: `Policy accepted: ${data.allowlist.length} site(s), max ${data.maxSteps} steps.` }];
    state = transition(state, "blocked");
    log.push({ at: now, state, note: "Blocked: executor/host companion not connected. No action was taken." });
    return { id: data.requestId, goal: data.goal, state, log, hints: goalProtectedHints(data.goal), saved: false };
  });
