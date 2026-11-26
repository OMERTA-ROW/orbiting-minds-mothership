import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLeasedWatchHandler } from "../services/omni-sandbox/leased-watchdog.mjs";
import { signWorkerRecord } from "../services/omni-sandbox/worker-leases.mjs";

const secret = "s".repeat(48);

function temporaryAuthority(contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "omni-leased-watchdog-test-"));
  const authorityFile = path.join(directory, "authority.json");
  if (contents !== undefined) fs.writeFileSync(authorityFile, contents);
  return { authorityFile, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

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
  const authority = temporaryAuthority();
  let received;
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: binding.workerId, authorityFile: authority.authorityFile },
    async (options) => {
      received = options;
      return cleanup;
    },
  );

  try {
    assert.equal(await handleWatch(envelope), cleanup);
    assert.deepEqual(received.binding, binding);
    assert.equal(received.recover, true);
  } finally {
    authority.close();
  }
});

test("leased watchdog treats invalid session authority as lapsed and cleans up", async () => {
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
  const authority = temporaryAuthority(JSON.stringify({ record: binding, signature: "0".repeat(64) }));
  const cleanup = { outcome: "terminated_and_wiped" };
  let received;
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: binding.workerId, authorityFile: authority.authorityFile },
    async (options) => {
      received = options;
      return cleanup;
    },
  );

  try {
    assert.equal(await handleWatch(envelope), cleanup);
    assert.equal(received.recover, true);
  } finally {
    authority.close();
  }
});

test("leased watchdog cleans a session whose authority is not renewed before expiry", async () => {
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
  const authorityRecord = {
    ...binding,
    contract: "omni.workspace-session/v1",
    kind: "session_authority",
    active: true,
    sequence: 1,
    expiresAt: Date.now() + 200,
  };
  const authority = temporaryAuthority(
    JSON.stringify({
      record: authorityRecord,
      signature: signWorkerRecord(secret, authorityRecord),
    }),
  );
  const cleanup = { outcome: "terminated_and_wiped" };
  let received;
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: binding.workerId, authorityFile: authority.authorityFile },
    async (options) => {
      received = options;
      return cleanup;
    },
  );

  try {
    assert.equal(await handleWatch(envelope), cleanup);
    assert.equal(received.recover, true);
  } finally {
    authority.close();
  }
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
