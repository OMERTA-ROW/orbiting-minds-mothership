import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ReactNode } from "react";
import { GenesisProvider, useGenesis, genesisStorageKey } from "@/hooks/use-genesis";
import { TrustedReleaseProvider, useTrustedRelease } from "@/hooks/use-trusted-release";
import { trustStorageKey } from "@/lib/trusted-release";
const wrapper = ({ children }: { children: ReactNode }) => (
  <GenesisProvider>
    <TrustedReleaseProvider>{children}</TrustedReleaseProvider>
  </GenesisProvider>
);
const useBoth = () => ({ g: useGenesis(), t: useTrustedRelease() });
const input = {
  title: "Fictional comparison",
  problem: "Compare synthetic response times.",
  unit: "milliseconds",
  direction: "Lower is better",
  baseline: [100, 110, 90],
  candidate: [80, 88, 72],
  method: "Paired fictional inputs with consistent ordering and median comparison.",
  fixtureVersion: "fixture-1",
  limitations: "No independent measurement or verified benefit.",
  consent: true,
};
async function ready() {
  const h = renderHook(useBoth, { wrapper });
  await waitFor(() => expect(h.result.current.g.ready && h.result.current.t.ready).toBe(true));
  let id = "";
  act(() => {
    id = h.result.current.g.dispatch({
      type: "identity",
      input: {
        name: "Sample owner",
        kind: "Human",
        agentName: "",
        role: "Builder",
        scopes: ["submit_capsules", "simulate_twins", "review_proposals"],
        consent: true,
        spendCapUsd: 0,
      },
    });
  });
  return { h, id };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("Trust store browser-local isolation", () => {
  it("reads real recorded demo comparisons after reload", async () => {
    const { h, id } = await ready();
    await act(async () => {
      await h.result.current.t.dispatch({ type: "impact", input: { ...input, operatorId: id } });
    });
    h.unmount();
    const next = renderHook(useBoth, { wrapper });
    await waitFor(() => expect(next.result.current.t.store.impacts).toHaveLength(1));
    expect(next.result.current.t.store.impacts[0]?.baseline).toEqual([100, 110, 90]);
  });
  it("preserves corrupt originals instead of overwriting them", async () => {
    const raw = '{"version":99,"keep":"original"}';
    localStorage.setItem(trustStorageKey, raw);
    const { h, id } = await ready();
    await act(async () => {
      await h.result.current.t.dispatch({ type: "impact", input: { ...input, operatorId: id } });
    });
    expect(localStorage.getItem(trustStorageKey)).toBe(raw);
    expect(h.result.current.t.issue).toContain("preserved");
  });
  it("preserves multiple temporary actions if writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { h, id } = await ready();
    await act(async () => {
      await h.result.current.t.dispatch({ type: "impact", input: { ...input, operatorId: id } });
    });
    await act(async () => {
      await h.result.current.t.dispatch({
        type: "impact",
        input: { ...input, title: "Second fictional comparison", operatorId: id },
      });
    });
    expect(h.result.current.t.store.impacts).toHaveLength(2);
    expect(h.result.current.t.issue).toContain("temporary");
  });
  it("never modifies Genesis, CARE, Guardian or Incident records", async () => {
    const { h, id } = await ready();
    const original = localStorage.getItem(genesisStorageKey);
    for (const k of [
      "evolution-care-demo-v1",
      "evolution-guardian-demo-v1",
      "evolution-incidents-demo-v1",
    ])
      localStorage.setItem(k, "original");
    await act(async () => {
      await h.result.current.t.dispatch({ type: "impact", input: { ...input, operatorId: id } });
    });
    expect(localStorage.getItem(genesisStorageKey)).toBe(original);
    for (const k of [
      "evolution-care-demo-v1",
      "evolution-guardian-demo-v1",
      "evolution-incidents-demo-v1",
    ])
      expect(localStorage.getItem(k)).toBe("original");
  });
  it("serializes queued actions without losing a comparison", async () => {
    const { h, id } = await ready();
    await act(async () => {
      await Promise.all([
        h.result.current.t.dispatch({ type: "impact", input: { ...input, operatorId: id } }),
        h.result.current.t.dispatch({
          type: "impact",
          input: { ...input, title: "Another fictional comparison", operatorId: id },
        }),
      ]);
    });
    expect(h.result.current.t.store.impacts).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(trustStorageKey) ?? "{}").impacts).toHaveLength(2);
  });
});
