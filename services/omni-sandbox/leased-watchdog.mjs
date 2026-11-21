import fs from "node:fs";
import { verifyWorkerRecord } from "./worker-leases.mjs";
import { workerSocketServer } from "./worker-socket.mjs";
import { watchSystemdWorker } from "./systemd-worker.mjs";

export async function serveLeasedWatchdog(config) {
  const socket = fs.lstatSync(config.socketPath);
  const status = fs.readFileSync("/proc/self/status", "utf8");
  if (
    process.getuid?.() !== config.watchdogUid ||
    config.watchdogUid === config.workerUid ||
    !socket.isSocket() ||
    socket.uid !== config.watchdogUid ||
    socket.gid !== config.coordinatorGid ||
    (socket.mode & 0o777) !== 0o660 ||
    !fs.fstatSync(3).isSocket() ||
    !/^NoNewPrivs:\s+1$/m.test(status) ||
    !/^CapEff:\s+0+$/m.test(status)
  )
    throw new Error("Watchdog requires a separate hardened identity and private activated socket.");
  let watching = false;
  const server = workerSocketServer(async (envelope) => {
    const binding = envelope?.record;
    const record = verifyWorkerRecord(config.secret, envelope, binding);
    if (
      watching ||
      record.workerId !== config.workerId ||
      record.kind !== "watch" ||
      typeof record.recover !== "boolean" ||
      record.expiresAt <= Date.now() ||
      record.expiresAt > Date.now() + 2000
    )
      throw new Error("Watchdog route is busy or its authenticated request is invalid.");
    watching = true;
    try {
      return await watchSystemdWorker({
        ...config,
        binding: Object.fromEntries(
          ["leaseId", "workerId", "ownerId", "projectId", "sessionId", "jobId"].map((key) => [
            key,
            record[key],
          ]),
        ),
        recover: record.recover,
      });
    } catch (error) {
      // BindsTo + After on the worker stop it if the independent watchdog fails.
      console.error(
        "Independent watchdog failed; refusing cleanup acknowledgement:",
        error.message,
      );
      setImmediate(() => process.exit(1));
      throw error;
    } finally {
      watching = false;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ fd: 3 }, resolve);
  });
  return server;
}
