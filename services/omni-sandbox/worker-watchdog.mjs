import fs from "node:fs";
import path from "node:path";
import { delegatedCgroupRoot } from "./cgroup.mjs";
import { signWorkerRecord } from "./worker-leases.mjs";
import { renewableWorkerAuthority } from "./worker-authority.mjs";

export async function watchWorker({
  parent,
  workspace,
  authorityFile,
  binding,
  secret,
  workerUid,
  watchdogUid,
  recover = false,
  intervalMs = 50,
}) {
  if (
    process.platform !== "linux" ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 10 ||
    intervalMs > 100
  )
    throw new Error("Unsupported worker watchdog configuration.");
  const root = delegatedCgroupRoot(parent);
  if (
    !["leaseId", "ownerId", "sessionId", "jobId"].every((key) =>
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(binding?.[key] ?? ""),
    ) ||
    !/^[a-z0-9-]{1,32}$/.test(binding?.workerId ?? "") ||
    !/^[A-Za-z0-9_.:-]{1,80}$/.test(binding?.projectId ?? "")
  )
    throw new Error("Invalid watchdog lease binding.");
  if (
    !Number.isSafeInteger(workerUid) ||
    workerUid < 1 ||
    !Number.isSafeInteger(watchdogUid) ||
    watchdogUid < 1 ||
    workerUid === watchdogUid ||
    process.getuid() !== watchdogUid ||
    fs.statSync(root).uid !== watchdogUid
  )
    throw new Error(
      "Watchdog requires a distinct non-root identity and its own cgroup delegation.",
    );
  if (path.basename(root) !== `worker-${binding.leaseId}`)
    throw new Error("Worker cgroup is not bound to this lease.");
  const ownGroup = /^0::(\/[^\n]+)$/m.exec(fs.readFileSync("/proc/self/cgroup", "utf8"))?.[1];
  if (
    !ownGroup ||
    root === `/sys/fs/cgroup${ownGroup}` ||
    `/sys/fs/cgroup${ownGroup}`.startsWith(`${root}/`)
  )
    throw new Error("Watchdog must be outside the worker cgroup.");
  const work = fs.lstatSync(workspace);
  if (
    !work.isDirectory() ||
    work.isSymbolicLink() ||
    fs.realpathSync(workspace) !== workspace ||
    work.uid !== watchdogUid ||
    path.basename(workspace) !== binding.leaseId
  )
    throw new Error("Workspace must be a pre-provisioned real directory.");
  const check = renewableWorkerAuthority(secret, binding);
  let reason = recover ? "restart quarantine" : "";
  while (!reason) {
    try {
      const envelope = JSON.parse(fs.readFileSync(authorityFile, "utf8"));
      check(envelope);
    } catch (error) {
      reason = error.message;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  // Kill the whole delegated worker tree, not a PID or a process group.
  fs.writeFileSync(path.join(root, "cgroup.kill"), "1");
  const stopDeadline = performance.now() + 2000;
  while (true) {
    const events = fs.readFileSync(path.join(root, "cgroup.events"), "utf8");
    if (/^populated 0$/m.test(events)) break;
    if (!/^populated 1$/m.test(events) || performance.now() >= stopDeadline)
      throw new Error("Worker termination is unconfirmed; lease must remain quarantined.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  for (const entry of fs
    .readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isDirectory())) {
    if (entry.name !== "manager" && !/^job-[a-f0-9-]{36}$/.test(entry.name))
      throw new Error("Unknown worker child cgroup; cleanup requires investigation.");
    fs.rmdirSync(path.join(root, entry.name));
  }
  // Closing the empty cgroup prevents a delayed startup from attaching after Stop.
  fs.rmdirSync(root);
  fs.rmSync(workspace, { recursive: true });
  if (fs.existsSync(workspace))
    throw new Error("Workspace wipe is unconfirmed; lease must remain quarantined.");
  const record = {
    ...Object.fromEntries(
      ["leaseId", "workerId", "ownerId", "projectId", "sessionId", "jobId"].map((key) => [
        key,
        binding[key],
      ]),
    ),
    outcome: "terminated_and_wiped",
    reason,
  };
  return { record, signature: signWorkerRecord(secret, record) };
}
