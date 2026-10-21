import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getForgeExport } from "@/lib/forge.functions";

const results = new Map<string, unknown>();
const digest = "a".repeat(64);
const context = {
  userId: "owner",
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => results.get(table),
        maybeSingle: async () => results.get(table),
      };
      return query;
    },
  },
};
// Only the handler is exposed here; hosted QA independently verifies auth/RLS.
const invoke = getForgeExport as unknown as (args: { context: typeof context; data: { id: string } }) => Promise<unknown>;
describe("Forge export revalidates current approval", () => {
  beforeEach(() => {
    results.set("beta_access", { data: { studio_approved: true, paused: false }, error: null });
    results.set("forge_versions", { data: { id: "version", sha256: digest }, error: null });
    results.set("forge_reviews", { data: { version_id: "version", sha256: digest }, error: null });
  });
  it("rejects a withdrawn review even when the page cached approval", async () => {
    results.set("forge_reviews", { data: null, error: new Error("not found") });
    await expect(invoke({ context, data: { id: "version" } })).rejects.toThrow("review required");
  });
  it("blocks export after account media approval is revoked", async () => {
    results.set("beta_access", { data: { studio_approved: false, paused: false }, error: null });
    await expect(invoke({ context, data: { id: "version" } })).rejects.toThrow("approval");
  });
  it("blocks export after account pause", async () => {
    results.set("beta_access", { data: { studio_approved: true, paused: true }, error: null });
    await expect(invoke({ context, data: { id: "version" } })).rejects.toThrow("paused");
  });
  it("requires the exact reviewed digest", async () => {
    results.set("forge_reviews", { data: { sha256: "b".repeat(64) }, error: null });
    await expect(invoke({ context, data: { id: "version" } })).rejects.toThrow("digest");
  });
});