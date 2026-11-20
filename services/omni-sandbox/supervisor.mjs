import { spawn } from "node:child_process";
import fs from "node:fs";
import { createJobCgroup } from "./cgroup.mjs";

/**
 * Experimental host boundary. This does not implement renewable authority,
 * crash supervision, a disk quota, or production admission.
 */
export async function startWorkspaceCommand({ parent, jobId, work, uid, limits, command }) {
  if (
    process.platform !== "linux" ||
    !Number.isSafeInteger(uid) ||
    uid < 1 ||
    typeof command !== "string" ||
    !command.trim()
  )
    throw new Error("Invalid workspace command configuration.");
  if (!fs.statSync(work).isDirectory()) throw new Error("Workspace must be a directory.");

  const group = createJobCgroup(parent, jobId, {
    cpuQuotaMicros: 50000,
    cpuPeriodMicros: 100000,
    memoryBytes: limits.memoryMb * 1024 * 1024,
    maxProcesses: limits.maxProcesses,
  });
  const argv = [
    "/usr/bin/setpriv",
    `--reuid=${uid}`,
    `--regid=${uid}`,
    "--clear-groups",
    "--inh-caps=-all",
    "--ambient-caps=-all",
    "--bounding-set=-all",
    "--no-new-privs",
    "--",
    "/usr/bin/bwrap",
    "--unshare-user",
    "--unshare-pid",
    "--unshare-net",
    "--unshare-ipc",
    "--unshare-uts",
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    "/usr",
    "/usr",
    "--symlink",
    "usr/bin",
    "/bin",
    "--symlink",
    "usr/sbin",
    "/sbin",
    "--symlink",
    "usr/lib",
    "/lib",
    "--symlink",
    "usr/lib64",
    "/lib64",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--bind",
    work,
    "/work",
    "--chdir",
    "/work",
    "--clearenv",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--setenv",
    "HOME",
    "/work",
    "--setenv",
    "LANG",
    "C.UTF-8",
    "--setenv",
    "TERM",
    "dumb",
    "--",
    "/bin/bash",
    "--noprofile",
    "--norc",
    "-c",
    command,
  ];
  const child = spawn(
    "/bin/sh",
    ["-c", 'IFS= read -r gate <&3 && [ "$gate" = go ] && exec "$@"', "sh", ...argv],
    {
      cwd: "/",
      env: { PATH: "/usr/bin:/bin" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  let stopping;
  const stop = () => (stopping ??= group.stop());
  const completed = (async () => {
    let result;
    let spawnError;
    try {
      result = await exited;
    } catch (error) {
      spawnError = error;
    }
    await stop();
    await closed;
    group.remove();
    if (spawnError) throw spawnError;
    return result;
  })();
  void completed.catch(() => {});
  try {
    if (!child.pid) throw new Error("Could not start the blocked workspace launcher.");
    group.attach(child.pid);
    child.stdio[3].end("go\n");
  } catch (error) {
    child.stdio[3].destroy();
    await completed.catch(() => {});
    throw error;
  }
  return { child, stop, completed };
}
