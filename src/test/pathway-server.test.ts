import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/beta-auth.server", () => ({ authenticateBetaAi: vi.fn().mockResolvedValue({}), readBoundedJson: async (request: Request) => request.json(), BetaHttpError: class extends Error {} }));

const mocks = vi.hoisted(() => ({ save: vi.fn(), state: vi.fn(), failure: { status: 403, message: "Vendor access is disabled" } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: mocks.state }) }),
  upsert: mocks.save,
}) } }));
vi.mock("@/lib/ai/responses.server.ts", () => ({ createResponsesCall: () => ({
  result: {
    fullStream: (async function* () {})(),
    partialOutputStream: (async function* () { throw new Error("Denied"); })(),
  },
  gateway: { waitForRunId: async () => undefined },
  getFailure: () => mocks.failure,
  getResponseHeaders: () => new Headers(),
}) }));

import { handlePathway } from "@/lib/ai/pathway.server";

describe("AI access pause", () => {
  beforeEach(() => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only-not-a-credential");
    mocks.save.mockReset().mockResolvedValue({ error: null });
    mocks.state.mockReset().mockResolvedValue({ data: null, error: null });
  });
  it("persists a known access denial even when the creator stops the request", async () => {
    const controller = new AbortController();
    const request = new Request("http://localhost:8080/api/evolution-pathway", {
      method: "POST", signal: controller.signal,
      headers: { origin: "http://localhost:8080", "content-type": "application/json" },
      body: JSON.stringify({ concept: "A creator-owned solar sensor network with isolated fault testing.", goal: "", consent: true }),
    });
    controller.abort();
    const response = await handlePathway(request);
    expect(response.status).toBe(403);
    expect(mocks.save).toHaveBeenCalledWith({ feature: "evolution-pathway", blocked_status: 403, message: "Vendor access is disabled" });
  });
  it("returns the saved denial before starting another AI call", async () => {
    mocks.state.mockResolvedValue({ data: { blocked_status: 402, message: "Add workspace credits" }, error: null });
    const response = await handlePathway(new Request("http://localhost:8080/api/evolution-pathway", {
      method: "POST", headers: { origin: "http://localhost:8080", "content-type": "application/json" },
      body: JSON.stringify({ concept: "A creator-owned solar sensor network with isolated fault testing.", goal: "", consent: true }),
    }));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ message: "Add workspace credits" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});