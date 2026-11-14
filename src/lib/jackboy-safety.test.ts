import { describe, expect, it } from "vitest";
import { safetyEventSchema, safetyView, type SafetyRow } from "./jackboy-safety";

const NOW = Date.parse("2026-11-14T01:30:00Z");
const row = (extra: Partial<SafetyRow>): SafetyRow => ({
  state: "clear",
  paused: false,
  code_stop: false,
  code_enabled: false,
  cancellation: null,
  observed_at: new Date(NOW - 20_000).toISOString(),
  expires_at: new Date(NOW + 100_000).toISOString(),
  source: "poll",
  reason: "",
  recorded_at: new Date(NOW - 20_000).toISOString(),
  autonomous_allowed: true,
  manual_allowed: true,
  ...extra,
});

describe("Jackboy safety view (fail closed)", () => {
  it("is not clear when stops are released but Jackboy does not allow autonomy", () => {
    const v = safetyView(row({ autonomous_allowed: false, blocked_by: "not_authorized" }), NOW);
    expect(v.clear).toBe(false);
    expect(v.autonomousAllowed).toBe("no");
    expect(v.detail).toContain("not authorized");
  });
  it("keeps a verified Kill Switch reading as a manual-terminal block even after a failed read", () => {
    expect(safetyView(row({ state: "unknown", source: "failure", paused: true, manual_allowed: false }), NOW).manualBlocked).toBe(true);
    expect(safetyView(row({}), NOW).manualBlocked).toBe(false);
  });
  it("is clear only for a fresh signed poll reading", () => {
    expect(safetyView(row({}), NOW).clear).toBe(true);
    expect(safetyView(row({}), NOW).state).toBe("clear");
  });
  it("reads a missing row as unknown", () => {
    const v = safetyView(null, NOW);
    expect(v.clear).toBe(false);
    expect(v.state).toBe("unknown");
  });
  it("reads an expired clear reading as stale", () => {
    const v = safetyView(row({ expires_at: new Date(NOW - 1).toISOString() }), NOW);
    expect(v.state).toBe("stale");
    expect(v.clear).toBe(false);
  });
  it("shows the CODE Emergency Stop as engaged", () => {
    const v = safetyView(row({ state: "engaged", code_stop: true, source: "event" }), NOW);
    expect(v.state).toBe("engaged");
    expect(v.codeStop).toBe("engaged");
    expect(v.clear).toBe(false);
  });
  it("shows Jackboy's Kill Switch separately from the CODE stop", () => {
    const v = safetyView(row({ state: "paused", paused: true }), NOW);
    expect(v.state).toBe("paused");
    expect(v.killSwitch).toBe("on");
    expect(v.codeStop).toBe("released");
  });
  it("never reports switch values from a failed check", () => {
    const v = safetyView(row({ state: "unknown", source: "failure", reason: "read_http_400" }), NOW);
    expect(v.state).toBe("unknown");
    expect(v.killSwitch).toBe("unknown");
    expect(v.codeStop).toBe("unknown");
  });
});

describe("Jackboy stop notice contract", () => {
  const base = {
    contract: "jackboy.safety-event/v1",
    projectId: "4f9a3c1e-2b7d-4e8f-9a1b-3c5d7e9f0a2b",
    paused: false,
    codeStop: true,
    codeEnabled: false,
    cancellation: "requested",
    observedAt: "2026-11-14T01:30:00Z",
  };
  it("accepts a CODE stop notice that reports the stop", () => {
    expect(safetyEventSchema.safeParse({ ...base, event: "code_stop_engaged" }).success).toBe(true);
  });
  it("refuses a notice that names a stop it does not report", () => {
    expect(
      safetyEventSchema.safeParse({ ...base, event: "code_stop_engaged", codeStop: false }).success,
    ).toBe(false);
    expect(safetyEventSchema.safeParse({ ...base, event: "global_pause_engaged" }).success).toBe(false);
  });
  it("refuses extra fields", () => {
    expect(
      safetyEventSchema.safeParse({ ...base, event: "code_stop_engaged", release: true }).success,
    ).toBe(false);
  });
});
