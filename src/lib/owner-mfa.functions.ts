/**
 * Owner authenticator recovery. Codes are generated here, shown once and
 * stored only as hashes. Recovery needs a verified owner email, a sign-in from
 * the last 10 minutes AND an unused recovery code; only then does the server
 * ask the sign-in provider to remove the lost authenticator so a new one can
 * be set up. Nothing here grants aal2, owner rights or any OMNI permission.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMfaFresh } from "./activation-approvals";
import {
  RECOVERY_CODE_COUNT,
  formatRecoveryCode,
  normalizeRecoveryCode,
  primarySignInAgeSeconds,
  recoveryBlocker,
  recoveryCodeHash,
  recoveryOutcomeMessage,
} from "./owner-mfa";

type Db = Parameters<typeof import("./razul-owner.server").requireRazulOwner>[0];

/** Verified identity from the bearer itself, plus the caller's own owner role row (aal1 allowed). */
async function ownerIdentity(db: Db, userId: string) {
  const bearer = getRequestHeader("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return { token, emailVerified: false, isOwner: false };
  const { data, error } = await db.auth.getUser(token);
  const emailVerified = !error && data.user?.id === userId && Boolean(data.user.email_confirmed_at);
  const role = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  return { token, emailVerified, isOwner: !role.error && role.data?.role === "owner" };
}

export const readOwnerRecovery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const id = await ownerIdentity(context.supabase, context.userId);
    const status = await context.supabase.rpc("owner_mfa_recovery_status");
    const row = Array.isArray(status.data) ? status.data[0] : undefined;
    return {
      emailVerified: id.emailVerified,
      isOwner: id.isOwner,
      codesRemaining: status.error ? null : (row?.remaining ?? 0),
      codesCreatedAt: row?.created_at ?? null,
      signInAgeSeconds: primarySignInAgeSeconds(
        context.claims["amr"],
        Math.floor(Date.now() / 1000),
      ),
    };
  });

export const createOwnerRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireRazulOwner } = await import("./razul-owner.server");
    try {
      await requireRazulOwner(context.supabase, context.userId, context.claims);
    } catch {
      return { ok: false as const, message: "Only the owner, verified with two-factor, can do this." };
    }
    if (!isMfaFresh(context.claims["amr"], Math.floor(Date.now() / 1000)))
      return { ok: false as const, message: "Enter a fresh authenticator code first (last 15 minutes)." };
    const codes: string[] = [];
    while (codes.length < RECOVERY_CODE_COUNT) {
      const code = formatRecoveryCode(crypto.getRandomValues(new Uint8Array(12)));
      if (!codes.includes(code)) codes.push(code);
    }
    const hashes = await Promise.all(
      codes.map((c) => recoveryCodeHash(context.userId, normalizeRecoveryCode(c)!)),
    );
    const { error } = await context.supabase.rpc("owner_mfa_set_recovery_codes", { _hashes: hashes });
    if (error)
      return {
        ok: false as const,
        message: error.message.includes("Fresh two-factor")
          ? "Enter a fresh authenticator code first (last 15 minutes)."
          : "Recovery codes were not saved. Nothing changed; try again.",
      };
    return { ok: true as const, codes };
  });

export const recoverOwnerAuthenticator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const id = await ownerIdentity(context.supabase, context.userId);
    const blocker = recoveryBlocker({
      emailVerified: id.emailVerified,
      isOwner: id.isOwner,
      signInAgeSeconds: primarySignInAgeSeconds(
        context.claims["amr"],
        Math.floor(Date.now() / 1000),
      ),
    });
    if (blocker) return { ok: false as const, message: blocker };
    const normalized = normalizeRecoveryCode(data.code);
    if (!normalized)
      return { ok: false as const, message: "Recovery codes look like XXXX-XXXX-XXXX." };
    const hash = await recoveryCodeHash(context.userId, normalized);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const consumed = await supabaseAdmin.rpc("owner_mfa_consume_recovery_code", {
      _user: context.userId,
      _hash: hash,
    });
    if (consumed.error)
      return { ok: false as const, message: "Recovery could not be checked. Nothing changed." };
    if (consumed.data !== "accepted")
      return { ok: false as const, message: recoveryOutcomeMessage(String(consumed.data)) };

    let removed = 0;
    let ok = true;
    const listed = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
    if (listed.error) ok = false;
    else
      for (const f of listed.data.factors.filter((x) => x.factor_type === "totp")) {
        const r = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: context.userId });
        if (r.error) ok = false;
        else removed++;
      }
    await supabaseAdmin.rpc("owner_mfa_finish_recovery", {
      _user: context.userId,
      _hash: hash,
      _removed: removed,
      _ok: ok,
    });
    if (!ok)
      return {
        ok: false as const,
        message: "The old authenticator could not be removed. Your recovery code still works; try again.",
      };
    // End every other sign-in so a stolen session cannot keep using the account.
    await supabaseAdmin.auth.admin.signOut(id.token, "others");
    return { ok: true as const, removed };
  });
