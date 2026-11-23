import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import { createExecutor, runIsolated, planHash, PATH, RELEASE } from "./executor.mjs";

if (process.platform !== "linux") throw new Error("Linux isolation diagnostics require Linux");
const options = {};
async function workspace(t) {
  const path = await fs.mkdtemp("/tmp/omni-linux-evidence-");
  t.after(() => fs.rm(path, { recursive: true, force: true }));
  await fs.chown(path, 65534, 65534);
  return path;
}

test("printf runs in isolation and returns its exact output", options, async (t) => {
  const result = await runIsolated(
    { argv: ["/usr/bin/printf", "hello"], timeoutMs: 3000 },
    new AbortController().signal,
    await workspace(t),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "hello");
});

test("isolated argv preserves spaces and shell metacharacters literally", options, async (t) => {
  const values = ["space here", "$(printf injected)", "'quotes'; *", "-i"];
  const result = await runIsolated(
    { argv: ["/usr/bin/printf", "%s\n", ...values], timeoutMs: 3000 },
    new AbortController().signal,
    await workspace(t),
  );
  assert.equal(result.exitCode, 0, result.output);
  assert.equal(result.output, `${values.join("\n")}\n`);
  assert.equal(result.timedOut, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.exceeded, false);
});

test(
  "signed executor plan invokes the real isolated launcher with synthetic authorization",
  options,
  async (t) => {
    const controlSecret = "c".repeat(32);
    const operations = [];
    const dir = await workspace(t);
    const executor = createExecutor(
      { enabled: true, reviewedRelease: RELEASE, controlSecret },
      {
        workspace: async () => dir,
        permission: async (_config, operation) => {
          operations.push(operation);
          return true;
        },
      },
    );
    const values = ["space here", "$(not a shell)", "-i"];
    const plan = {
      jobId: randomUUID(),
      projectId: randomUUID(),
      expiresAt: new Date(Date.now() + 50_000).toISOString(),
      release: RELEASE,
      commands: [{ argv: ["/usr/bin/printf", "%s\n", ...values], timeoutMs: 3000 }],
    };
    const body = JSON.stringify({ operation: "run", args: plan });
    const nonce = randomUUID().replaceAll("-", "");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", controlSecret)
      .update(`omni.autonomous/v1\n${PATH}\n${timestamp}\n${nonce}\n${body}`)
      .digest("hex");
    try {
      const response = await executor.handle(
        new Request(`http://127.0.0.1${PATH}`, {
          method: "POST",
          body,
          headers: {
            "X-Executor-Timestamp": timestamp,
            "X-Executor-Nonce": nonce,
            "X-Executor-Signature": signature,
          },
        }),
      );
      assert.equal(response.status, 200);
      const responseBody = await response.text();
      assert.equal(
        response.headers.get("X-Executor-Proof"),
        createHmac("sha256", controlSecret)
          .update(`omni.autonomous/v1\nresponse\n${nonce}\n200\n${responseBody}`)
          .digest("hex"),
      );
      const result = JSON.parse(responseBody);
      assert.equal(result.jobId, plan.jobId);
      assert.equal(result.outcome, "completed");
      assert.equal(result.providerCostUsd, 0);
      assert.equal(result.outputs.length, 1);
      assert.equal(result.outputs[0].exitCode, 0);
      assert.equal(result.outputs[0].output, `${values.join("\n")}\n`);
      assert.equal(result.outputs[0].exceeded, false);
      assert.equal(result.outputs[0].timedOut, false);
      assert.equal(result.outputs[0].cancelled, false);
      assert.equal(operations[0], "claim");
      assert.equal(operations.at(-1), "finish");
      assert.ok(operations.slice(1, -1).every((operation) => operation === "permission"));
      assert.ok(operations.includes("permission"));
      await assert.rejects(fs.stat(dir), { code: "ENOENT" });
    } finally {
      await executor.close();
    }
  },
);

test("executor cancellation waits for the real isolated command to exit", options, async (t) => {
  const dir = await workspace(t);
  const executor = createExecutor(
    { enabled: true, reviewedRelease: RELEASE },
    { workspace: async () => dir, permission: async () => true },
  );
  const plan = {
    jobId: randomUUID(),
    projectId: randomUUID(),
    expiresAt: new Date(Date.now() + 50_000).toISOString(),
    release: RELEASE,
    commands: [
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          "import time; open('/workspace/ready','w').close(); time.sleep(10)",
        ],
        timeoutMs: 8000,
      },
    ],
  };
  const running = executor.runPlan(plan).then(
    (result) => ({ result }),
    (error) => ({ error }),
  );
  try {
    const deadline = Date.now() + 5000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      ready = await fs.stat(`${dir}/ready`).then(
        () => true,
        (error) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        },
      );
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(ready, "isolated command did not start");
    assert.deepEqual(await executor.cancel({ jobId: plan.jobId, planSha256: planHash(plan) }), {
      cancelled: true,
    });
    const reply = await running;
    if ("error" in reply) throw reply.error;
    assert.equal(reply.result.outcome, "cancelled");
    assert.equal(reply.result.outputs[0].cancelled, true);
    await assert.rejects(fs.stat(dir), { code: "ENOENT" });
  } finally {
    await executor.close();
    await running;
  }
});

test(
  "real non-root PID/mount/network namespaces, read-only host files and empty child environment",
  options,
  async (t) => {
    const namespaces = await Promise.all(
      ["pid", "mnt", "net"].map((kind) => fs.readlink(`/proc/self/ns/${kind}`)),
    );
    const dir = await workspace(t);
    const previous = process.env.OMNI_ISOLATION_SYNTHETIC_SECRET;
    process.env.OMNI_ISOLATION_SYNTHETIC_SECRET = "diagnostic-only";
    let environment;
    try {
      environment = await runIsolated(
        { argv: ["/usr/bin/env", "-0"], timeoutMs: 3000 },
        new AbortController().signal,
        dir,
      );
    } finally {
      if (previous === undefined) delete process.env.OMNI_ISOLATION_SYNTHETIC_SECRET;
      else process.env.OMNI_ISOLATION_SYNTHETIC_SECRET = previous;
    }
    assert.equal(environment.exitCode, 0, "environment probe failed");
    assert.equal(environment.exceeded, false, "environment probe exceeded output limit");
    assert.equal(environment.timedOut, false, "environment probe timed out");
    assert.equal(environment.cancelled, false, "environment probe was cancelled");
    assert.equal(environment.output.length, 0, "child environment is not empty");
    let hostConnections = 0;
    const listener = createServer((socket) => {
      hostConnections++;
      socket.destroy();
    });
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const closeListener = () =>
      new Promise((resolve, reject) => {
        if (!listener.listening) return resolve();
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    t.after(closeListener);
    const result = await runIsolated(
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          `import os,socket,errno,sys
assert os.getuid()==65534 and os.getgid()==65534
for kind,host in zip(['pid','mnt','net'],sys.argv[1:4]):
 assert os.readlink('/proc/self/ns/'+kind)!=host
for path in ['/app','/root','/home/runner','/etc']:
 assert not os.path.exists(path),path
try: open('/usr/omni-write-probe','w'); raise AssertionError('host write allowed')
except OSError as e: assert e.errno in [errno.EROFS,errno.EACCES]
open('/workspace/writable','w').write('synthetic')
for host,port in [('1.1.1.1',443),('10.0.0.1',443),('169.254.169.254',80),('127.0.0.1',80)]:
 s=socket.socket(); s.settimeout(.2)
 try: s.connect((host,port)); raise AssertionError('network open')
 except OSError: pass
 finally: s.close()
try: socket.getaddrinfo('example.com',443); raise AssertionError('DNS available')
except socket.gaierror: pass
with open('/proc/net/route') as routes:
 assert len(routes.readlines())==1
with open('/proc/net/dev') as interfaces:
 names=[line.split(':',1)[0].strip() for line in interfaces.readlines()[2:] if ':' in line]
 assert set(names).issubset({'lo'})
probe=socket.socket(); probe.settimeout(.2)
try:
 probe.connect(('127.0.0.1',int(sys.argv[4]))); raise AssertionError('host loopback reachable')
except OSError: pass
finally: probe.close()`,
          ...namespaces,
          String(listener.address().port),
        ],
        timeoutMs: 3000,
      },
      new AbortController().signal,
      dir,
    );
    await closeListener();
    assert.equal(hostConnections, 0, "host loopback listener received a connection");
    assert.equal(result.exitCode, 0, result.output);
    assert.equal(result.timedOut, false);
  },
);

test(
  "real address-space, file-size, open-file and process-count ceilings reject excess resources",
  options,
  async (t) => {
    const result = await runIsolated(
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          `import os,errno,signal
try: bytearray(600*1024*1024); raise AssertionError('memory limit missing')
except MemoryError: pass
try:
 with open('/workspace/oversize','wb',buffering=0) as f:
  assert f.write(b'x'*1048576)==1048576
  f.write(b'x')
 raise AssertionError('file size limit missing')
except OSError as e: assert e.errno==errno.EFBIG
assert os.stat('/workspace/oversize').st_size<=1048576
files=[]
try:
 for i in range(80): files.append(open('/dev/null'))
 raise AssertionError('file descriptor limit missing')
except OSError as e: assert e.errno==errno.EMFILE
finally:
 for f in files: f.close()
children=[]
try:
 for i in range(40):
  pid=os.fork()
  if pid==0: signal.pause(); os._exit(0)
  children.append(pid)
 raise AssertionError('process limit missing')
except OSError as e: assert e.errno==errno.EAGAIN
finally:
 for pid in children: os.kill(pid,signal.SIGKILL)
 for pid in children: os.waitpid(pid,0)`,
        ],
        timeoutMs: 5000,
      },
      new AbortController().signal,
      await workspace(t),
    );
    assert.equal(result.exitCode, 0, result.output);
    assert.equal(result.timedOut, false);
  },
);

test(
  "real CPU ceiling terminates a busy loop without the wall-clock timeout",
  options,
  async (t) => {
    const started = Date.now();
    const result = await runIsolated(
      {
        argv: ["/usr/bin/python3", "-c", "print('cpu-probe-ready',flush=True)\nwhile True: pass"],
        timeoutMs: 30000,
      },
      new AbortController().signal,
      await workspace(t),
    );
    assert.match(result.output, /cpu-probe-ready/);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.ok(Date.now() - started >= 9000);
  },
);

test("real wall-clock timeout terminates a sleeping command", options, async (t) => {
  const started = Date.now();
  const result = await runIsolated(
    {
      argv: ["/usr/bin/sleep", "10"],
      timeoutMs: 300,
    },
    new AbortController().signal,
    await workspace(t),
  );
  assert.equal(result.timedOut, true, result.output);
  assert.notEqual(result.exitCode, 0);
  assert.ok(Date.now() - started < 1500);
});

async function processSnapshot() {
  const entries = await fs.readdir("/proc");
  const processes = new Map();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = await fs.readFile(`/proc/${entry}/stat`, "utf8");
      const end = stat.lastIndexOf(")");
      if (end < 0) throw new Error("Unreadable process status");
      const fields = stat.slice(end + 2).split(" ");
      processes.set(Number(entry), {
        state: fields[0],
        parent: Number(fields[1]),
        session: Number(fields[3]),
        startTime: fields[19],
        name: stat.slice(stat.indexOf("(") + 1, end),
      });
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
    }
  }
  return processes;
}

test(
  "cancellation terminates observed descendants, including a separate session",
  options,
  async (t) => {
    const dir = await workspace(t);
    const abort = new AbortController();
    let leader;
    const running = runIsolated(
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          "import os,time; child=os.fork()\nif child==0:\n os.setsid(); open('/workspace/ready','w').close(); time.sleep(20); os._exit(0)\ntime.sleep(20)",
        ],
        timeoutMs: 10000,
      },
      abort.signal,
      dir,
      (pid) => {
        leader = pid;
      },
    ).then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    let observed = new Map();
    try {
      const deadline = Date.now() + 3000;
      let ready = false;
      while (!ready && Date.now() < deadline) {
        ready = await fs.stat(`${dir}/ready`).then(
          () => true,
          (error) => {
            if (error.code !== "ENOENT") throw error;
            return false;
          },
        );
        if (!ready) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(ready && leader, "descendant did not become ready");
      const snapshot = await processSnapshot();
      const descendants = new Set([leader]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [pid, process] of snapshot) {
          if (descendants.has(process.parent) && !descendants.has(pid)) {
            descendants.add(pid);
            changed = true;
          }
        }
      }
      observed = new Map([...descendants].map((pid) => [pid, snapshot.get(pid)?.startTime]));
      const python = [...observed.keys()].filter((pid) =>
        snapshot.get(pid)?.name.startsWith("python3"),
      );
      assert.ok(python.length >= 2, "parent and descendant were not observable");
      assert.ok(
        python.some((pid) => snapshot.get(pid)?.session === pid),
        "separate descendant session was not observable",
      );
    } finally {
      abort.abort();
      const reply = await running;
      if ("error" in reply) throw reply.error;
      assert.equal(reply.result.cancelled, true, "runner did not report cancellation");
    }
    const deadline = Date.now() + 1500;
    let survivors;
    do {
      const snapshot = await processSnapshot();
      survivors = [...observed].filter(([pid, startTime]) => {
        const process = snapshot.get(pid);
        return process && process.startTime === startTime && process.state !== "Z";
      });
      if (survivors.length) await new Promise((resolve) => setTimeout(resolve, 20));
    } while (survivors.length && Date.now() < deadline);
    for (const [pid] of survivors) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    assert.equal(survivors.length, 0, "observed processes survived cancellation");
  },
);

test("real Linux isolation, resource ceilings and descendant cancellation", options, async () => {
  const executor = createExecutor({ enabled: false, controlSecret: "fixture-only".repeat(4) });
  try {
    const result = await executor.selfTest();
    assert.equal(result.release, RELEASE);
    assert.equal(result.passed, true);
  } finally {
    await executor.close();
  }
});
