import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { expiryFrom, hashInviteToken, newInviteToken } from "@/lib/invitations";

// The invitation RPCs live in .lovable/pending/owner-invitations.sql and are NOT
// applied to the shared backend yet. Every authorization decision is made inside
// those SECURITY DEFINER functions; these wrappers only pass verified callers through.
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
const NOT_ACTIVE = "Members & Invitations are not activated on this backend yet (pending owner approval).";
function fail(e: { message: string; code?: string }): never {
  if (e.code === "PGRST202" || /could not find the function/i.test(e.message)) throw new Error(NOT_ACTIVE);
  throw new Error(e.message);
}

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rpc = (context.supabase.rpc as unknown as Rpc).bind(context.supabase);
    const [m, i] = await Promise.all([rpc("list_members"), rpc("list_invitations")]);
    if (m.error) fail(m.error);
    if (i.error) fail(i.error);
    return { members: (m.data ?? []) as { user_id: string; email: string; role: string }[], invitations: (i.data ?? []) as { id: string; email: string; role: string; expires_at: string; revoked_at: string | null; accepted_at: string | null }[] };
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(254), role: z.enum(["admin", "tester"]), hours: z.number().int() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const token = newInviteToken();
    const rpc = (context.supabase.rpc as unknown as Rpc).bind(context.supabase);
    const { data: id, error } = await rpc("create_invitation", { _email: data.email.toLowerCase(), _role: data.role, _expires_at: expiryFrom(data.hours), _token_hash: await hashInviteToken(token) });
    if (error) fail(error);
    return { id: id as string, token }; // plaintext returned once, never stored
  });

const idInput = (d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d);
export const revokeInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ data, context }) => { const r = await (context.supabase.rpc as unknown as Rpc).call(context.supabase, "revoke_invitation", { _id: data.id }); if (r.error) fail(r.error); return { ok: true }; });
export const removeMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ data, context }) => { const r = await (context.supabase.rpc as unknown as Rpc).call(context.supabase, "remove_member", { _user_id: data.id }); if (r.error) fail(r.error); return { ok: true }; });
export const acceptInvitation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).strict().parse(d))
  .handler(async ({ data, context }) => { const r = await (context.supabase.rpc as unknown as Rpc).call(context.supabase, "accept_invitation", { _token_hash: await hashInviteToken(data.token) }); if (r.error) fail(r.error); return { role: r.data as string }; });
export const claimOwner = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { const r = await (context.supabase.rpc as unknown as Rpc).call(context.supabase, "claim_owner"); if (r.error) fail(r.error); return { ok: r.data === true }; });
