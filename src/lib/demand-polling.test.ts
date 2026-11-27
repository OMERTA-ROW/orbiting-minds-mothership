import { afterEach, describe, expect, it, vi } from "vitest";
import { demandPolling, executionPollDelay } from "./demand-polling";

afterEach(() => vi.useRealTimers());

describe("Phase 2 observation demand", () => {
  it("does not poll idle execution, but preserves armed, running and cancellation cadence", () => {
    const idle = { armed: false, running: false, cancellationPending: false };
    expect(executionPollDelay(idle)).toBe(false);
    expect(executionPollDelay(null)).toBe(false);
    expect(executionPollDelay({ ...idle, armed: true })).toBe(5000);
    expect(executionPollDelay({ ...idle, running: true })).toBe(5000);
    expect(executionPollDelay({ ...idle, cancellationPending: true })).toBe(5000);
  });

  it("makes one idle read, no reads over one hour, and supports explicit refresh", async () => {
    vi.useFakeTimers();
    const poll = vi.fn(async () => false as const);
    const observer = demandPolling({ poll, visible: () => true });
    await observer.refresh();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await observer.refresh();
    expect(poll).toHaveBeenCalledTimes(2);
    observer.close();
  });

  it("keeps required active observations running in a hidden tab", async () => {
    vi.useFakeTimers();
    const poll = vi.fn(async () => 5000);
    const observer = demandPolling({ poll, visible: () => false, allowHidden: true });
    await observer.refresh();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(poll).toHaveBeenCalledTimes(4);
    observer.close();
  });

  it("suspends passive hidden-tab reads and refreshes immediately on return", async () => {
    vi.useFakeTimers();
    let visible = true;
    const poll = vi.fn(async () => 20_000);
    const observer = demandPolling({ poll, visible: () => visible });
    await observer.refresh();
    visible = false;
    observer.visibilityChanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
    visible = true;
    observer.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(2);
    observer.close();
  });

  it("does not overlap slow reads or visibility/manual requests", async () => {
    vi.useFakeTimers();
    let finish: ((delay: number) => void) | undefined;
    const poll = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const observer = demandPolling({ poll, visible: () => true });
    const first = observer.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    await observer.refresh();
    observer.visibilityChanged();
    expect(poll).toHaveBeenCalledTimes(1);
    if (!finish) throw new Error("Read did not start");
    finish(5000);
    await first;
    await vi.advanceTimersByTimeAsync(4999);
    expect(poll).toHaveBeenCalledTimes(1);
    observer.close();
  });

  it("stops after active work becomes idle and never replays a failed read", async () => {
    vi.useFakeTimers();
    const poll = vi
      .fn<() => Promise<number | false>>()
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(false);
    const observer = demandPolling({ poll, visible: () => true });
    await observer.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(2);
    poll.mockRejectedValueOnce(new Error("offline"));
    await observer.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(3);
    observer.close();
  });

  it("cannot reschedule an in-flight read after unmount", async () => {
    vi.useFakeTimers();
    let finish: ((delay: number) => void) | undefined;
    const poll = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const observer = demandPolling({ poll, visible: () => true });
    const first = observer.refresh();
    observer.close();
    if (!finish) throw new Error("Read did not start");
    finish(5000);
    await first;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
