import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), captured: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: mocks.fetch } }));
vi.mock("@/lib/error-capture", () => ({ consumeLastCapturedError: mocks.captured }));

import server from "@/server";

describe("custom SSR error wrapper retained by the Railway build", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const request = () => server.fetch(new Request("http://localhost/"), undefined, undefined);

  it("preserves successful responses", async () => {
    const response = new Response("Mothership");
    mocks.fetch.mockResolvedValue(response);
    expect(await request()).toBe(response);
  });

  it("renders a safe HTML error for thrown SSR failures without exposing details", async () => {
    const error = new Error("private diagnostic detail");
    mocks.fetch.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("text/html");
      const body = await response.text();
      expect(body).toContain("This page didn't load");
      expect(body).not.toContain(error.message);
      expect(log).toHaveBeenCalledWith(error);
    } finally {
      log.mockRestore();
    }
  });

  it("normalizes h3 swallowed exceptions to the safe error page", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ unhandled: true, message: "HTTPError" }, { status: 500 }),
    );
    const error = new Error("captured private failure");
    mocks.captured.mockReturnValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("text/html");
      const body = await response.text();
      expect(body).toContain("This page didn't load");
      expect(body).not.toContain(error.message);
      expect(log).toHaveBeenCalledWith(error);
    } finally {
      log.mockRestore();
    }
  });

  it("preserves intentional API and authentication errors", async () => {
    for (const status of [401, 403, 503]) {
      const response = Response.json({ error: "Denied" }, { status });
      mocks.fetch.mockResolvedValue(response);
      expect(await request()).toBe(response);
    }
  });
});
