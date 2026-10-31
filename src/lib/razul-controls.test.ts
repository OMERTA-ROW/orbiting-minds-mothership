import { describe, expect, it, vi } from "vitest";
import { applyRazulControl, razulControlInput, sourceCheckState } from "./razul-controls";

describe("Razul owner controls", () => {
  it("requires explicit owner confirmation", () => {
    expect(razulControlInput.safeParse({ action: "pause", confirm: false }).success).toBe(false);
  });
  it("denies unavailable authorization before any setting write", async () => {
    const rpc = vi.fn();
    await expect(
      applyRazulControl(
        {
          authorize: async () => {
            throw new Error("MFA owner required");
          },
          rpc,
        },
        { action: "pause", confirm: true },
      ),
    ).rejects.toThrow("MFA owner required");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("pauses only the existing observatory with fixed metadata", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await applyRazulControl({ authorize: async () => {}, rpc }, { action: "pause", confirm: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("razul_pause", {
      _reason: "Paused by verified owner",
    });
  });
  it("does not offer a job activation or resume command", () => {
    expect(razulControlInput.safeParse({ action: "resume", confirm: true }).success).toBe(false);
  });
  it("preserves the bounded retention and relevance limits", () => {
    const data = {
      action: "configure",
      confirm: true,
      threshold: 40,
      retentionDays: 7,
      coverage: [],
      blockedSources: [],
    };
    expect(razulControlInput.safeParse(data).success).toBe(true);
    expect(razulControlInput.safeParse({ ...data, retentionDays: 366 }).success).toBe(false);
    expect(razulControlInput.safeParse({ ...data, threshold: 101 }).success).toBe(false);
  });
  it("only edits the six established agent subscriptions", () => {
    expect(
      razulControlInput.safeParse({
        action: "subscription",
        confirm: true,
        agent: "stranger",
        categories: [],
        floor: 40,
        enabled: true,
      }).success,
    ).toBe(false);
  });
  it("failed persistence never returns saved", async () => {
    await expect(
      applyRazulControl(
        { authorize: async () => {}, rpc: async () => ({ error: "denied" }) },
        { action: "pause", confirm: true },
      ),
    ).rejects.toThrow("not saved");
  });
  it("cannot infer source checks from collection or future timestamps", () => {
    expect(sourceCheckState(undefined, "2026-10-31T18:00:00Z")).toBe("unknown");
    expect(
      sourceCheckState(
        { checked_at: "2026-11-01T00:00:00Z", status: "completed" },
        "2026-10-31T18:00:00Z",
      ),
    ).toBe("unknown");
  });
  it("flags actual receipt failures and stale successful checks", () => {
    expect(
      sourceCheckState(
        { checked_at: "2026-10-31T17:00:00Z", status: "failed" },
        "2026-10-31T18:00:00Z",
      ),
    ).toBe("last check failed");
    expect(
      sourceCheckState(
        { checked_at: "2026-10-29T17:00:00Z", status: "completed" },
        "2026-10-31T18:00:00Z",
      ),
    ).toBe("stale");
  });
});
