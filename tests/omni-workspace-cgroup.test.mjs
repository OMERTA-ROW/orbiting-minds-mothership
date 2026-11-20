import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createJobCgroup, openJobCgroupForRecovery } from "../services/omni-sandbox/cgroup.mjs";

const parent = process.env.OMNI_WORKSPACE_DELEGATED_CGROUP;
const runLinux = process.platform === "linux" && Boolean(parent);
const limits = {
  cpuQuotaMicros: 50000,
  cpuPeriodMicros: 100000,
  memoryBytes: 64 * 1024 * 1024,
  maxProcesses: 8,
};

function startPython(group, script) {
  const child = spawn(
    "/bin/sh",
    [
      "-c",
      'read -r ready; test "$ready" = go || exit 1; exec /usr/bin/python3 -c "$1"',
      "sh",
      script,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const done = once(child, "close").then(([code, signal]) => ({ code, signal, stdout, stderr }));
  group.attach(child.pid);
  child.stdin.end("go\n");
  return done;
}

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
      assert.equal(fs.readFileSync(`${group.path}/memory.swap.max`, "utf8").trim(), "0");
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

test("the PID controller rejects excess processes", { skip: !runLinux }, async () => {
  const group = createJobCgroup(parent, randomUUID(), { ...limits, maxProcesses: 3 });
  try {
    const result = await startPython(
      group,
      `import errno, os, signal
children = []
try:
 for i in range(3):
  try: pid = os.fork()
  except OSError as error:
   assert error.errno == errno.EAGAIN
   print("limited", flush=True)
   break
  if pid == 0:
   signal.pause()
   os._exit(0)
  children.append(pid)
 else: raise AssertionError("PID limit was not enforced")
finally:
 for pid in children: os.kill(pid, signal.SIGKILL)
 for pid in children: os.waitpid(pid, 0)`,
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /limited/);
    assert.match(fs.readFileSync(`${group.path}/pids.events`, "utf8"), /^max [1-9]\d*$/m);
  } finally {
    await group.stop();
    group.remove();
  }
});

test("the memory controller kills an over-budget process group", { skip: !runLinux }, async () => {
  const group = createJobCgroup(parent, randomUUID(), { ...limits, memoryBytes: 48 * 1024 ** 2 });
  try {
    const result = await startPython(
      group,
      `import os, time
os.fork()
data = bytearray(32 * 1024 * 1024)
time.sleep(10)`,
    );
    assert.notEqual(result.code, 0);
    assert.match(fs.readFileSync(`${group.path}/memory.events`, "utf8"), /^oom_kill [1-9]\d*$/m);
  } finally {
    await group.stop();
    group.remove();
  }
});

test("the CPU controller bounds aggregate CPU bandwidth", { skip: !runLinux }, async () => {
  const group = createJobCgroup(parent, randomUUID(), { ...limits, cpuQuotaMicros: 20000 });
  try {
    const result = await startPython(
      group,
      `import time
end = time.monotonic() + 1.5
while time.monotonic() < end: pass`,
    );
    assert.equal(result.code, 0, result.stderr);
    const stats = fs.readFileSync(`${group.path}/cpu.stat`, "utf8");
    const usage = Number(/^usage_usec (\d+)$/m.exec(stats)?.[1]);
    assert.ok(usage > 20000 && usage < 600000, `unexpected CPU usage ${usage} microseconds`);
    assert.match(stats, /^nr_throttled [1-9]\d*$/m);
  } finally {
    await group.stop();
    group.remove();
  }
});

test(
  "a replacement supervisor can terminate an orphaned job but cannot attach or resume it",
  { skip: !runLinux, timeout: 10000 },
  async () => {
    const id = randomUUID();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-cgroup-recovery-"));
    const marker = path.join(dir, "started");
    const groupPath = path.join(parent, `job-${id}`);
    const moduleUrl = new URL("../services/omni-sandbox/cgroup.mjs", import.meta.url).href;
    const script = `
      import fs from "node:fs";
      import { spawn } from "node:child_process";
      import { createJobCgroup } from ${JSON.stringify(moduleUrl)};
      const group = createJobCgroup(process.argv[1], process.argv[2], ${JSON.stringify(limits)});
      const child = spawn("/bin/sh", ["-c", 'read -r go; test "$go" = go || exit 1; setsid sleep 60 & echo "$!" > "$1"; wait', "sh", process.argv[3]],
        { detached: true, stdio: ["pipe", "ignore", "ignore"] });
      group.attach(child.pid);
      child.stdin.end("go\\n");
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(process.argv[3])) {
        if (Date.now() > deadline) throw new Error("child did not start");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      process.kill(process.pid, "SIGKILL");
    `;
    const supervisor = spawn(
      process.execPath,
      ["--input-type=module", "-e", script, parent, id, marker],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let errors = "";
    supervisor.stderr.on("data", (chunk) => (errors += chunk));
    try {
      const [code, signal] = await once(supervisor, "exit");
      assert.equal(code, null, errors);
      assert.equal(signal, "SIGKILL", errors);
      assert.ok(fs.existsSync(marker), errors);
      assert.match(fs.readFileSync(`${groupPath}/cgroup.events`, "utf8"), /^populated 1$/m);
      const recovered = openJobCgroupForRecovery(parent, id);
      assert.throws(() => recovered.attach(process.pid), /Cannot attach/);
      assert.throws(() => recovered.remove(), /populated/);
      await recovered.stop();
      assert.match(fs.readFileSync(`${groupPath}/cgroup.events`, "utf8"), /^populated 0$/m);
      recovered.remove();
      assert.equal(fs.existsSync(groupPath), false);
    } finally {
      if (fs.existsSync(groupPath)) {
        const recovered = openJobCgroupForRecovery(parent, id);
        await recovered.stop();
        recovered.remove();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "recovery reports cleanup failure rather than claiming removal",
  { skip: !runLinux },
  async () => {
    const id = randomUUID();
    const group = createJobCgroup(parent, id, limits);
    const nested = path.join(group.path, "leftover");
    fs.mkdirSync(nested);
    try {
      const recovered = openJobCgroupForRecovery(parent, id);
      await recovered.stop();
      assert.throws(() => recovered.remove());
      assert.equal(fs.existsSync(group.path), true);
    } finally {
      fs.rmdirSync(nested);
      group.remove();
    }
  },
);
