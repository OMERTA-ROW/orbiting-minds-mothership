import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), access: vi.fn(), membership: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.membership,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.access }) }) }),
  }),
}));
import { authenticateBetaAi, readBoundedJson } from "@/lib/beta-auth.server";
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:8080/api/omni", {
    method: "POST",
    headers: { origin: "http://localhost:8080", ...headers },
  });
describe("server AI permission boundary", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
    mocks.getUser.mockReset().mockResolvedValue({
      data: { user: { id: "test-owner", email_confirmed_at: "2026-10-27T00:00:00Z" } },
      error: null,
    });
    mocks.access
      .mockReset()
      .mockResolvedValue({ data: { ai_approved: true, paused: false }, error: null });
    mocks.membership.mockReset().mockResolvedValue({ data: "owner", error: null });
  });
  it("rejects anonymous requests before account/model access", async () => {
    await expect(authenticateBetaAi(request())).rejects.toMatchObject({ status: 401 });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects foreign origin", async () => {
    await expect(
      authenticateBetaAi(request({ origin: "https://evil.test", authorization: "Bearer invalid" })),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects missing origin", async () => {
    await expect(
      authenticateBetaAi(
        new Request("http://localhost:8080/api/omni", {
          method: "POST",
          headers: { authorization: "Bearer test" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects non-bearer authorization", async () => {
    await expect(
      authenticateBetaAi(request({ authorization: "Basic test" })),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("permits only revalidated approved account", async () => {
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).resolves.toMatchObject({ userId: "test-owner" });
    expect(mocks.getUser).toHaveBeenCalledWith("test");
  });
  it("rejects unconfirmed email even before reading founder approval", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "test-owner", email_confirmed_at: null } },
      error: null,
    });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("revalidates and rejects expired tokens", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer expired" })),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("rejects unapproved sessions despite valid identity", async () => {
    mocks.access.mockResolvedValue({ data: { ai_approved: false, paused: false }, error: null });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects paused sessions", async () => {
    mocks.access.mockResolvedValue({ data: { ai_approved: true, paused: true }, error: null });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("blocks missing protected membership setup on every AI endpoint", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("does not let a beta approval substitute for membership", async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("fails closed when permissions cannot be read", async () => {
    mocks.access.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(
      authenticateBetaAi(request({ authorization: "Bearer test" })),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects oversized body while reading", async () => {
    const req = new Request("http://localhost:8080/api/omni", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(12001) }),
    });
    await expect(readBoundedJson(req)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed JSON", async () => {
    await expect(
      readBoundedJson(
        new Request("http://localhost:8080", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects non-JSON content type", async () => {
    await expect(
      readBoundedJson(
        new Request("http://localhost:8080", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("reads complete valid JSON at exactly the bounded byte count", async () => {
    await expect(
      readBoundedJson(
        new Request("http://localhost:8080", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"a":1}',
        }),
        7,
      ),
    ).resolves.toEqual({ a: 1 });
  });
});
