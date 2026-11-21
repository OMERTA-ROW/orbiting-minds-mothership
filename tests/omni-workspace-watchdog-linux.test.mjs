import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createWorkerCgroup } from "../services/omni-sandbox/cgroup.mjs";
import { createWorkerLeases, signWorkerRecord } from "../services/omni-sandbox/worker-leases.mjs";

const enabled = process.env.OMNI_WORKSPACE_WATCHDOG_TEST === "1";
const secret = "s".repeat(48);
function processResult(proc) {
  let stdout = "",
    stderr = "";
  proc.stdout.on("data", (part) => {
    stdout += part;
  });
  proc.stderr.on("data", (part) => {
    stderr += part;
  });
  return new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
for (const scenario of [
  "startup Stop",
  "execution Stop",
  "expiry",
  "restart quarantine",
  "wipe failure",
]) {
  test(`independent UID watchdog: ${scenario}`, { skip: !enabled }, async () => {
    assert.equal(process.platform, "linux");
    assert.equal(process.getuid(), 0, "Only the disposable fixture provisioning oracle is root.");
    const parent = process.env.OMNI_WORKSPACE_DELEGATED_CGROUP;
    const workerUid = 21000,
      watchdogUid = 22000;
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "omni-watchdog-"));
    fs.chmodSync(base, 0o711);
    const coordinator = path.join(base, "coordinator");
    fs.mkdirSync(coordinator, { mode: 0o700 });
    const db = new DatabaseSync(path.join(coordinator, "leases.sqlite"));
    const pool = createWorkerLeases(db, ["one"]);
    const binding = pool.claim({
      projectId: "omni",
      ownerId: randomUUID(),
      sessionId: randomUUID(),
      jobId: randomUUID(),
    });
    const delegated = path.join(parent, `watchdog-${binding.leaseId}`);
    fs.mkdirSync(delegated);
    fs.writeFileSync(`${delegated}/cgroup.subtree_control`, "+cpu +memory +pids");
    fs.chownSync(delegated, watchdogUid, watchdogUid);
    const original = createWorkerCgroup(delegated, binding.leaseId, {
      cpuQuotaMicros: 50000,
      cpuPeriodMicros: 100000,
      memoryBytes: 128 * 1024 ** 2,
      maxProcesses: 32,
    });
    const root = path.join(delegated, `worker-${binding.leaseId}`);
    fs.chownSync(root, watchdogUid, watchdogUid);
    for (const entry of fs.readdirSync(root))
      fs.chownSync(path.join(root, entry), watchdogUid, watchdogUid);
    const watchHome = path.join(base, "watchdog");
    fs.mkdirSync(watchHome, { mode: 0o711 });
    fs.chownSync(watchHome, watchdogUid, watchdogUid);
    const workspace = path.join(watchHome, binding.leaseId);
    fs.mkdirSync(workspace);
    fs.chownSync(workspace, watchdogUid, workerUid);
    fs.chmodSync(workspace, 0o770);
    const control = path.join(watchHome, "control");
    fs.mkdirSync(control, { mode: 0o700 });
    fs.chownSync(control, watchdogUid, watchdogUid);
    const authorityFile = path.join(control, "authority.json");
    let sequence = 0;
    const publish = (active) => {
      const record = { ...binding, sequence: ++sequence, active, expiresAt: Date.now() + 1000 };
      const next = `${authorityFile}.next`;
      fs.writeFileSync(
        next,
        JSON.stringify({ record, signature: signWorkerRecord(secret, record) }),
        { mode: 0o600 },
      );
      fs.chownSync(next, watchdogUid, watchdogUid);
      fs.renameSync(next, authorityFile);
    };
    publish(scenario !== "startup Stop");
    let worker, watchdog;
    try {
      const script =
        `IFS= read -r gate <&3; [ "$gate" = go ] || exit 1; ` +
        `kill -TERM "$WATCHDOG_PID" 2>&1 && { echo WATCHDOG_SIGNAL_ALLOWED; exit 77; }; ` +
        `echo WATCHDOG_SIGNAL_BLOCKED; touch ready; ` +
        (scenario === "wipe failure"
          ? "mkdir private; chmod 700 private; touch private/file; "
          : "") +
        "setsid sleep 30 & sleep 30";
      worker = spawn(
        "/usr/bin/setpriv",
        [
          `--reuid=${workerUid}`,
          `--regid=${workerUid}`,
          "--clear-groups",
          "--inh-caps=-all",
          "--ambient-caps=-all",
          "--bounding-set=-all",
          "--no-new-privs",
          "/bin/bash",
          "-c",
          "IFS= read -r pid <&4; export WATCHDOG_PID=$pid; " + script,
        ],
        {
          cwd: workspace,
          env: { PATH: "/usr/bin:/bin" },
          stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        },
      );
      const workerResult = processResult(worker);
      fs.writeFileSync(`${root}/cgroup.procs`, String(worker.pid));
      watchdog = spawn(
        "/usr/bin/setpriv",
        [
          `--reuid=${watchdogUid}`,
          `--regid=${watchdogUid}`,
          "--clear-groups",
          "--inh-caps=-all",
          "--ambient-caps=-all",
          "--bounding-set=-all",
          "--no-new-privs",
          process.execPath,
          "/opt/omni-watchdog-fixture/tests/fixtures/omni-worker-watchdog-process.mjs",
        ],
        { env: { PATH: "/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] },
      );
      const watchdogResult = processResult(watchdog);
      watchdog.stdin.end(
        JSON.stringify({
          parent: root,
          workspace,
          authorityFile,
          binding,
          secret,
          workerUid,
          watchdogUid,
          recover: scenario === "restart quarantine",
        }),
      );
      worker.stdio[4].end(`${watchdog.pid}\n`);
      if (!["startup Stop", "restart quarantine"].includes(scenario)) {
        worker.stdio[3].end("go\n");
        const deadline = performance.now() + 700;
        while (!fs.existsSync(path.join(workspace, "ready")) && performance.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 10));
        assert.ok(fs.existsSync(path.join(workspace, "ready")), "Worker did not enter execution.");
        if (scenario !== "expiry") publish(false);
      }
      const result = await watchdogResult;
      assert.equal(result.code, scenario === "wipe failure" ? 1 : 0, result.stderr);
      const child = await workerResult;
      assert.equal(child.signal, "SIGKILL", child.stderr);
      if (!["startup Stop", "restart quarantine"].includes(scenario)) {
        assert.match(child.stdout, /Operation not permitted/);
        assert.match(child.stdout, /WATCHDOG_SIGNAL_BLOCKED/);
        assert.doesNotMatch(child.stdout, /WATCHDOG_SIGNAL_ALLOWED/);
      }
      assert.equal(fs.existsSync(root), false, result.stderr);
      if (scenario === "wipe failure") {
        assert.equal(result.code, 1);
        assert.equal(fs.existsSync(workspace), true);
        pool.quarantine(binding.leaseId);
        assert.throws(
          () =>
            pool.claim({
              projectId: "omni",
              ownerId: randomUUID(),
              sessionId: randomUUID(),
              jobId: randomUUID(),
            }),
          /exhausted/,
        );
      } else {
        assert.equal(result.code, 0, result.stderr);
        assert.equal(fs.existsSync(workspace), false);
        pool.release(JSON.parse(result.stdout), secret);
        assert.equal(pool.read(binding.leaseId).state, "released");
      }
    } finally {
      worker?.stdio[3].destroy();
      if (fs.existsSync(root)) {
        fs.writeFileSync(`${root}/cgroup.kill`, "1");
        fs.rmdirSync(root);
      }
      if (watchdog?.exitCode === null) watchdog.kill("SIGKILL");
      fs.rmdirSync(delegated);
      db.close();
      fs.rmSync(base, { recursive: true });
    }
  });
}
