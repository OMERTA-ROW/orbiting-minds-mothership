import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  owner: vi.fn(),
  results: [] as unknown[],
  calls: [] as string[],
  fetch: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((value: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: (value: unknown) => unknown) => {
        validator = fn;
        return builder;
      },
      handler:
        (handler: (value: unknown) => unknown) => (input: { data?: unknown; context: unknown }) =>
          handler({ ...input, data: validator ? validator(input.data) : input.data }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./razul-owner.server", () => ({ requireRazulOwner: f.owner }));

function from(table: string) {
  const result = f.results.shift();
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "upsert", "update", "delete", "order", "limit"]) {
    q[method] = (...args: unknown[]) => {
      f.calls.push(`${table}:${method}:${JSON.stringify(args)}`);
      return q;
    };
  }
  q["single"] = () => Promise.resolve(result);
  q["maybeSingle"] = () => Promise.resolve(result);
  q["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));

import {
  addCloudConnection,
  checkCloudConnection,
  checkWebsite,
  deleteDirectoryEntry,
  saveDirectoryEntry,
  saveControlSettings,
} from "./evolution-control.functions";
// Test seam invokes the compiled handler, not a live RPC or shared database.
function invoke(fn: unknown, data: unknown) {
  if (typeof fn !== "function") throw new Error("Handler is missing");
  return fn({ data, context: { userId: "owner", claims: {}, supabase: { from } } });
}
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  f.results.length = 0;
  f.calls.length = 0;
  f.owner.mockReset();
  f.fetch.mockReset();
  vi.stubGlobal("fetch", f.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("project control action evidence", () => {
  it("rejects a foreign/deleted project update rather than claiming saved", async () => {
    f.results.push({ data: null, error: null });
    await expect(invoke(saveDirectoryEntry, { id, name: "Project" })).rejects.toThrow(
      /not confirmed/,
    );
    expect(f.calls.some((c) => c.includes(':eq:["owner_id","owner"]'))).toBe(true);
  });
  it("acknowledges a returned persisted project and rejects zero-row removal", async () => {
    f.results.push({ data: { id }, error: null }, { data: null, error: null });
    await expect(invoke(saveDirectoryEntry, { name: "Project" })).resolves.toEqual({ saved: true });
    await expect(invoke(deleteDirectoryEntry, { id })).rejects.toThrow(/not confirmed/);
  });
  it("rejects failed cloud creation and settings persistence", async () => {
    f.results.push({ data: null, error: { code: "denied" } }, { data: null, error: null });
    await expect(
      invoke(addCloudConnection, { label: "Server", provider: "railway" }),
    ).rejects.toThrow(/not confirmed/);
    await expect(
      invoke(saveControlSettings, { cloneAllOptIn: false, githubOrgs: [] }),
    ).rejects.toThrow(/not confirmed/);
  });
  it("owner refusal prevents all writes and provider calls", async () => {
    f.owner.mockRejectedValue(new Error("Owner MFA required"));
    await expect(invoke(checkCloudConnection, { id })).rejects.toThrow(/MFA/);
    expect(f.calls).toEqual([]);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("website response alone cannot claim a persisted check", async () => {
    f.results.push(
      { data: { website_url: "https://example.com" }, error: null },
      { data: null, error: {} },
    );
    f.fetch.mockResolvedValue(new Response("", { status: 200 }));
    await expect(invoke(checkWebsite, { id })).rejects.toThrow(/not confirmed/);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("HTTP 200 with no account evidence is saved as failed, not verified", async () => {
    vi.stubEnv("RAILWAY_API_TOKEN", "test-only-credential");
    f.results.push({ data: { provider: "railway" }, error: null }, { data: { id }, error: null });
    f.fetch.mockResolvedValue(Response.json({}));
    await expect(invoke(checkCloudConnection, { id })).resolves.toMatchObject({ status: "failed" });
  });
  it("verified provider data still needs a confirmed saved row", async () => {
    vi.stubEnv("RAILWAY_API_TOKEN", "test-only-credential");
    f.results.push({ data: { provider: "railway" }, error: null }, { data: null, error: null });
    f.fetch.mockResolvedValue(Response.json({ data: { me: { id: "test-account" } } }));
    await expect(invoke(checkCloudConnection, { id })).rejects.toThrow(/not confirmed/);
  });
});
