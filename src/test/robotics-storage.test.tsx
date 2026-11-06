import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRobotics } from "@/hooks/use-robotics";
import { defaultRoboticsConfig, roboticsStorageKey, type RoboticsCommand } from "@/lib/robotics";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
const command: RoboticsCommand = {
  type: "run",
  scenarioId: "rover-safe-stop",
  operator: "Sample operator",
  config: defaultRoboticsConfig("reaction"),
  consent: true,
};
describe("Separate robotics local persistence", () => {
  it("reads locally recorded evidence after remount", async () => {
    const a = renderHook(useRobotics);
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch(command));
    a.unmount();
    const b = renderHook(useRobotics);
    await waitFor(() => expect(b.result.current.store.runs).toHaveLength(1));
    expect(b.result.current.store.runs[0]?.result.metric).toBe(0.15);
  });
  it.each(["{broken", '{"version":99,"runs":[]}'])(
    "preserves unreadable original %s",
    async (raw) => {
      localStorage.setItem(roboticsStorageKey, raw);
      const a = renderHook(useRobotics);
      await waitFor(() => expect(a.result.current.ready).toBe(true));
      act(() => a.result.current.dispatch(command));
      expect(localStorage.getItem(roboticsStorageKey)).toBe(raw);
      expect(a.result.current.issue).toContain("preserved");
      expect(a.result.current.store.runs).toHaveLength(1);
    },
  );
  it("preserves corrupted cross-tab data and keeps actions temporary", async () => {
    const a = renderHook(useRobotics);
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    localStorage.setItem(roboticsStorageKey, "invalid");
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: roboticsStorageKey, newValue: "invalid" }),
      ),
    );
    act(() => a.result.current.dispatch(command));
    expect(localStorage.getItem(roboticsStorageKey)).toBe("invalid");
    expect(a.result.current.issue).toContain("preserved");
  });
  it("keeps consecutive temporary actions when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = renderHook(useRobotics);
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => {
      a.result.current.dispatch(command);
      a.result.current.dispatch(command);
    });
    expect(a.result.current.store.runs).toHaveLength(2);
    expect(a.result.current.issue).toContain("temporary");
  });
  it("leaves Guardian, CARE, Genesis and Exchange records untouched", async () => {
    const keys = [
      "evolution-guardian-demo-v1",
      "evolution-care-demo-v1",
      "evolution-genesis-demo-v1",
      "evolution-code-exchange-demo-v1",
    ];
    keys.forEach((k) => localStorage.setItem(k, `original-${k}`));
    const a = renderHook(useRobotics);
    await waitFor(() => expect(a.result.current.ready).toBe(true));
    act(() => a.result.current.dispatch(command));
    keys.forEach((k) => expect(localStorage.getItem(k)).toBe(`original-${k}`));
  });
});
