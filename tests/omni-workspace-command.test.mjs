import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { launchWorkspaceJob } from "../services/omni-sandbox/workspace-command.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const launch = deferred();
  const completion = deferred();
  const job = { state: "queued", events: [], outBytes: 0 };
  const options = { limits: { commandTimeoutSec: 1, outputCapBytes: 10 } };
  let stops = 0;
  let cleaned = 0;
  const active = {
    child: { stdout: new PassThrough(), stderr: new PassThrough() },
    completed: completion.promise,
    stop: async () => {
      stops++;
      completion.resolve({ code: null, signal: "SIGKILL" });
    },
  };
  const handle = launchWorkspaceJob(
    job,
    options,
    () => {
      cleaned++;
    },
    () => launch.promise,
  );
  return {
    job,
    options,
    active,
    launch,
    completion,
    handle,
    stops: () => stops,
    cleaned: () => cleaned,
  };
}

test("successful completion is recorded only after supervisor cleanup", async () => {
  const f = fixture();
  f.launch.resolve(f.active);
  await Promise.resolve();
  f.active.child.stdout.write("hello");
  assert.equal(f.cleaned(), 0);
  f.completion.resolve({ code: 0, signal: null });
  await f.handle.finished;
  assert.equal(f.cleaned(), 1);
  assert.equal(f.job.state, "done");
  assert.equal(f.job.events[0].text, "hello");
});

test("Stop during startup waits for and terminates the supervisor", async () => {
  const f = fixture();
  const stopped = f.handle.stop("owner");
  f.launch.resolve(f.active);
  await stopped;
  assert.equal(f.stops(), 1);
  assert.equal(f.cleaned(), 1);
  assert.equal(f.job.state, "stopped");
});

test("output cap stops the command and bounds emitted bytes", async () => {
  const f = fixture();
  f.launch.resolve(f.active);
  await Promise.resolve();
  f.active.child.stdout.write("123456789012345");
  await f.handle.finished;
  assert.equal(f.stops(), 1);
  assert.equal(f.job.outBytes, 10);
  assert.equal(f.job.events[0].text, "1234567890");
  assert.equal(f.job.state, "stopped");
});

test("wall deadline stops the supervisor", async () => {
  const f = fixture();
  f.launch.resolve(f.active);
  await f.handle.finished;
  assert.equal(f.stops(), 1);
  assert.equal(f.job.state, "stopped");
  assert.match(f.job.events[0].text, /Time limit/);
});

test("unconfirmed cleanup never records termination or acknowledges Stop", async () => {
  const f = fixture();
  f.active.stop = async () => {
    f.completion.reject(new Error("cgroup cleanup failed"));
  };
  f.launch.resolve(f.active);
  await assert.rejects(f.handle.stop("owner"), /cgroup cleanup failed/);
  assert.equal(f.cleaned(), 0);
  assert.equal(f.job.state, "failed");
});

test("a failed termination record cannot be reported as success", async () => {
  const completion = deferred();
  const job = { state: "queued", events: [], outBytes: 0 };
  const active = {
    child: { stdout: new PassThrough(), stderr: new PassThrough() },
    completed: completion.promise,
    stop: async () => {},
  };
  const handle = launchWorkspaceJob(
    job,
    { limits: { commandTimeoutSec: 1, outputCapBytes: 10 } },
    () => {
      throw new Error("journal unavailable");
    },
    async () => active,
  );
  completion.resolve({ code: 0, signal: null });
  await assert.rejects(handle.finished, /journal unavailable/);
  assert.equal(job.state, "failed");
  assert.ok(!job.events.some((event) => event.stream === "exit"));
});
