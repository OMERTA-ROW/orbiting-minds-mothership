import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listForgejoRepos, type ForgejoResult } from "./forgejo";

export const readForgejoRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ForgejoResult | { state: "denied" }> => {
    setResponseHeader("Cache-Control", "private, no-store");
    try {
      const { requireRazulOwner } = await import("./razul-owner.server");
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return { state: "denied" };
    }
    return listForgejoRepos({
      base: process.env["FORGEJO_BASE_URL"],
      token: process.env["FORGEJO_API_TOKEN"],
      accessClientId: process.env["CF_ACCESS_CLIENT_ID"],
      accessClientSecret: process.env["CF_ACCESS_CLIENT_SECRET"],
    });
  });
