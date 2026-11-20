/**
 * Owner-only OMNI API key management. Every function re-verifies the single
 * verified MFA owner server-side; the plaintext secret is generated here,
 * returned exactly once, and only its SHA-256 hash and display prefix are
 * persisted. No external connection is established by these operations.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateOmniKey,
  omniExpiryRpcArgs,
  omniKeyCreateInput,
  omniKeyIdInput,
  omniKeyPrefix,
  sha256Hex,
} from "./omni-api-keys";

/** Allowlisted, value-free reasons; raw database text is never returned. */
function createFailureMessage(error: { code?: string; message?: string } | null): string {
  const message = error?.message ?? "";
  if (error?.code === "42501" || /owner|MFA|aal2/i.test(message))
    return "API key could not be created: owner sign-in with your 6-digit code is required.";
  if (/expiry|never expires/i.test(message))
    return "API key could not be created: choose 1–365 days or Never expires.";
  if (/scope/i.test(message)) return "API key could not be created: choose at least one access.";
  if (/name/i.test(message))
    return "API key could not be created: the name must be 1–60 characters.";
  return "API key could not be created.";
}

export const listOmniApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { data, error } = await context.supabase
      .from("omni_api_keys")
      .select(
        "id,name,key_prefix,scopes,status,expires_at,never_expires,last_used_at,created_at,rotated_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("API keys could not be read.");
    return data;
  });

export const listOmniApiKeyAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { data, error } = await context.supabase
      .from("razul_control_audit")
      .select("id,actor_id,action,record_type,record_id,occurred_at")
      .eq("record_type", "omni_api_key")
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("API key audit log could not be read.");
    return data;
  });

export const createOmniApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => omniKeyCreateInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const secret = generateOmniKey();
    const hash = await sha256Hex(secret);
    const expiry = omniExpiryRpcArgs(data.expiry);
    const { data: id, error } = await context.supabase.rpc("omni_api_key_issue", {
      _name: data.name,
      _scopes: data.scopes,
      _key_hash: hash,
      _key_prefix: omniKeyPrefix(secret),
      // Generated types mark every SQL argument non-null; NULL here means "never expires" and the
      // database refuses any other combination.
      _expiry_days: expiry._expiry_days as number,
      _never_expires: expiry._never_expires,
    });
    if (error || !id) throw new Error(createFailureMessage(error));
    // Shown exactly once; only the hash and prefix are stored.
    return { id, secret, neverExpires: data.expiry.kind === "never" };
  });

export const rotateOmniApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => omniKeyIdInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const secret = generateOmniKey();
    const hash = await sha256Hex(secret);
    const { error } = await context.supabase.rpc("omni_api_key_rotate", {
      _id: data.id,
      _key_hash: hash,
      _key_prefix: omniKeyPrefix(secret),
    });
    if (error) throw new Error("API key could not be rotated.");
    return { id: data.id, secret };
  });

export const revokeOmniApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => omniKeyIdInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { error } = await context.supabase.rpc("omni_api_key_revoke", { _id: data.id });
    if (error) throw new Error("API key could not be revoked.");
    return { id: data.id };
  });
