import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { test } from "node:test";
import { createJobCgroup } from "../services/omni-sandbox/cgroup.mjs";

const parent = process.env.OMNI_WORKSPACE_DELEGATED_CGROUP;
const runLinux = process.platform === "linux" && Boolean(parent);
const limits = {
  cpuQuotaMicros: 50000,
  cpuPeriodMicros: 100000,
  memoryBytes: 64 * 1024 * 1024,
  maxProcesses: 8,
};

test("refuses a directory that is not a delegated cgroup v2", () => {
  assert.throws(() => createJobCgroup("/tmp", randomUUID(), limits), /cgroup v2/);
});

test(
  "delegated job cgroup limits and kills a detached descendant",
  { skip: !runLinux },
  async () => {
    const group = createJobCgroup(parent, randomUUID(), limits);
    const child = spawn(
      "/bin/sh",
      ["-c", 'read -r go; test "$go" = go || exit 1; setsid sleep 60 & echo $!; wait'],
      { detached: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const exited = once(child, "close");
    try {
      assert.equal(fs.readFileSync(`${group.path}/cpu.max`, "utf8").trim(), "50000 100000");
      assert.equal(
        fs.readFileSync(`${group.path}/memory.max`, "utf8").trim(),
        String(64 * 1024 ** 2),
      );
      assert.equal(fs.readFileSync(`${group.path}/memory.oom.group`, "utf8").trim(), "1");
      assert.equal(fs.readFileSync(`${group.path}/pids.max`, "utf8").trim(), "8");
      group.attach(child.pid);
      child.stdin.end("go\n");
      const [data] = await once(child.stdout, "data");
      const descendant = Number(data.toString().trim());
      assert.ok(Number.isSafeInteger(descendant) && descendant > 1);
      const members = fs.readFileSync(`${group.path}/cgroup.procs`, "utf8").trim().split("\n");
      assert.ok(members.includes(String(child.pid)));
      assert.ok(members.includes(String(descendant)));
      await group.stop();
      await exited;
      assert.match(fs.readFileSync(`${group.path}/cgroup.events`, "utf8"), /^populated 0$/m);
    } finally {
      await group.stop();
      await exited;
      group.remove();
    }
  },
);
