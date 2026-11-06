import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  state: vi.fn(),
  runs: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.verify,
    from: (table: string) => {
      if (table === "razul_job_state")
        return { select: () => ({ eq: () => ({ maybeSingle: mocks.state }) }) };
      if (table === "razul_runs")
        return { select: () => ({ order: () => ({ limit: mocks.runs }) }) };
      if (table === "razul_control_audit") return { insert: mocks.audit };
      throw new Error("Unexpected table");
    },
  },
}));

import { handleOmniJobs } from "@/routes/api/public/omni/jobs";

const request = (key = `omni_${"a".repeat(48)}`) =>
  new Request("https://mothership.test/api/public/omni/jobs", {
    headers: { authorization: `Bearer ${key}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ data: "key-id", error: null });
  mocks.state.mockResolvedValue({ data: { paused_at: null }, error: null });
  mocks.runs.mockResolvedValue({ data: [{ id: "run-id" }], error: null });
  mocks.audit.mockResolvedValue({ error: null });
});

describe("OMNI jobs metadata audit", () => {
  it("returns metadata only after a successful scoped access audit", async () => {
    const response = await handleOmniJobs(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.audit).toHaveBeenCalledWith({
      actor_id: null,
      action: "use-jobs",
      record_type: "omni_api_key",
      record_id: "key-id",
    });
    expect((await response.json()).recentRuns).toEqual([{ id: "run-id" }]);
  });

  it("fails closed without disclosing metadata when the audit insert fails", async () => {
    mocks.audit.mockResolvedValue({ error: { message: "private database detail" } });
    const response = await handleOmniJobs(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("run-id");
    expect(body).not.toContain("private database detail");
  });

  it("rejects invalid credentials before reading metadata or writing an audit", async () => {
    mocks.verify.mockResolvedValue({ data: null, error: null });
    expect((await handleOmniJobs(request())).status).toBe(401);
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.runs).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not claim success or audit a read when metadata is unavailable", async () => {
    mocks.runs.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await handleOmniJobs(request())).status).toBe(500);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
