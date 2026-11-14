import { describe, expect, it, vi } from "vitest";
import { handleNoopWorker } from "./omni-noop-broker.server";

const token = `omni_worker_${"a".repeat(64)}`;
const job = "66666666-6666-4666-8666-666666666666";
const request = (body: string, credential = token) =>
  new Request("https://mothership.example/noop", {
    method: "POST",
    headers: { authorization: `Bearer ${credential}` },
    body,
  });

describe("no-op broker", () => {
  it("rejects forged identities before issuing a permit", async () => {
    const action = vi.fn(async () => ({ ok: false, reason: "identity_invalid" }));
    const permit = vi.fn();
    const deps = { action, safety: vi.fn(), permit, release: vi.fn() };
    const response = await handleNoopWorker(request('{"action":"claim"}'), deps);
    expect(response.status).toBe(401);
    expect(permit).not.toHaveBeenCalled();
    expect(deps.safety).not.toHaveBeenCalled();
  });

  it("cancels the claim and releases the permit when recording it fails", async () => {
    const action = vi.fn(async (_hash: string, op: string) =>
      op === "claim" ? { ok: true, job, durationMs: 1000 } : { ok: true },
    );
    const release = vi.fn(async () => {});
    const response = await handleNoopWorker(request('{"action":"claim"}'), {
      action,
      safety: async () => true,
      permit: async () => {
        throw new Error("permit_not_recorded");
      },
      release,
    });
    expect(response.status).toBe(503);
    expect(action.mock.calls.map((call) => call[1])).toEqual(["inspect", "claim", "cancel"]);
    expect(release).toHaveBeenCalledWith(job);
  });

  it("times out a body that never finishes", async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ start() {} });
      const req = new Request("https://mothership.example/noop", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body,
        duplex: "half",
      } as RequestInit);
      const action = vi.fn(async () => ({ ok: true }));
      const pending = handleNoopWorker(req, {
        action,
        safety: async () => true,
        permit: async () => {},
        release: async () => {},
      });
      await vi.advanceTimersByTimeAsync(3001);
      expect((await pending).status).toBe(400);
      expect(action).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
