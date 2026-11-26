import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLeasedWatchHandler } from "../services/omni-sandbox/leased-watchdog.mjs";
import { signWorkerRecord } from "../services/omni-sandbox/worker-leases.mjs";

const secret = "s".repeat(48);

test("leased watchdog routes an authenticated session watch and returns its cleanup acknowledgement", async () => {
  const binding = {
    leaseId: randomUUID(),
    workerId: "worker-one",
    ownerId: randomUUID(),
    projectId: "omni",
    sessionId: randomUUID(),
  };
  const record = {
    ...binding,
    contract: "omni.workspace-session/v1",
    kind: "watch",
    recover: false,
    expiresAt: Date.now() + 1000,
  };
  const envelope = { record, signature: signWorkerRecord(secret, record) };
  const cleanup = { outcome: "terminated_and_wiped" };
  let received;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-watchdog-session-"));
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: binding.workerId, workspacePath: path.join(root, "removed") },
    async (options) => {
      received = options;
      return cleanup;
    },
  );

  try {
    assert.equal(await handleWatch(envelope), cleanup);
    assert.deepEqual(received.binding, binding);
    assert.equal(received.recover, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy job cleanup does not require a disk workspace path", async () => {
  const record = {
    leaseId: randomUUID(),
    workerId: "worker-one",
    ownerId: randomUUID(),
    projectId: "omni",
    sessionId: randomUUID(),
    jobId: randomUUID(),
    kind: "watch",
    recover: false,
    expiresAt: Date.now() + 1000,
  };
  const cleanup = { outcome: "terminated_and_wiped" };
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: record.workerId },
    async () => cleanup,
  );
  assert.equal(await handleWatch({ record, signature: signWorkerRecord(secret, record) }), cleanup);
});

test("session cleanup without a workspace path is refused and reported", async () => {
  const record = {
    leaseId: randomUUID(),
    workerId: "worker-one",
    ownerId: randomUUID(),
    projectId: "omni",
    sessionId: randomUUID(),
    contract: "omni.workspace-session/v1",
    kind: "watch",
    recover: false,
    expiresAt: Date.now() + 1000,
  };
  let reported;
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: record.workerId },
    async () => ({ outcome: "terminated_and_wiped" }),
    (error) => {
      reported = error;
    },
  );
  await assert.rejects(
    handleWatch({ record, signature: signWorkerRecord(secret, record) }),
    /absolute workspace path/,
  );
  assert.match(reported.message, /absolute workspace path/);
});

test("leased watchdog refuses an invalid session watch signature before starting cleanup", async () => {
  const record = {
    leaseId: randomUUID(),
    workerId: "worker-one",
    ownerId: randomUUID(),
    projectId: "omni",
    sessionId: randomUUID(),
    contract: "omni.workspace-session/v1",
    kind: "watch",
    recover: false,
    expiresAt: Date.now() + 1000,
  };
  let started = false;
  const handleWatch = createLeasedWatchHandler({ secret, workerId: record.workerId }, async () => {
    started = true;
  });

  await assert.rejects(
    handleWatch({ record, signature: "0".repeat(64) }),
    /Invalid worker control signature/,
  );
  assert.equal(started, false);
});

test("leased watchdog reports a watch failure and refuses its cleanup acknowledgement", async () => {
  const record = {
    leaseId: randomUUID(),
    workerId: "worker-one",
    ownerId: randomUUID(),
    projectId: "omni",
    sessionId: randomUUID(),
    contract: "omni.workspace-session/v1",
    kind: "watch",
    recover: false,
    expiresAt: Date.now() + 1000,
  };
  const failure = new Error("cleanup failed");
  let reported;
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: record.workerId },
    async () => {
      throw failure;
    },
    (error) => {
      reported = error;
    },
  );

  await assert.rejects(
    handleWatch({ record, signature: signWorkerRecord(secret, record) }),
    failure,
  );
  assert.equal(reported, failure);
});
