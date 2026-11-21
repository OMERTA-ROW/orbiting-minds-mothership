import fs from "node:fs";
import path from "node:path";
import { createSandbox, loadConfig } from "./server.mjs";
import { delegatedCgroupRoot } from "./cgroup.mjs";

if (process.platform !== "linux" || process.getuid() === 0 || process.getgid() === 0)
  throw new Error("The host worker requires a non-root Linux service identity.");

const status = fs.readFileSync("/proc/self/status", "utf8");
if (!/^NoNewPrivs:\s+1$/m.test(status) || !/^CapEff:\s+0+$/m.test(status))
  throw new Error("The host worker requires no-new-privileges and empty capabilities.");

const membership = /^0::(\/[^\n]*)$/m.exec(fs.readFileSync("/proc/self/cgroup", "utf8"))?.[1];
if (!membership || membership === "/" || membership.split("/").includes(".."))
  throw new Error("The host worker requires a dedicated delegated cgroup v2 service.");
const parent = delegatedCgroupRoot(`/sys/fs/cgroup${membership}`);
const controllers = fs.readFileSync(path.join(parent, "cgroup.controllers"), "utf8").split(/\s+/);
if (!["cpu", "memory", "pids"].every((controller) => controllers.includes(controller)))
  throw new Error("CPU, memory and PID controllers must be delegated.");
const manager = path.join(parent, "manager");
fs.mkdirSync(manager);
fs.writeFileSync(path.join(manager, "cgroup.procs"), "0");
fs.writeFileSync(path.join(parent, "cgroup.subtree_control"), "+cpu +memory +pids");

const config = loadConfig();
config.cgroupParent = parent;
// Admission stays quarantined. Do not run the historical root-only readiness probe.
const sandbox = createSandbox(config, { network: "open" });
await sandbox.ready;
sandbox.server.listen(config.port, "127.0.0.1", () => {
  console.log(`Quarantined host worker listening on loopback:${config.port}`);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    sandbox.close();
    process.exit(0);
  });
