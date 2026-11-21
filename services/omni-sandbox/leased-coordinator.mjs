import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { signWorkerRecord, verifyWorkerRecord } from "./worker-leases.mjs";
import { workerRequest } from "./worker-socket.mjs";

const digest = (command) => createHash("sha256").update(command).digest("hex");

// Experimental admission only. The production OMNI service remains quarantined.
export function createLeasedCoordinator({
  pool,
  workers,
  databaseFile,
  approvalSecret,
  approve,
  renew,
  monitor,
}) {
  const privateState = fs.lstatSync(path.dirname(databaseFile));
  if (
    !privateState.isDirectory() ||
    privateState.isSymbolicLink() ||
    privateState.uid !== process.getuid?.() ||
    (privateState.mode & 0o077) !== 0
  )
    throw new Error("Coordinator database requires a private identity-owned directory.");
  const leadership = new DatabaseSync(`${databaseFile}.coordinator-lock`);
  try {
    leadership.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
  } catch (error) {
    leadership.close();
    throw new Error("Coordinator leadership is already held or unreadable.", { cause: error });
  }
  const active = new Map();
  let recovering = false;
  const workerFor = (binding) => {
    const worker = workers.find((candidate) => candidate.workerId === binding.workerId);
    if (!worker) throw new Error("Lease has no configured worker route.");
    return worker;
  };
  const publish = (worker, binding, sequence, enabled) => {
    const record = { ...binding, sequence, active: enabled, expiresAt: Date.now() + 500 };
    const next = `${worker.authorityFile}.${binding.leaseId}.next`;
    fs.writeFileSync(
      next,
      JSON.stringify({ record, signature: signWorkerRecord(worker.watchdogSecret, record) }),
      { mode: 0o640, flag: "wx" },
    );
    fs.renameSync(next, worker.authorityFile);
  };
  const signRequest = (worker, binding, invocationId, kind, extra = {}) => {
    const record = { ...binding, invocationId, kind, expiresAt: Date.now() + 1000, ...extra };
    return { record, signature: signWorkerRecord(worker.workerSecret, record) };
  };
  return {
    async execute(identity, command, limits) {
      if (recovering || pool.unfinished().some((lease) => !active.has(lease.leaseId)))
        throw new Error("Unfinished leases require startup quarantine before admission.");
      const binding = pool.claim(identity);
      const worker = workerFor(binding);
      let sequence = 0,
        timer,
        renewing = false,
        enabled = false,
        stopped = false,
        jobResult;
      let watch;
      const revoke = () => {
        stopped = true;
        enabled = false;
        clearInterval(timer);
        publish(worker, binding, ++sequence, false);
      };
      active.set(binding.leaseId, revoke);
      try {
        const approval = verifyWorkerRecord(
          approvalSecret,
          await approve(binding, digest(command)),
          binding,
        );
        if (
          approval.kind !== "approval" ||
          approval.commandDigest !== digest(command) ||
          approval.expiresAt <= Date.now() ||
          approval.expiresAt > Date.now() + 2000
        )
          throw new Error("Owner-bound command approval is invalid or expired.");
        const initialAuthority = verifyWorkerRecord(
          worker.watchdogSecret,
          await renew(binding),
          binding,
        );
        if (
          stopped ||
          initialAuthority.active !== true ||
          initialAuthority.expiresAt <= Date.now() ||
          initialAuthority.expiresAt > Date.now() + 2000
        )
          throw new Error("Startup authority is stopped, expired or unreadable.");
        const startupCleanup = verifyWorkerRecord(
          worker.watchdogSecret,
          await monitor(worker, binding, true),
          binding,
        );
        if (startupCleanup.outcome !== "terminated_and_wiped" || stopped)
          throw new Error("Worker startup cleanup or authority is unconfirmed.");
        enabled = true;
        publish(worker, binding, ++sequence, true);
        watch = monitor(worker, binding, false);
        const observedWatch = watch.then(
          (ack) => ({ ack }),
          (error) => ({ error }),
        );
        timer = setInterval(async () => {
          if (renewing || !enabled) return;
          renewing = true;
          try {
            const authority = verifyWorkerRecord(
              worker.watchdogSecret,
              await renew(binding),
              binding,
            );
            if (
              authority.active !== true ||
              authority.expiresAt <= Date.now() ||
              authority.expiresAt > Date.now() + 2000
            )
              throw new Error("Execution authority is stopped, expired or unreadable.");
            if (enabled) publish(worker, binding, ++sequence, true);
          } catch (error) {
            console.error("Worker renewal failed:", error.message);
            try {
              revoke();
            } catch (writeError) {
              // No new authority is published: the independent watchdog must expire it.
              console.error("Worker revocation persistence failed:", writeError.message);
            }
          } finally {
            renewing = false;
          }
        }, 100);
        const invocationId = await worker.invocation();
        const ready = verifyWorkerRecord(
          worker.workerSecret,
          await workerRequest(
            worker.socketPath,
            signRequest(worker, binding, invocationId, "probe"),
          ),
          binding,
        );
        if (ready.ready !== true || !enabled || approval.expiresAt <= Date.now())
          throw new Error("Worker startup authority or exclusivity was lost.");
        const job = workerRequest(
          worker.socketPath,
          signRequest(worker, binding, invocationId, "run", { command, limits }),
          (limits.commandTimeoutSec + 5) * 1000,
        ).then(
          (reply) => ({ result: verifyWorkerRecord(worker.workerSecret, reply, binding) }),
          (error) => ({ error }),
        );
        const first = await Promise.race([job, observedWatch]);
        if (first.result) jobResult = first.result;
        if (first.error) console.error("Worker lifecycle failed:", first.error.message);
        revoke();
        pool.quarantine(binding.leaseId);
        const ack = first.ack ?? (await watch);
        pool.release(ack, worker.watchdogSecret);
        if (!jobResult || jobResult.failure || jobResult.code !== 0)
          throw Object.assign(new Error(`Workspace did not complete: ${ack.record.reason}.`), {
            result: jobResult,
          });
        return { binding, result: jobResult, cleanup: ack.record };
      } catch (error) {
        if (pool.read(binding.leaseId).state === "released") throw error;
        pool.quarantine(binding.leaseId);
        if (!watch) {
          publish(worker, binding, ++sequence, false);
          watch = monitor(worker, binding, true);
        } else {
          try {
            revoke();
          } catch (writeError) {
            console.error("Worker revocation persistence failed:", writeError.message);
          }
        }
        try {
          const ack = await watch;
          if (pool.read(binding.leaseId).state !== "released")
            pool.release(ack, worker.watchdogSecret);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Worker cleanup unconfirmed; lease retained.",
          );
        }
        throw error;
      } finally {
        enabled = false;
        clearInterval(timer);
        active.delete(binding.leaseId);
      }
    },
    stop() {
      const failures = [];
      for (const revoke of active.values()) {
        try {
          revoke();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          "Stop persistence failed; all authority renewals ceased.",
        );
    },
    async recover() {
      if (active.size || recovering) throw new Error("Recovery must be exclusive with admission.");
      recovering = true;
      try {
        for (const binding of pool.unfinished()) {
          const worker = workerFor(binding);
          pool.quarantine(binding.leaseId);
          publish(worker, binding, 0, false);
          pool.release(await monitor(worker, binding, true), worker.watchdogSecret);
        }
      } finally {
        recovering = false;
      }
    },
    close() {
      if (active.size || recovering)
        throw new Error("Cannot release active coordinator leadership.");
      leadership.close();
    },
  };
}
