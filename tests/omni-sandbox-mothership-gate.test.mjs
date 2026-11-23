import test from "node:test";
import assert from "node:assert/strict";
import { checkSandboxJob } from "../services/omni-sandbox/mothership-gate.mjs";

const job = { id: "job-1" };

function dependencies(overrides = {}) {
  const logs = [];
  return {
    logs,
    deps: {
      getApproval: () => ({ approved: true }),
      isStopped: () => false,
      spend: () => ({ callUsd: 0.1, jobUsd: 0.2, dayUsd: 1, totalUsd: 2 }),
      flagEnabled: () => true,
      log: (entry) => logs.push(entry),
      ...overrides,
    },
  };
}

function assertRefused(result, logs, reason) {
  assert.deepEqual(result, { ok: false, reason });
  assert.deepEqual(logs, [{ jobId: job.id, reason }]);
}

test("execution flag defaults off", () => {
  const { deps, logs } = dependencies({ flagEnabled: undefined });
  assertRefused(checkSandboxJob(job, deps), logs, "execution_disabled");
});

test("refuses jobs without an approved record", () => {
  const { deps, logs } = dependencies({ getApproval: () => ({ approved: false }) });
  assertRefused(checkSandboxJob(job, deps), logs, "not_approved");
});

test("refuses jobs while Mothership Stop is on", () => {
  const { deps, logs } = dependencies({ isStopped: () => true });
  assertRefused(checkSandboxJob(job, deps), logs, "stopped");
});

for (const [key, limit] of Object.entries({
  callUsd: 0.5,
  jobUsd: 1,
  dayUsd: 5,
  totalUsd: 10,
})) {
  test(`refuses when ${key} exceeds its cap`, () => {
    const { deps, logs } = dependencies({
      spend: () => ({ callUsd: 0, jobUsd: 0, dayUsd: 0, totalUsd: 0, [key]: limit + 0.01 }),
    });
    assertRefused(checkSandboxJob(job, deps), logs, "cap_reached");
  });
}

test("allows an approved, active job within all caps when execution is enabled", () => {
  const { deps, logs } = dependencies();
  assert.deepEqual(checkSandboxJob(job, deps), { ok: true });
  assert.deepEqual(logs, []);
});
