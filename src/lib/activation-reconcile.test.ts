import { describe, expect, it } from "vitest";
import {
  RECONCILE_GUARD_TEXT,
  activationNeedsReconcile,
  classifyBeginError,
  upstreamNotInEffect,
} from "./activation-reconcile";

const now = Date.parse("2026-11-16T20:55:00Z");

describe("activationNeedsReconcile (mirrors the 0057 database guard)", () => {
  it("a link revoked by a Step 8 re-approval needs reconciliation", () => {
    expect(
      activationNeedsReconcile(
        { status: "revoked", evidence: { remoteReconciliationRequired: true } },
        now,
      ),
    ).toBe(true);
  });
  it("a reconciled revoke and a failed attempt with verified rollback do not", () => {
    expect(
      activationNeedsReconcile(
        { status: "revoked", evidence: { remoteReconciliationRequired: false, rollbackVerified: true } },
        now,
      ),
    ).toBe(false);
    expect(activationNeedsReconcile({ status: "failed", evidence: { rollbackVerified: true } }, now)).toBe(false);
  });
  it("a failed attempt without verified rollback does", () => {
    expect(activationNeedsReconcile({ status: "failed", evidence: {} }, now)).toBe(true);
    expect(activationNeedsReconcile({ status: "failed", evidence: null }, now)).toBe(true);
  });
  it("an open attempt counts only after the 90-second window", () => {
    const at = (ms: number) => new Date(now - ms).toISOString();
    expect(activationNeedsReconcile({ status: "activating", started_at: at(30_000) }, now)).toBe(false);
    expect(activationNeedsReconcile({ status: "activating", started_at: at(90_000) }, now)).toBe(true);
  });
  it("inactive, active and missing rows do not", () => {
    expect(activationNeedsReconcile({ status: "inactive", evidence: {} }, now)).toBe(false);
    expect(activationNeedsReconcile({ status: "active", evidence: {} }, now)).toBe(false);
    expect(activationNeedsReconcile(null, now)).toBe(false);
  });
});

describe("classifyBeginError", () => {
  it("recognizes the production guard exception (P0001) as reconcile_required", () => {
    expect(classifyBeginError({ code: "P0001", message: RECONCILE_GUARD_TEXT })).toBe(
      "reconcile_required",
    );
  });
  it("keeps MFA, owner denial and unknown errors distinct", () => {
    expect(classifyBeginError({ code: "P0001", message: "Fresh two-factor verification required" })).toBe("mfa");
    expect(classifyBeginError({ code: "42501", message: "denied" })).toBe("denied");
    expect(classifyBeginError({ code: "XX000", message: "boom" })).toBe("begin_error");
    expect(classifyBeginError({})).toBe("begin_error");
  });
});

describe("upstreamNotInEffect", () => {
  it("separates approval from activation and always says nothing was sent", () => {
    const never = upstreamNotInEffect("live_link", null, now);
    expect(never).toContain("Step 9 live link");
    expect(never).toContain("Approval records the decision only");
    expect(never).toContain("Nothing was sent");
    const lapsed = upstreamNotInEffect("live_link", { status: "active", evidence: {} }, now);
    expect(lapsed).toContain("no longer in effect");
    const revoked = upstreamNotInEffect(
      "live_link",
      { status: "revoked", evidence: { remoteReconciliationRequired: true } },
      now,
    );
    expect(revoked).toContain("Reconcile pending activation");
  });
});
