import { describe, expect, it } from "vitest";
import {
  allowedActions,
  applyDecision,
  blockingStep,
  decisionInput,
  isMfaFresh,
  noteProblem,
  normalizeRows,
  validateExpiry,
  type ApprovalRow,
} from "./activation-approvals";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const OWNER = "11111111-1111-4111-8111-111111111111";

function approvedThrough(n: number): ApprovalRow[] {
  let rows = normalizeRows([]);
  for (let s = 1; s <= n; s++)
    rows = applyDecision(rows, s, "approve", OWNER, NOW, {
      expiresAt: s === 7 ? new Date(NOW + 3600_000).toISOString() : null,
    });
  return rows;
}

describe("activation approvals ordering", () => {
  it("has exactly 10 steps, all pending at first", () => {
    const rows = normalizeRows([]);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("step 1 is unlocked; step 2 waits on step 1", () => {
    const rows = normalizeRows([]);
    expect(blockingStep(rows, 1, NOW)).toBeNull();
    expect(blockingStep(rows, 2, NOW)).toBe(1);
    expect(allowedActions(rows, 2, NOW)).toEqual([]);
  });

  it("a failed earlier step keeps later steps locked", () => {
    let rows = approvedThrough(2);
    rows = applyDecision(rows, 3, "fail", OWNER, NOW);
    expect(blockingStep(rows, 4, NOW)).toBe(3);
  });

  it("revoking step 3 resets steps 4-6 to pending", () => {
    let rows = approvedThrough(6);
    rows = applyDecision(rows, 3, "revoke", OWNER, NOW);
    expect(rows.slice(0, 2).map((r) => r.status)).toEqual(["approved", "approved"]);
    expect(rows.slice(2, 6).every((r) => r.status === "pending")).toBe(true);
  });

  it("an expired step-7 window locks step 8", () => {
    const rows = approvedThrough(7);
    expect(blockingStep(rows, 8, NOW)).toBeNull();
    expect(blockingStep(rows, 8, NOW + 2 * 3600_000)).toBe(7);
  });
});

describe("approval expiry", () => {
  it("accepts 24 hours ahead and rejects 24 hours plus one minute", () => {
    expect(validateExpiry(new Date(NOW + 24 * 3600_000).toISOString(), NOW)).toBeNull();
    expect(validateExpiry(new Date(NOW + 24 * 3600_000 + 60_000).toISOString(), NOW)).not.toBeNull();
  });
  it("rejects a past expiry", () => {
    expect(validateExpiry(new Date(NOW - 1000).toISOString(), NOW)).not.toBeNull();
  });
});

describe("fresh two-factor", () => {
  const nowS = Math.floor(NOW / 1000);
  it("is fresh within 15 minutes of an authenticator check", () => {
    expect(isMfaFresh([{ method: "totp", timestamp: nowS - 14 * 60 }], nowS)).toBe(true);
  });
  it("is stale after 15 minutes", () => {
    expect(isMfaFresh([{ method: "totp", timestamp: nowS - 16 * 60 }], nowS)).toBe(false);
  });
  it("a password-only sign-in is not two-factor", () => {
    expect(isMfaFresh([{ method: "password", timestamp: nowS }], nowS)).toBe(false);
  });
});

describe("notes and inputs", () => {
  it("refuses notes that look like keys", () => {
    expect(noteProblem("sk-proj-abcdefghijklmnop")).not.toBeNull();
    expect(noteProblem("a".repeat(64))).not.toBeNull();
    expect(noteProblem("Checked in Railway dashboard")).toBeNull();
  });
  it("rejects step 11 and unknown actions", () => {
    expect(() => decisionInput.parse({ step: 11, action: "approve" })).toThrow();
    expect(() => decisionInput.parse({ step: 1, action: "deploy" })).toThrow();
  });
});
