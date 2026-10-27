import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAgentMembership, type OmniAgentRun } from "./omni-agent";

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
async function member(client: { rpc: unknown }) {
  const result = await (client.rpc as Rpc).call(client, "caller_role");
  if (result.error)
    throw new Error("Private owner/member setup is not activated. No agent request started.");
  assertAgentMembership(result.data);
}
export const readOmniAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await member(context.supabase);
    const result = await (context.supabase.rpc as unknown as Rpc).call(
      context.supabase,
      "list_omni_agent_runs",
      { _project: data.projectId },
    );
    if (result.error)
      throw new Error(
        "Saved agent runs are not available. The minimal agent setup must be activated first.",
      );
    return (result.data ?? []) as OmniAgentRun[];
  });
// Cancellation remains available to the authenticated owner even after membership/AI revocation.
export const cancelOmniAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const result = await (context.supabase.rpc as unknown as Rpc).call(
      context.supabase,
      "cancel_omni_agent_run",
      { _id: data.id },
    );
    if (result.error)
      throw new Error(
        "Cancellation was not saved. Stop the response too; do not assume the agent stopped.",
      );
    return result.data as OmniAgentRun;
  });
