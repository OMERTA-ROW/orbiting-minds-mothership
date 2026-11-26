import fs from "node:fs";
import path from "node:path";
import { verifySessionRecord, verifyWorkerRecord } from "./worker-leases.mjs";
import { workerSocketServer } from "./worker-socket.mjs";
import { watchSystemdWorker } from "./systemd-worker.mjs";

const SESSION_CONTRACT = "omni.workspace-session/v1";

export function verifyWorkspaceRemoved(workspacePath, inspect = fs.lstatSync) {
  if (typeof workspacePath !== "string" || !path.isAbsolute(workspacePath))
    throw new Error("An absolute workspace path is required for cleanup verification.");
  try {
    inspect(workspacePath);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw new Error("Workspace removal could not be independently confirmed.", { cause: error });
  }
  throw new Error("Workspace remains after worker cleanup.");
}

function verifyWatchRecord(secret, envelope, binding) {
  const record = envelope?.record;
  const isSession = record?.contract === SESSION_CONTRACT;
  if (binding && isSession === Object.hasOwn(binding, "jobId"))
    throw new Error("Worker control identity mismatch.");
  if (isSession) {
    if (Object.hasOwn(record, "jobId")) throw new Error("Invalid session control contract.");
    return verifySessionRecord(secret, envelope, binding ?? record);
  }
  return verifyWorkerRecord(secret, envelope, binding ?? record);
}

export function createLeasedWatchHandler(config, watch = watchSystemdWorker, onFailure = () => {}) {
  let watching;
  return async (envelope) => {
    const binding = envelope?.record;
    const record = verifyWatchRecord(config.secret, envelope, binding);
    if (
      record.workerId !== config.workerId ||
      record.kind !== "watch" ||
      typeof record.recover !== "boolean" ||
      record.expiresAt <= Date.now() ||
      record.expiresAt > Date.now() + 2000
    )
      throw new Error("Watchdog route is busy or its authenticated request is invalid.");
    if (watching) {
      if (!record.recover) throw new Error("Watchdog route is exclusively assigned.");
      verifyWatchRecord(config.secret, envelope, watching.binding);
      return watching.promise;
    }
    const identityKeys = ["leaseId", "workerId", "ownerId", "projectId", "sessionId"];
    if (record.contract !== SESSION_CONTRACT) identityKeys.push("jobId");
    const bindingIdentity = Object.fromEntries(identityKeys.map((key) => [key, record[key]]));
    const promise = Promise.resolve()
      .then(() =>
        watch({
          ...config,
          binding: bindingIdentity,
          recover: record.recover,
        }),
      )
      .then((result) => {
        if (record.contract === SESSION_CONTRACT || config.workspacePath !== undefined)
          verifyWorkspaceRemoved(config.workspacePath);
        return result;
      });
    watching = {
      binding: bindingIdentity,
      promise,
    };
    try {
      return await watching.promise;
    } catch (error) {
      onFailure(error);
      throw error;
    } finally {
      watching = undefined;
    }
  };
}

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
  const handleWatch = createLeasedWatchHandler(config, watchSystemdWorker, (error) => {
    // BindsTo + After on the worker stop it if the independent watchdog fails.
    console.error("Independent watchdog failed; refusing cleanup acknowledgement:", error.message);
    setImmediate(() => process.exit(1));
  });
  const server = workerSocketServer(handleWatch);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ fd: 3 }, resolve);
  });
  return server;
}
