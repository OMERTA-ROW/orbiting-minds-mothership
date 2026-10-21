import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStudioAccess, MAX_MEDIA_BYTES, STUDIO_BUCKET, studioPath } from "./quantum";
import { forgeDigest, forgeId, forgeReviewInput, radioInput, webInput } from "./forge";

export const readForge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [versions, reviews] = await Promise.all([
      context.supabase
        .from("forge_versions")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase.from("forge_reviews").select("*").eq("owner_id", context.userId),
    ]);
    if (versions.error || reviews.error) throw new Error("Forge versions could not be read.");
    return { versions: versions.data ?? [], reviews: reviews.data ?? [] };
  });
export const createRadioVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => radioInput.parse(v))
  .handler(async ({ context, data }) => {
    const access = await context.supabase
      .from("beta_access")
      .select("studio_approved,paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (access.error) throw new Error("Permission check failed.");
    assertStudioAccess(access.data);
    const source = await context.supabase
      .from("studio_assets")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .eq("role", "original")
      .single();
    if (source.error) throw new Error("Select an original in your account.");
    const download = await context.supabase.storage
      .from(STUDIO_BUCKET)
      .download(studioPath(context.userId, data.id));
    if (
      download.error ||
      !download.data ||
      download.data.size > MAX_MEDIA_BYTES ||
      download.data.size !== source.data.byte_size
    )
      throw new Error("Source unavailable or reservation size mismatch.");
    const started = performance.now(),
      { editRadioWav } = await import("./forge-radio");
    const result = editRadioWav(new Uint8Array(await download.data.arrayBuffer()), data.settings),
      sha256 = await forgeDigest(result.bytes);
    const current = await context.supabase
      .from("beta_access")
      .select("studio_approved,paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (current.error) throw new Error("Permission recheck failed.");
    assertStudioAccess(current.data);
    const asset = await context.supabase
      .from("studio_assets")
      .insert({
        owner_id: context.userId,
        project_id: source.data.project_id,
        source_id: data.id,
        role: "enhanced",
        gain_db: 0,
        byte_size: result.bytes.length,
        rights_consent: true,
        privacy_consent: true,
        sha256,
        metrics: result.report,
      })
      .select()
      .single();
    if (asset.error)
      throw new Error(
        "Output reservation blocked. Original unchanged; check the eight-file limit.",
      );
    const uploaded = await context.supabase.storage
      .from(STUDIO_BUCKET)
      .upload(
        studioPath(context.userId, asset.data.id),
        new Blob([new Uint8Array(result.bytes)], { type: "audio/wav" }),
        { contentType: "audio/wav", upsert: false },
      );
    if (uploaded.error) {
      await context.supabase
        .from("studio_assets")
        .delete()
        .eq("id", asset.data.id)
        .eq("owner_id", context.userId);
      throw new Error(
        "Radio upload failed. Original unchanged; inspect reservations before retrying.",
      );
    }
    // Derived immutable output metadata is privileged; source ownership and account access were verified above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const version = await supabaseAdmin
      .from("forge_versions")
      .insert({
        owner_id: context.userId,
        project_id: source.data.project_id,
        kind: "radio",
        revision: 1,
        source_id: data.id,
        output_id: asset.data.id,
        content: data.settings,
        sha256,
        processor: "PCM radio v1 / wavefile",
        evidence: { ...result.report, elapsedMs: Math.round(performance.now() - started) },
      })
      .select()
      .single();
    if (version.error) {
      const removed = await context.supabase.storage
        .from(STUDIO_BUCKET)
        .remove([studioPath(context.userId, asset.data.id)]);
      if (!removed.error)
        await context.supabase
          .from("studio_assets")
          .delete()
          .eq("id", asset.data.id)
          .eq("owner_id", context.userId);
      throw new Error(
        "Version recording failed. Original preserved; reload the asset list to inspect cleanup.",
      );
    }
    return version.data;
  });
export const saveForgeWeb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => webInput.parse(v))
  .handler(async ({ context, data }) => {
    const [access, project] = await Promise.all([
      context.supabase
        .from("beta_access")
        .select("studio_approved,paused")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("beta_projects")
        .select("id")
        .eq("id", data.projectId)
        .eq("owner_id", context.userId)
        .single(),
    ]);
    if (access.error || project.error)
      throw new Error("Owned project or media permission unavailable.");
    assertStudioAccess(access.data);
    if (data.content.audioAssetId) {
      const audio = await context.supabase
        .from("studio_assets")
        .select("id")
        .eq("id", data.content.audioAssetId)
        .eq("owner_id", context.userId)
        .eq("project_id", data.projectId)
        .single();
      if (audio.error) throw new Error("Linked asset must belong to this project and account.");
    }
    const { renderForgeWeb, checkForgeWeb } = await import("./forge-web"),
      html = renderForgeWeb(data.content),
      sha256 = await forgeDigest(new TextEncoder().encode(html));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("forge_versions")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        kind: "web",
        revision: 1,
        content: data.content,
        sha256,
        processor: "Structured static Web Forge v1",
        evidence: checkForgeWeb(data.content),
      })
      .select()
      .single();
    if (result.error)
      throw new Error(
        "Web draft save blocked by access, pause or version limit. No deployment ran.",
      );
    return result.data;
  });
export const reviewForgeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => forgeReviewInput.parse(v))
  .handler(async ({ context, data }) => {
    const version = await context.supabase
      .from("forge_versions")
      .select("id,sha256")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (version.error) throw new Error("Version not found in your account.");
    const review = await context.supabase
      .from("forge_reviews")
      .insert({
        owner_id: context.userId,
        version_id: data.id,
        sha256: version.data.sha256,
        rights_consent: true,
        privacy_consent: true,
        export_approved: true,
      })
      .select()
      .single();
    if (review.error)
      throw new Error(
        "Review blocked or already recorded; account approval and unpaused state required.",
      );
    return review.data;
  });
export const revokeForgeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => forgeId.parse(v))
  .handler(async ({ context, data }) => {
    const result = await context.supabase
      .from("forge_reviews")
      .delete()
      .eq("version_id", data.id)
      .eq("owner_id", context.userId);
    if (result.error) throw new Error("Review withdrawal failed.");
    return { revoked: true };
  });
export const deleteForgeVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => forgeId.parse(v))
  .handler(async ({ context, data }) => {
    const own = await context.supabase
      .from("forge_versions")
      .select("id")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .single();
    if (own.error) throw new Error("Version not found in your account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("forge_versions")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (result.error) throw new Error("Version deletion failed.");
    return { removed: true, mediaRetained: true };
  });
