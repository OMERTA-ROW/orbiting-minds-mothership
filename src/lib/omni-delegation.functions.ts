/**
 * Owner-side OMNI connection approval and management. Every function needs the signed-in
 * owner; approving also needs an authenticator code from the last 15 minutes (checked here
 * and again in the database). The one-time code is generated here and only its hash is
 * stored; the browser receives it once, inside the redirect to the allowlisted callback.
 */
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sha256Hex } from "./omni-api-keys";
import { stepUpBlocker } from "./owner-mfa";
import {
  DELEGATION_AUDIENCE,
  DELEGATION_CLIENT,
  GRANTABLE_SCOPE_CANDIDATES,
  authorizeParamsSchema,
  callbackUrl,
  generateDelegationSecret,
  grantableScopes,
  parseAuthorizeRequest,
} from "./omni-delegation";
import { staged } from "./staged-rpc";

/** Whether chat:write can be granted: database change 0066 is installed (marker function). */
async function liveGrantable(client: Parameters<typeof staged>[0]) {
  try {
    const r = await staged(client).rpc("omni_delegated_chat_ready");
    return grantableScopes(!r.error && r.data === true);
  } catch {
    return grantableScopes(false);
  }
}

/** Owner state for the approval page; never throws for "not the owner". */
export const describeOmniAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => authorizeParamsSchema.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const grantable = await liveGrantable(context.supabase);
    const parsed = parseAuthorizeRequest(data, grantable);
    if (!parsed.ok) return { valid: false as const, error: parsed.error };
    const role = await context.supabase.rpc("is_razul_owner");
    const owner = !role.error && role.data === true;
    return {
      valid: true as const,
      owner,
      grantable,
      // Owner checks need aal2; an owner signed in without the second step is asked for a code.
      needsSecondStep: !owner && context.claims["aal"] !== "aal2",
      mfaBlocker: owner
        ? stepUpBlocker(context.claims["aal"], context.claims["amr"], Math.floor(Date.now() / 1000))
        : null,
    };
  });

const approveInput = z
  .object({
    request: authorizeParamsSchema,
    scopes: z
      .array(z.enum(GRANTABLE_SCOPE_CANDIDATES))
      .min(1)
      .max(GRANTABLE_SCOPE_CANDIDATES.length),
    confirm: z.literal(true),
  })
  .strict();

function approveFailure(error: { code?: string; message?: string } | null) {
  const m = error?.message ?? "";
  if (/Fresh two-factor/i.test(m)) return "Enter a fresh authenticator code first, then approve.";
  if (error?.code === "42501" || /owner|MFA/i.test(m))
    return "Only the verified Mothership owner with two-step sign-in can approve.";
  if (/Too many/i.test(m)) return "Too many approvals in 10 minutes. Wait, then try again.";
  return "The approval was not recorded. Nothing was shared; try again.";
}

export const approveOmniAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approveInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const parsed = parseAuthorizeRequest(data.request, await liveGrantable(context.supabase));
    if (!parsed.ok) return { ok: false as const, message: parsed.error };
    if (
      new Set(data.scopes).size !== data.scopes.length ||
      data.scopes.some((s) => !parsed.supported.includes(s))
    )
      return { ok: false as const, message: "Choose only permissions OMNI asked for." };
    const blocker = stepUpBlocker(
      context.claims["aal"],
      context.claims["amr"],
      Math.floor(Date.now() / 1000),
    );
    if (blocker) return { ok: false as const, message: blocker };
    const code = generateDelegationSecret("omnic");
    const { error } = await context.supabase.rpc("omni_delegation_authorize", {
      _client_id: DELEGATION_CLIENT.id,
      _audience: DELEGATION_AUDIENCE,
      _redirect_uri: DELEGATION_CLIENT.redirectUri,
      _scopes: data.scopes,
      _code_hash: await sha256Hex(code),
      _code_challenge: parsed.codeChallenge,
    });
    if (error) return { ok: false as const, message: approveFailure(error) };
    return { ok: true as const, redirectTo: callbackUrl({ code }, parsed.state) };
  });

export const listOmniDelegations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { data, error } = await context.supabase
      .from("omni_delegations")
      .select(
        "id,client_id,scopes,token_prefix,issued_at,expires_at,revoked_at,revoked_reason,last_used_at",
      )
      .order("issued_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("OMNI connections could not be read.");
    return data;
  });

export const revokeOmniDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), confirm: z.literal(true) })
      .strict()
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    await requireRazulOwner(context.supabase, context.userId, context.claims);
    const { error } = await context.supabase.rpc("omni_delegation_owner_revoke", { _id: data.id });
    if (error) throw new Error("The OMNI connection could not be cancelled.");
    return { id: data.id };
  });
