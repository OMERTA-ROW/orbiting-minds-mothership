// Pure invitation/membership rules. Server code must re-check these against
// database rows; nothing here is trusted from the browser.
export const ROLES = ["owner", "admin", "tester"] as const;
export type Role = (typeof ROLES)[number];
const rank: Record<Role, number> = { tester: 1, admin: 2, owner: 3 };

/** Only owners grant admin; admins may invite testers only; nobody grants owner via invitation. */
export function canGrant(actor: Role | null, target: Role): boolean {
  if (!actor || target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "admin" && target === "tester";
}
/** Actors may manage only strictly lower-ranked members (owner manages all non-owners). */
export function canManage(actor: Role | null, member: Role): boolean {
  return !!actor && member !== "owner" && rank[actor] > rank[member];
}

export type InvitationState = {
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};
export function invitationStatus(i: InvitationState, now = new Date()) {
  if (i.revoked_at) return "revoked" as const;
  if (i.accepted_at) return "used" as const;
  if (new Date(i.expires_at).getTime() <= now.getTime()) return "expired" as const;
  return "open" as const;
}
export function assertAcceptable(i: InvitationState, now = new Date()) {
  const s = invitationStatus(i, now);
  if (s !== "open") throw new Error(`Invitation is ${s}.`);
}

const MAX_TTL_HOURS = 24 * 14;
export function expiryFrom(hours: number, now = new Date()) {
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_TTL_HOURS)
    throw new Error("Expiry must be 1–336 hours.");
  return new Date(now.getTime() + hours * 3600_000).toISOString();
}

/** Random single-use token; only its SHA-256 is ever stored. */
export function newInviteToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export async function hashInviteToken(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Malformed invitation token.");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
/** Invitation email must match the signed-in, verified account; identities are never merged. */
export function assertInviteeMatches(
  inviteEmail: string,
  user: { email?: string | null; email_confirmed_at?: string | null },
) {
  if (!user.email_confirmed_at) throw new Error("Confirm your email before accepting.");
  if ((user.email ?? "").trim().toLowerCase() !== inviteEmail.trim().toLowerCase())
    throw new Error("This invitation belongs to a different account.");
}
