import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assetInput,
  assetIdInput,
  enhanceInput,
  assertStudioAccess,
  STUDIO_BUCKET,
  studioPath,
  MAX_MEDIA_BYTES,
} from "./quantum";

export const readStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [assets, access] = await Promise.all([
      context.supabase
        .from("studio_assets")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("beta_access")
        .select("studio_approved,paused")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (assets.error || access.error) throw new Error("Private media records could not be read.");
    return { assets: assets.data ?? [], access: access.data };
  });
export const reserveStudioAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => assetInput.parse(v))
  .handler(async ({ data, context }) => {
    const access = await context.supabase
      .from("beta_access")
      .select("studio_approved,paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (access.error) throw new Error("Media permission could not be checked.");
    assertStudioAccess(access.data);
    const saved = await context.supabase
      .from("studio_assets")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        role: "original",
        byte_size: data.bytes,
        rights_consent: true,
        privacy_consent: true,
      })
      .select()
      .single();
    if (saved.error)
      throw new Error("File reservation failed. Check your project and eight-asset limit.");
    return saved.data;
  });
export const removeStudioAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => assetIdInput.parse(v))
  .handler(async ({ data, context }) => {
    const saved = await context.supabase
      .from("studio_assets")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("id", data.id)
      .single();
    if (saved.error) throw new Error("File not found in this account.");
    const children = await context.supabase
      .from("studio_assets")
      .select("id")
      .eq("source_id", data.id)
      .eq("owner_id", context.userId);
    if (children.error || children.data?.length)
      throw new Error("Remove enhanced versions before deleting their original.");
    const checkpoints = await context.supabase
      .from("forge_versions")
      .select("id")
      .eq("owner_id", context.userId)
      .or(`source_id.eq.${data.id},output_id.eq.${data.id}`);
    if (checkpoints.error || checkpoints.data?.length)
      throw new Error(
        "Delete linked Forge checkpoints before deleting this audio. Stored file retained.",
      );
    const removed = await context.supabase.storage
      .from(STUDIO_BUCKET)
      .remove([studioPath(context.userId, data.id)]);
    if (removed.error)
      throw new Error("Stored audio could not be deleted. Record retained for recovery.");
    const record = await context.supabase
      .from("studio_assets")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (record.error)
      throw new Error(
        "Audio deleted but metadata cleanup failed; retry deleting the remaining reservation.",
      );
    return { removed: true };
  });
export const processStudioAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => enhanceInput.parse(v))
  .handler(async ({ data, context }) => {
    const access = await context.supabase
      .from("beta_access")
      .select("studio_approved,paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (access.error) throw new Error("Media permission could not be checked.");
    assertStudioAccess(access.data);
    const asset = await context.supabase
      .from("studio_assets")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .eq("role", "original")
      .single();
    if (asset.error) throw new Error("Original not found in your account.");
    const downloaded = await context.supabase.storage
      .from(STUDIO_BUCKET)
      .download(studioPath(context.userId, data.id));
    if (downloaded.error || !downloaded.data)
      throw new Error("Original audio unavailable; retry upload or remove this reservation.");
    if (downloaded.data.size > MAX_MEDIA_BYTES || downloaded.data.size !== asset.data.byte_size)
      throw new Error("Stored audio size does not match its reservation.");
    const { enhanceWav } = await import("./quantum-audio");
    const result = enhanceWav(new Uint8Array(await downloaded.data.arrayBuffer()), data.gainDb);
    const sha = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(result.bytes))),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const current = await context.supabase
      .from("beta_access")
      .select("studio_approved,paused")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (current.error) throw new Error("Permission recheck failed.");
    assertStudioAccess(current.data);
    const saved = await context.supabase
      .from("studio_assets")
      .insert({
        owner_id: context.userId,
        project_id: asset.data.project_id,
        role: "enhanced",
        source_id: data.id,
        byte_size: result.bytes.length,
        gain_db: data.gainDb,
        rights_consent: true,
        privacy_consent: true,
        metrics: result.report,
        sha256: sha,
      })
      .select()
      .single();
    if (saved.error)
      throw new Error(
        "Enhanced reservation blocked by project or eight-asset limit. Original unchanged.",
      );
    const uploaded = await context.supabase.storage
      .from(STUDIO_BUCKET)
      .upload(
        studioPath(context.userId, saved.data.id),
        new Blob([new Uint8Array(result.bytes)], { type: "audio/wav" }),
        { contentType: "audio/wav", upsert: false },
      );
    if (uploaded.error) {
      await context.supabase
        .from("studio_assets")
        .delete()
        .eq("id", saved.data.id)
        .eq("owner_id", context.userId);
      throw new Error(
        "Enhanced upload failed; original unchanged. Check remaining reservations before retrying.",
      );
    }
    return { asset: saved.data, report: result.report, sha256: sha };
  });
