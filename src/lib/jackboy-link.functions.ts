import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertJackboyLinkScope, jackboyLinkRequestSchema } from "./jackboy-link-scope";

export const requestJackboyLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => jackboyLinkRequestSchema.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    // Fail closed: an engaged, missing or unreadable Emergency Stop refuses every link action.
    const { assertEmergencyStopReleased } = await import("./omni-terminal.server");
    await assertEmergencyStopReleased(context.supabase);
    assertJackboyLinkScope(data, context.userId, {
      owner: process.env["JACKBOY_LINK_MOTHERSHIP_OWNER_ID"],
      project: process.env["OMNI_LINK_PROJECT_ID"],
      approval: process.env["OMNI_LINK_APPROVAL_ID"],
      selfTestEnabled: process.env["JACKBOY_LINK_SELF_TEST_ENABLED"],
    });
    const { configuredJackboyLink, JackboyLink } = await import("./jackboy-link.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = new JackboyLink(await configuredJackboyLink(), async (event, jobId) => {
      const { error } = await supabaseAdmin.from("razul_control_audit").insert({
        actor_id: context.userId,
        action: event,
        record_type: "jackboy_link",
        record_id: jobId || data.approvalId,
      });
      if (error) throw new Error("Jackboy link audit failed; outcome may require reconciliation.");
    });
    if (data.action === "handshake") {
      await client.connect();
      return { state: "authenticated" as const };
    }
    if (!data.jobId) throw new Error("Job ID is required.");
    return client.execute(data.action, data.jobId);
  });
