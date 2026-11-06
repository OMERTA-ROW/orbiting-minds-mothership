import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useNexus, nexusStorageKey } from "@/hooks/use-nexus";
import { GenesisProvider, genesisStorageKey } from "@/hooks/use-genesis";
import { nexusPeople, planned, projectId, nexusStep, approved } from "./nexus-fixtures";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
function seed() {
  localStorage.setItem(genesisStorageKey, JSON.stringify(nexusPeople()));
  localStorage.setItem(nexusStorageKey, JSON.stringify(planned()));
}
describe("Independent validated Nexus storage", () => {
  it("reads local routed drafts back after remount", async () => {
    seed();
    const a = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() =>
      a.result.current.dispatch({
        type: "message",
        projectId,
        actorId: "author",
        body: "Persistent sample task",
        targets: ["openai"],
        shared: false,
        consent: true,
      }),
    );
    a.unmount();
    const b = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(b.result.current.store.tasks).toHaveLength(1));
    expect(b.result.current.store.tasks[0]?.prompt).toBe("Persistent sample task");
    expect(b.result.current.store.messages[0]?.channel).toBe("openai");
  });
  it("preserves malformed storage without overwriting", async () => {
    seed();
    const raw = '{"version":99,"original":true}';
    localStorage.setItem(nexusStorageKey, raw);
    const a = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause", paused: true }));
    expect(localStorage.getItem(nexusStorageKey)).toBe(raw);
    expect(a.result.current.issue).toContain("preserved");
  });
  it("retains consecutive temporary actions when browser saving fails", async () => {
    seed();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => {
      a.result.current.dispatch({
        type: "message",
        projectId,
        actorId: "author",
        body: "First sample task",
        targets: [],
        shared: true,
        consent: true,
      });
      a.result.current.dispatch({
        type: "message",
        projectId,
        actorId: "author",
        body: "Second sample task",
        targets: [],
        shared: true,
        consent: true,
      });
    });
    expect(a.result.current.store.messages).toHaveLength(2);
    expect(a.result.current.issue).toContain("temporary");
  });
  it("does not alter Guardian, CARE, Trust or Genesis stores", async () => {
    seed();
    const keys = [
      "evolution-guardian-demo-v1",
      "evolution-care-demo-v1",
      "evolution-trusted-release-demo-v1",
    ];
    keys.forEach((k) => localStorage.setItem(k, "original"));
    const genesis = localStorage.getItem(genesisStorageKey);
    const a = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch({ type: "pause", paused: true }));
    keys.forEach((k) => expect(localStorage.getItem(k)).toBe("original"));
    expect(localStorage.getItem(genesisStorageKey)).toBe(genesis);
  });
  it("refreshes current saved version before a stale merge without overwriting", async () => {
    seed();
    localStorage.setItem(nexusStorageKey, JSON.stringify(approved()));
    const a = renderHook(useNexus, { wrapper: GenesisProvider });
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    const latest = nexusStep(approved(), {
      type: "merge",
      projectId,
      taskId: "task-openai",
      actorId: "author",
      consent: true,
    });
    const saved = JSON.stringify(latest);
    localStorage.setItem(nexusStorageKey, saved);
    act(() => {
      expect(() =>
        a.result.current.dispatch({
          type: "merge",
          projectId,
          taskId: "task-openai",
          actorId: "author",
          consent: true,
        }),
      ).toThrow(/read-only/);
    });
    expect(a.result.current.store.projects[0]?.version).toBe(2);
    expect(localStorage.getItem(nexusStorageKey)).toBe(saved);
  });
});
