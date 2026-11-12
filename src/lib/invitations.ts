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
  declined_at?: string | null;
};
export type InvitationStatus = "open" | "used" | "revoked" | "declined" | "expired";
export function invitationStatus(i: InvitationState, now = new Date()): InvitationStatus {
  if (i.revoked_at) return "revoked" as const;
  if (i.accepted_at) return "used" as const;
  if (i.declined_at) return "declined" as const;
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

/** Split invitations into the active list (open only) and history, newest first. */
export function splitInvitations<T extends InvitationState & { created_at?: string }>(
  rows: readonly T[],
  now = new Date(),
) {
  const tagged = rows.map((row) => ({ row, status: invitationStatus(row, now) }));
  return {
    active: tagged.filter((t) => t.status === "open"),
    history: tagged.filter((t) => t.status !== "open"),
  };
}

/** Plain-language message for an invitation/member server error. */
export function memberErrorMessage(message: string): string {
  if (/already accepted/i.test(message))
    return "This invitation was already accepted. Remove the member instead if needed.";
  if (/already revoked/i.test(message)) return "This invitation was already revoked.";
  if (/already declined/i.test(message)) return "The invited person already declined.";
  if (/not a member/i.test(message)) return "This person was already removed.";
  if (/not valid/i.test(message))
    return "This invitation is no longer valid (used, revoked, declined or expired). Ask for a new link.";
  if (/different account/i.test(message))
    return "You're signed in with a different email than the one invited. Sign out and sign in with the invited email.";
  if (/confirm your email/i.test(message)) return "Confirm your email first, then try again.";
  if (/invalid expiry/i.test(message)) return "Choose an expiry between 1 hour and 14 days.";
  if (/owner already assigned/i.test(message)) return "The owner role is already assigned.";
  if (/not the configured/i.test(message))
    return "Only the configured, confirmed owner email can claim the owner role.";
  if (/not allowed/i.test(message)) return "You don't have permission to do that.";
  if (/not activated/i.test(message)) return message;
  return "That didn't work. Nothing was changed. Refresh and try again.";
}
