import { beforeEach, describe, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({ owner: vi.fn(), list: vi.fn(), read: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: seam.header }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: seam.owner }));
vi.mock("./forgejo", () => ({ listForgejoRepos: seam.list }));
vi.mock("./repository-features.server", () => ({
  readRepositoryFeature: seam.read,
  githubFeatureInventory: seam.list,
}));
import { readRepositoryFeatures } from "./repository-features.functions";
const context = { userId: "unit-owner", claims: { aal: "aal2" }, supabase: {} };
const data = { repo: "owner/repo", feature: "issues" as const, page: 1 };
const invoke = () =>
  (
    readRepositoryFeatures as unknown as (v: {
      data: typeof data;
      context: typeof context;
    }) => Promise<{ state: string }>
  )({ context, data });
beforeEach(() => {
  vi.clearAllMocks();
  seam.owner.mockReset();
  seam.list.mockResolvedValue({ state: "connected", repos: [{ name: "owner/repo" }] });
  seam.read.mockResolvedValue({ state: "read", rows: [] });
});
describe("Repository feature compiled handler — mocked auth/provider", () => {
  it("refuses failed owner/MFA checks before inventory or feature reads", async () => {
    seam.owner.mockRejectedValue(new Error("private reason"));
    expect((await invoke()).state).toBe("blocked");
    expect(seam.list).not.toHaveBeenCalled();
    expect(seam.read).not.toHaveBeenCalled();
  });
  it("refuses a repository outside current authorized inventory", async () => {
    seam.list.mockResolvedValue({ state: "connected", repos: [{ name: "other/repo" }] });
    expect((await invoke()).state).toBe("blocked");
    expect(seam.read).not.toHaveBeenCalled();
  });
  it("refuses unverifiable inventory", async () => {
    seam.list.mockResolvedValue({ state: "unreachable" });
    expect((await invoke()).state).toBe("blocked");
    expect(seam.read).not.toHaveBeenCalled();
  });
  it("checks owner then inventory before reading and uses no-store", async () => {
    expect((await invoke()).state).toBe("read");
    expect(seam.owner.mock.invocationCallOrder[0]).toBeLessThan(
      seam.list.mock.invocationCallOrder[0] ?? 0,
    );
    expect(seam.list.mock.invocationCallOrder[0]).toBeLessThan(
      seam.read.mock.invocationCallOrder[0] ?? 0,
    );
    expect(seam.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});
