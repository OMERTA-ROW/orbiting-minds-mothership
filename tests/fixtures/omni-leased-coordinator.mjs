import fs from "node:fs";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { createLeasedCoordinator } from "../../services/omni-sandbox/leased-coordinator.mjs";
import {
  createWorkerLeases,
  signWorkerRecord,
} from "../../services/omni-sandbox/worker-leases.mjs";
import { workerRequest } from "../../services/omni-sandbox/worker-socket.mjs";
import { systemdWorkerControl } from "../../services/omni-sandbox/systemd-worker.mjs";

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const db = new DatabaseSync(config.database);
const leadership = new DatabaseSync(`${config.database}.coordinator-lock`);
leadership.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
const pool = createWorkerLeases(db, [config.workerId]);
let authority = true;
const worker = {
  ...config,
  invocation: async () =>
    (await systemdWorkerControl(config.workerId, config.workerUser).inspect()).InvocationID,
};
const envelope = (secret, record) => ({ record, signature: signWorkerRecord(secret, record) });
const coordinator = createLeasedCoordinator({
  pool,
  workers: [worker],
  approvalSecret: config.approvalSecret,
  approve: async (binding, commandDigest) => {
    if (config.startupDelay)
      await new Promise((resolve) => setTimeout(resolve, config.startupDelay));
    return envelope(config.approvalSecret, {
      ...binding,
      kind: "approval",
      commandDigest,
      expiresAt: Date.now() + 2000,
    });
  },
  renew: async (binding) => {
    if (!authority) throw new Error("Synthetic owner authority became unreadable.");
    return envelope(config.watchdogSecret, {
      ...binding,
      active: true,
      expiresAt: Date.now() + 500,
    });
  },
  monitor: (route, binding, recover) =>
    workerRequest(
      route.watchdogSocket,
      envelope(route.watchdogSecret, {
        ...binding,
        kind: "watch",
        recover,
        expiresAt: Date.now() + 2000,
      }),
      45000,
    ),
});
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line === "stop") coordinator.stop();
  else if (line === "renewal loss") authority = false;
  else throw new Error("Unknown fixture control.");
});
try {
  if (config.recover) {
    await coordinator.recover();
    console.log(JSON.stringify({ recovered: true }));
  } else {
    const result = await coordinator.execute(config.identity, config.command, {
      memoryMb: 128,
      maxProcesses: 32,
      outputBytes: 16384,
      commandTimeoutSec: 10,
    });
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.log(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
} finally {
  input.close();
  db.close();
  leadership.close();
}
