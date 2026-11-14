import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import {
  createExecutor,
  parsePlan,
  planHash,
  permissionRequest,
  RELEASE,
  PATH,
} from "../services/omni-autonomous/executor.mjs";

const config = { enabled: true, reviewedRelease: RELEASE, controlSecret: "c".repeat(32) };
const plan = () => ({
  jobId: randomUUID(),
  projectId: randomUUID(),
  expiresAt: new Date(Date.now() + 50_000).toISOString(),
  release: RELEASE,
  commands: [{ argv: ["/usr/bin/printf", "fixture"], timeoutMs: 1000 }],
});
const complete = async () => ({
  exitCode: 0,
  output: "fixture",
  cancelled: false,
  exceeded: false,
});
const workspace = (prefix) => fs.mkdtemp(`/tmp/${prefix}-test-`);
test("disabled, expired, unbounded and shell plans never run", async () => {
  let calls = 0;
  const executor = createExecutor(
    { ...config, enabled: false },
    {
      run: async () => {
        calls++;
      },
      permission: async () => true,
    },
  );
  await assert.rejects(executor.runPlan(plan()), /disabled/);
  assert.throws(() => parsePlan({ ...plan(), expiresAt: "invalid" }));
  assert.throws(() =>
    parsePlan({ ...plan(), commands: [{ argv: ["/bin/sh", "-c", "true"], timeoutMs: 1000 }] }),
  );
  assert.equal(calls, 0);
});
test("permission failure and unknown safety are fail closed with no command", async () => {
  let calls = 0;
  const executor = createExecutor(config, {
    run: async () => {
      calls++;
    },
    permission: async () => {
      throw new Error("unreachable");
    },
  });
  await assert.rejects(executor.runPlan(plan()));
  assert.equal(calls, 0);
});
test("duplicate concurrent jobs claim once; Stop cancellation waits for process exit", async () => {
  const value = plan();
  let notify;
  const started = new Promise((resolve) => {
    notify = resolve;
  });
  let exited = false;
  const executor = createExecutor(config, {
    workspace,
    permission: async () => true,
    run: async (_command, signal) => {
      notify();
      await new Promise((resolve) =>
        signal.addEventListener("abort", () => setTimeout(resolve, 10), { once: true }),
      );
      exited = true;
      return { exitCode: null, output: "", cancelled: true, exceeded: false };
    },
  });
  const running = executor.runPlan(value);
  await started;
  await assert.rejects(executor.runPlan(value), /duplicate/);
  await assert.rejects(
    executor.cancel({ jobId: value.jobId, planSha256: "f".repeat(64) }),
    /scope/,
  );
  assert.deepEqual(await executor.cancel({ jobId: value.jobId, planSha256: planHash(value) }), {
    cancelled: true,
  });
  assert.equal(exited, true);
  assert.equal((await running).outcome, "cancelled");
});
test("permission polling loss cancels active work before another command", async () => {
  const value = plan();
  value.commands.push({ argv: ["/usr/bin/printf", "never"], timeoutMs: 1000 });
  let checks = 0;
  let commands = 0;
  const executor = createExecutor(config, {
    workspace,
    permission: async (_c, op) => op !== "permission" || ++checks < 2,
    run: async (_command, signal) => {
      commands++;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      return { exitCode: null, output: "", cancelled: true, exceeded: false };
    },
  });
  assert.equal((await executor.runPlan(value)).outcome, "cancelled");
  assert.equal(commands, 1);
});
test("completed plans report zero paid-provider spend and durable completion", async () => {
  const calls = [];
  const executor = createExecutor(config, {
    workspace,
    run: complete,
    permission: async (_c, operation) => {
      calls.push(operation);
      return true;
    },
  });
  const reply = await executor.runPlan(plan());
  assert.equal(reply.outcome, "completed");
  assert.equal(reply.providerCostUsd, 0);
  assert.deepEqual(calls, ["claim", "permission", "finish"]);
});
test("signed executor requests deny tampering and replay", async () => {
  const executor = createExecutor(config, { run: complete, permission: async () => true });
  const args = { jobId: randomUUID(), planSha256: "a".repeat(64) };
  const body = JSON.stringify({ operation: "cancel", args });
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID().replaceAll("-", "");
  const signature = createHmac("sha256", config.controlSecret)
    .update(`omni.autonomous/v1\n${PATH}\n${ts}\n${nonce}\n${body}`)
    .digest("hex");
  const request = () =>
    new Request(`https://executor.invalid${PATH}`, {
      method: "POST",
      body,
      headers: {
        "X-Executor-Timestamp": ts,
        "X-Executor-Nonce": nonce,
        "X-Executor-Signature": signature,
      },
    });
  assert.equal((await executor.handle(request())).status, 200);
  assert.equal((await executor.handle(request())).status, 409);
  assert.equal(
    (
      await executor.handle(
        new Request(`https://executor.invalid${PATH}`, { method: "POST", body }),
      )
    ).status,
    401,
  );
});
test("signed stale safety responses are denied; completion retains the approved plan hash", async () => {
  const value = plan();
  const permissionSecret = "p".repeat(32);
  let seen;
  const c = {
    jackboyOrigin: "https://jackboy.invalid",
    clientId: "fixture",
    permissionToken: "t".repeat(32),
    permissionSecret,
    fetch: async (_url, init) => {
      seen = JSON.parse(init.body);
      const nonce = init.headers["X-Omni-Nonce"];
      const body = JSON.stringify({
        contract: "omni.link/v2",
        requestNonce: nonce,
        state: {
          projectId: value.projectId,
          checkedAt: new Date(Date.now() - 10_000).toISOString(),
          allowed: true,
          emergencyStop: false,
          killSwitch: false,
        },
      });
      return new Response(body, {
        headers: {
          "X-Omni-Proof": createHmac("sha256", permissionSecret)
            .update(`omni.link/v2\nresponse\n${nonce}\n200\n${body}`)
            .digest("hex"),
        },
      });
    },
  };
  await assert.rejects(permissionRequest(c, "finish", { ...value, outcome: "completed" }), /Stale/);
  assert.equal(seen.args.planSha256, planHash(value));
});
