import fs from "node:fs";
import { startWorkspaceCommand } from "./supervisor.mjs";
import { signWorkerRecord, verifyWorkerRecord } from "./worker-leases.mjs";
import { workerSocketServer } from "./worker-socket.mjs";

export function createLeasedSessionWorkspace({
  parent,
  reservationSignal,
  runCommand = startWorkspaceCommand,
}) {
  if (
    typeof parent !== "string" ||
    !fs.statSync(parent).isDirectory() ||
    !reservationSignal ||
    typeof reservationSignal.addEventListener !== "function" ||
    typeof reservationSignal.aborted !== "boolean" ||
    typeof runCommand !== "function"
  )
    throw new Error("A reserved session workspace requires a directory and reservation signal.");
  if (reservationSignal.aborted) throw new Error("Session reservation is no longer active.");

  const workspace = fs.mkdtempSync(`${parent}/omni-session-workspace-`);
  let ended = false;
  let activeJob;
  let pendingStart;
  let cleanup;
  let running = false;
  const wipe = () => fs.rmSync(workspace, { recursive: true, force: true });
  const stopAndWipe = async (job) => {
    try {
      await job.stop?.();
    } catch {}
    try {
      await job.completed;
    } catch {}
    wipe();
  };
  const reservationLost = () => {
    ended = true;
    if (activeJob) cleanup = stopAndWipe(activeJob);
    else if (pendingStart) cleanup = pendingStart.then(stopAndWipe, wipe);
    else {
      try {
        wipe();
        cleanup = Promise.resolve();
      } catch (error) {
        cleanup = Promise.reject(error);
      }
    }
    void cleanup.catch(() => {});
  };
  reservationSignal.addEventListener("abort", reservationLost, { once: true });

  return {
    async run(options) {
      if (ended || reservationSignal.aborted)
        throw new Error("Session reservation is no longer active.");
      if (running) throw new Error("A session workspace command is already running.");
      running = true;
      try {
        pendingStart = Promise.resolve(
          runCommand({ ...options, work: workspace, ephemeral: false }),
        );
        activeJob = await pendingStart;
        pendingStart = undefined;
        if (ended || reservationSignal.aborted) {
          await (cleanup ?? stopAndWipe(activeJob));
          throw new Error("Session reservation is no longer active.");
        }
        return await activeJob.completed;
      } finally {
        activeJob = undefined;
        pendingStart = undefined;
        running = false;
        if (ended) await (cleanup ?? Promise.resolve().then(wipe));
      }
    },
    async end() {
      if (!ended) {
        ended = true;
        reservationSignal.removeEventListener("abort", reservationLost);
      }
      cleanup ??= activeJob
        ? stopAndWipe(activeJob)
        : pendingStart
          ? pendingStart.then(stopAndWipe, wipe)
          : Promise.resolve().then(wipe);
      await cleanup;
    },
  };
}

export async function serveLeasedWorker({ parent, workerId, secret, socketPath, coordinatorGid }) {
  const uid = process.getuid?.();
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const socketInfo = fs.lstatSync(socketPath);
  const bubblewrap = fs.lstatSync("/usr/bin/bwrap");
  if (
    process.platform !== "linux" ||
    !uid ||
    !bubblewrap.isFile() ||
    bubblewrap.uid !== 0 ||
    (bubblewrap.mode & 0o6022) !== 0 ||
    !/^NoNewPrivs:\s+1$/m.test(status) ||
    !/^CapEff:\s+0+$/m.test(status) ||
    !socketInfo.isSocket() ||
    socketInfo.uid !== uid ||
    socketInfo.gid !== coordinatorGid ||
    (socketInfo.mode & 0o777) !== 0o660 ||
    !fs.fstatSync(3).isSocket() ||
    process.getgroups().includes(coordinatorGid)
  )
    throw new Error("Worker requires a hardened identity and systemd-activated private socket.");
  const invocationId = process.env.INVOCATION_ID;
  if (!/^[a-f0-9]{32}$/.test(invocationId ?? ""))
    throw new Error("Worker requires an identifiable systemd invocation.");
  let assigned = false;
  const server = workerSocketServer(async (envelope) => {
    const binding = envelope?.record;
    if (binding?.workerId !== workerId) throw new Error("Wrong worker route.");
    const record = verifyWorkerRecord(secret, envelope, binding);
    if (
      record.invocationId !== invocationId ||
      record.expiresAt <= Date.now() ||
      record.expiresAt > Date.now() + 2000
    )
      throw new Error("Stale worker invocation or admission.");
    if (record.kind === "probe")
      return {
        record: { ...record, ready: !assigned },
        signature: signWorkerRecord(secret, { ...record, ready: !assigned }),
      };
    if (record.kind !== "run" || assigned) throw new Error("Worker is exclusively assigned.");
    if (
      typeof record.command !== "string" ||
      Buffer.byteLength(record.command) > 16384 ||
      !Number.isSafeInteger(record.limits?.commandTimeoutSec) ||
      record.limits.commandTimeoutSec < 1 ||
      record.limits.commandTimeoutSec > 30 ||
      !Number.isSafeInteger(record.limits.outputBytes) ||
      record.limits.outputBytes < 1 ||
      record.limits.outputBytes > 65536
    )
      throw new Error("Invalid bounded worker command.");
    assigned = true;
    const job = await startWorkspaceCommand({
      parent,
      jobId: record.jobId,
      work: "/",
      uid,
      limits: record.limits,
      command: record.command,
      ephemeral: true,
    });
    let stdout = "",
      stderr = "",
      bytes = 0,
      failure;
    const stop = (reason) => {
      failure ??= reason;
      void job.stop().catch((error) => {
        console.error("Worker termination unconfirmed:", error.message);
        server.close();
      });
    };
    for (const [name, pipe] of [
      ["stdout", job.child.stdout],
      ["stderr", job.child.stderr],
    ])
      pipe.setEncoding("utf8").on("data", (part) => {
        bytes += Buffer.byteLength(part);
        if (bytes > record.limits.outputBytes) stop("output limit");
        else if (name === "stdout") stdout += part.toString("utf8");
        else stderr += part.toString("utf8");
      });
    const timer = setTimeout(() => stop("wall time"), record.limits.commandTimeoutSec * 1000);
    try {
      const result = await job.completed;
      const reply = {
        ...record,
        kind: "result",
        code: result.code,
        signal: result.signal,
        stdout,
        stderr,
        failure,
      };
      return { record: reply, signature: signWorkerRecord(secret, reply) };
    } finally {
      clearTimeout(timer);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ fd: 3 }, resolve);
  });
  return server;
}
