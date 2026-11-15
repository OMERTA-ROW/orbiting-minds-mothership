import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createVercelAdapter } from "../services/omni-autonomous/vercel-adapter.mjs";
import { planHash, RELEASE } from "../services/omni-autonomous/executor.mjs";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const plan = () => ({
  jobId: randomUUID(),
  projectId: randomUUID(),
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  release: RELEASE,
  commands: [{ argv: ["/usr/bin/printf", "hello"], timeoutMs: 1000 }],
});

function fixture() {
  const records = new Map();
  const boxes = new Map();
  const calls = [];
  const journal = {
    async assertReady() {
      if ([...records.values()].some((record) => !record.terminated)) {
        throw new Error("unresolved reservation");
      }
    },
    async reserve(record) {
      if (records.has(record.jobId)) throw new Error("duplicate job");
      records.set(record.jobId, { ...record, terminated: false });
    },
    async find(jobId, hash) {
      const record = records.get(jobId);
      return record?.planSha256 === hash ? record : null;
    },
    async markTerminated(record) {
      const current = records.get(record.jobId);
      if (!current || current.name !== record.name) throw new Error("journal mismatch");
      current.terminated = true;
    },
  };
  const Sandbox = {
    async create(options) {
      calls.push(["create", options]);
      const box = {
        name: options.name,
        persistent: options.persistent,
        status: "running",
        async runCommand(command) {
          calls.push(["command", command]);
          command.stdout.write("hello");
          return { exitCode: 0 };
        },
        async stop() {
          calls.push(["stop"]);
          box.status = "stopped";
        },
      };
      boxes.set(box.name, box);
      return box;
    },
    async get({ name, resume }) {
      calls.push(["get", { name, resume }]);
      const box = boxes.get(name);
      if (!box) throw new Error("not found");
      return box;
    },
  };
  return { journal, Sandbox, calls, boxes, records };
}

test("one approved printf runs in a fresh deny-all non-persistent sandbox and is never replayed", async () => {
  const f = fixture();
  const adapter = createVercelAdapter(f);
  const value = plan();
  const result = await adapter.run(value, ["/usr/bin/printf", "hello"], new AbortController().signal);
  assert.equal(result.outcome, "completed");
  assert.equal(result.output, "hello");
  assert.equal(result.terminated, true);
  const options = f.calls.find(([type]) => type === "create")[1];
  assert.equal(options.networkPolicy, "deny-all");
  assert.equal(options.persistent, false);
  assert.deepEqual(options.resources, { vcpus: 1 });
  assert.deepEqual(options.ports, []);
  assert.deepEqual(options.env, {});
  const command = f.calls.find(([type]) => type === "command")[1];
  assert.equal(command.cmd, "/usr/bin/printf");
  assert.deepEqual(command.args, ["hello"]);
  assert.deepEqual(command.env, {});
  assert.ok(f.records.get(value.jobId).terminated);
  await assert.rejects(adapter.run(value, value.commands[0].argv, new AbortController().signal), /duplicate/);
  assert.equal(f.calls.filter(([type]) => type === "create").length, 1);
});

test("only the exact approved single printf command is accepted", async () => {
  const f = fixture();
  const adapter = createVercelAdapter(f);
  const value = plan();
  await assert.rejects(adapter.run(value, ["/usr/bin/printf", "different"], new AbortController().signal), /approved/);
  value.commands.push({ argv: ["/usr/bin/printf", "second"], timeoutMs: 1000 });
  await assert.rejects(adapter.run(value, value.commands[0].argv, new AbortController().signal), /approved/);
  assert.deepEqual(f.calls, []);
});

test("the approved arguments cannot be changed while durable reservation is pending", async () => {
  const f = fixture();
  const gate = deferred();
  const reserved = deferred();
  const reserve = f.journal.reserve;
  f.journal.reserve = async (record) => {
    await reserve(record);
    reserved.resolve();
    await gate.promise;
  };
  const value = plan();
  const originalHash = planHash(value);
  const running = createVercelAdapter(f).run(value, [...value.commands[0].argv], new AbortController().signal);
  await reserved.promise;
  value.commands[0].argv[1] = "changed";
  gate.resolve();
  const result = await running;
  assert.equal(result.planSha256, originalHash);
  assert.deepEqual(f.calls.find(([type]) => type === "command")[1].args, ["hello"]);
});

test("Stop during creation waits for the VM and confirmed termination", async () => {
  const f = fixture();
  const creation = deferred();
  const started = deferred();
  const original = f.Sandbox.create;
  f.Sandbox.create = async (options) => {
    const box = await original(options);
    started.resolve();
    await creation.promise;
    return box;
  };
  const adapter = createVercelAdapter(f);
  const value = plan();
  const running = adapter.run(value, value.commands[0].argv, new AbortController().signal);
  await started.promise;
  let acknowledged = false;
  const cancelling = adapter.cancel({ jobId: value.jobId, planSha256: planHash(value) }).then((result) => {
    acknowledged = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(acknowledged, false);
  creation.resolve();
  assert.equal((await running).outcome, "cancelled");
  assert.equal((await cancelling).terminated, true);
  assert.equal(f.calls.some(([type]) => type === "command"), false);
});

test("Stop racing completion waits for fresh stopped status and durable recording", async () => {
  const f = fixture();
  const runningCommand = deferred();
  const commandStarted = deferred();
  const stopGate = deferred();
  const original = f.Sandbox.create;
  f.Sandbox.create = async (options) => {
    const box = await original(options);
    box.runCommand = () => {
      commandStarted.resolve();
      return runningCommand.promise;
    };
    box.stop = async () => {
      await stopGate.promise;
      box.status = "stopped";
    };
    return box;
  };
  const adapter = createVercelAdapter(f);
  const value = plan();
  const running = adapter.run(value, value.commands[0].argv, new AbortController().signal);
  await commandStarted.promise;
  runningCommand.resolve({ exitCode: 0 });
  await Promise.resolve();
  let acknowledged = false;
  const cancellation = adapter.cancel({ jobId: value.jobId, planSha256: planHash(value) }).then((result) => {
    acknowledged = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(acknowledged, false);
  stopGate.resolve();
  assert.equal((await running).outcome, "cancelled");
  assert.equal((await cancellation).terminated, true);
  assert.equal(f.records.get(value.jobId).terminated, true);
});

test("uncertain creation cannot acknowledge or replay; restart reconciles a found VM", async () => {
  const f = fixture();
  const original = f.Sandbox.create;
  f.Sandbox.create = async (options) => {
    await original(options);
    throw new Error("create response lost");
  };
  const value = plan();
  const adapter = createVercelAdapter(f);
  await assert.rejects(adapter.run(value, value.commands[0].argv, new AbortController().signal), /lost/);
  await assert.rejects(adapter.cancel({ jobId: value.jobId, planSha256: planHash(value) }), /unverified/);
  const next = plan();
  const restarted = createVercelAdapter(f);
  await assert.rejects(restarted.run(next, next.commands[0].argv, new AbortController().signal), /unresolved/);
  assert.equal((await restarted.reconcile({ jobId: value.jobId, planSha256: planHash(value) })).terminated, true);
  await assert.rejects(restarted.run(value, value.commands[0].argv, new AbortController().signal), /duplicate/);
  assert.equal(f.calls.filter(([type]) => type === "create").length, 1);
});

test("missing VM, unsuccessful stop and journal failure never produce termination evidence", async () => {
  for (const failure of ["missing", "stop", "journal"]) {
    const f = fixture();
    const original = f.Sandbox.create;
    f.Sandbox.create = async (options) => {
      const box = await original(options);
      if (failure === "missing") f.boxes.delete(box.name);
      if (failure === "stop") box.stop = async () => {};
      if (failure === "journal") f.journal.markTerminated = async () => { throw new Error("journal failed"); };
      return box;
    };
    const value = plan();
    const adapter = createVercelAdapter(f);
    await assert.rejects(adapter.run(value, value.commands[0].argv, new AbortController().signal));
    await assert.rejects(adapter.cancel({ jobId: value.jobId, planSha256: planHash(value) }), /unverified/);
    if (failure === "missing")
      await assert.rejects(adapter.reconcile({ jobId: value.jobId, planSha256: planHash(value) }), /not found/);
    assert.equal(f.records.get(value.jobId).terminated, false);
  }
});

test("oversized output aborts and command errors still terminate the VM", async () => {
  for (const failure of ["output", "command"]) {
    const f = fixture();
    const original = f.Sandbox.create;
    f.Sandbox.create = async (options) => {
      const box = await original(options);
      box.runCommand = async (command) => {
        if (failure === "command") throw new Error("command failed");
        command.stdout.write("x".repeat(8193));
        return { exitCode: 0 };
      };
      return box;
    };
    const value = plan();
    const running = createVercelAdapter(f).run(value, value.commands[0].argv, new AbortController().signal);
    if (failure === "command") await assert.rejects(running, /command failed/);
    else {
      const result = await running;
      assert.equal(result.outcome, "cancelled");
      assert.equal(result.exceeded, true);
      assert.equal(result.output, "");
    }
    assert.equal(f.records.get(value.jobId).terminated, true);
  }
});

test("the broker deadline stops a command that never returns", async () => {
  const f = fixture();
  const original = f.Sandbox.create;
  f.Sandbox.create = async (options) => {
    const box = await original(options);
    box.runCommand = () => new Promise(() => {});
    return box;
  };
  const value = plan();
  value.commands[0].timeoutMs = 100;
  const result = await createVercelAdapter(f).run(
    value,
    value.commands[0].argv,
    new AbortController().signal,
  );
  assert.equal(result.outcome, "cancelled");
  assert.equal(f.records.get(value.jobId).terminated, true);
});
