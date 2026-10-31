import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequestHeader } from "@tanstack/react-start/server";
import { assertEyeOwner } from "./razul-eye";

export async function requireRazulOwner(db: SupabaseClient<Database>, callerId: string, claims: Record<string, unknown>) {
  const bearer = getRequestHeader("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined;
  if (!token) throw new Error("Verified owner identity is required.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user || data.user.id !== callerId || !data.user.email_confirmed_at) throw new Error("Verified owner identity is required.");
  const role = await db.rpc("is_razul_owner");
  if (role.error) throw new Error("Owner authorization could not be verified.");
  assertEyeOwner({ callerId, verifiedUserId: data.user.id, emailConfirmed: true, assurance: typeof claims["aal"] === "string" ? claims["aal"] : null }, role.data === true);
}