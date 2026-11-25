import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { delegatedCgroupRoot } from "../../services/omni-sandbox/cgroup.mjs";
import { startWorkspaceCommand } from "../../services/omni-sandbox/supervisor.mjs";

const uid = process.getuid?.();
const parent = delegatedCgroupRoot(process.env.OMNI_WORKSPACE_TEST_CGROUP);
if (
  process.platform !== "linux" ||
  !uid ||
  uid < 1000 ||
  path.basename(parent) !== "omni-workspace-diagnostic" ||
  !parent.startsWith("/sys/fs/cgroup/")
) {
  throw new Error("Use a dedicated delegated diagnostic cgroup and non-root staging identity.");
}
const limits = { memoryMb: 256, maxProcesses: 32 };

async function start(t, command) {
  const jobId = randomUUID();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-workspace-evidence-"));
  let control;
  try {
    control = await startWorkspaceCommand({ parent, jobId, work: dir, uid, limits, command });
  } catch (error) {
    // The supervisor reports uncertain startup cleanup explicitly; preserve the workspace.
    if (!(error instanceof AggregateError)) await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
  let output = "";
  control.child.stdout.on("data", (chunk) => (output += chunk.toString("utf8")));
  control.child.stderr.on("data", (chunk) => (output += chunk.toString("utf8")));
  t.after(async () => {
    await control.stop();
    await control.completed;
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { control, jobId, output: () => output };
}

async function waitForOutput(job, marker) {
  const deadline = Date.now() + 5000;
  while (!job.output().includes(marker)) {
    if (Date.now() >= deadline) throw new Error(`Diagnostic did not produce ${marker}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test(
  "supervisor uses a non-root isolated namespace with read-only host files",
  { timeout: 15000 },
  async (t) => {
    const listener = createServer((socket) => socket.destroy());
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    t.after(() => new Promise((resolve) => listener.close(resolve)));
    const port = listener.address().port;
    const hostNamespaces = await Promise.all(
      ["pid", "mnt", "net"].map((kind) => fs.readlink(`/proc/self/ns/${kind}`)),
    );
    const command = [
      "id -u",
      "for n in pid mnt net; do readlink /proc/self/ns/$n; done",
      'awk \'$2 == "/usr" && $4 ~ /(^|,)ro(,|$)/ { print "READ_ONLY_USR" }\' /proc/mounts',
      "test ! -e /etc && echo NO_HOST_ETC",
      `python3 -c "import socket; s=socket.socket(); s.settimeout(.5); print('LOOPBACK_BLOCKED' if s.connect_ex(('127.0.0.1',${port})) else 'LOOPBACK_OPEN')"`,
    ].join("; ");
    const job = await start(t, command);
    const result = await job.control.completed;
    const lines = job.output().trim().split("\n");
    assert.equal(result.code, 0, job.output());
    assert.equal(Number(lines[0]), uid);
    for (const [index, kind] of ["pid", "mnt", "net"].entries()) {
      assert.match(lines[index + 1], new RegExp(`^${kind}:\\[\\d+\\]$`));
      assert.notEqual(lines[index + 1], hostNamespaces[index]);
    }
    assert.match(job.output(), /READ_ONLY_USR/);
    assert.match(job.output(), /NO_HOST_ETC/);
    assert.match(job.output(), /LOOPBACK_BLOCKED/);
    assert.doesNotMatch(job.output(), /LOOPBACK_OPEN/);
  },
);

test("supervisor installs job-wide cgroup resource ceilings", { timeout: 15000 }, async (t) => {
  const job = await start(t, "echo READY; exec sleep 20");
  await waitForOutput(job, "READY");
  const group = path.join(parent, `job-${job.jobId}`);
  assert.equal((await fs.readFile(path.join(group, "memory.max"), "utf8")).trim(), "268435456");
  assert.equal((await fs.readFile(path.join(group, "memory.swap.max"), "utf8")).trim(), "0");
  assert.equal((await fs.readFile(path.join(group, "pids.max"), "utf8")).trim(), "32");
  assert.equal((await fs.readFile(path.join(group, "cpu.max"), "utf8")).trim(), "50000 100000");
  await job.control.stop();
  await job.control.completed;
  await assert.rejects(fs.stat(group), { code: "ENOENT" });
});

test("explicit stop removes a job with a detached descendant", { timeout: 15000 }, async (t) => {
  const command = `setsid python3 -c 'import os,time; print("DETACHED_PID=%d SID=%d" % (os.getpid(),os.getsid(0)),flush=True); time.sleep(20)' & wait`;
  const job = await start(t, command);
  await waitForOutput(job, "DETACHED_PID=");
  const match = /DETACHED_PID=(\d+) SID=(\d+)/.exec(job.output());
  assert.ok(match, job.output());
  assert.equal(match[1], match[2], "child must run in its own session");
  const group = path.join(parent, `job-${job.jobId}`);
  assert.match(await fs.readFile(path.join(group, "cgroup.events"), "utf8"), /^populated 1$/m);
  await job.control.stop();
  await job.control.completed;
  await assert.rejects(fs.stat(group), { code: "ENOENT" });
});

test(
  "a diagnostic deadline stops the supervisor and removes its cgroup",
  { timeout: 15000 },
  async (t) => {
    const job = await start(t, "echo READY; sleep 20; echo LATE");
    await waitForOutput(job, "READY");
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await job.control.stop();
    const result = await job.control.completed;
    assert.notEqual(result.code, 0);
    assert.ok(Date.now() - started < 3000);
    assert.doesNotMatch(job.output(), /LATE/);
    await assert.rejects(fs.stat(path.join(parent, `job-${job.jobId}`)), { code: "ENOENT" });
  },
);
