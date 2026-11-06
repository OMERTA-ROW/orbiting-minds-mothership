import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoExchangeProvider, useDemoExchange } from "@/hooks/use-demo-exchange";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
const feedback = {
  contributionId: "sandbox-transfer",
  name: "Demo reviewer",
  body: "Please verify atomic replay protection.",
  kind: "Comment" as const,
};
describe("Demo-only browser persistence", () => {
  it("reads feedback back on reload without creating shared records", async () => {
    const first = renderHook(useDemoExchange, { wrapper: DemoExchangeProvider });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    act(() => first.result.current.addFeedback(feedback));
    expect(first.result.current.store.activity).toHaveLength(1);
    first.unmount();
    const second = renderHook(useDemoExchange, { wrapper: DemoExchangeProvider });
    await waitFor(() => expect(second.result.current.store.feedback[0]?.body).toBe(feedback.body));
    act(() => second.result.current.clear());
    expect(second.result.current.store.activity).toHaveLength(0);
    expect(second.result.current.store.feedback).toHaveLength(0);
  });
  it("retains consecutive memory-only records when browser writes are unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const hook = renderHook(useDemoExchange, { wrapper: DemoExchangeProvider });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.addFeedback(feedback));
    expect(hook.result.current.storageAvailable).toBe(false);
    act(() =>
      hook.result.current.addFeedback({
        ...feedback,
        body: "A second local record must remain present.",
      }),
    );
    expect(hook.result.current.store.feedback).toHaveLength(2);
    expect(hook.result.current.store.activity).toHaveLength(2);
  });
});
