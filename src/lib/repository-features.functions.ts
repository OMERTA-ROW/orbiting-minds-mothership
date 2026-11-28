import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { featureInput } from "./repository-features";
import { listForgejoRepos } from "./forgejo";

export const readFeatureInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: "forgejo" | "github" }) => {
    if (input.provider !== "forgejo" && input.provider !== "github")
      throw new Error("Invalid provider");
    return input;
  })
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    try {
      const { requireRazulOwner } = await import("./razul-owner.server");
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return { state: "denied" as const };
    }
    if (data.provider === "github") {
      const { githubFeatureInventory } = await import("./repository-features.server");
      return githubFeatureInventory({
        lovableKey: process.env["LOVABLE_API_KEY"],
        githubKey: process.env["GITHUB_API_KEY"],
      });
    }
    return listForgejoRepos({
      base: process.env["FORGEJO_BASE_URL"],
      token: process.env["FORGEJO_API_TOKEN"],
      accessClientId: process.env["CF_ACCESS_CLIENT_ID"],
      accessClientSecret: process.env["CF_ACCESS_CLIENT_SECRET"],
    });
  });

export const readRepositoryFeatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => featureInput.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    try {
      const { requireRazulOwner } = await import("./razul-owner.server");
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return {
        state: "blocked" as const,
        message:
          "Verified owner access and two-step sign-in are required. Confirm your authenticator in Account Security, then retry.",
        rows: [],
      };
    }
    const env = {
      base: process.env["FORGEJO_BASE_URL"],
      token: process.env["FORGEJO_API_TOKEN"],
      accessId: process.env["CF_ACCESS_CLIENT_ID"],
      accessSecret: process.env["CF_ACCESS_CLIENT_SECRET"],
      lovableKey: process.env["LOVABLE_API_KEY"],
      githubKey: process.env["GITHUB_API_KEY"],
    };
    const { readRepositoryFeature, githubFeatureInventory } =
      await import("./repository-features.server");
    const repos =
      data.provider === "github"
        ? await githubFeatureInventory(env)
        : await listForgejoRepos({
            base: env.base,
            token: env.token,
            accessClientId: env.accessId,
            accessClientSecret: env.accessSecret,
          });
    if (repos.state !== "connected" || !repos.repos.some((r) => r.name === data.repo))
      return {
        state: "blocked" as const,
        message:
          "Repository is not in the current authorized gateway inventory, or that inventory could not be verified. Refresh Repositories first.",
        rows: [],
      };
    return readRepositoryFeature(data, env);
  });
