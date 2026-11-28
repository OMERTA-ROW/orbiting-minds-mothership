import { describe, it, expect, vi, beforeEach } from "vitest";
const s = vi.hoisted(() => ({ owner: vi.fn(), audit: vi.fn(), reader: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: s.header }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: s.owner }));
vi.mock("./forgejo-audit.server", () => ({ auditReader: s.reader }));
vi.mock("./forgejo-audit", () => ({ auditMirrors: s.audit }));
import { readForgejoIntegrity } from "./forgejo-audit.functions";
function invoke() {
  return (readForgejoIntegrity as unknown as (i: { context: unknown }) => Promise<unknown>)({
    context: { supabase: {}, userId: "unit", claims: { aal: "aal2" } },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  s.owner.mockReset();
});
describe("audit owner boundary (compiled-handler mock)", () => {
  it("refuses MFA denial before creating readers", async () => {
    s.owner.mockRejectedValue(new Error("denied"));
    expect(await invoke()).toEqual({ state: "denied" });
    expect(s.reader).not.toHaveBeenCalled();
    expect(s.audit).not.toHaveBeenCalled();
  });
  it("checks owner before a private read-only audit", async () => {
    s.audit.mockResolvedValue({ complete: false });
    expect(await invoke()).toEqual({ state: "audited", audit: { complete: false } });
    expect(s.owner.mock.invocationCallOrder[0]).toBeLessThan(
      s.reader.mock.invocationCallOrder[0] ?? 0,
    );
    expect(s.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});
