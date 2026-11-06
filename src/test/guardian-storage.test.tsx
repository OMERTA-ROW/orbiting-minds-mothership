import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardianProvider, useGuardian, guardianStorageKey } from "@/hooks/use-guardian";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("Guardian independent browser-local store", () => {
  it("reads an actual locally recorded incident after remount", async () => {
    const a = renderHook(useGuardian, { wrapper: GuardianProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "incident", deviceId: "mac-demo" }));
    a.unmount();
    const b = renderHook(useGuardian, { wrapper: GuardianProvider });
    await waitFor(() => expect(b.result.current.store.incidents).toHaveLength(1));
    expect(b.result.current.store.audit[0]?.kind).toBe("incident");
  });
  it("preserves malformed original storage without overwriting", async () => {
    const raw = '{"version":99,"private":"original"}';
    localStorage.setItem(guardianStorageKey, raw);
    const a = renderHook(useGuardian, { wrapper: GuardianProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause" }));
    expect(localStorage.getItem(guardianStorageKey)).toBe(raw);
    expect(a.result.current.issue).toContain("preserved");
  });
  it("retains consecutive temporary actions when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = renderHook(useGuardian, { wrapper: GuardianProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => {
      a.result.current.dispatch({ type: "incident", deviceId: "mac-demo" });
      a.result.current.dispatch({ type: "pause" });
    });
    expect(a.result.current.store.audit).toHaveLength(2);
    expect(a.result.current.store.paused).toBe(true);
    expect(a.result.current.issue).toContain("temporary");
  });
  it("does not overwrite CARE, Genesis or Exchange records", async () => {
    const keys = [
      "evolution-care-demo-v1",
      "evolution-genesis-demo-v1",
      "evolution-code-exchange-demo-v1",
    ];
    keys.forEach((k) => localStorage.setItem(k, `${k}-original`));
    const a = renderHook(useGuardian, { wrapper: GuardianProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause" }));
    keys.forEach((k) => expect(localStorage.getItem(k)).toBe(`${k}-original`));
  });
});
