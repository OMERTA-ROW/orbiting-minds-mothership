import fs from "node:fs";
import { renewableSessionAuthority } from "./worker-authority.mjs";
import { signWorkerRecord, verifySessionRecord, verifyWorkerRecord } from "./worker-leases.mjs";
import { workerSocketServer } from "./worker-socket.mjs";
import { watchSystemdWorker } from "./systemd-worker.mjs";

const SESSION_CONTRACT = "omni.workspace-session/v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function verifyWatchRequest(secret, envelope, workerId, expectedBinding) {
  const binding = envelope?.record;
  const session = binding?.contract === SESSION_CONTRACT;
  if (
    (binding?.contract !== undefined && !session) ||
    (session && binding.jobId !== undefined) ||
    (expectedBinding && (expectedBinding.contract === SESSION_CONTRACT) !== session)
  )
    throw new Error("Watchdog contract is not supported or does not match.");
  const verify = session ? verifySessionRecord : verifyWorkerRecord;
  const record = verify(secret, envelope, expectedBinding ?? binding);
  if (
    record.workerId !== workerId ||
    record.kind !== "watch" ||
    typeof record.recover !== "boolean" ||
    record.expiresAt <= Date.now() ||
    record.expiresAt > Date.now() + 2000 ||
    !Number.isSafeInteger(record.expiresAt)
  )
    throw new Error("Watchdog route is busy or its authenticated request is invalid.");
  return { record, session };
}

export async function watchSessionAuthority({ binding, secret, authorityFile, onLapse }) {
  const check = renewableSessionAuthority(secret, binding);
  while (true) {
    try {
      check(JSON.parse(fs.readFileSync(authorityFile, "utf8")));
    } catch (error) {
      return onLapse(error);
    }
    await sleep(50);
  }
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
  let watching;
  const server = workerSocketServer(async (envelope) => {
    const { record, session } = verifyWatchRequest(
      config.secret,
      envelope,
      config.workerId,
      watching?.binding,
    );
    if (watching) {
      if (!record.recover) throw new Error("Watchdog route is exclusively assigned.");
      return watching.promise;
    }
    const bindingIdentity = Object.fromEntries(
      (session
        ? ["leaseId", "workerId", "ownerId", "projectId", "sessionId"]
        : ["leaseId", "workerId", "ownerId", "projectId", "sessionId", "jobId"]
      ).map((key) => [key, record[key]]),
    );
    const sessionBinding = session ? { ...bindingIdentity, contract: SESSION_CONTRACT } : undefined;
    const cleanupSession = async () => {
      await watchSystemdWorker({ ...config, binding: bindingIdentity, recover: true });
      const cleanup = {
        ...sessionBinding,
        kind: "session_cleanup",
        outcome: "terminated_and_wiped",
      };
      return { record: cleanup, signature: signWorkerRecord(config.secret, cleanup) };
    };
    let watch;
    if (sessionBinding && record.recover) {
      watch = cleanupSession();
    } else if (sessionBinding) {
      watch = watchSessionAuthority({
        binding: sessionBinding,
        secret: config.secret,
        authorityFile: config.sessionAuthorityFile ?? config.authorityFile,
        onLapse: cleanupSession,
      });
    } else {
      watch = watchSystemdWorker({
        ...config,
        binding: bindingIdentity,
        recover: record.recover,
      });
    }
    watching = {
      binding: sessionBinding ?? bindingIdentity,
      promise: watch,
    };
    try {
      return await watching.promise;
    } catch (error) {
      // BindsTo + After on the worker stop it if the independent watchdog fails.
      console.error(
        "Independent watchdog failed; refusing cleanup acknowledgement:",
        error.message,
      );
      setImmediate(() => process.exit(1));
      throw error;
    } finally {
      watching = undefined;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ fd: 3 }, resolve);
  });
  return server;
}
