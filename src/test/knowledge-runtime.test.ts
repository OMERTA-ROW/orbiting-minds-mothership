import { describe, expect, it, vi } from "vitest";
import { dispatchKnowledgeWork, readBoundedFeed } from "@/lib/knowledge-runtime.server";

describe("collector request lifetime", () => {
  it("registers background work and acknowledges only acceptance", async () => {
    const waitUntil = vi.fn(), work = vi.fn(async () => ({ status: "completed" }));
    const request = Object.assign(new Request("https://example.test"), { waitUntil });
    const response = await dispatchKnowledgeWork(request, work, false);
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ accepted: true, completed: false });
    expect(waitUntil).toHaveBeenCalledTimes(1); await waitUntil.mock.calls[0]?.[0];
  });
  it("refuses unsupported hosted background execution without starting work", async () => {
    const work = vi.fn(); const response = await dispatchKnowledgeWork(new Request("https://example.test"), work, false);
    expect(response.status).toBe(503); expect(work).not.toHaveBeenCalled();
  });
  it("enforces actual bytes and cancels an oversized multibyte stream", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("ééé")); }, cancel });
    await expect(readBoundedFeed(new Response(body), 5)).rejects.toThrow("byte limit"); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("decodes UTF-8 characters split across chunks at the byte boundary", async () => {
    const bytes = new TextEncoder().encode("é");
    const body = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 1)); c.enqueue(bytes.slice(1)); c.close(); } });
    expect(await readBoundedFeed(new Response(body), 2)).toBe("é");
  });
});