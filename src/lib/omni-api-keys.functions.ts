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
  omniKeyCreateInput,
  omniKeyIdInput,
  omniKeyPrefix,
  sha256Hex,
} from "./omni-api-keys";

async function requireOwner(context: {
  supabase: Parameters<typeof importOwner>[0] extends never ? never : never;
}) {
  void context;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type importOwner = typeof import("./razul-owner.server");

export const listOmniApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { data, error } = await context.supabase
      .from("omni_api_keys")
      .select("id,name,key_prefix,scopes,status,expires_at,last_used_at,created_at,rotated_at")
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
    const { data: id, error } = await context.supabase.rpc("omni_api_key_create", {
      _name: data.name,
      _scopes: data.scopes,
      _key_hash: hash,
      _key_prefix: omniKeyPrefix(secret),
      _days: data.days,
    });
    if (error || !id) throw new Error("API key could not be created.");
    // Shown exactly once; only the hash and prefix are stored.
    return { id, secret };
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
