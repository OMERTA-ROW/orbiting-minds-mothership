import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cloudAccountEvidence, confirmedWrite } from "./persistence-evidence";
import {
  CLOUD_PROVIDERS,
  checkableWebsite,
  cloudInput,
  directoryInput,
  discoverRepos,
  idInput,
  settingsInput,
  type CloudProvider,
} from "./evolution-control";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
  claims: Record<string, unknown>;
};

async function owner(context: Ctx) {
  setResponseHeader("Cache-Control", "private, no-store");
  const { requireRazulOwner } = await import("./razul-owner.server");
  await requireRazulOwner(context.supabase, context.userId, context.claims);
}

export const readControlCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const checkedAt = new Date().toISOString();
    try {
      await owner(context);
    } catch {
      return {
        ok: false as const,
        checkedAt,
        message:
          "Verified owner access and two-step sign-in are required. Open Account Security, confirm your authenticator, then retry.",
      };
    }
    const db = context.supabase;
    const [dir, repos, runs, cloud, settings] = await Promise.all([
      db
        .from("evolution_directory")
        .select("*")
        .eq("owner_id", context.userId)
        .order("name")
        .limit(1000),
      db
        .from("evolution_github_repos")
        .select("*")
        .eq("owner_id", context.userId)
        .order("full_name")
        .limit(5000),
      db
        .from("evolution_github_sync_runs")
        .select("*")
        .eq("owner_id", context.userId)
        .order("started_at", { ascending: false })
        .limit(5),
      db
        .from("evolution_cloud_connections")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at")
        .limit(1000),
      db.from("evolution_settings").select("*").eq("owner_id", context.userId).maybeSingle(),
    ]);
    const err = dir.error ?? repos.error ?? runs.error ?? cloud.error ?? settings.error;
    if (err)
      return {
        ok: false as const,
        checkedAt,
        message: "Private project records could not be read. Retry.",
      };
    return {
      ok: true as const,
      checkedAt,
      directory: dir.data ?? [],
      repos: repos.data ?? [],
      runs: runs.data ?? [],
      cloud: cloud.data ?? [],
      settings: settings.data ?? { clone_all_opt_in: false, github_orgs: ["OMERTA-ROW"] },
      setup: {
        github: Boolean(process.env["GITHUB_API_KEY"] && process.env["LOVABLE_API_KEY"]),
        credentials: Object.fromEntries(
          (Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => [
            p,
            Boolean(process.env[CLOUD_PROVIDERS[p].secret]),
          ]),
        ) as Record<CloudProvider, boolean>,
        executor: false,
      },
    };
  });

export const importGithubRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await owner(context);
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const ghKey = process.env["GITHUB_API_KEY"];
    if (!lovableKey || !ghKey)
      throw new Error(
        "GitHub is not connected to this project. Connect GitHub in Connectors, then retry.",
      );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await context.supabase
      .from("evolution_settings")
      .select("github_orgs")
      .eq("owner_id", context.userId)
      .maybeSingle();
    const run = await supabaseAdmin
      .from("evolution_github_sync_runs")
      .insert({ owner_id: context.userId, status: "running" })
      .select("id")
      .single();
    if (run.error) throw new Error("The import could not be started. Retry.");
    const finish = (patch: Record<string, unknown>) =>
      supabaseAdmin
        .from("evolution_github_sync_runs")
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq("id", run.data.id)
        .eq("owner_id", context.userId)
        .select("id")
        .single();
    try {
      const result = await discoverRepos(
        async (path) => {
          const res = await fetch(`https://connector-gateway.lovable.dev/github${path}`, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": ghKey,
            },
            signal: AbortSignal.timeout(15000),
          });
          return { status: res.status, body: res.ok ? await res.json() : null };
        },
        settings.data?.github_orgs ?? ["OMERTA-ROW"],
      );
      const now = new Date().toISOString();
      const rows = result.repos.map((r) => ({
        owner_id: context.userId,
        github_repo_id: r.id,
        full_name: r.full_name,
        owner_login: r.owner.login,
        private: r.private,
        archived: Boolean(r.archived),
        default_branch: r.default_branch ?? null,
        html_url: r.html_url,
        pushed_at: r.pushed_at ?? null,
        size_kb: typeof r.size === "number" ? r.size : null,
        last_seen_at: now,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const up = await supabaseAdmin
          .from("evolution_github_repos")
          .upsert(rows.slice(i, i + 500), { onConflict: "owner_id,github_repo_id" });
        if (up.error) throw new Error("Repository metadata could not be stored.");
      }
      const status = result.errors.length && !rows.length ? "failed" : "succeeded";
      const finished = await finish({
        status,
        pages: result.pages,
        repos_seen: rows.length,
        sources: result.sources,
        error: result.errors.join("; ").slice(0, 500) || null,
      });
      confirmedWrite("Import outcome", finished);
      return { status, repos: rows.length, pages: result.pages, errors: result.errors };
    } catch {
      // Metadata may have been saved even when finalization failed. Never silently replay.
      await finish({ status: "failed", error: "Import interrupted or final outcome unconfirmed." });
      throw new Error(
        "GitHub import was not confirmed complete. Refresh saved records before retrying; some metadata may already be stored.",
      );
    }
  });

export const saveDirectoryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => directoryInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    const row = {
      name: data.name,
      lovable_project_id: data.lovableProjectId || null,
      website_url: data.websiteUrl || null,
      github_repo_id: data.githubRepoId,
      cloud_connection_id: data.cloudConnectionId || null,
      notes: data.notes,
    };
    const res = data.id
      ? await context.supabase
          .from("evolution_directory")
          .update(row)
          .eq("id", data.id)
          .eq("owner_id", context.userId)
          .select("id")
          .single()
      : await context.supabase
          .from("evolution_directory")
          .insert({ ...row, owner_id: context.userId })
          .select("id")
          .single();
    confirmedWrite("Project", res);
    return { saved: true };
  });

export const deleteDirectoryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    confirmedWrite(
      "Removal",
      await context.supabase
        .from("evolution_directory")
        .delete()
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .select("id")
        .single(),
    );
    return { removed: true };
  });

export const checkWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    const entry = await context.supabase
      .from("evolution_directory")
      .select("website_url")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    const url = entry.data?.website_url ? checkableWebsite(entry.data.website_url) : null;
    if (!url) throw new Error("Add a public https:// website address first.");
    let status = 0;
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      status = res.status;
      await res.body?.cancel();
    } catch {
      status = 0;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saved = await supabaseAdmin
      .from("evolution_directory")
      .update({ website_status: status, website_checked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .select("id")
      .single();
    confirmedWrite("Website check", saved);
    return { status };
  });

export const saveControlSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => settingsInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    const res = await context.supabase
      .from("evolution_settings")
      .upsert(
        {
          owner_id: context.userId,
          clone_all_opt_in: data.cloneAllOptIn,
          github_orgs: data.githubOrgs,
        },
        { onConflict: "owner_id" },
      )
      .select("owner_id")
      .single();
    confirmedWrite("Settings", res);
    return { saved: true };
  });

export const addCloudConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => cloudInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    confirmedWrite(
      "Cloud connection",
      await context.supabase
        .from("evolution_cloud_connections")
        .insert({ owner_id: context.userId, provider: data.provider, label: data.label })
        .select("id")
        .single(),
    );
    return { saved: true };
  });

export const removeCloudConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    confirmedWrite(
      "Removal",
      await context.supabase
        .from("evolution_cloud_connections")
        .delete()
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .select("id")
        .single(),
    );
    return { removed: true };
  });

/** Read-only account check with the server-held credential; never creates, deploys or changes anything. */
export const checkCloudConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ context, data }) => {
    await owner(context);
    const row = await context.supabase
      .from("evolution_cloud_connections")
      .select("provider")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (row.error || !row.data) throw new Error("Cloud connection not found.");
    const provider = row.data.provider as CloudProvider;
    const key = process.env[CLOUD_PROVIDERS[provider].secret];
    let status: "verified" | "failed" | "missing_credential";
    let detail: string;
    if (!key) {
      status = "missing_credential";
      detail = `Add ${CLOUD_PROVIDERS[provider].secret} in Project Settings → Secrets, then check again.`;
    } else {
      try {
        const res =
          provider === "vultr"
            ? await fetch("https://api.vultr.com/v2/account", {
                headers: { Authorization: `Bearer ${key}` },
                signal: AbortSignal.timeout(10000),
              })
            : await fetch("https://backboard.railway.com/graphql/v2", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({ query: "query { me { id } }" }),
                signal: AbortSignal.timeout(10000),
              });
        const body: unknown = await res.json().catch(() => null);
        const ok = res.ok && cloudAccountEvidence(provider, body);
        status = ok ? "verified" : "failed";
        detail = ok
          ? "Account reachable with read-only check."
          : `${CLOUD_PROVIDERS[provider].name} did not provide valid account evidence (HTTP ${res.status}). Check the credential and provider access, then retry.`;
      } catch {
        status = "failed";
        detail = `${CLOUD_PROVIDERS[provider].name} could not be reached. Retry later.`;
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saved = await supabaseAdmin
      .from("evolution_cloud_connections")
      .update({ status, detail, checked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .select("id")
      .single();
    confirmedWrite("Cloud account check", saved);
    return { status, detail };
  });
