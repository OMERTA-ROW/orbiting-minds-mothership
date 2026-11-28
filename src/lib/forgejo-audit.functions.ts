import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditMirrors } from "./forgejo-audit";

export const readForgejoIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    try {
      const { requireRazulOwner } = await import("./razul-owner.server");
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return { state: "denied" as const };
    }
    const { auditReader } = await import("./forgejo-audit.server");
    const env = {
      base: process.env["FORGEJO_BASE_URL"],
      token: process.env["FORGEJO_API_TOKEN"],
      accessId: process.env["CF_ACCESS_CLIENT_ID"],
      accessSecret: process.env["CF_ACCESS_CLIENT_SECRET"],
      lovableKey: process.env["LOVABLE_API_KEY"],
      githubKey: process.env["GITHUB_API_KEY"],
    };
    const deadline = Date.now() + 120_000;
    const reader = (provider: "forgejo" | "github") => {
      const read = auditReader(provider, env);
      return (path: string) =>
        Date.now() > deadline ? Promise.resolve({ status: 504, body: null }) : read(path);
    };
    return {
      state: "audited" as const,
      audit: await auditMirrors(reader("forgejo"), reader("github")),
    };
  });
