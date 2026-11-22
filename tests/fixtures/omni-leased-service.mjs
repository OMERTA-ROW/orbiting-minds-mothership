import fs from "node:fs";
import path from "node:path";
import { serveLeasedWorker } from "../../services/omni-sandbox/leased-worker.mjs";
import { serveLeasedWatchdog } from "../../services/omni-sandbox/leased-watchdog.mjs";

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (config.role === "worker") {
  const membership = /^0::(\/[^\n]+)$/m.exec(fs.readFileSync("/proc/self/cgroup", "utf8"))?.[1];
  if (!membership || membership === "/") throw new Error("Fixture requires delegated service.");
  const parent = `/sys/fs/cgroup${membership}`;
  const manager = path.join(parent, "manager");
  fs.mkdirSync(manager);
  fs.writeFileSync(path.join(manager, "cgroup.procs"), "0");
  fs.writeFileSync(path.join(parent, "cgroup.subtree_control"), "+cpu +memory +pids");
  await serveLeasedWorker({ ...config, parent });
} else if (config.role === "watchdog") {
  await serveLeasedWatchdog(config);
} else throw new Error("Unknown fixture role.");
