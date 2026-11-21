import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { systemdWorkerControl } from "../services/omni-sandbox/systemd-worker.mjs";

const enabled = process.env.OMNI_WORKSPACE_LIFECYCLE_TEST === "1";
const execute = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const installed = "/opt/omni-watchdog-fixture";
const workerId = "fixture",
  workerUid = 21000,
  watchdogUid = 22000,
  coordinatorUid = 23000;
const workerUser = `omni-worker-${workerId}`;
const workerUnit = `omni-worker@${workerId}.service`;
const workerSocketUnit = `omni-worker@${workerId}.socket`;
const watchdogUnit = "omni-watchdog@fixture.service";
const watchdogSocketUnit = "omni-watchdog@fixture.socket";
const units = [workerSocketUnit, workerUnit, watchdogSocketUnit, watchdogUnit];
const control = systemdWorkerControl(workerId, workerUser);
const systemctl = (...args) => execute("/usr/bin/systemctl", ["--no-pager", ...args]);

function result(child) {
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (part) => {
    stdout += part;
  });
  child.stderr.on("data", (part) => {
    stderr += part;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
function writePrivate(file, value, uid, gid = uid, mode = 0o600) {
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), { mode });
  fs.chownSync(file, uid, gid);
}
async function runningSandbox() {
  const state = await control.inspect();
  const root = `/sys/fs/cgroup${state.ControlGroup}`;
  if (!state.ControlGroup || !fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root)) {
    if (!dir.startsWith("job-")) continue;
    for (const pid of fs
      .readFileSync(path.join(root, dir, "cgroup.procs"), "utf8")
      .trim()
      .split("\n")) {
      try {
        if (fs.existsSync(`/proc/${pid}/root/work/ready`)) return { pid, root };
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
      }
    }
  }
  return null;
}
async function waitFor(check, message, ms = 5000) {
  const deadline = performance.now() + ms;
  do {
    const value = await check();
    if (value) return value;
    await sleep(25);
  } while (performance.now() < deadline);
  throw new Error(message);
}

for (const scenario of [
  "happy path",
  "startup Stop",
  "mid-job Stop",
  "renewal loss",
  "worker crash",
  "coordinator restart",
  "watchdog crash",
  "cleanup refused",
]) {
  test(
    `integrated socket/tmpfs lifecycle: ${scenario}`,
    { skip: !enabled, timeout: 45000 },
    async () => {
      assert.equal(process.platform, "linux");
      assert.equal(process.getuid(), 0, "Root is only the disposable provisioning/test oracle.");
      const base = fs.mkdtempSync("/run/omni-leased-test-");
      fs.chmodSync(base, 0o711);
      const state = path.join(base, "coordinator");
      fs.mkdirSync(state, { mode: 0o750 });
      fs.chownSync(state, coordinatorUid, watchdogUid);
      fs.chmodSync(state, 0o2750);
      const socketPath = path.join(base, "worker.sock");
      const watchdogSocket = path.join(base, "watchdog.sock");
      const authorityFile = path.join(state, "authority.json");
      const workerConfig = path.join(base, "worker.json");
      const watchdogConfig = path.join(base, "watchdog.json");
      const coordinatorConfig = path.join(state, "config.json");
      const privateState = path.join(state, "private");
      fs.mkdirSync(privateState, { mode: 0o700 });
      fs.chownSync(privateState, coordinatorUid, coordinatorUid);
      const database = path.join(privateState, "leases.sqlite");
      const config = {
        database,
        workerId,
        workerUser,
        socketPath,
        watchdogSocket,
        authorityFile,
        workerSecret: "w".repeat(48),
        watchdogSecret: "d".repeat(48),
        approvalSecret: "a".repeat(48),
        startupDelay: scenario === "startup Stop" ? 1000 : 0,
        again: scenario === "happy path",
        identity: {
          ownerId: randomUUID(),
          projectId: "omni",
          sessionId: randomUUID(),
          jobId: randomUUID(),
        },
        command:
          scenario === "happy path"
            ? "test ! -e previous; mkdir -m 000 private; touch ready; " +
              'test "$(stat -f -c %T /work)" = tmpfs; test "$(stat -f -c %T /tmp)" = tmpfs; ' +
              'test -z "$OMNI_LEAK_PROBE"; touch previous; echo real-tmpfs-response'
            : "mkdir -m 000 private; touch ready; setsid sleep 30 & sleep 30",
      };
      writePrivate(
        workerConfig,
        {
          role: "worker",
          workerId,
          secret: config.workerSecret,
          socketPath,
          coordinatorGid: coordinatorUid,
        },
        workerUid,
      );
      writePrivate(
        watchdogConfig,
        {
          role: "watchdog",
          workerId,
          workerUser,
          workerUid,
          watchdogUid,
          secret: config.watchdogSecret,
          socketPath: watchdogSocket,
          coordinatorGid: coordinatorUid,
          authorityFile,
        },
        watchdogUid,
      );
      writePrivate(coordinatorConfig, config, coordinatorUid);
      const hardening =
        "Type=exec\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nAmbientCapabilities=\nProtectSystem=strict\n" +
        "ProtectHome=yes\nPrivateTmp=yes\nRestrictSUIDSGID=yes\nProtectKernelTunables=yes\n" +
        "ProtectKernelModules=yes\nProtectKernelLogs=yes\nUMask=0077\nKillMode=control-group\n" +
        "TimeoutStopSec=1s\nRestart=no\n";
      const socketUnit = (socket, user, service) =>
        `[Socket]\nListenStream=${socket}\nSocketUser=${user}\nSocketGroup=omni-coordinator-fixture\n` +
        `SocketMode=0660\nRemoveOnStop=yes\nService=${service}\n`;
      writePrivate(
        `/run/systemd/system/${workerSocketUnit}`,
        socketUnit(socketPath, workerUser, workerUnit),
        0,
        0,
        0o644,
      );
      writePrivate(
        `/run/systemd/system/${watchdogSocketUnit}`,
        socketUnit(watchdogSocket, "omni-watchdog-fixture", watchdogUnit),
        0,
        0,
        0o644,
      );
      writePrivate(
        `/run/systemd/system/${workerUnit}`,
        `[Unit]\nRequires=${workerSocketUnit}\nBindsTo=${watchdogUnit}\nAfter=${watchdogUnit}\n` +
          `[Service]\nUser=${workerUser}\nGroup=${workerUser}\nDelegate=yes\n` +
          `ExecStart=${process.execPath} ${installed}/tests/fixtures/omni-leased-service.mjs ${workerConfig}\n` +
          "Environment=OMNI_LEAK_PROBE=synthetic-parent-value\n" +
          hardening +
          "TasksMax=64\nMemoryMax=256M\nMemorySwapMax=0\nCPUQuota=50%\n" +
          "RestrictNamespaces=user mnt pid net ipc uts\nRestrictAddressFamilies=AF_UNIX AF_NETLINK\n",
        0,
        0,
        0o644,
      );
      writePrivate(
        `/run/systemd/system/${watchdogUnit}`,
        `[Unit]\nRequires=${watchdogSocketUnit}\n[Service]\nUser=omni-watchdog-fixture\n` +
          `Group=omni-watchdog-fixture\nExecStart=${process.execPath} ` +
          `${installed}/tests/fixtures/omni-leased-service.mjs ${watchdogConfig}\n` +
          hardening +
          "RestrictAddressFamilies=AF_UNIX\n",
        0,
        0,
        0o644,
      );
      const policy = "/etc/polkit-1/rules.d/49-omni-lifecycle-fixture.rules";
      writePrivate(
        policy,
        "polkit.addRule(function(action, subject) {\n" +
          ' if (action.id === "org.freedesktop.systemd1.manage-units" &&\n' +
          ' subject.user === "omni-watchdog-fixture" &&\n' +
          ` ["${workerUnit}", "${workerSocketUnit}"].indexOf(action.lookup("unit")) >= 0 &&\n` +
          ' ["start", "stop"].indexOf(action.lookup("verb")) >= 0) return polkit.Result.YES;\n' +
          "});\n",
        0,
        0,
        0o644,
      );
      let child, childResult;
      const startCoordinator = () => {
        child = spawn(
          "/usr/bin/setpriv",
          [
            `--reuid=${coordinatorUid}`,
            `--regid=${coordinatorUid}`,
            "--clear-groups",
            "--inh-caps=-all",
            "--ambient-caps=-all",
            "--bounding-set=-all",
            "--no-new-privs",
            process.execPath,
            `${installed}/tests/fixtures/omni-leased-coordinator.mjs`,
            coordinatorConfig,
          ],
          { stdio: ["pipe", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" } },
        );
        childResult = result(child);
      };
      try {
        await systemctl("daemon-reload");
        await systemctl("start", watchdogSocketUnit, watchdogUnit, workerSocketUnit, workerUnit);
        const initial = await control.inspect();
        assert.match(
          fs.readFileSync(`/proc/${initial.MainPID}/status`, "utf8"),
          new RegExp(`^Uid:\\s+${workerUid}\\s+${workerUid}\\s+${workerUid}\\s+${workerUid}$`, "m"),
        );
        const watchdogPid = (
          await systemctl("show", watchdogUnit, "--property=MainPID", "--value")
        ).stdout.trim();
        assert.match(
          fs.readFileSync(`/proc/${watchdogPid}/status`, "utf8"),
          new RegExp(
            `^Uid:\\s+${watchdogUid}\\s+${watchdogUid}\\s+${watchdogUid}\\s+${watchdogUid}$`,
            "m",
          ),
        );
        startCoordinator();
        if (scenario === "startup Stop") {
          await waitFor(async () => {
            if (!fs.existsSync(database)) return false;
            const db = new DatabaseSync(database);
            try {
              const table = db
                .prepare("SELECT 1 FROM sqlite_master WHERE name='workspace_worker_leases'")
                .get();
              return table && db.prepare("SELECT 1 FROM workspace_worker_leases").get();
            } finally {
              db.close();
            }
          }, "Coordinator did not acquire its durable lease.");
          child.stdin.write("stop\n");
        } else if (scenario !== "happy path") {
          await waitFor(
            runningSandbox,
            "Worker did not execute inside its real tmpfs/PID namespace.",
          );
          if (scenario === "mid-job Stop") child.stdin.write("stop\n");
          else if (scenario === "renewal loss") child.stdin.write("renewal loss\n");
          else if (scenario === "worker crash" || scenario === "watchdog crash")
            await systemctl(
              "kill",
              "--kill-who=main",
              "--signal=KILL",
              scenario === "watchdog crash" ? watchdogUnit : workerUnit,
            );
          else if (scenario === "cleanup refused") {
            fs.unlinkSync(policy);
            await sleep(2000);
            child.stdin.write("stop\n");
          } else {
            child.kill("SIGKILL");
            await childResult;
            await waitFor(async () => {
              const current = await control.inspect();
              return (
                current.ActiveState === "active" && current.InvocationID !== initial.InvocationID
              );
            }, "Independent watchdog did not recycle after coordinator death.");
            config.recover = true;
            writePrivate(coordinatorConfig, config, coordinatorUid);
            startCoordinator();
          }
        }
        const completed = await childResult;
        assert.equal(
          completed.code,
          ["happy path", "coordinator restart"].includes(scenario) ? 0 : 1,
          `${completed.stdout}\n${completed.stderr}`,
        );
        const reply = JSON.parse(completed.stdout.trim());
        if (scenario === "happy path") {
          assert.match(reply.result.stdout, /real-tmpfs-response/);
          assert.notEqual(reply.cleanup.invocationId, reply.cleanup.previousInvocationId);
          assert.equal(reply.cleanup.outcome, "terminated_and_wiped");
          assert.match(reply.reuse.result.stdout, /fresh-workspace/);
          assert.equal(reply.binding.workerId, reply.reuse.binding.workerId);
          assert.notEqual(reply.binding.leaseId, reply.reuse.binding.leaseId);
        } else if (scenario === "coordinator restart") assert.equal(reply.recovered, true);
        else
          assert.match(
            reply.error,
            /did not complete|closed|timed out|Startup authority|cleanup unconfirmed/,
          );
        const current = await control.inspect();
        const retained = ["watchdog crash", "cleanup refused"].includes(scenario);
        if (!retained) {
          assert.equal(current.ActiveState, "active");
          assert.notEqual(current.InvocationID, initial.InvocationID);
        } else {
          await waitFor(
            async () => ["inactive", "failed"].includes((await control.inspect()).ActiveState),
            "Watchdog failure did not stop its bound worker.",
          );
        }
        assert.equal(
          fs.existsSync(`/sys/fs/cgroup${initial.ControlGroup}/job-${config.identity.jobId}`),
          false,
        );
        const db = new DatabaseSync(database);
        try {
          const leases = db.prepare("SELECT state FROM workspace_worker_leases").all();
          assert.equal(leases.length, scenario === "happy path" ? 2 : 1);
          for (const lease of leases)
            assert.equal(lease.state, retained ? "quarantined" : "released");
        } finally {
          db.close();
        }
        assert.equal(await runningSandbox(), null, "Recycled workers must not resume jobs.");
      } catch (error) {
        const logs = await systemctl("status", workerUnit, watchdogUnit).catch(
          (failure) => failure,
        );
        console.error(logs.stdout, logs.stderr);
        await execute("/usr/bin/journalctl", [
          "--no-pager",
          "-u",
          workerUnit,
          "-u",
          watchdogUnit,
          "-n",
          "60",
        ]).then((logs) => console.error(logs.stdout));
        throw error;
      } finally {
        if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await systemctl("stop", ...units);
        for (const unit of units) fs.unlinkSync(`/run/systemd/system/${unit}`);
        if (fs.existsSync(policy)) fs.unlinkSync(policy);
        await systemctl("daemon-reload");
        fs.rmSync(base, { recursive: true });
      }
    },
  );
}
