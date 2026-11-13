import { describe, expect, it } from "vitest";
import { normalizeRows, type ApprovalRow } from "./activation-approvals";
import {
  accessReason,
  approvedBeforeReset,
  effectiveRows,
  isMissingObject,
  latestSecurityReset,
  nextAction,
  stepState,
} from "./activation-status";

const OWNER = "40543e40-5202-4219-a852-ead1c659e9a9";
const NOW = Date.parse("2026-11-13T16:30:00Z");

function rows(approvedThrough: number, decidedAt = "2026-11-12T21:25:56Z"): ApprovalRow[] {
  return normalizeRows(
    Array.from({ length: 10 }, (_, i) => ({
      step: i + 1,
      status: i + 1 <= approvedThrough ? "approved" : "pending",
      approver_id: i + 1 <= approvedThrough ? OWNER : null,
      decided_at: i + 1 <= approvedThrough ? decidedAt : null,
      approval_expires_at: i + 1 === 7 ? "2026-11-14T00:00:00Z" : null,
    })),
  );
}

describe("approvals persist across ordinary sign-ins", () => {
  it("ignores sign-ins, new recovery codes and refused recoveries", () => {
    const reset = latestSecurityReset([
      { event: "codes_created", created_at: "2026-11-13T16:23:12Z" },
      { event: "recovery_refused", created_at: "2026-11-13T16:24:00Z" },
    ]);
    expect(reset).toBeNull();
    const r = rows(1);
    expect(effectiveRows(r, reset)[0]!.status).toBe("approved");
    expect(stepState(r[0]!, { rows: r, now: NOW, resetAt: reset })).toBe("approved");
  });
});

describe("fresh approval after a security reset", () => {
  it.each(["mfa_disabled", "recovery_completed", "admin_factor_removed"])(
    "%s invalidates approvals decided before it",
    (event) => {
      const reset = latestSecurityReset([{ event, created_at: "2026-11-13T16:20:51Z" }]);
      expect(reset).toBe("2026-11-13T16:20:51Z");
      const r = rows(3);
      expect(approvedBeforeReset(r[0]!, reset)).toBe(true);
      expect(effectiveRows(r, reset).filter((x) => x.status === "approved")).toHaveLength(0);
      expect(stepState(r[0]!, { rows: r, now: NOW, resetAt: reset })).toBe("needs_fresh_approval");
    },
  );
  it("keeps approvals decided after the reset", () => {
    const r = rows(1, "2026-11-13T16:25:00Z");
    expect(approvedBeforeReset(r[0]!, "2026-11-13T16:20:51Z")).toBe(false);
  });
  it("uses the newest reset", () => {
    expect(
      latestSecurityReset([
        { event: "admin_factor_removed", created_at: "2026-11-12T17:19:47Z" },
        { event: "mfa_disabled", created_at: "2026-11-13T16:20:51Z" },
      ]),
    ).toBe("2026-11-13T16:20:51Z");
  });
});

describe("explicit step states", () => {
  it("shows revoked, failed, locked and pending", () => {
    const r = rows(1);
    r[1] = { ...r[1]!, status: "failed" };
    expect(stepState(r[1]!, { rows: r, now: NOW, resetAt: null })).toBe("failed");
    expect(stepState(r[2]!, { rows: r, now: NOW, resetAt: null })).toBe("locked");
    const p = rows(1);
    expect(stepState(p[1]!, { rows: p, now: NOW, resetAt: null })).toBe("pending");
    expect(
      stepState(p[1]!, { rows: p, now: NOW, resetAt: null, lastAuditAction: "revoke_cascade" }),
    ).toBe("revoked");
  });
});

describe("next step is always actionable", () => {
  const base = { checks: [], now: NOW, mfaFresh: true, checksStore: "ready" as const };
  it("names the missing check store before any technical step", () => {
    const n = nextAction({ ...base, rows: rows(1), resetAt: null, checksStore: "missing" });
    expect(n).toMatchObject({ kind: "database_update", step: 2 });
    expect(n.detail).toMatch(/0051/);
  });
  it("current owner state: step 1 approved before today's reset, store missing", () => {
    const n = nextAction({
      ...base,
      rows: rows(1),
      resetAt: "2026-11-13T16:20:51Z",
      checksStore: "missing",
    });
    expect(n).toMatchObject({ kind: "database_update", step: 1 });
  });
  it("asks for a code when MFA is not fresh", () => {
    expect(nextAction({ ...base, rows: rows(2), resetAt: null, mfaFresh: false })).toMatchObject({
      kind: "reverify",
      step: 3,
    });
  });
  it("asks to run the check for a technical step", () => {
    expect(nextAction({ ...base, rows: rows(1), resetAt: null })).toMatchObject({
      kind: "run_check",
      step: 2,
    });
  });
  it("asks to approve an owner step, or re-approve after a reset", () => {
    expect(nextAction({ ...base, rows: rows(2), resetAt: null })).toMatchObject({
      kind: "approve",
      step: 3,
    });
    const stale = rows(3);
    stale[0] = { ...stale[0]!, decided_at: "2026-11-13T16:25:00Z" };
    stale[1] = { ...stale[1]!, decided_at: "2026-11-13T16:25:00Z" };
    expect(nextAction({ ...base, rows: stale, resetAt: "2026-11-13T16:20:51Z" })).toMatchObject({
      kind: "fresh_approval",
      step: 3,
    });
  });
  it("reports done without implying anything was switched on", () => {
    const n = nextAction({ ...base, rows: rows(10), resetAt: null });
    expect(n.kind).toBe("done");
    expect(n.detail).toMatch(/Nothing was switched on/);
  });
});

describe("owner access reasons", () => {
  it("maps each server refusal to a specific reason", () => {
    expect(accessReason("Verified owner identity is required.")).toBe("identity");
    expect(
      accessReason("All-Seeing Eye infrastructure is available only to the configured owner."),
    ).toBe("not_owner");
    expect(
      accessReason("Complete owner multi-factor verification before inspecting infrastructure."),
    ).toBe("needs_code");
    expect(accessReason("Unauthorized")).toBe("signed_out");
    expect(accessReason("Owner authorization could not be verified.")).toBe("unreadable");
  });
  it("recognises a missing table or function", () => {
    expect(isMissingObject({ code: "PGRST205", message: "x" })).toBe(true);
    expect(isMissingObject({ code: "42P01" })).toBe(true);
    expect(isMissingObject({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});
