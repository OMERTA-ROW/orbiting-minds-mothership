import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evolutionConfigInput, evolutionProjectInput } from "./evolution";

export const readEvolutionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    return { owner: !role.error && role.data === true };
  });

export const readEvolutionWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const checkedAt = new Date().toISOString();
    const { requireRazulOwner } = await import("./razul-owner.server");
    try {
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return {
        ok: false as const,
        checkedAt,
        message:
          "Verified owner access and two-step sign-in are required. Open Account Security, confirm your authenticator, then retry.",
      };
    }
    const [projects, configs] = await Promise.all([
      context.supabase
        .from("beta_projects")
        .select("id, name, brief, created_at")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("evolution_project_configs")
        .select(
          "id, project_id, revision, source_url, branch, build_command, output_directory, created_at",
        )
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (projects.error || configs.error)
      return {
        ok: false as const,
        checkedAt,
        message:
          "Private project records could not be read. Retry; no operational status has been verified.",
      };
    return { ok: true as const, checkedAt, projects: projects.data, configs: configs.data };
  });

export const createEvolutionProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => evolutionProjectInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("evolution_project_create", {
      _name: data.name,
      _brief: data.brief,
    });
    if (result.error || !result.data)
      throw new Error("Project was not saved. Check owner access and retry.");
    return { projectId: result.data };
  });

export const saveEvolutionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => evolutionConfigInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const result = await context.supabase.rpc("evolution_config_save", {
      _project: data.projectId,
      _expected_revision: data.expectedRevision,
      _source: data.sourceUrl,
      _branch: data.branch,
      _command: data.buildCommand,
      _output: data.outputDirectory,
    });
    if (result.error || !result.data)
      throw new Error(
        result.error?.message.includes("Configuration changed")
          ? "Configuration changed in another session. Reload before saving; your revision was not written."
          : "Configuration was not saved. Check owner access and non-sensitive fields, then retry.",
      );
    return { revision: result.data.revision, createdAt: result.data.created_at };
  });
