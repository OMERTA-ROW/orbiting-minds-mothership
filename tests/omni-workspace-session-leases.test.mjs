import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  createSessionLeases,
  createWorkerLeases,
  signWorkerRecord,
} from "../services/omni-sandbox/worker-leases.mjs";
import { createLeasedSessionWorkspace } from "../services/omni-sandbox/leased-worker.mjs";
import {
  createLeasedWatchHandler,
  verifyWorkspaceRemoved,
} from "../services/omni-sandbox/leased-watchdog.mjs";
import { renewableSessionAuthority } from "../services/omni-sandbox/worker-authority.mjs";

const secret = "s".repeat(48);
const identity = () => ({ ownerId: randomUUID(), sessionId: randomUUID(), projectId: "omni" });
const envelope = (record) => ({ record, signature: signWorkerRecord(secret, record) });
const sessionRecord = (lease, fields) => ({
  contract: "omni.workspace-session/v1",
  ...lease,
  ...fields,
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-lease-"));
  const file = path.join(dir, "leases.sqlite");
  const db = new DatabaseSync(file);
  const sessions = createSessionLeases(db, ["one", "two"]);
  const jobs = createWorkerLeases(db, ["one", "two"]);
  return {
    file,
    db,
    sessions,
    jobs,
    close() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("leased session commands reuse one workspace directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-workspace-"));
  const reservation = new AbortController();
  let workspacePath;
  const session = createLeasedSessionWorkspace({
    parent: root,
    reservationSignal: reservation.signal,
    runCommand: async ({ work, command, ephemeral }) => {
      workspacePath ??= work;
      assert.equal(work, workspacePath);
      assert.equal(ephemeral, false);
      if (command === "first") fs.writeFileSync(path.join(work, "kept"), "session data");
      if (command === "second")
        assert.equal(fs.readFileSync(path.join(work, "kept"), "utf8"), "session data");
      return { completed: Promise.resolve({ code: 0 }), stop: async () => {} };
    },
  });
  try {
    await session.run({ command: "first" });
    await session.run({ command: "second" });
    assert.equal(fs.existsSync(workspacePath), true);
  } finally {
    await session.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("leased session end wipes its workspace", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-workspace-"));
  const reservation = new AbortController();
  let workspacePath;
  const session = createLeasedSessionWorkspace({
    parent: root,
    reservationSignal: reservation.signal,
    runCommand: async ({ work }) => {
      workspacePath = work;
      return { completed: Promise.resolve({ code: 0 }), stop: async () => {} };
    },
  });
  try {
    await session.run({ command: "first" });
    await session.end();
    assert.equal(fs.existsSync(workspacePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("watchdog reports cleanup only after independently confirming the workspace is absent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-watchdog-"));
  const workspacePath = path.join(root, "removed-workspace");
  const binding = {
    leaseId: randomUUID(),
    workerId: "one",
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
  const cleanup = { outcome: "terminated_and_wiped" };
  const handleWatch = createLeasedWatchHandler(
    { secret, workerId: binding.workerId, workspacePath },
    async () => cleanup,
  );
  try {
    assert.equal(await handleWatch(envelope(record)), cleanup);
    assert.equal(verifyWorkspaceRemoved(workspacePath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace verification refuses cleanup success while the directory remains", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-watchdog-present-"));
  try {
    assert.throws(() => verifyWorkspaceRemoved(root), /Workspace remains/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace verification refuses cleanup success when the directory is unreadable", () => {
  const unreadable = Object.assign(new Error("permission denied"), { code: "EACCES" });
  assert.throws(
    () =>
      verifyWorkspaceRemoved("/workspace", () => {
        throw unreadable;
      }),
    /could not be independently confirmed/,
  );
});

test("lost session reservation wipes its workspace and refuses later commands", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-workspace-"));
  const reservation = new AbortController();
  let workspacePath;
  const session = createLeasedSessionWorkspace({
    parent: root,
    reservationSignal: reservation.signal,
    runCommand: async ({ work }) => {
      workspacePath = work;
      return { completed: Promise.resolve({ code: 0 }), stop: async () => {} };
    },
  });
  try {
    await session.run({ command: "first" });
    reservation.abort();
    assert.equal(fs.existsSync(workspacePath), false);
    await assert.rejects(session.run({ command: "second" }), /reservation/);
  } finally {
    await session.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session ownership persists across restart and excludes job leases", () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    const other = new DatabaseSync(f.file);
    try {
      const restored = createSessionLeases(other, ["one", "two"]);
      assert.equal(restored.unfinished()[0].leaseId, lease.leaseId);
      assert.throws(() => f.jobs.claim({ ...lease, jobId: randomUUID() }), /session recovery/);
      assert.throws(() => f.jobs.claim({ ...identity(), jobId: randomUUID() }), /session recovery/);
      const second = restored.claim(identity());
      assert.notEqual(second.workerId, lease.workerId);
      assert.throws(() => restored.claim(identity()), /exhausted/);
    } finally {
      other.close();
    }
  } finally {
    f.close();
  }
});

test("database triggers prevent cross-protocol worker or session reuse", () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    assert.throws(
      () =>
        f.db
          .prepare("INSERT INTO workspace_worker_leases VALUES (?,?,?,?,?,?,'leased')")
          .run(randomUUID(), "two", randomUUID(), lease.projectId, randomUUID(), randomUUID()),
      /session lease/,
    );
    f.sessions.release(
      envelope(sessionRecord(lease, { kind: "session_cleanup", outcome: "terminated_and_wiped" })),
      secret,
    );
    const job = f.jobs.claim({ ...identity(), jobId: randomUUID() });
    assert.throws(
      () =>
        f.db
          .prepare("INSERT INTO workspace_session_leases VALUES (?,?,?,?,?,'leased')")
          .run(randomUUID(), "two", randomUUID(), job.projectId, randomUUID()),
      /job lease/,
    );
  } finally {
    f.close();
  }
});

test("simultaneous session and job reservations cannot claim the same worker", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-session-race-"));
  const file = path.join(dir, "leases.sqlite");
  const db = new DatabaseSync(file);
  createSessionLeases(db, ["one"]);
  const moduleUrl = new URL("../services/omni-sandbox/worker-leases.mjs", import.meta.url).href;
  const source = `
    import { DatabaseSync } from "node:sqlite";
    import { createSessionLeases, createWorkerLeases } from ${JSON.stringify(moduleUrl)};
    const db = new DatabaseSync(process.argv[1]);
    const id = JSON.parse(process.argv[3]);
    try {
      const pool = process.argv[2] === "session"
        ? createSessionLeases(db, ["one"])
        : createWorkerLeases(db, ["one"]);
      pool.claim(id);
      console.log("claimed");
    } catch (error) {
      if (!/exhausted|session lease|job lease/.test(error.message)) throw error;
      console.log("refused");
    } finally { db.close(); }
  `;
  const run = (kind) =>
    new Promise((resolve, reject) => {
      const id = { ...identity(), jobId: randomUUID() };
      const child = spawn(process.execPath, [
        "--input-type=module",
        "-e",
        source,
        file,
        kind,
        JSON.stringify(id),
      ]);
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (errors += chunk));
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 ? resolve(output.trim()) : reject(new Error(errors)),
      );
    });
  try {
    assert.deepEqual((await Promise.all([run("session"), run("job")])).sort(), [
      "claimed",
      "refused",
    ]);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("session remains quarantined until bound authenticated wipe", () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    f.sessions.quarantine(lease.leaseId);
    const good = sessionRecord(lease, { kind: "session_cleanup", outcome: "terminated_and_wiped" });
    assert.throws(
      () => f.sessions.release(envelope({ ...good, ownerId: randomUUID() }), secret),
      /mismatch/,
    );
    assert.throws(
      () => f.sessions.release(envelope({ ...good, kind: "authority" }), secret),
      /wipe/,
    );
    assert.throws(
      () => f.sessions.release(envelope({ ...good, outcome: "cleanup_failed" }), secret),
      /wipe/,
    );
    assert.equal(f.sessions.read(lease.leaseId).state, "quarantined");
    f.sessions.release(envelope(good), secret);
    assert.equal(f.sessions.read(lease.leaseId).state, "released");
    assert.throws(() => f.sessions.release(envelope(good), secret), /wipe/);
    assert.throws(() => f.sessions.claim(lease), /durable lease/);
  } finally {
    f.close();
  }
});

test("session authority fails closed on Stop, invalid signature and identity mismatch", () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    const active = sessionRecord(lease, {
      kind: "session_authority",
      active: true,
      sequence: 1,
      expiresAt: Date.now() + 1000,
    });
    const check = renewableSessionAuthority(secret, lease);
    assert.equal(check(envelope(active)).sequence, 1);
    assert.throws(() => check(envelope({ ...active, active: false, sequence: 2 })), /revoked/);
    assert.throws(() => check(envelope({ ...active, sequence: 3 })), /already revoked/);
    const wrong = renewableSessionAuthority(secret, lease);
    assert.throws(() => wrong(envelope({ ...active, sessionId: randomUUID() })), /mismatch/);
    const tampered = renewableSessionAuthority(secret, lease);
    assert.throws(() => tampered({ record: active, signature: "0".repeat(64) }), /signature/);
    assert.throws(() => tampered(envelope(active)), /already revoked/);
  } finally {
    f.close();
  }
});

test("expired and replayed session authority cannot be renewed", () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    const check = renewableSessionAuthority(secret, lease);
    const active = sessionRecord(lease, {
      kind: "session_authority",
      active: true,
      sequence: 2,
      expiresAt: Date.now() + 1000,
    });
    check(envelope(active));
    assert.throws(() => check(envelope({ ...active, sequence: 1 })), /replay/);
    assert.throws(() => check(envelope({ ...active, sequence: 3 })), /already revoked/);
    const expired = renewableSessionAuthority(secret, lease);
    assert.throws(() => expired(envelope({ ...active, expiresAt: Date.now() - 1 })), /expired/);
  } finally {
    f.close();
  }
});

test("reusing a sequence cannot extend the monotonic session deadline", async () => {
  const f = fixture();
  try {
    const lease = f.sessions.claim(identity());
    const check = renewableSessionAuthority(secret, lease);
    const record = sessionRecord(lease, {
      kind: "session_authority",
      active: true,
      sequence: 1,
      expiresAt: Date.now() + 40,
    });
    check(envelope(record));
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.throws(
      () => check(envelope({ ...record, expiresAt: Date.now() + 1000 })),
      /renewal expired/,
    );
  } finally {
    f.close();
  }
});
