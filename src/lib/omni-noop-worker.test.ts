import { describe, expect, it, vi } from "vitest";
import { runNoopWorkerOnce } from "./omni-noop-worker";

const endpoint = "https://mothership.example/api/public/omni/noop-worker";
const token = `omni_worker_${"a".repeat(64)}`;
const job = "66666666-6666-4666-8666-666666666666";

describe("isolated no-op worker", () => {
  it("aborts a running synthetic job when the broker refuses a heartbeat", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const { action } = JSON.parse(String(init.body)) as { action: string };
      calls.push(action);
      if (action === "claim")
        return Response.json({ ok: true, job, durationMs: 10000, leaseMs: 5000 });
      if (action === "heartbeat")
        return Response.json({ error: "safety_blocked" }, { status: 409 });
      return Response.json({ ok: true });
    });
    const started = performance.now();
    expect(await runNoopWorkerOnce(endpoint, token, fetcher)).toBe("cancelled");
    expect(performance.now() - started).toBeLessThan(5000);
    expect(calls).toEqual(["claim", "heartbeat", "cancel"]);
    expect(calls).not.toContain("complete");
  });

  it("completes only after an admitted bounded no-op", async () => {
    const actions: string[] = [];
    const fetcher = async (_url: string, init: RequestInit) => {
      const { action } = JSON.parse(String(init.body)) as { action: string };
      actions.push(action);
      return Response.json(
        action === "claim"
          ? { ok: true, job, durationMs: 1000, leaseMs: 5000 }
          : { ok: true, leaseMs: 5000 },
      );
    };
    expect(await runNoopWorkerOnce(endpoint, token, fetcher)).toBe("completed");
    expect(actions).toEqual(["claim", "heartbeat", "complete"]);
  });

  it("rejects unscoped identities and an insecure broker", async () => {
    await expect(runNoopWorkerOnce(endpoint, "omni_bad")).rejects.toThrow(
      "Invalid worker identity",
    );
    await expect(runNoopWorkerOnce("http://mothership.example", token)).rejects.toThrow("HTTPS");
  });

  it("aborts the timer when its lease expires without a renewal", async () => {
    vi.useFakeTimers();
    try {
      const actions: string[] = [];
      const fetcher = async (_url: string, init: RequestInit) => {
        const { action } = JSON.parse(String(init.body)) as { action: string };
        actions.push(action);
        return Response.json(
          action === "claim" ? { ok: true, job, durationMs: 10000, leaseMs: 1000 } : { ok: true },
        );
      };
      const pending = runNoopWorkerOnce(endpoint, token, fetcher);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await pending).toBe("cancelled");
      expect(actions).toEqual(["claim", "cancel"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
