import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { omniReadiness, type OmniReadinessInput } from "./omni-activation";

// Explicit read-only check. Never grants approval, creates accounts or calls a model.
export const readOmniActivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const identity = await context.supabase.auth.getUser();
    if (identity.error || !identity.data.user || identity.data.user.id !== context.userId) {
      throw new Error("Your session could not be revalidated. Sign in again.");
    }
    const rpc = context.supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: { code?: string } | null }>;
    const [access, projects, membership] = await Promise.all([
      context.supabase.from("beta_access").select("ai_approved, paused").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("beta_projects").select("id", { count: "exact", head: true }).eq("owner_id", context.userId),
      rpc.call(context.supabase, "caller_role"),
    ]);
    if (access.error || projects.error) throw new Error("Private permissions could not be checked. No request started.");
    const role: OmniReadinessInput["membership"] = membership.error ? "unavailable" :
      membership.data === "owner" || membership.data === "admin" || membership.data === "tester" ? membership.data : "unassigned";
    // Availability is service-managed. No account/project data is read with this client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = await supabaseAdmin.from("ai_gateway_state").select("blocked_status").eq("feature", "evolution-omni").maybeSingle();
    const { omniModel } = await import("./ai/omni-responses.server");
    return {
      ...omniReadiness({
        emailVerified: Boolean(identity.data.user.email_confirmed_at),
        aiApproved: access.data?.ai_approved === true,
        paused: access.data?.paused === true,
        ownedProjects: projects.count ?? 0,
        providerConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
        providerStateReadable: !state.error,
        providerBlocked: Boolean(state.data),
        membership: role,
      }),
      model: omniModel,
      checkedAt: new Date().toISOString(),
    };
  });