import { describe, expect, it } from "vitest";
import {
  SENTINEL_KINDS,
  SENTINEL_LIMITS,
  sentinelAlertTargets,
  validateSentinelReport,
} from "./razul-sentinel";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = "a".repeat(64);
const valid = { sentinelId: ID, token: TOKEN, kind: "feedback", payload: { title: "Test" } };

describe("validateSentinelReport", () => {
  it("accepts a well-formed report", () => {
    expect(validateSentinelReport(valid)).toBeNull();
  });

  it("rejects non-object bodies and missing fields", () => {
    expect(validateSentinelReport(null)).toMatch(/object/);
    expect(validateSentinelReport({ ...valid, sentinelId: "nope" })).toMatch(/UUID/);
    expect(validateSentinelReport({ ...valid, token: "short" })).toMatch(/hex/);
  });

  it("rejects kinds outside the allowlist", () => {
    expect(validateSentinelReport({ ...valid, kind: "exec" })).toMatch(/kind/);
    for (const kind of SENTINEL_KINDS) {
      expect(validateSentinelReport({ ...valid, kind })).toBeNull();
    }
  });

  it("rejects oversized payloads", () => {
    const big = { ...valid, payload: { data: "x".repeat(SENTINEL_LIMITS.maxPayloadBytes) } };
    expect(validateSentinelReport(big)).toMatch(/size limit/);
  });

  it("rejects array payloads", () => {
    expect(validateSentinelReport({ ...valid, payload: [1, 2] })).toMatch(/payload/);
  });
});

describe("sentinelAlertTargets", () => {
  it("routes feedback and releases to Jackboy and OMNI", () => {
    expect(sentinelAlertTargets("feedback")).toEqual(["jackboy", "omni"]);
    expect(sentinelAlertTargets("release")).toEqual(["jackboy", "omni"]);
  });

  it("routes diagnostics to OMNI only and keeps health in history", () => {
    expect(sentinelAlertTargets("diagnostic")).toEqual(["omni"]);
    expect(sentinelAlertTargets("health")).toEqual([]);
    expect(sentinelAlertTargets("project-event")).toEqual([]);
  });
});
