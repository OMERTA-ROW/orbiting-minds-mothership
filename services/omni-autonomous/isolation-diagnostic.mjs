import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createExecutor, runIsolated, RELEASE } from "./executor.mjs";

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
    const result = await runIsolated(
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          `import os,socket,errno,sys
assert os.getuid()==65534 and os.getgid()==65534
for kind,host in zip(['pid','mnt','net'],sys.argv[1:]):
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
listener=socket.socket()
try:
 listener.bind(('127.0.0.1',0)); listener.listen()
 probe=socket.socket(); probe.settimeout(.2)
 try: probe.connect(listener.getsockname()); raise AssertionError('loopback reachable')
 except OSError: pass
 finally: probe.close()
except OSError: pass
finally: listener.close()`,
          ...namespaces,
        ],
        timeoutMs: 3000,
      },
      new AbortController().signal,
      dir,
    );
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

test("cancellation terminates observed descendants, including a separate session", options, async (t) => {
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
});

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
