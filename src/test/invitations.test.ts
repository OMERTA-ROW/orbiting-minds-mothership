import { describe, expect, it } from "vitest";
import {
  assertAcceptable,
  assertInviteeMatches,
  canGrant,
  canManage,
  expiryFrom,
  hashInviteToken,
  invitationStatus,
  newInviteToken,
} from "@/lib/invitations";
const now = new Date("2026-10-26T12:00:00Z");
const open = { expires_at: "2026-10-27T12:00:00Z", revoked_at: null, accepted_at: null };
describe("invitation rules", () => {
  it("no one can grant owner by invitation", () => {
    expect(canGrant("owner", "owner")).toBe(false);
  });
  it("admins cannot escalate to admin", () => {
    expect(canGrant("admin", "admin")).toBe(false);
    expect(canGrant("admin", "tester")).toBe(true);
  });
  it("testers and signed-out users cannot invite", () => {
    expect(canGrant("tester", "tester")).toBe(false);
    expect(canGrant(null, "tester")).toBe(false);
  });
  it("admins cannot manage other admins or the owner", () => {
    expect(canManage("admin", "admin")).toBe(false);
    expect(canManage("owner", "owner")).toBe(false);
    expect(canManage("owner", "admin")).toBe(true);
  });
  it("used, revoked and expired invitations are rejected", () => {
    expect(() => assertAcceptable(open, now)).not.toThrow();
    expect(invitationStatus({ ...open, accepted_at: "x" }, now)).toBe("used");
    expect(invitationStatus({ ...open, revoked_at: "x" }, now)).toBe("revoked");
    expect(() => assertAcceptable(open, new Date("2026-10-27T12:00:00Z"))).toThrow(/expired/);
  });
  it("expiry is bounded to 1–336 hours", () => {
    expect(() => expiryFrom(0, now)).toThrow();
    expect(() => expiryFrom(337, now)).toThrow();
    expect(expiryFrom(24, now)).toBe("2026-10-27T12:00:00.000Z");
  });
  it("stores only a hash and rejects malformed tokens", async () => {
    const t = newInviteToken();
    const h = await hashInviteToken(t);
    expect(h).toHaveLength(64);
    expect(h).not.toBe(t);
    await expect(hashInviteToken("abc")).rejects.toThrow();
  });
  it("requires matching verified email; no identity merging", () => {
    expect(() =>
      assertInviteeMatches("a@x.test", { email: "b@x.test", email_confirmed_at: "t" }),
    ).toThrow();
    expect(() =>
      assertInviteeMatches("a@x.test", { email: "A@x.test", email_confirmed_at: null }),
    ).toThrow();
    expect(() =>
      assertInviteeMatches("a@x.test", { email: "A@x.test", email_confirmed_at: "t" }),
    ).not.toThrow();
  });
});
