import { createHash } from "node:crypto";
import fs from "node:fs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const FILESYSTEMS = new Map([
  [0xef53, "ext"],
  [0x58465342, "xfs"],
  [0x9123683e, "btrfs"],
  [0x01021994, "tmpfs"],
  [0x794c7630, "overlay"],
]);

export function recordBootObservation(db, identity) {
  if (
    !identity ||
    !/^[0-9a-f]{32}$/.test(identity.machine) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identity.boot) ||
    !/^[0-9a-f]{64}$/.test(identity.pathHash)
  )
    return "unavailable";
  db.exec(`
    CREATE TABLE IF NOT EXISTS sandbox_health_boot (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      machine_hash TEXT NOT NULL,
      path_hash TEXT NOT NULL,
      boot_id TEXT NOT NULL,
      survived_reboot INTEGER NOT NULL
    );
    BEGIN IMMEDIATE;
  `);
  try {
    const previous = db.prepare("SELECT * FROM sandbox_health_boot WHERE singleton = 1").get();
    const sameLocation =
      previous?.machine_hash === digest(identity.machine) &&
      previous?.path_hash === identity.pathHash;
    const survived =
      sameLocation && (previous.boot_id !== identity.boot || previous.survived_reboot === 1);
    db.prepare(
      `
      INSERT INTO sandbox_health_boot
        (singleton, machine_hash, path_hash, boot_id, survived_reboot)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        machine_hash=excluded.machine_hash, path_hash=excluded.path_hash,
        boot_id=excluded.boot_id, survived_reboot=excluded.survived_reboot
    `,
    ).run(digest(identity.machine), identity.pathHash, identity.boot, survived ? 1 : 0);
    db.exec("COMMIT");
    return survived ? "observed" : "not_observed";
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function replayEvidence(db, databasePath) {
  const resolved = fs.realpathSync(databasePath);
  const pathHash = digest(resolved);
  let filesystem = "unknown";
  let reboot = "unavailable";
  if (process.platform === "linux") {
    filesystem = FILESYSTEMS.get(fs.statfsSync(resolved).type >>> 0) ?? "unknown";
    let machine;
    let boot;
    try {
      machine = fs.readFileSync("/etc/machine-id", "utf8").trim();
      boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    } catch (error) {
      if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
    }
    reboot = recordBootObservation(db, { machine, boot, pathHash });
  }
  return {
    store: "sqlite",
    pathSha256: pathHash,
    filesystem,
    rebootObservation: reboot,
    persistence: "unverified",
  };
}

export function trackReplayEvidence(db, databasePath) {
  const evidence = replayEvidence(db, databasePath);
  const initial = fs.lstatSync(databasePath);
  return () => {
    let unchanged = false;
    try {
      const current = fs.lstatSync(databasePath);
      unchanged =
        initial.isFile() &&
        current.isFile() &&
        initial.dev === current.dev &&
        initial.ino === current.ino;
    } catch (error) {
      if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
    }
    return {
      ...evidence,
      stateFile: unchanged ? "same_file" : "changed_or_unavailable",
      rebootObservation: unchanged ? evidence.rebootObservation : "unavailable",
    };
  };
}
