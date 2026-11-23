import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLeasedCoordinator } from "../services/omni-sandbox/leased-coordinator.mjs";

function makeCoordinator(pool, gateDeps) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "omni-coordinator-gate-"));
  const coordinator = createLeasedCoordinator({
    pool,
    workers: [],
    databaseFile: path.join(directory, "state.sqlite"),
    approvalSecret: "test-secret",
    approve: async () => {},
    renew: async () => {},
    monitor: async () => {},
    ...gateDeps,
  });
  return {
    coordinator,
    cleanup() {
      coordinator.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

const approvedDeps = {
  getApproval: () => ({ approved: true }),
  isStopped: () => false,
  spend: () => ({ callUsd: 0, jobUsd: 0, dayUsd: 0, totalUsd: 0 }),
  flagEnabled: () => true,
  log: () => {},
};

test("gate refusal returns its reason without reserving a lease", async () => {
  let claims = 0;
  const pool = {
    unfinished: () => [],
    claim: () => {
      claims += 1;
      throw new Error("lease should not be claimed");
    },
  };
  const { coordinator, cleanup } = makeCoordinator(pool, {
    ...approvedDeps,
    getApproval: () => null,
  });

  try {
    assert.deepEqual(await coordinator.execute("job-1", "command", {}), {
      ok: false,
      reason: "not_approved",
    });
    assert.equal(claims, 0);
  } finally {
    cleanup();
  }
});

test("gate approval reaches the existing admission path", async () => {
  let claims = 0;
  const pool = {
    unfinished: () => [],
    claim: () => {
      claims += 1;
      throw new Error("admission reached");
    },
  };
  const { coordinator, cleanup } = makeCoordinator(pool, approvedDeps);

  try {
    await assert.rejects(coordinator.execute("job-1", "command", {}), /admission reached/);
    assert.equal(claims, 1);
  } finally {
    cleanup();
  }
});

test("missing gate dependencies refuse execution", async () => {
  let claims = 0;
  const pool = {
    unfinished: () => [],
    claim: () => {
      claims += 1;
      throw new Error("lease should not be claimed");
    },
  };
  const { coordinator, cleanup } = makeCoordinator(pool);

  try {
    assert.deepEqual(await coordinator.execute("job-1", "command", {}), {
      ok: false,
      reason: "execution_disabled",
    });
    assert.equal(claims, 0);
  } finally {
    cleanup();
  }
});
