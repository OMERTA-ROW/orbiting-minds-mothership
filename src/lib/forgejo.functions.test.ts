import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ owner: vi.fn(), list: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: seam.header }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: seam.owner }));
vi.mock("./forgejo", () => ({ listForgejoRepos: seam.list }));
import { readForgejoRepos } from "./forgejo.functions";

// Compiled-handler unit seam, not live auth, Cloud or gateway evidence.
const context = { userId: "unit-owner", claims: { aal: "aal2" }, supabase: {} };
function invoke() {
  if (typeof readForgejoRepos !== "function") throw new Error("Handler unavailable");
  return (readForgejoRepos as unknown as (input: { context: typeof context }) => Promise<unknown>)({
    context,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  seam.owner.mockReset();
  seam.list.mockResolvedValue({ state: "connected", repos: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("Forgejo authenticated server boundary", () => {
  it("refuses owner/MFA failure before any gateway call", async () => {
    seam.owner.mockRejectedValue(new Error("Owner MFA required"));
    expect(await invoke()).toEqual({ state: "denied" });
    expect(seam.list).not.toHaveBeenCalled();
  });
  it("passes all four server settings only after owner validation with no-store", async () => {
    vi.stubEnv("FORGEJO_BASE_URL", "https://git-api.evoomni.tech");
    vi.stubEnv("FORGEJO_API_TOKEN", "unit-key");
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "unit-id");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "unit-secret");
    await invoke();
    expect(seam.owner).toHaveBeenCalledWith(context.supabase, context.userId, context.claims);
    expect(seam.list).toHaveBeenCalledWith({
      base: "https://git-api.evoomni.tech",
      token: "unit-key",
      accessClientId: "unit-id",
      accessClientSecret: "unit-secret",
    });
    expect(seam.owner.mock.invocationCallOrder[0]).toBeLessThan(
      seam.list.mock.invocationCallOrder[0] ?? 0,
    );
    expect(seam.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});
