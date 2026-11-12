import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  role: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  listFactors: vi.fn(),
  deleteFactor: vi.fn(),
  signOut: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return { createServerFn: () => chain };
});
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => "Bearer caller-token",
  setResponseHeader: () => undefined,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: m.adminRpc,
    auth: {
      admin: {
        mfa: { listFactors: m.listFactors, deleteFactor: m.deleteFactor },
        signOut: m.signOut,
      },
    },
  },
}));
import { createRecoveryCodes, disableTwoStep, recoverAuthenticator } from "@/lib/account-mfa.functions";

const USER = "40543e40-5202-4219-a852-ead1c659e9a9";
const now = () => Math.floor(Date.now() / 1000);
const db = {
  auth: { getUser: m.getUser },
  rpc: m.rpc,
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: m.role }) }) }) }),
};
const call = (fn: unknown, claims: Record<string, unknown>, data?: unknown) =>
  (fn as (a: unknown) => Promise<Record<string, unknown>>)({
    context: { supabase: db, userId: USER, claims },
    data,
  });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.getUser.mockResolvedValue({ data: { user: { id: USER, email_confirmed_at: "2026-11-01" } }, error: null });
  m.role.mockResolvedValue({ data: { role: "owner" }, error: null });
  m.adminRpc.mockImplementation(async (name: string) =>
    name === "account_mfa_consume_recovery_code" ? { data: "accepted", error: null } : { data: null, error: null },
  );
  m.listFactors.mockResolvedValue({
    data: { factors: [{ id: "totp-1", factor_type: "totp" }, { id: "phone-1", factor_type: "phone" }] },
    error: null,
  });
  m.deleteFactor.mockResolvedValue({ data: {}, error: null });
  m.signOut.mockResolvedValue({ error: null });
});

const freshSignIn = { aal: "aal1", amr: [{ method: "oauth", timestamp: now() - 60 }] };

describe("authenticator recovery (any account)", () => {
  it("never removes an authenticator on a plain old sign-in", async () => {
    const r = await call(recoverAuthenticator, { aal: "aal1", amr: [{ method: "oauth", timestamp: now() - 3600 }] }, { code: "0123-4567-89AZ" });
    expect(r).toMatchObject({ ok: false });
    expect(String(r["message"])).toContain("Sign in again");
    expect(m.adminRpc).not.toHaveBeenCalled();
    expect(m.deleteFactor).not.toHaveBeenCalled();
  });
  it("refuses unverified emails before any recovery check", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: USER, email_confirmed_at: null } }, error: null });
    expect(await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89AZ" })).toMatchObject({ ok: false });
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("works for a member without the owner role", async () => {
    m.role.mockResolvedValue({ data: null, error: null });
    expect(await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89AZ" })).toEqual({ ok: true, removed: 1 });
  });
  it("refuses wrong or locked codes without removing anything", async () => {
    m.adminRpc.mockResolvedValue({ data: "invalid", error: null });
    expect(await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89AZ" })).toMatchObject({ ok: false });
    m.adminRpc.mockResolvedValue({ data: "locked", error: null });
    const r = await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89AZ" });
    expect(String(r["message"])).toContain("an hour");
    expect(m.deleteFactor).not.toHaveBeenCalled();
  });
  it("with a fresh sign-in and valid code, removes only authenticator-app factors and ends other sign-ins", async () => {
    const r = await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89az" });
    expect(r).toEqual({ ok: true, removed: 1 });
    const [, args] = m.adminRpc.mock.calls[0]!;
    expect(args._user).toBe(USER);
    expect(args._hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(m.adminRpc.mock.calls)).not.toContain("0123");
    expect(m.deleteFactor).toHaveBeenCalledTimes(1);
    expect(m.deleteFactor).toHaveBeenCalledWith({ id: "totp-1", userId: USER });
    expect(m.adminRpc).toHaveBeenCalledWith("owner_mfa_finish_recovery", expect.objectContaining({ _ok: true, _removed: 1 }));
    expect(m.signOut).toHaveBeenCalledWith("caller-token", "others");
  });
  it("restores the code when the provider cannot remove the authenticator", async () => {
    m.deleteFactor.mockResolvedValue({ data: null, error: { message: "nope" } });
    const r = await call(recoverAuthenticator, freshSignIn, { code: "0123-4567-89AZ" });
    expect(String(r["message"])).toContain("still works");
    expect(m.adminRpc).toHaveBeenCalledWith("owner_mfa_finish_recovery", expect.objectContaining({ _ok: false }));
    expect(m.signOut).not.toHaveBeenCalled();
  });
});

describe("recovery code creation", () => {
  it("needs a two-step code from the last 15 minutes", async () => {
    const r = await call(createRecoveryCodes, { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 16 * 60 }] });
    expect(r).toMatchObject({ ok: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("returns 10 distinct codes once and stores only their hashes", async () => {
    m.rpc.mockResolvedValue({ data: 10, error: null });
    const r = await call(createRecoveryCodes, { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 30 }] });
    const codes = r["codes"] as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const [name, args] = m.rpc.mock.calls[0]!;
    expect(name).toBe("account_mfa_set_recovery_codes");
    expect(args._hashes).toHaveLength(10);
    for (const h of args._hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    for (const c of codes) expect(JSON.stringify(args)).not.toContain(c.replace(/-/g, ""));
  });
});

describe("recovery code creation limits", () => {
  it("is refused at aal1 even right after sign-in", async () => {
    const r = await call(createRecoveryCodes, { aal: "aal1", amr: [{ method: "oauth", timestamp: now() - 10 }] });
    expect(r).toMatchObject({ ok: false });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("explains the 5-per-hour replacement limit", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Recovery codes replaced too often; wait an hour" } });
    const r = await call(createRecoveryCodes, { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 30 }] });
    expect(r).toMatchObject({ ok: false });
    expect(String(r["message"])).toContain("Wait an hour");
  });
});

describe("turning two-step sign-in off (revocation)", () => {
  const freshCode = { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 60 }] };
  it("is refused without a code from the last 15 minutes", async () => {
    expect(await call(disableTwoStep, { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 16 * 60 }] })).toMatchObject({ ok: false });
    expect(await call(disableTwoStep, { aal: "aal1", amr: [{ method: "password", timestamp: now() }] })).toMatchObject({ ok: false });
    expect(m.listFactors).not.toHaveBeenCalled();
    expect(m.deleteFactor).not.toHaveBeenCalled();
  });
  it("removes only authenticator-app factors and deletes recovery codes", async () => {
    const r = await call(disableTwoStep, freshCode);
    expect(r).toEqual({ ok: true, removed: 1 });
    expect(m.deleteFactor).toHaveBeenCalledTimes(1);
    expect(m.deleteFactor).toHaveBeenCalledWith({ id: "totp-1", userId: USER });
    expect(m.adminRpc).toHaveBeenCalledWith("account_mfa_record_disabled", { _user: USER, _removed: 1, _ok: true });
  });
  it("reports a provider failure instead of claiming it is off", async () => {
    m.deleteFactor.mockResolvedValue({ data: null, error: { message: "nope" } });
    const r = await call(disableTwoStep, freshCode);
    expect(r).toMatchObject({ ok: false });
    expect(m.adminRpc).toHaveBeenCalledWith("account_mfa_record_disabled", expect.objectContaining({ _ok: false }));
  });
});
