import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useEntertainment, entertainmentStorageKey } from "@/hooks/use-entertainment";
import { GuardianProvider, guardianStorageKey } from "@/hooks/use-guardian";
import { GenesisProvider } from "@/hooks/use-genesis";
import { initialGuardianStore } from "@/lib/guardian";
import { nexusStorageKey } from "@/hooks/use-nexus";
import { initialNexusStore } from "@/lib/nexus";
import { type CreativeInput } from "@/lib/entertainment";
const input: CreativeInput = {
  worldId: "nexus-studio",
  studioId: "film",
  goal: "Plan a fictional original lunar short with caption QA.",
  credit: "Demo human",
  rights: "Original prototype samples only; no third-party footage.",
  destination: "No distribution",
  consent: true,
};
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <GuardianProvider>
      <GenesisProvider>{children}</GenesisProvider>
    </GuardianProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("Creative browser-local records", () => {
  it("persists consented plans across remount", async () => {
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    a.unmount();
    const b = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(b.result.current.store.plans[0]?.goal).toBe(input.goal));
  });
  it("preserves malformed prior records", async () => {
    const raw = '{"version":99,"original":"keep"}';
    localStorage.setItem(entertainmentStorageKey, raw);
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    expect(localStorage.getItem(entertainmentStorageKey)).toBe(raw);
    expect(a.result.current.store.plans).toHaveLength(1);
  });
  it("retains consecutive temporary actions when saving fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => {
      a.result.current.dispatch({ type: "propose", input });
      a.result.current.dispatch({ type: "propose", input });
    });
    expect(a.result.current.store.plans).toHaveLength(2);
  });
  it.each(["guardian", "nexus"])("fresh %s pause blocks stale creative mutations", async (key) => {
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    localStorage.setItem(
      key === "guardian" ? guardianStorageKey : nexusStorageKey,
      JSON.stringify({
        ...(key === "guardian" ? initialGuardianStore : initialNexusStore),
        paused: true,
      }),
    );
    act(() =>
      expect(() => a.result.current.dispatch({ type: "propose", input })).toThrow(/paused/),
    );
    expect(a.result.current.store.plans).toHaveLength(0);
  });
  it("unreadable policy fails closed but withdrawal stays possible", async () => {
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    const id = a.result.current.store.plans[0]?.id;
    if (!id) throw new Error("Missing plan");
    localStorage.setItem(guardianStorageKey, "unreadable");
    act(() => expect(() => a.result.current.dispatch({ type: "propose", input })).toThrow());
    act(() => a.result.current.dispatch({ type: "withdraw", planId: id, worldId: input.worldId }));
    expect(a.result.current.store.plans[0]?.state).toBe("Withdrawn");
    expect(localStorage.getItem(guardianStorageKey)).toBe("unreadable");
  });
  it("does not modify OmniBridge, Nexus or Guardian records", async () => {
    localStorage.setItem(guardianStorageKey, JSON.stringify(initialGuardianStore));
    localStorage.setItem(nexusStorageKey, JSON.stringify(initialNexusStore));
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    const keys = [
      guardianStorageKey,
      nexusStorageKey,
      "evolution-omnibridge-demo-v1",
      "evolution-genesis-demo-v1",
    ];
    const before = keys.map((k) => localStorage.getItem(k));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    expect(keys.map((k) => localStorage.getItem(k))).toEqual(before);
  });
  it("refreshes stored records before another mutation", async () => {
    const a = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    const b = renderHook(useEntertainment, { wrapper: Wrapper });
    await waitFor(() => expect(b.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "propose", input }));
    act(() => b.result.current.dispatch({ type: "propose", input }));
    expect(b.result.current.store.plans).toHaveLength(3);
  });
});
