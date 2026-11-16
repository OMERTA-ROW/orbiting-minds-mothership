import { describe, expect, it } from "vitest";
import {
  ActuationError,
  connectionExpiresAt,
  describeActuationFailure,
  earlierOf,
} from "./activation-actuation";
import { JackboyLinkError } from "./jackboy-link.server";

const NOW = Date.parse("2026-11-16T21:15:00Z");

describe("Step 9 connection window", () => {
  it("asks Jackboy for its own approval end when Step 7 was renewed past it (the 21:15 failure)", () => {
    expect(
      connectionExpiresAt("2026-11-17T08:45:00Z", Date.parse("2026-11-17T03:49:58.534Z"), NOW),
    ).toBe("2026-11-17T03:49:58.534Z");
  });
  it("keeps Step 7's end when it is earlier than Jackboy's approval", () => {
    expect(
      connectionExpiresAt("2026-11-16T20:33:00Z", Date.parse("2026-11-17T03:49:58Z"), Date.parse("2026-11-16T20:00:00Z")),
    ).toBe("2026-11-16T20:33:00.000Z");
  });
  it("refuses locally when Jackboy's approval is missing or ending within a minute", () => {
    expect(() => connectionExpiresAt("2026-11-17T08:45:00Z", NaN, NOW)).toThrow(ActuationError);
    expect(() => connectionExpiresAt("2026-11-17T08:45:00Z", NOW + 30_000, NOW)).toThrow(
      /ends within a minute/,
    );
  });
  it("refuses locally when Step 7 has ended", () => {
    expect(() => connectionExpiresAt("2026-11-16T21:00:00Z", NOW + 3600_000, NOW)).toThrow(
      /Step 7/,
    );
  });
  it("earlierOf picks the earlier valid time", () => {
    expect(earlierOf("2026-11-17T08:45:00Z", "2026-11-17T03:49:58Z")).toBe(
      "2026-11-17T03:49:58.000Z",
    );
    expect(earlierOf(null, "2026-11-17T03:49:58Z")).toBe("2026-11-17T03:49:58.000Z");
    expect(earlierOf(null, null)).toBeNull();
  });
});

describe("actuation failure reasons", () => {
  it("names Jackboy's signed approval_expired refusal", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 403, code: "approval_expired" }),
    );
    expect(f.reason).toBe("jackboy_http_403_approval_expired");
    expect(f.message).toMatch(/outlast Jackboy's own link approval/);
  });
  it("names a refusal by Jackboy's execution authority", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 503, code: "execution_control_unavailable" }),
    );
    expect(f.reason).toBe("jackboy_http_503_execution_control_unavailable");
  });
  it("classifies local state mismatch and unverifiable replies without contents", () => {
    expect(describeActuationFailure(new ActuationError("state_mismatch", "x")).reason).toBe(
      "state_mismatch",
    );
    expect(describeActuationFailure(new Error("stale")).reason).toBe("state_unverified");
  });
  it("keeps the stored reason within the database's limit", () => {
    const f = describeActuationFailure(
      new JackboyLinkError("x", "http", { status: 403, code: "approval_expired_or_link_disabled" }),
    );
    expect(`backend_actuation_${f.reason}`.length).toBeLessThanOrEqual(200);
  });
});
