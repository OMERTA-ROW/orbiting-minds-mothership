import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { parsePlan, planHash } from "./executor.mjs";

const OUTPUT_LIMIT = 8192;
const SANDBOX_NAME = /^omni-staging-[a-f0-9]{32}$/;

// Draft only: the caller must supply the Vercel SDK and a durable, atomic journal.
// This module is deliberately not connected to the executor's signed endpoint.
export function createVercelAdapter({ Sandbox, journal }) {
  const active = new Map();
  let reconciling = false;

  async function terminate(record) {
    const box = await Sandbox.get({ name: record.name, resume: false });
    if (box.name !== record.name || box.persistent !== false) {
      throw new Error("Sandbox identity or persistence is unverified");
    }
    if (box.status !== "stopped") await box.stop();
    const fresh = await Sandbox.get({ name: record.name, resume: false });
    if (fresh.name !== record.name || fresh.persistent !== false || fresh.status !== "stopped") {
      throw new Error("Sandbox termination is unverified");
    }
    await journal.markTerminated(record);
    return { jobId: record.jobId, planSha256: record.planSha256, terminated: true };
  }

  async function run(input, approvedArgv, signal) {
    const parsed = parsePlan(input);
    const plan = {
      ...parsed,
      commands: parsed.commands.map((command) => ({ ...command, argv: [...command.argv] })),
    };
    const command = plan.commands[0];
    if (
      plan.commands.length !== 1 ||
      command.argv[0] !== "/usr/bin/printf" ||
      !Array.isArray(approvedArgv) ||
      approvedArgv.length !== command.argv.length ||
      !approvedArgv.every((arg, index) => arg === command.argv[index])
    ) {
      throw new Error("Plan is not the separately approved printf command");
    }
    if (signal.aborted || active.size || reconciling)
      throw new Error("Executor is stopped or occupied");

    const record = {
      jobId: plan.jobId,
      planSha256: planHash(plan),
      name: `omni-staging-${randomBytes(16).toString("hex")}`,
    };
    const state = { record, stopRequested: false, done: null };
    active.set(record.jobId, state);
    const abort = () => {
      state.stopRequested = true;
      state.wake?.();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const deadline = setTimeout(abort, Math.max(0, Date.parse(plan.expiresAt) - Date.now()));

    state.done = (async () => {
      // The journal must fail closed if any earlier reservation remains unresolved.
      await journal.assertReady();
      // reserve must atomically persist before create and reject every repeated job.
      await journal.reserve(record);
      const remaining = Date.parse(plan.expiresAt) - Date.now();
      if (state.stopRequested || remaining <= 0) throw new Error("Stopped before sandbox creation");
      const box = await Sandbox.create({
        name: record.name,
        networkPolicy: "deny-all",
        persistent: false,
        resources: { vcpus: 1 },
        timeout: Math.min(command.timeoutMs, remaining),
        ports: [],
        env: {},
      });
      if (box.name !== record.name || box.persistent !== false) {
        throw new Error("Created sandbox configuration is unverified");
      }

      let output = "";
      let outputBytes = 0;
      let exceeded = false;
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          outputBytes += chunk.length;
          if (outputBytes > OUTPUT_LIMIT) {
            exceeded = true;
            abort();
          } else {
            output += chunk.toString("utf8");
          }
          callback();
        },
      });
      const interrupted = new Promise((resolve) => {
        state.wake = () => resolve(null);
        if (state.stopRequested) state.wake();
      });
      const commandDeadline = setTimeout(
        abort,
        Math.max(0, Math.min(command.timeoutMs, Date.parse(plan.expiresAt) - Date.now())),
      );
      let result = null;
      let commandError;
      if (!state.stopRequested && Date.now() < Date.parse(plan.expiresAt)) {
        try {
          const execution = box.runCommand({
            cmd: command.argv[0],
            args: command.argv.slice(1),
            timeoutMs: command.timeoutMs,
            env: {},
            stdout: stream,
            stderr: stream,
          });
          result = await Promise.race([execution, interrupted]);
        } catch (error) {
          commandError = error;
        }
      } else {
        abort();
      }

      clearTimeout(commandDeadline);
      const evidence = await terminate(record);
      if (commandError) throw commandError;
      return {
        ...evidence,
        outcome: state.stopRequested
          ? "cancelled"
          : result?.exitCode === 0 && !exceeded
            ? "completed"
            : "failed",
        output,
        exceeded,
      };
    })();

    try {
      return await state.done;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener("abort", abort);
      active.delete(record.jobId);
    }
  }

  async function cancel({ jobId, planSha256 }) {
    const state = active.get(jobId);
    if (!state || state.record.planSha256 !== planSha256) {
      throw new Error("Cancellation scope or active instance is unverified");
    }
    state.stopRequested = true;
    state.wake?.();
    const result = await state.done;
    if (result.outcome !== "cancelled" || result.terminated !== true) {
      throw new Error("Cancellation is unverified");
    }
    return { jobId, planSha256, terminated: true };
  }

  async function reconcile({ jobId, planSha256 }) {
    if (
      typeof jobId !== "string" ||
      typeof planSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(planSha256) ||
      active.size ||
      reconciling
    ) {
      throw new Error("Reconciliation record is invalid or executor is occupied");
    }
    reconciling = true;
    try {
      const record = await journal.find(jobId, planSha256);
      if (
        !record ||
        record.jobId !== jobId ||
        record.planSha256 !== planSha256 ||
        !SANDBOX_NAME.test(record.name)
      ) {
        throw new Error("Reconciliation journal is unverified");
      }
      // Unknown/not-found is not evidence that an in-flight create cannot appear.
      return await terminate(record);
    } finally {
      reconciling = false;
    }
  }

  return { run, cancel, reconcile };
}
