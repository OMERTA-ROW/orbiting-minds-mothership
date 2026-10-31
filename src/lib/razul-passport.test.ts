import { describe, expect, it } from "vitest";
import { passportFreshness, passportSummary, validatePassport } from "./razul-passport";

const valid = {
  project: "OMNI Mothership",
  residentAgent: "omni",
  purpose: "Command center",
  features: ["dashboard"],
  architecture: "TanStack Start",
  documentationUrl: "https://example.com/docs",
  permissions: ["read:findings"],
  tools: ["ask-razul"],
  pendingTasks: ["activate owner"],
  verifiedTests: ["1201 unit tests"],
  status: "active",
  lessons: ["default deny works"],
  provenance: "owner-bootstrap",
};

describe("validatePassport", () => {
  it("accepts a well-formed passport", () => {
    expect(validatePassport(valid)).toBeNull();
  });
  it("rejects secret-like values anywhere in the record", () => {
    expect(validatePassport({ ...valid, tools: ["api_key=abc"] })).toMatch(/secret/i);
    expect(validatePassport({ ...valid, purpose: "stores password hashes" })).toMatch(/secret/i);
  });
  it("requires HTTPS documentation URLs", () => {
    expect(validatePassport({ ...valid, documentationUrl: "http://x.com" })).toMatch(/HTTPS/);
  });
  it("rejects oversized lists and missing identity", () => {
    expect(validatePassport({ ...valid, features: Array(51).fill("x") })).toMatch(/features/);
    expect(validatePassport({ ...valid, project: "" })).toMatch(/project/);
    expect(validatePassport({ ...valid, residentAgent: "" })).toMatch(/residentAgent/);
  });
});

describe("freshness and summary", () => {
  const now = new Date("2026-10-31T14:00:00Z");
  it("marks passports stale after the freshness window", () => {
    expect(passportFreshness(new Date("2026-10-30T14:00:00Z"), now)).toBe("fresh");
    expect(passportFreshness(new Date("2026-10-20T14:00:00Z"), now)).toBe("stale");
  });
  it("summarizes project, agent, version, tasks and freshness", () => {
    const s = passportSummary(
      { project: "OMNI", residentAgent: "omni", status: "active", version: 3, pendingTasks: ["a", "b"], updatedAt: new Date("2026-10-31T13:00:00Z") },
      now,
    );
    expect(s).toBe("OMNI (agent omni) — active, v3, 2 pending task(s), fresh");
  });
});
