import fs from "node:fs";
import path from "node:path";

const CGROUP2_MAGIC = 0x63677270;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function boundedInteger(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}.`);
  return value;
}

function populated(group) {
  const events = fs.readFileSync(path.join(group, "cgroup.events"), "utf8");
  const match = /^populated ([01])$/m.exec(events);
  if (!match) throw new Error("Cannot determine cgroup population.");
  return match[1] === "1";
}

export function delegatedCgroupRoot(parent) {
  if (typeof parent !== "string" || !path.isAbsolute(parent))
    throw new Error("Invalid delegated cgroup.");
  const info = fs.lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.statfsSync(parent).type !== CGROUP2_MAGIC)
    throw new Error("The delegated parent must be a real cgroup v2 directory.");
  return fs.realpathSync(parent);
}

function jobPath(parent, jobId) {
  if (typeof jobId !== "string" || !UUID.test(jobId)) throw new Error("Invalid job ID.");
  return path.join(delegatedCgroupRoot(parent), `job-${jobId}`);
}

function jobGroup(group, allowAttach) {
  let stopping = false;
  return {
    path: group,
    attach(pid) {
      if (!allowAttach) throw new Error("Cannot attach processes to a recovered job.");
      if (stopping) throw new Error("Cannot attach processes after job termination begins.");
      if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid process ID.");
      fs.writeFileSync(path.join(group, "cgroup.procs"), String(pid));
    },
    async stop(timeoutMs = 2000) {
      boundedInteger(timeoutMs, 1, 10000, "stop timeout");
      stopping = true;
      fs.writeFileSync(path.join(group, "cgroup.kill"), "1");
      const deadline = performance.now() + timeoutMs;
      while (populated(group)) {
        if (performance.now() >= deadline) throw new Error("Cgroup termination was not confirmed.");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    remove() {
      if (populated(group)) throw new Error("Cannot remove a populated cgroup.");
      fs.rmdirSync(group);
    },
  };
}

/**
 * A job leaf under an already delegated cgroup v2 parent. The caller must attach
 * only a trusted, blocked child before allowing it to start untrusted code.
 */
export function createJobCgroup(parent, jobId, limits) {
  const group = jobPath(parent, jobId);
  const quota = boundedInteger(limits.cpuQuotaMicros, 1000, 1000000, "CPU quota");
  const period = boundedInteger(limits.cpuPeriodMicros, 1000, 1000000, "CPU period");
  const memory = boundedInteger(limits.memoryBytes, 16 * 1024 * 1024, 8 * 1024 ** 3, "memory");
  const pids = boundedInteger(limits.maxProcesses, 1, 512, "PID limit");
  fs.mkdirSync(group);
  try {
    for (const [file, value] of [
      ["cpu.max", `${quota} ${period}`],
      ["memory.max", String(memory)],
      ["memory.swap.max", "0"],
      ["memory.oom.group", "1"],
      ["pids.max", String(pids)],
    ]) {
      fs.writeFileSync(path.join(group, file), value);
    }
    fs.accessSync(path.join(group, "cgroup.kill"), fs.constants.W_OK);
    populated(group);
  } catch (error) {
    fs.rmdirSync(group);
    throw error;
  }
  return jobGroup(group, true);
}

/**
 * Reopen only a known unfinished job for termination, never for reuse.
 * The caller must first exclude every other supervisor for this delegated parent.
 */
export function openJobCgroupForRecovery(parent, jobId) {
  const group = jobPath(parent, jobId);
  const info = fs.lstatSync(group);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.statfsSync(group).type !== CGROUP2_MAGIC)
    throw new Error("The recovery target must be a real cgroup v2 directory.");
  fs.accessSync(path.join(group, "cgroup.kill"), fs.constants.W_OK);
  populated(group);
  return jobGroup(group, false);
}
