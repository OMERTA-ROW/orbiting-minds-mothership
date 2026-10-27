import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  access: vi.fn(),
  projects: vi.fn(),
  rpc: vi.fn(),
  state: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.state }) }) }) },
}));
vi.mock("@/lib/ai/omni-responses.server", () => ({ omniModel: "configured-model" }));
import { readOmniActivation } from "@/lib/omni-activation.functions";

const run = () =>
  (readOmniActivation as unknown as (args: unknown) => Promise<unknown>)({
    context: {
      userId: "verified-user",
      supabase: { auth: { getUser: mocks.identity }, from: mocks.from, rpc: mocks.rpc },
    },
  });
describe("authenticated read-only activation snapshot", () => {
  beforeEach(() => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only-key");
    mocks.identity
      .mockReset()
      .mockResolvedValue({
        data: { user: { id: "verified-user", email_confirmed_at: "2026-10-27T00:00:00Z" } },
        error: null,
      });
    mocks.access
      .mockReset()
      .mockResolvedValue({ data: { ai_approved: true, paused: false }, error: null });
    mocks.projects.mockReset().mockResolvedValue({ count: 1, error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    mocks.state.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.from.mockReset().mockImplementation((table: string) => ({
      select: () => ({
        eq: (column: string, id: string) => {
          expect(id).toBe("verified-user");
          if (table === "beta_access") {
            expect(column).toBe("user_id");
            return { maybeSingle: mocks.access };
          }
          expect(table).toBe("beta_projects");
          expect(column).toBe("owner_id");
          return mocks.projects();
        },
      }),
    }));
  });
  it("reads only caller permissions and owned project count, without granting pending roles", async () => {
    expect(await run()).toMatchObject({
      state: "Ready for reviewed request",
      membership: "unavailable",
      inferenceVerified: false,
      nativeConnected: false,
      executionAllowed: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("caller_role");
    expect(mocks.from.mock.calls.map((c) => c[0])).toEqual(["beta_access", "beta_projects"]);
  });
  it("rejects identity mismatch before reading permissions", async () => {
    mocks.identity.mockResolvedValue({ data: { user: { id: "different-user" } }, error: null });
    await expect(run()).rejects.toThrow("session");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("fails closed on unavailable owner data", async () => {
    mocks.projects.mockResolvedValue({ count: null, error: { message: "denied" } });
    await expect(run()).rejects.toThrow("permissions");
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("does not consider missing availability state to be a provider success", async () => {
    mocks.state.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await run()).toMatchObject({ state: "Blocked", inferenceVerified: false });
  });
  it("does not return private service key or infer runtime from key presence", async () => {
    expect(JSON.stringify(await run())).not.toContain("test-only-key");
    vi.stubEnv("LOVABLE_API_KEY", "");
    expect(await run()).toMatchObject({ state: "Blocked", inferenceVerified: false });
  });
});
