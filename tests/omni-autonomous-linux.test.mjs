import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createExecutor, runIsolated, RELEASE } from "../services/omni-autonomous/executor.mjs";

const options = {
  skip:
    process.platform !== "linux" || process.env.OMNI_LINUX_ISOLATION_TEST !== "true"
      ? "Opt-in Linux test requires bubblewrap, prlimit and isolated scratch ownership"
      : false,
};
async function workspace(t) {
  const path = await fs.mkdtemp("/tmp/omni-linux-evidence-");
  t.after(() => fs.rm(path, { recursive: true, force: true }));
  await fs.chown(path, 65534, 65534);
  return path;
}

test(
  "real non-root PID/mount/network namespaces, read-only host files and scrubbed environment",
  options,
  async (t) => {
    const namespaces = await Promise.all(
      ["pid", "mnt", "net"].map((kind) => fs.readlink(`/proc/self/ns/${kind}`)),
    );
    const result = await runIsolated(
      {
        argv: [
          "/usr/bin/python3",
          "-c",
          `import os,socket,errno,sys
assert os.getuid()==65534 and os.getgid()==65534
assert set(os.environ).issubset({'PATH','LC_CTYPE','PWD'}),sorted(os.environ)
assert os.environ['PATH']=='/usr/bin:/bin'
assert os.environ.get('PWD','/workspace')=='/workspace'
for kind,host in zip(['pid','mnt','net'],sys.argv[1:]):
 assert os.readlink('/proc/self/ns/'+kind)!=host
for path in ['/app','/root','/home/runner','/etc']:
 assert not os.path.exists(path),path
try: open('/usr/omni-write-probe','w'); raise AssertionError('host write allowed')
except OSError as e: assert e.errno in [errno.EROFS,errno.EACCES]
open('/workspace/writable','w').write('synthetic')
s=socket.socket(); s.settimeout(.2)
try: s.connect(('1.1.1.1',443)); raise AssertionError('network open')
except OSError: pass`,
          ...namespaces,
        ],
        timeoutMs: 3000,
      },
      new AbortController().signal,
      await workspace(t),
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
