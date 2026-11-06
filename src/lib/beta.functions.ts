import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { betaAgentInput, betaProjectInput } from "./beta";
import { z } from "zod";

export const readBeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [projects, agents, access, audit] = await Promise.all([
      context.supabase
        .from("beta_projects")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("beta_agent_profiles")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("beta_access")
        .select("ai_approved, paused")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("beta_audit")
        .select("*")
        .eq("owner_id", context.userId)
        .order("occurred_at", { ascending: false })
        .limit(30),
    ]);
    const error = projects.error || agents.error || access.error || audit.error;
    if (error) throw new Error("Private records could not be read. Please sign in again or retry.");
    return {
      projects: projects.data ?? [],
      agents: agents.data ?? [],
      access: access.data,
      audit: audit.data ?? [],
    };
  });
export const saveBetaProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => betaProjectInput.parse(v))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("beta_projects")
      .insert({ owner_id: context.userId, ...data })
      .select()
      .single();
    if (result.error) throw new Error("Project could not be saved. No success has been recorded.");
    return result.data;
  });
export const saveBetaAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => betaAgentInput.parse(v))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("beta_agent_profiles")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        name: data.name,
        provider: data.provider,
        model: data.model,
        scope: data.scope,
        operator_consent: data.consent,
        status: "Pending",
      })
      .select()
      .single();
    if (result.error)
      throw new Error("Agent declaration could not be saved in this account’s project.");
    return result.data;
  });
export const changeBetaPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ paused: z.boolean() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("beta_access")
      .update({ paused: data.paused })
      .eq("user_id", context.userId)
      .select("paused")
      .single();
    if (result.error)
      throw new Error("AI pause could not be saved. Do not assume requests are blocked.");
    return result.data;
  });
export const revokeBetaAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("beta_agent_profiles")
      .update({ status: "Revoked" })
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .select("id")
      .single();
    if (result.error) throw new Error("Declaration not found in your account.");
    return result.data;
  });
