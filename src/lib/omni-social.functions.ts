import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { socialAction, socialSave } from "./omni-platforms";

export const readSocialDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [rows, audit] = await Promise.all([
      context.supabase
        .from("omni_social_drafts")
        .select("*")
        .eq("owner_id", context.userId)
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("beta_audit")
        .select("*")
        .eq("owner_id", context.userId)
        .eq("capability", "omni_social_drafts")
        .order("occurred_at", { ascending: false })
        .limit(30),
    ]);
    if (rows.error || audit.error) throw new Error("Private social plans could not be read.");
    return { rows: rows.data ?? [], audit: audit.data ?? [] };
  });
export const saveSocialDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => socialSave.parse(v))
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("omni_social_transition", {
      _action: "save",
      _project: data.projectId,
      ...(data.id ? { _id: data.id } : {}),
      ...(data.revision ? { _revision: data.revision } : {}),
      _content: data.content,
      _approve: data.consent,
    });
    if (result.error)
      throw new Error(
        "Private draft save blocked; reload to check ownership, account pause or version changes. Nothing posted.",
      );
    return result.data;
  });
export const transitionSocialDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => socialAction.parse(v))
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("omni_social_transition", {
      _action: data.action,
      ...(data.id ? { _id: data.id } : {}),
      ...(data.revision ? { _revision: data.revision } : {}),
      _approve: data.approve ?? false,
    });
    if (result.error)
      throw new Error(
        "Draft action blocked; exact saved version, current consent and account access required. No platform action taken.",
      );
    return result.data;
  });
