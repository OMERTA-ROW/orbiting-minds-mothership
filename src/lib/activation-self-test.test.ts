import { describe, expect, it, vi } from "vitest";
import {
  SELF_TEST_MAX_POLLS,
  attemptStage,
  classifySelfTestError,
  linkIdentityIssues,
  otherAttemptInFlight,
  selfTestAuditAction,
  selfTestReadiness,
  type ReadinessInput,
} from "./activation-self-test";
import { driveSelfTest } from "./activation-self-test.server";

const NOW = Date.parse("2026-11-14T00:00:00Z");
const ready: ReadinessInput = {
  deploymentMode: "runner_only",
  stopReleased: true,
  ownerMatches: true,
  linkEnabled: true,
  selfTestEnabled: true,
  approvalExpiresAt: NOW + 6 * 3600_000,
  identityValid: true,
  now: NOW,
};
const blockers = (input: Partial<ReadinessInput>) =>
  selfTestReadiness({ ...ready, ...input })
    .filter((i) => !i.ok)
    .map((i) => i.key);

describe("Step 8 readiness (fails closed)", () => {
  it("is ready only when every precondition holds", () => {
    expect(blockers({})).toEqual([]);
  });
  it("blocks when the self-test switch is off", () => {
    expect(blockers({ selfTestEnabled: false })).toEqual(["self_test"]);
  });
  it("blocks when the link approval window is missing, expired or over 24 hours ahead", () => {
    expect(blockers({ approvalExpiresAt: NaN })).toEqual(["window"]);
    expect(blockers({ approvalExpiresAt: NOW - 1 })).toEqual(["window"]);
    expect(blockers({ approvalExpiresAt: NOW + 25 * 3600_000 })).toEqual(["window"]);
  });
  it("blocks on an engaged Emergency Stop and says it is never released here", () => {
    const stop = selfTestReadiness({ ...ready, stopReleased: false }).find((i) => i.key === "stop")!;
    expect(stop.ok).toBe(false);
    expect(stop.detail).toMatch(/never released from this page/);
  });
  it("blocks on owner mismatch, disabled link, bad identity and non-runner deployment", () => {
    expect(
      blockers({ ownerMatches: false, linkEnabled: false, identityValid: false, deploymentMode: "unknown" }),
    ).toEqual(["deployment", "owner", "link", "identity"]);
  });
});

describe("attempt stages (idempotent retry)", () => {
  it.each([
    [[], "new"],
    [["request_submit", "connecting"], "submit_unconfirmed"],
    [["request_submit", "connecting", "connected", "result_queued"], "queued"],
    [["request_submit", "result_queued", "request_run"], "run_requested"],
    [["request_submit", "result_queued", "request_run", "result_completed", "self_test_passed"], "finished_passed"],
    [["request_submit", "result_queued", "request_run", "result_failed", "self_test_failed"], "finished_failed"],
    [["request_submit", "result_cancelled"], "closed"],
  ])("%j → %s", (actions, stage) => {
    expect(attemptStage(actions)).toBe(stage);
  });
});

describe("evidence mapping", () => {
  it("counts only proof-checked terminal results", () => {
    const job = (status: string, passed?: boolean) => ({
      id: "j",
      status,
      result: passed === undefined ? null : { passed, checks: 3, runner: "restricted-protocol-self-test" },
    });
    expect(selfTestAuditAction(job("completed", true))).toBe("self_test_passed");
    expect(selfTestAuditAction(job("completed", false))).toBe("self_test_failed");
    expect(selfTestAuditAction(job("timed_out"))).toBe("self_test_failed");
    expect(selfTestAuditAction(job("cancelled"))).toBeNull();
    expect(selfTestAuditAction(job("running"))).toBeNull();
  });
});

describe("overlapping attempts", () => {
  const at = new Date(NOW - 30_000).toISOString();
  it("flags another attempt that requested a run without a result", () => {
    const rows = [
      { action: "request_run", record_id: "other", occurred_at: at },
      { action: "request_run", record_id: "mine", occurred_at: at },
    ];
    expect(otherAttemptInFlight(rows, "mine", NOW)).toBe("other");
  });
  it("ignores finished or old attempts", () => {
    const old = new Date(NOW - 10 * 60_000).toISOString();
    expect(
      otherAttemptInFlight(
        [
          { action: "request_run", record_id: "a", occurred_at: at },
          { action: "self_test_passed", record_id: "a", occurred_at: at },
          { action: "request_run", record_id: "b", occurred_at: old },
        ],
        "mine",
        NOW,
      ),
    ).toBeNull();
  });
});

describe("error classification", () => {
  const err = (extra: Record<string, unknown>) => Object.assign(new Error("x"), extra);
  it("reports Jackboy's Kill Switch as a safety denial, not a fault", () => {
    const c = classifySelfTestError(err({ stage: "http", status: 403, code: "kill_switch_on" }), false);
    expect(c.kind).toBe("safety_denial");
    expect(c.message).toMatch(/Kill Switch is on/);
  });
  it("reports any other 403 as a safety denial", () => {
    expect(classifySelfTestError(err({ stage: "http", status: 403 }), false).kind).toBe("safety_denial");
  });
  it("reports a timeout with its deadline and status-only retry after a run was sent", () => {
    const c = classifySelfTestError(err({ stage: "timeout", limitMs: 10_000, phase: "reply" }), true);
    expect(c.kind).toBe("timeout");
    expect(c.message).toMatch(/within 10 s/);
    expect(c.message).toMatch(/never runs it again/);
  });
  it("treats an invalid signature as not evidence", () => {
    expect(classifySelfTestError(err({ stage: "proof" }), true).message).toMatch(/not evidence/);
  });
});

describe("driveSelfTest", () => {
  const job = (status: string, passed = true) => ({
    id: "11111111-1111-4111-8111-111111111111",
    status,
    result: status === "completed" ? { passed, checks: 3, runner: "restricted-protocol-self-test" } : null,
  });
  const opts = () => ({ deadline: Date.now() + 28_000, sleep: async () => {} });

  it("new attempt: submits once, runs once", async () => {
    const execute = vi.fn(async (action: string) => (action === "submit" ? job("queued") : job("completed")));
    const onRunSent = vi.fn();
    const out = await driveSelfTest({ execute }, "new", "id", { ...opts(), onRunSent });
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["submit", "run"]);
    expect(onRunSent).toHaveBeenCalledOnce();
    expect(out.job.status).toBe("completed");
  });
  it("retry after a run was sent: reads status only, never runs again", async () => {
    const execute = vi.fn(async (_action: string) => job("completed"));
    await driveSelfTest({ execute }, "run_requested", "id", opts());
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["status"]);
  });
  it("unconfirmed submit: asks status, then runs only if still queued", async () => {
    const execute = vi.fn(async (action: string) => (action === "status" ? job("queued") : job("completed")));
    await driveSelfTest({ execute }, "submit_unconfirmed", "id", opts());
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["status", "run"]);
  });
  it("polls a running job a bounded number of times", async () => {
    const execute = vi.fn(async (action: string) => (action === "submit" ? job("queued") : job("running")));
    const out = await driveSelfTest({ execute }, "new", "id", opts());
    expect(out.polls).toBe(SELF_TEST_MAX_POLLS);
    expect(out.job.status).toBe("running");
  });
  it("stops polling when the budget is nearly spent", async () => {
    const execute = vi.fn(async (action: string) => (action === "submit" ? job("queued") : job("running")));
    const out = await driveSelfTest({ execute }, "new", "id", { deadline: Date.now() + 3_000, sleep: async () => {} });
    expect(out.polls).toBe(0);
  });
});

describe("linkIdentityIssues (names only, no aliases)", () => {
  const good = {
    origin: "https://jackboy.example.com",
    clientId: "mothership_1",
    projectId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
    bootstrap: "b".repeat(40),
    secret: "s".repeat(40),
  };
  it("accepts a complete, well-formed identity", () => {
    expect(linkIdentityIssues(good)).toEqual([]);
  });
  it("reports a missing client ID by name, even when a handoff client ID exists elsewhere", () => {
    expect(linkIdentityIssues({ ...good, clientId: "" })).toEqual([
      { name: "OMNI_LINK_CLIENT_ID", problem: "missing" },
    ]);
  });
  it("distinguishes malformed from missing and never includes values", () => {
    const issues = linkIdentityIssues({ ...good, clientId: "has space", projectId: "nope", secret: "b".repeat(40) });
    expect(issues).toEqual([
      { name: "OMNI_LINK_CLIENT_ID", problem: "malformed" },
      { name: "OMNI_LINK_PROJECT_ID", problem: "malformed" },
      { name: "OMNI_LINK_HMAC_SECRET", problem: "malformed" },
    ]);
    expect(JSON.stringify(issues)).not.toContain("has space");
  });
  it("names the failing setting and the publish rule in the readiness detail", () => {
    const item = selfTestReadiness({
      ...ready,
      identityValid: false,
      identityIssues: [{ name: "OMNI_LINK_CLIENT_ID", problem: "missing" }],
    }).find((i) => i.key === "identity")!;
    expect(item.ok).toBe(false);
    expect(item.detail).toContain("OMNI_LINK_CLIENT_ID is missing");
    expect(item.detail).toContain("JACKBOY_HANDOFF_CLIENT_ID is a different identity");
    expect(item.detail).toContain("published again");
  });
});
