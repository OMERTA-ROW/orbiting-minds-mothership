import fs from "node:fs";
import { startWorkspaceCommand } from "./supervisor.mjs";
import { signWorkerRecord, verifyWorkerRecord } from "./worker-leases.mjs";
import { workerSocketServer } from "./worker-socket.mjs";

export async function serveLeasedWorker({ parent, workerId, secret, socketPath, coordinatorGid }) {
  const uid = process.getuid?.();
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const socketInfo = fs.lstatSync(socketPath);
  if (
    process.platform !== "linux" ||
    !uid ||
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
      pipe.on("data", (part) => {
        bytes += part.length;
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
