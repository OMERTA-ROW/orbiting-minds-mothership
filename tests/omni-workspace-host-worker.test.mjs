import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startWorkspaceCommand } from "../services/omni-sandbox/supervisor.mjs";

const enabled = process.env.OMNI_WORKSPACE_WORKER_TEST === "1";
test(
  "pre-provisioned non-root worker uses its real host identity inside bubblewrap",
  {
    skip: !enabled,
  },
  async () => {
    assert.equal(process.platform, "linux");
    const uid = process.getuid();
    const gid = process.getgid();
    assert.ok(uid > 0 && gid === uid);
    const status = fs.readFileSync("/proc/self/status", "utf8");
    assert.match(status, /^NoNewPrivs:\s+1$/m);
    assert.match(status, /^CapEff:\s+0+$/m);
    const parent = `/sys/fs/cgroup${/^0::(\/[^\n]+)$/m.exec(fs.readFileSync("/proc/self/cgroup", "utf8"))[1]}`;
    fs.mkdirSync(`${parent}/manager`);
    fs.writeFileSync(`${parent}/manager/cgroup.procs`, "0");
    fs.writeFileSync(`${parent}/cgroup.subtree_control`, "+cpu +memory +pids");
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "omni-worker-"));
    try {
      const control = await startWorkspaceCommand({
        parent,
        jobId: randomUUID(),
        uid,
        work,
        limits: { memoryMb: 128, maxProcesses: 32 },
        command: [
          "set -eu",
          "id -u",
          "id -g",
          "cat /proc/self/uid_map",
          "cat /proc/self/gid_map",
          "touch /work/identity-proof",
          "test ! -e /sys",
          "test ! -e /etc/omni-workspace",
          "test ! -e /var/lib",
          'echo "pid=$(readlink /proc/self/ns/pid)"',
          'echo "net=$(readlink /proc/self/ns/net)"',
          'echo "mnt=$(readlink /proc/self/ns/mnt)"',
          "env",
          ...["127.0.0.1/18801", "169.254.169.254/80", "10.0.0.1/80", "1.1.1.1/443"].map(
            (address) =>
              `if timeout 1 bash -c 'exec 3<>/dev/tcp/${address}' 2>/dev/null; then exit 77; else echo NETWORK_BLOCKED; fi`,
          ),
          "printf WORKER_ISOLATED",
        ].join("; "),
      });
      let stdout = "";
      let stderr = "";
      control.child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      control.child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      assert.equal((await control.completed).code, 0, stderr);
      const lines = stdout.trim().split("\n");
      assert.equal(Number(lines[0]), uid);
      assert.equal(Number(lines[1]), gid);
      assert.deepEqual(lines[2].trim().split(/\s+/).map(Number), [uid, 0, 1]);
      assert.deepEqual(lines[3].trim().split(/\s+/).map(Number), [gid, 0, 1]);
      for (const kind of ["pid", "net", "mnt"]) {
        const value = lines.find((line) => line.startsWith(`${kind}=`))?.slice(kind.length + 1);
        assert.ok(value);
        assert.notEqual(value, fs.readlinkSync(`/proc/self/ns/${kind}`));
      }
      const environment = lines
        .filter((line) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(line))
        .map((line) => line.split("=")[0])
        .filter((name) => !["pid", "net", "mnt"].includes(name));
      for (const name of environment)
        assert.ok(["PATH", "HOME", "LANG", "TERM", "PWD", "SHLVL", "_"].includes(name), name);
      assert.equal(lines.filter((line) => line === "NETWORK_BLOCKED").length, 4);
      assert.equal(lines.at(-1), "WORKER_ISOLATED");
      assert.equal(fs.statSync(path.join(work, "identity-proof")).uid, uid);
      assert.equal(fs.statSync(path.join(work, "identity-proof")).gid, gid);
      await assert.rejects(
        startWorkspaceCommand({
          parent,
          jobId: randomUUID(),
          uid: uid + 1,
          work,
          limits: { memoryMb: 128, maxProcesses: 32 },
          command: "true",
        }),
        /cannot select a different host UID/,
      );
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  },
);
