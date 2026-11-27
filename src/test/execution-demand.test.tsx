import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({ read: vi.fn(), control: vi.fn(), plan: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/unified-activation.functions", () => ({
  getUnifiedExecutionState: fns.read,
  controlUnifiedExecution: fns.control,
  runAuthorizedPlan: fns.plan,
}));
import { UnifiedExecutionStatus } from "@/components/omnibridge/UnifiedExecutionStatus";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Mounted execution observation", () => {
  it("removes idle reads, resumes on request, follows active cancellation and stops when clear", async () => {
    vi.useFakeTimers();
    const idle = { armed: false, running: false, cancellationPending: false };
    fns.read.mockResolvedValue({ state: idle, label: "Blocked" });
    const view = render(<UnifiedExecutionStatus />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fns.read).toHaveBeenCalledTimes(1);
    fns.read.mockResolvedValue({ state: { ...idle, cancellationPending: true }, label: "Blocked" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh execution state" }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fns.read).toHaveBeenCalledTimes(4);
    fns.read.mockResolvedValue({ state: idle, label: "Blocked" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fns.read).toHaveBeenCalledTimes(5);
    expect(fns.control).not.toHaveBeenCalled();
    expect(fns.plan).not.toHaveBeenCalled();
    view.unmount();
  });
});
