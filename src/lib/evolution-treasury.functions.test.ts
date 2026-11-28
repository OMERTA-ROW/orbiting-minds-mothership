import { beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), header: vi.fn() }));
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

import { postTreasuryJournal, readEvolutionTreasury } from "./evolution-treasury.functions";

const id = "018f0f34-d93d-7a40-a64f-0dc2b28cb8d2";
const context = {
  userId: "owner",
  claims: { amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] },
  supabase: { rpc: seam.rpc },
};
const emptySnapshot = {
  checkedAt: new Date().toISOString(),
  realMoney: false as const,
  unitName: "internal units" as const,
  accounts: [],
  journals: [],
  audit: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  seam.owner.mockResolvedValue(undefined);
  seam.rpc.mockResolvedValue({ data: emptySnapshot, error: null });
});

describe("Evolution Treasury server functions — mocked owner and database", () => {
  it("checks owner authorization before reading and prevents shared caching", async () => {
    const read = readEvolutionTreasury as unknown as (value: {
      context: typeof context;
    }) => Promise<typeof emptySnapshot>;
    await expect(read({ context })).resolves.toEqual(emptySnapshot);
    expect(seam.owner).toHaveBeenCalledOnce();
    expect(seam.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(seam.rpc).toHaveBeenCalledWith("evolution_treasury_read_snapshot");
  });

  it("fails closed when the snapshot claims real money", async () => {
    seam.rpc.mockResolvedValue({ data: { ...emptySnapshot, realMoney: true }, error: null });
    const read = readEvolutionTreasury as unknown as (value: {
      context: typeof context;
    }) => Promise<unknown>;
    await expect(read({ context })).rejects.toThrow();
  });

  it("refuses posting with stale two-step confirmation before any database mutation", async () => {
    const stale = { ...context, claims: { amr: [{ method: "totp", timestamp: 1 }] } };
    const post = postTreasuryJournal as unknown as (value: {
      context: typeof stale;
      data: { journalId: string; amountConfirmation: number };
    }) => Promise<unknown>;
    await expect(
      post({ context: stale, data: { journalId: id, amountConfirmation: 100 } }),
    ).rejects.toThrow("15 minutes");
    expect(seam.rpc).not.toHaveBeenCalled();
  });

  it("passes the exact journal and amount confirmation to the atomic posting function", async () => {
    seam.rpc.mockResolvedValue({
      data: { ok: true, journalId: id, status: "posted", existing: false },
      error: null,
    });
    const post = postTreasuryJournal as unknown as (value: {
      context: typeof context;
      data: { journalId: string; amountConfirmation: number };
    }) => Promise<{ status?: string }>;
    await expect(
      post({ context, data: { journalId: id, amountConfirmation: 100 } }),
    ).resolves.toMatchObject({ status: "posted" });
    expect(seam.rpc).toHaveBeenCalledWith("evolution_treasury_post_journal", {
      _journal_id: id,
      _amount_confirmation: 100,
    });
  });
});
