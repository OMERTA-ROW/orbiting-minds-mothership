import { describe, expect, it } from "vitest";
import { ACTIVATION_STEPS, isTechnicalStep, normalizeRows } from "./activation-approvals";
import {
  FlowTimeoutError,
  nextEligibleStep,
  stepViews,
  withTimeout,
  type FlowInput,
} from "./activation-flow";

const NOW = Date.parse("2026-11-13T20:00:00Z");
const OWNER = "11111111-1111-4111-8111-111111111111";

function input(approvedThrough: number, extra: Partial<FlowInput> = {}): FlowInput {
  const rows = normalizeRows(
    ACTIVATION_STEPS.map(({ step }) => ({
      step,
      status: step <= approvedThrough ? "approved" : "pending",
      approver_id: step <= approvedThrough ? OWNER : null,
      decided_at: step <= approvedThrough ? "2026-11-13T19:50:00Z" : null,
      approval_expires_at: step === 7 && step <= approvedThrough ? "2026-11-14T08:00:00Z" : null,
    })),
  );
  return {
    rows,
    checks: [],
    audit: [],
    now: NOW,
    resetAt: null,
    mfaFresh: true,
    checksStore: "ready",
    ...extra,
  };
}

describe("all 10 steps at every stage of progress", () => {
  for (let done = 0; done <= 10; done++) {
    it(`with ${done} approved, earlier steps are closed, the next is open and later ones are locked`, () => {
      const views = stepViews(input(done));
      expect(views).toHaveLength(10);
      expect(nextEligibleStep(views)).toBe(done === 10 ? null : done + 1);
      for (const v of views) {
        if (v.step <= done) {
          expect(v.state).toBe("approved");
          expect(v.complete).toBe(true);
          expect(v.canRunCheck).toBe(false);
          expect(v.canApprove).toBe(false);
          expect(v.canRevoke).toBe(true);
          expect(v.collapsedByDefault).toBe(true);
          expect(v.blockedReason).toBe("Already approved");
        } else if (v.step === done + 1) {
          expect(v.isNext).toBe(true);
          expect(v.state).toBe("pending");
          expect(v.blocker).toBeNull();
          // A technical step needs a check; it is never approvable before a pass.
          expect(v.canRunCheck).toBe(isTechnicalStep(v.step));
          expect(v.canApprove).toBe(!isTechnicalStep(v.step));
          expect(v.collapsedByDefault).toBe(false);
        } else {
          expect(v.state).toBe("locked");
          expect(v.blocker).toBe(done + 1);
          expect(v.canRunCheck || v.canApprove || v.canRevoke).toBe(false);
        }
      }
    });
  }
});

describe("technical step transitions", () => {
  it("a passed check alone never approves: approval needs the owner and a pass under 15 minutes", () => {
    const fresh = stepViews(
      input(1, { checks: [{ step: 2, status: "passed", checkedAt: "2026-11-13T19:55:00Z" }] }),
    )[1]!;
    expect(fresh.state).toBe("pending");
    expect(fresh.complete).toBe(false);
    expect(fresh.freshPass).toBe(true);
    expect(fresh.canApprove).toBe(true);
    const old = stepViews(
      input(1, { checks: [{ step: 2, status: "passed", checkedAt: "2026-11-13T19:40:00Z" }] }),
    )[1]!;
    expect(old.freshPass).toBe(false);
    expect(old.canApprove).toBe(false);
    expect(old.canRunCheck).toBe(true);
  });

  it("failed signed evidence offers a retry and keeps every later step locked", () => {
    const base = input(1, {
      checks: [{ step: 2, status: "needs_attention", checkedAt: "2026-11-13T19:51:53Z" }],
    });
    base.rows[1] = {
      ...base.rows[1]!,
      status: "failed",
      approver_id: OWNER,
      decided_at: "2026-11-13T19:51:53Z",
    };
    const views = stepViews(base);
    expect(views[1]).toMatchObject({
      state: "failed",
      checkLabel: "Retry check",
      canRunCheck: true,
      canApprove: false,
      isNext: true,
    });
    for (const v of views.slice(2))
      expect(v).toMatchObject({
        state: "locked",
        blocker: 2,
        canRunCheck: false,
        canApprove: false,
      });
  });

  it("refuses all actions without a fresh code and technical actions without the check store", () => {
    const noCode = stepViews(input(1, { mfaFresh: false }));
    expect(noCode[1]).toMatchObject({
      canRunCheck: false,
      canApprove: false,
      blockedReason: "Enter a fresh two-step code first",
    });
    expect(noCode[0]!.canRevoke).toBe(false);
    const noStore = stepViews(input(1, { checksStore: "missing" }));
    expect(noStore[1]).toMatchObject({
      canRunCheck: false,
      blockedReason: "Check store unavailable",
    });
  });

  it("an approval from before a security reset needs a fresh check and owner approval", () => {
    const views = stepViews(
      input(1, {
        resetAt: "2026-11-13T19:55:00Z",
        checks: [{ step: 1, status: "passed", checkedAt: "2026-11-13T19:58:00Z" }],
      }),
    );
    expect(views[0]).toMatchObject({
      state: "needs_fresh_approval",
      complete: false,
      canRunCheck: true,
      canApprove: true,
      isNext: true,
    });
  });

  it("an expired step 7 window is not complete and is not re-checked", () => {
    const base = input(7);
    base.rows[6] = { ...base.rows[6]!, approval_expires_at: "2026-11-13T19:00:00Z" };
    const v = stepViews(base)[6]!;
    expect(v).toMatchObject({
      state: "expired",
      complete: false,
      canRunCheck: false,
      isNext: true,
    });
  });

  it("keeps each step's own audit history, newest first", () => {
    const audit = [
      { id: "b", action: "approve", record_id: "1", occurred_at: "2026-11-13T19:51:01Z" },
      {
        id: "c",
        action: "check_needs_attention",
        record_id: "2",
        occurred_at: "2026-11-13T19:51:53Z",
      },
      { id: "a", action: "check_passed", record_id: "1", occurred_at: "2026-11-13T19:51:00Z" },
    ];
    const views = stepViews(input(1, { audit }));
    expect(views[0]!.audit.map((a) => a.id)).toEqual(["b", "a"]);
    expect(views[1]!.audit.map((a) => a.id)).toEqual(["c"]);
  });
});

describe("bounded waiting", () => {
  it("stops waiting with a timeout error and passes results through", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toBeInstanceOf(FlowTimeoutError);
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});
