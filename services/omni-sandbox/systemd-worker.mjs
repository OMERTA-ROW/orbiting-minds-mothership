import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { renewableWorkerAuthority } from "./worker-authority.mjs";
import { signWorkerRecord } from "./worker-leases.mjs";

const execute = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function systemdWorkerControl(workerId, workerUser) {
  if (!/^[a-z0-9-]{1,32}$/.test(workerId) || workerUser !== `omni-worker-${workerId}`)
    throw new Error("Systemd worker is not in the exact identity allowlist.");
  const service = `omni-worker@${workerId}.service`;
  const socket = `omni-worker@${workerId}.socket`;
  const command = (...args) =>
    execute("/usr/bin/systemctl", ["--no-pager", "--no-ask-password", ...args], {
      timeout: args[0] === "show" ? 1000 : 15000,
      maxBuffer: 65536,
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
    });
  const inspect = async () => {
    const { stdout } = await command(
      "show",
      service,
      "--property=ActiveState,ControlGroup,InvocationID,KillMode,User,PrivateTmp,MainPID,Restart,BindsTo,After",
    );
    const properties = Object.fromEntries(
      stdout
        .trim()
        .split("\n")
        .map((line) => {
          const equals = line.indexOf("=");
          return [line.slice(0, equals), line.slice(equals + 1)];
        }),
    );
    if (
      properties.User !== workerUser ||
      properties.KillMode !== "control-group" ||
      properties.PrivateTmp !== "yes" ||
      properties.Restart !== "no" ||
      !properties.BindsTo?.split(" ").includes(`omni-watchdog@${workerId}.service`) ||
      !properties.After?.split(" ").includes(`omni-watchdog@${workerId}.service`)
    )
      throw new Error("Worker systemd containment settings do not match.");
    return properties;
  };
  return {
    inspect,
    async recycle() {
      const before = await inspect();
      if (before.ControlGroup && !/^\/[A-Za-z0-9_@./\\:-]+$/.test(before.ControlGroup))
        throw new Error("Invalid systemd cgroup path.");
      if (before.ControlGroup?.split("/").includes(".."))
        throw new Error("Invalid systemd cgroup traversal.");
      const oldGroup = before.ControlGroup ? `/sys/fs/cgroup${before.ControlGroup}` : null;
      // Stop socket activation first; otherwise a delayed connection can restart the old unit.
      await command("stop", socket);
      await command("stop", service);
      const stopped = await inspect();
      if (
        !["inactive", "failed"].includes(stopped.ActiveState) ||
        stopped.MainPID !== "0" ||
        (oldGroup && fs.existsSync(oldGroup))
      )
        throw new Error("Worker cgroup termination and namespace destruction are unconfirmed.");
      await command("start", socket);
      await command("start", service);
      const fresh = await inspect();
      if (
        fresh.ActiveState !== "active" ||
        !/^[a-f0-9]{32}$/.test(fresh.InvocationID) ||
        fresh.InvocationID === before.InvocationID
      )
        throw new Error("Fresh worker invocation is unconfirmed.");
      return { previousInvocationId: before.InvocationID, invocationId: fresh.InvocationID };
    },
  };
}

export async function watchSystemdWorker({
  binding,
  secret,
  authorityFile,
  workerUser,
  workerUid,
  watchdogUid,
  recover = false,
}) {
  if (
    !watchdogUid ||
    !workerUid ||
    workerUid === watchdogUid ||
    process.getuid?.() !== watchdogUid ||
    process.getuid() === 0
  )
    throw new Error("Systemd watchdog requires its dedicated non-root identity.");
  const control = systemdWorkerControl(binding.workerId, workerUser);
  const initial = await control.inspect();
  const check = renewableWorkerAuthority(secret, binding);
  let reason = recover ? "restart quarantine" : "";
  while (!reason) {
    try {
      check(JSON.parse(fs.readFileSync(authorityFile, "utf8")));
      const current = await control.inspect();
      if (current.ActiveState !== "active" || current.InvocationID !== initial.InvocationID)
        throw new Error("Worker crashed or invocation changed.");
    } catch (error) {
      reason = error.message;
      break;
    }
    await sleep(50);
  }
  const generation = await control.recycle();
  const record = {
    ...binding,
    ...generation,
    outcome: "terminated_and_wiped",
    reason,
  };
  return { record, signature: signWorkerRecord(secret, record) };
}
