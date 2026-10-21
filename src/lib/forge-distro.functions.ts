import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canonInput,
  canonSchema,
  releaseInput,
  releaseSchema,
  releaseAction,
  rssXml,
  branchPlan,
  channelEvidence,
  canonicalJson,
  assertReleaseAction,
  platformHandoff,
} from "./forge-universe";
import {
  assertStudioAccess,
  inspectWav,
  MAX_MEDIA_BYTES,
  STUDIO_BUCKET,
  studioPath,
} from "./quantum";
import { forgeDigest } from "./forge";

export const readCreatorForge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [versions, audit] = await Promise.all([
      context.supabase
        .from("forge_creator_versions")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("beta_audit")
        .select("*")
        .eq("owner_id", context.userId)
        .eq("capability", "forge_creator_versions")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);
    if (versions.error || audit.error)
      throw new Error("Creator versions or export history could not be read.");
    return { versions: versions.data ?? [], audit: audit.data ?? [] };
  });
export const saveCreatorCanon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => canonInput.parse(v))
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
      throw new Error("Owned project and media permission required.");
    assertStudioAccess(access.data);
    const sha256 = await forgeDigest(new TextEncoder().encode(canonicalJson(data.content)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("forge_creator_versions")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        kind: "canon",
        content: data.content,
        sha256,
      })
      .select()
      .single();
    if (result.error) throw new Error("Canon save blocked. Previous versions remain unchanged.");
    return result.data;
  });
export const saveDistroDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => releaseInput.parse(v))
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
      throw new Error("Owned project and media permission required.");
    assertStudioAccess(access.data);
    if (data.content.assetId) {
      const asset = await context.supabase
        .from("studio_assets")
        .select("id,sha256")
        .eq("id", data.content.assetId)
        .eq("owner_id", context.userId)
        .eq("project_id", data.projectId)
        .single();
      if (asset.error || !asset.data.sha256)
        throw new Error("Select a hashed output from this private project.");
    }
    if (data.content.canonId) {
      const canon = await context.supabase
        .from("forge_creator_versions")
        .select("id")
        .eq("id", data.content.canonId)
        .eq("owner_id", context.userId)
        .eq("project_id", data.projectId)
        .eq("kind", "canon")
        .single();
      if (canon.error) throw new Error("Select a saved canon from this project.");
    }
    const sha256 = await forgeDigest(new TextEncoder().encode(canonicalJson(data.content)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("forge_creator_versions")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        kind: "release",
        content: data.content,
        sha256,
        asset_id: data.content.assetId,
        canon_id: data.content.canonId,
      })
      .select()
      .single();
    if (result.error)
      throw new Error("Release draft save blocked by current access or version limit.");
    return result.data;
  });
export const actOnDistro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => releaseAction.parse(v))
  .handler(async ({ context, data }) => {
    const saved = await context.supabase
      .from("forge_creator_versions")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .eq("kind", "release")
      .single();
    if (saved.error) throw new Error("Release not found in your account.");
    const draft = releaseSchema.parse(saved.data.content);
    if ((await forgeDigest(new TextEncoder().encode(canonicalJson(draft)))) !== saved.data.sha256)
      throw new Error("Saved release digest mismatch.");
    // No user URL is fetched. Only owner-scoped storage is read and a private bundle is prepared.
    let bundle: Uint8Array | null = null;
    if (data.action === "prepare") {
      const access = await context.supabase
        .from("beta_access")
        .select("studio_approved,paused")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (access.error) throw new Error("Media access check failed.");
      assertStudioAccess(access.data);
      assertReleaseAction(
        saved.data.state,
        data.action,
        access.data?.studio_approved === true,
        access.data?.paused !== false,
      );
      const { zipSync, strToU8 } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      const hashes: Record<string, string> = {};
      if (draft.channel === "rss") {
        if (!draft.assetId) throw new Error("Select a private WAV output.");
        const asset = await context.supabase
          .from("studio_assets")
          .select("*")
          .eq("id", draft.assetId)
          .eq("owner_id", context.userId)
          .eq("project_id", saved.data.project_id)
          .single();
        if (asset.error || !asset.data.sha256) throw new Error("Hashed source unavailable.");
        const audio = await context.supabase.storage
          .from(STUDIO_BUCKET)
          .download(studioPath(context.userId, draft.assetId));
        if (
          audio.error ||
          !audio.data ||
          audio.data.size !== asset.data.byte_size ||
          audio.data.size > MAX_MEDIA_BYTES
        )
          throw new Error("Private source size check failed; no bundle prepared.");
        const bytes = new Uint8Array(await audio.data.arrayBuffer());
        inspectWav(bytes);
        const hash = await forgeDigest(bytes);
        if (hash !== asset.data.sha256)
          throw new Error("Private WAV digest check failed; original unchanged.");
        const xml = rssXml(draft, saved.data.id, bytes.length, saved.data.created_at);
        const { XMLValidator } = await import("fast-xml-parser");
        if (XMLValidator.validate(xml) !== true) throw new Error("RSS XML validation failed.");
        files[`audio/${saved.data.id}.wav`] = bytes;
        files["feed.xml"] = strToU8(xml);
        hashes[`audio/${saved.data.id}.wav`] = hash;
        hashes["feed.xml"] = await forgeDigest(files["feed.xml"]);
      }
      if (draft.canonId) {
        const canon = await context.supabase
          .from("forge_creator_versions")
          .select("*")
          .eq("id", draft.canonId)
          .eq("owner_id", context.userId)
          .eq("project_id", saved.data.project_id)
          .eq("kind", "canon")
          .single();
        if (canon.error) throw new Error("Referenced canon unavailable.");
        const content = canonSchema.parse(canon.data.content);
        if ((await forgeDigest(strToU8(canonicalJson(content)))) !== canon.data.sha256)
          throw new Error("Canon digest mismatch.");
        files["canon.json"] = strToU8(
          JSON.stringify({ content, plans: branchPlan(content), execution: false }, null, 2),
        );
      }
      files["release.json"] = strToU8(
        JSON.stringify(
          {
            releaseId: saved.data.id,
            draftDigest: saved.data.sha256,
            draft,
            capability: channelEvidence(draft.channel),
            fileDigests: hashes,
            delivery: "MANUAL EXPORT / NOT UPLOADED",
            receipt: null,
            scheduled: false,
            autopublish: false,
            signing: false,
            cost: "UNKNOWN; no provider calls",
            destination: "OWNER DECLARED / NOT VERIFIED",
            mediaIncluded: draft.channel === "rss",
            revocation: "Blocks future preparation; cannot recall downloaded copies",
          },
          null,
          2,
        ),
      );
      const handoff = platformHandoff(draft.channel);
      if (handoff)
        files["platform-handoff.json"] = strToU8(
          JSON.stringify(
            {
              draft,
              ...handoff,
              state: "INCOMPLETE METADATA HANDOFF / NOT SUBMITTED",
              directUpload: false,
              scheduled: false,
            },
            null,
            2,
          ),
        );
      files["HANDOFF.txt"] = strToU8(
        "OMNI FORGE manual release bundle.\nNot published, uploaded or platform-approved.\nRSS only: Upload feed.xml and audio/ yourself to the exact declared owned HTTPS directory; confirm public bytes, MIME, accessibility and host receipts before submitting to a podcast directory. WAV acceptance varies; this is not universal platform compatibility.\nTarget date is an intention, not a scheduled job. Other channels include metadata/canon only, never fake finished media.\nRights declarations and hashes are not independent clearance or signatures.\n",
      );
      bundle = zipSync(files, { level: 0, mtime: new Date("1980-01-01T00:00:00Z") });
    }
    // Row lock and current account lock serialize review, prepare and revoke. No network delivery occurs.
    const transitioned = await context.supabase.rpc("forge_release_transition", {
      _id: saved.data.id,
      _sha256: saved.data.sha256,
      _action: data.action,
      _rights: data.consent?.rights === true,
      _privacy: data.consent?.privacy === true,
      _approve: data.approve === true,
      _owned_site: data.ownedSite === true,
    });
    if (transitioned.error)
      throw new Error(
        "Release action refused by current review, revocation or media permissions. Reload before retrying.",
      );
    return {
      version: transitioned.data,
      archive: bundle ? Buffer.from(bundle).toString("base64") : null,
      filename: `omni-forge-${saved.data.id}.zip`,
      delivery: "NOT UPLOADED",
      receipt: null,
    };
  });
