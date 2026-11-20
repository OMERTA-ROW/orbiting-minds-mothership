import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createJobCgroup, openJobCgroupForRecovery } from "../services/omni-sandbox/cgroup.mjs";
import { createWorkspaceJournal } from "../services/omni-sandbox/recovery.mjs";

const parent = process.env.OMNI_WORKSPACE_DELEGATED_CGROUP;
const runLinux = process.platform === "linux" && Boolean(parent);
const identity = () => ({
  projectId: "omni",
  ownerId: randomUUID(),
  sessionId: randomUUID(),
  jobId: randomUUID(),
});
const limits = {
  cpuQuotaMicros: 50000,
  cpuPeriodMicros: 100000,
  memoryBytes: 64 * 1024 * 1024,
  maxProcesses: 8,
};

function service(root, configured = true) {
  const moduleUrl = new URL("../services/omni-sandbox/server.mjs", import.meta.url).href;
  const script = `
    import { createSandbox, loadConfig } from ${JSON.stringify(moduleUrl)};
    const sb = createSandbox(loadConfig(), { network: "isolated" });
    await sb.ready;
    sb.server.listen(0, "127.0.0.1", () => console.log("ready"));
    process.on("SIGTERM", () => { sb.close(); process.exit(0); });
  `;
  return spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: {
      PATH: process.env.PATH,
      OMNI_SANDBOX_ROOT: root,
      OMNI_SANDBOX_CLIENT_ID: "recovery-test",
      OMNI_SANDBOX_HMAC_SECRET: "t".repeat(48),
      ...(configured ? { OMNI_SANDBOX_CGROUP_PARENT: parent } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitReady(child) {
  return new Promise((resolve, reject) => {
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      reject(new Error(`Service exited before readiness: ${code}/${signal} ${errors}`)),
    );
    child.stdout.once("data", () => resolve());
  });
}

test("workspace job claims are identity-bound and single-use across reopen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-job-journal-"));
  const file = path.join(dir, "journal.sqlite");
  let db = new DatabaseSync(file);
  const job = identity();
  try {
    const journal = createWorkspaceJournal(db);
    assert.throws(() => journal.claim({ ...job, ownerId: `A${job.ownerId.slice(1)}` }));
    journal.claim(job);
    db.close();
    db = new DatabaseSync(file);
    assert.throws(() => createWorkspaceJournal(db).claim({ ...job, ownerId: randomUUID() }));
    const stored = db
      .prepare("SELECT project_id, owner_id, session_id, state FROM workspace_job_journal")
      .get();
    assert.deepEqual(
      { ...stored },
      {
        project_id: job.projectId,
        owner_id: job.ownerId,
        session_id: job.sessionId,
        state: "claimed",
      },
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "actual service startup terminates and records an orphaned job before readiness",
  { skip: !runLinux, timeout: 15000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-start-recovery-"));
    const root = path.join(dir, "root");
    const state = path.join(root, ".state");
    fs.mkdirSync(state, { recursive: true, mode: 0o700 });
    const job = identity();
    const db = new DatabaseSync(path.join(state, "nonces.sqlite"));
    createWorkspaceJournal(db).claim(job);
    db.close();
    const group = createJobCgroup(parent, job.jobId, limits);
    const child = spawn(
      "/bin/sh",
      ["-c", 'read -r go; test "$go" = go || exit 1; setsid sleep 60 & echo ready; wait'],
      { detached: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const exited = once(child, "close");
    let first;
    try {
      group.attach(child.pid);
      child.stdin.end("go\n");
      await once(child.stdout, "data");
      first = service(root);
      await waitReady(first);
      await exited;
      assert.equal(fs.existsSync(group.path), false);
      const read = new DatabaseSync(path.join(state, "nonces.sqlite"));
      assert.equal(
        read.prepare("SELECT state FROM workspace_job_journal WHERE job_id = ?").get(job.jobId)
          .state,
        "terminated",
      );
      read.close();

      const second = service(root);
      let errors = "";
      second.stderr.on("data", (chunk) => (errors += chunk));
      const [code] = await once(second, "close");
      assert.notEqual(code, 0);
      assert.match(errors, /Cannot exclusively lock workspace recovery state/);
      const stopped = once(first, "exit");
      first.kill("SIGTERM");
      await stopped;
      const missingConfig = service(root, false);
      let missingErrors = "";
      missingConfig.stderr.on("data", (chunk) => (missingErrors += chunk));
      const [missingCode] = await once(missingConfig, "close");
      assert.notEqual(missingCode, 0);
      assert.match(missingErrors, /recovery parent must be configured/);
    } finally {
      child.stdin.destroy();
      if (first && first.exitCode === null && first.signalCode === null) {
        const stopped = once(first, "exit");
        first.kill("SIGTERM");
        await stopped;
      }
      if (fs.existsSync(group.path)) {
        const recovered = openJobCgroupForRecovery(parent, job.jobId);
        await recovered.stop();
        recovered.remove();
      }
      await exited;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "service startup fails rather than claiming successful cleanup",
  { skip: !runLinux, timeout: 10000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-cleanup-failure-"));
    const root = path.join(dir, "root");
    const state = path.join(root, ".state");
    fs.mkdirSync(state, { recursive: true, mode: 0o700 });
    const job = identity();
    const db = new DatabaseSync(path.join(state, "nonces.sqlite"));
    createWorkspaceJournal(db).claim(job);
    db.close();
    const group = createJobCgroup(parent, job.jobId, limits);
    const nested = path.join(group.path, "leftover");
    fs.mkdirSync(nested);
    try {
      const child = service(root);
      let errors = "";
      child.stderr.on("data", (chunk) => (errors += chunk));
      const [code] = await once(child, "close");
      assert.notEqual(code, 0);
      assert.match(errors, /Workspace startup recovery failed/);
      assert.equal(fs.existsSync(group.path), true);
      const read = new DatabaseSync(path.join(state, "nonces.sqlite"));
      assert.equal(
        read.prepare("SELECT state FROM workspace_job_journal WHERE job_id = ?").get(job.jobId)
          .state,
        "terminated",
      );
      read.close();
    } finally {
      fs.rmdirSync(nested);
      group.remove();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "service startup fails closed if an unfinished job has no cgroup",
  { skip: !runLinux, timeout: 10000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-missing-group-"));
    const root = path.join(dir, "root");
    const state = path.join(root, ".state");
    fs.mkdirSync(state, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path.join(state, "nonces.sqlite"));
    createWorkspaceJournal(db).claim(identity());
    db.close();
    try {
      const child = service(root);
      let errors = "";
      child.stderr.on("data", (chunk) => (errors += chunk));
      const [code] = await once(child, "close");
      assert.notEqual(code, 0);
      assert.match(errors, /termination is unverified/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
