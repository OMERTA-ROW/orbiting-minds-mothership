import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { neuroChangeInput, neuroRegisterInput } from "./neuro";

export const readNeuroRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    try {
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return {
        ok: false as const,
        message:
          "Verified owner access and two-step sign-in are required. Confirm your authenticator in Account Security, then retry.",
      };
    }
    const db = context.supabase;
    const [components, revisions, reviews] = await Promise.all([
      db
        .from("neuro_components")
        .select("*")
        .eq("owner_id", context.userId)
        .order("name")
        .limit(600),
      db
        .from("neuro_revisions")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("neuro_reviews")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (components.error || revisions.error || reviews.error)
      return {
        ok: false as const,
        message: "Private Neuro records could not be read. Retry; no connections were changed.",
      };
    return {
      ok: true as const,
      components: components.data ?? [],
      revisions: revisions.data ?? [],
      reviews: reviews.data ?? [],
    };
  });

export const registerNeuroEcosystem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("neuro_register_ecosystem");
    if (result.error)
      throw new Error("The ecosystem registry was not saved. Retry after owner verification.");
    return { count: result.data };
  });

export const registerNeuroComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => neuroRegisterInput.parse(i))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const r = await context.supabase.rpc("neuro_register", { p_key: data.key, p_name: data.name });
    if (r.error)
      throw new Error("The component was not registered. Check its name and unique pathway key.");
    return { id: r.data };
  });

export const changeNeuroProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => neuroChangeInput.parse(i))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const r = await context.supabase.rpc("neuro_change", {
      p_action: data.action,
      p_component: data.componentId,
      p_expected: data.expected,
      p_target: data.action === "propose" ? 0 : data.target,
      p_profile: data.action === "propose" ? data.profile : null,
      p_note:
        data.action === "propose"
          ? "Owner proposed metadata boundaries; not an integration grant."
          : data.note,
    });
    if (r.error) {
      const known = [
        "Active version changed",
        "Proposal is stale",
        "Scoped owner review required",
        "Rollback needs",
        "Integrity check failed",
      ];
      const message = known.find((s) => r.error.message.includes(s));
      throw new Error(
        message
          ? `${message}. Refresh and review before retrying.`
          : "The profile action was refused. Refresh, verify owner access and check the review evidence.",
      );
    }
    return { revision: r.data };
  });
