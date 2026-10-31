import { describe, expect, it, vi } from "vitest";
import {
  readEyeSnapshot,
  eyeLabel,
  eyeSourceUrl,
  makeEyeSnapshot,
  type EyeRecords,
} from "./razul-eye";
const empty: EyeRecords = {
  sources: [],
  runs: [],
  state: null,
  sentinels: [],
  queue: [],
  events: [],
  projects: [],
  findings: [],
  feeds: [],
};
const identity = {
  callerId: "owner-id",
  verifiedUserId: "owner-id",
  emailConfirmed: true,
  assurance: "aal2",
};
function deps(overrides = {}) {
  return {
    identity: async () => identity,
    owner: async () => true,
    records: vi.fn(async () => empty),
    now: () => "2026-10-31T17:52:00.000Z",
    ...overrides,
  };
}
describe("All-Seeing Eye owner-only infrastructure", () => {
  it("allows only a confirmed owner with strong MFA", async () => {
    const d = deps();
    expect((await readEyeSnapshot(d)).readAt).toBe("2026-10-31T17:52:00.000Z");
    expect(d.records).toHaveBeenCalledOnce();
  });
  it.each(["admin", "tester", "machine"])("denies %s without reading infrastructure", async () => {
    const d = deps({ owner: async () => false });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/only to the configured owner/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it("denies absent identity", async () => {
    const d = deps({ identity: async () => ({ ...identity, verifiedUserId: null }) });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/identity/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it("denies a mismatched identity", async () => {
    const d = deps({ identity: async () => ({ ...identity, verifiedUserId: "other" }) });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/identity/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it("denies unconfirmed email", async () => {
    const d = deps({ identity: async () => ({ ...identity, emailConfirmed: false }) });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/identity/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it.each(["aal1", null])("denies insufficient MFA %s", async (assurance) => {
    const d = deps({ identity: async () => ({ ...identity, assurance }) });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/multi-factor/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it("role verification failure never reads infrastructure", async () => {
    const d = deps({
      owner: async () => {
        throw new Error("Role check unavailable");
      },
    });
    await expect(readEyeSnapshot(d)).rejects.toThrow(/unavailable/);
    expect(d.records).not.toHaveBeenCalled();
  });
  it("retains only a bounded newest-first chronological view", () => {
    const events = Array.from({ length: 120 }, (_, n) => ({
      id: String(n),
      sentinel_id: "s",
      kind: "health",
      created_at: new Date(Date.UTC(2026, 9, 31, 0, n)).toISOString(),
    }));
    const snapshot = makeEyeSnapshot({ ...empty, events }, "2026-10-31T17:52:00.000Z");
    expect(snapshot.history).toHaveLength(100);
    expect(snapshot.history[0]?.id).toBe("event:119");
    expect(snapshot.history[99]?.id).toBe("event:20");
  });
  it("source receipt and control-change history preserve actual event timestamps", () => {
    const snapshot = makeEyeSnapshot(
      {
        ...empty,
        checks: [
          {
            id: "c1",
            source_id: "cisa",
            checked_at: "2026-10-31T18:00:00Z",
            status: "failed",
            fetched: 0,
            inserted: 0,
            error_code: "fetch-failed",
          },
        ],
        audit: [
          {
            id: "a1",
            action: "UPDATE",
            record_type: "razul_agent_feeds",
            occurred_at: "2026-10-31T17:00:00Z",
          },
        ],
      },
      "2026-10-31T19:00:00Z",
    );
    expect(snapshot.history.map((r) => r.id)).toEqual(["check:c1", "audit:a1"]);
    expect(snapshot.history[0]?.at).toBe("2026-10-31T18:00:00Z");
  });
  it("omits credential-like labels and credential-bearing source links", () => {
    expect(eyeLabel("password=fictional-example")).toBe("[restricted text omitted]");
    expect(eyeSourceUrl("https://example.org/?token=fixture")).toBeNull();
    expect(eyeSourceUrl("https://user:fixture@example.org/feed")).toBeNull();
    expect(eyeSourceUrl("https://example.org/feed")).toBe("https://example.org/feed");
  });
});
