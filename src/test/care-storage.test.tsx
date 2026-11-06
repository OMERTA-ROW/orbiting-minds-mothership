import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareProvider, useCare, careStorageKey } from "@/hooks/use-care";
import { initialCareStore } from "@/lib/care";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("CARE browser-local preferences", () => {
  it("reads recorded consent and history back after remount", async () => {
    const a = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() =>
      a.result.current.dispatch({
        type: "modules",
        modules: { ...initialCareStore.modules, care: true },
      }),
    );
    a.unmount();
    const b = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(b.result.current.store.modules.care).toBe(true));
    expect(b.result.current.store.history).toHaveLength(1);
  });
  it("preserves corrupt stored data rather than overwriting it", async () => {
    const raw = '{"version":99,"keep":"original"}';
    localStorage.setItem(careStorageKey, raw);
    const a = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause" }));
    expect(localStorage.getItem(careStorageKey)).toBe(raw);
    expect(a.result.current.issue).toContain("preserved");
  });
  it("keeps consecutive temporary actions when writes are denied", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => {
      a.result.current.dispatch({ type: "device", id: "win-demo" });
      a.result.current.dispatch({ type: "pause" });
    });
    expect(a.result.current.store.deviceId).toBe("win-demo");
    expect(a.result.current.store.history).toHaveLength(2);
    expect(a.result.current.issue).toContain("temporary");
  });
  it("restores a legacy Windows device with winget context without discarding history", async () => {
    const legacy = JSON.parse(JSON.stringify(initialCareStore));
    delete legacy.channel;
    delete legacy.scanPlans;
    delete legacy.policy.days;
    legacy.deviceId = "win-demo";
    legacy.history = [
      { id: "original", at: "2026-10-20T23:56:00.000Z", action: "Original local event" },
    ];
    localStorage.setItem(careStorageKey, JSON.stringify(legacy));
    const a = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    expect(a.result.current.store.channel).toBe("winget");
    expect(a.result.current.store.history).toEqual(legacy.history);
  });
  it("never overwrites existing Exchange or Genesis stores", async () => {
    localStorage.setItem("evolution-code-exchange-demo-v1", "exchange");
    localStorage.setItem("evolution-genesis-demo-v1", "genesis");
    const a = renderHook(useCare, { wrapper: CareProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause" }));
    expect(localStorage.getItem("evolution-code-exchange-demo-v1")).toBe("exchange");
    expect(localStorage.getItem("evolution-genesis-demo-v1")).toBe("genesis");
  });
});
