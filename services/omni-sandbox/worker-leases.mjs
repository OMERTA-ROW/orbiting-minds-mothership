import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identityKeys = ["leaseId", "workerId", "ownerId", "projectId", "sessionId", "jobId"];

export function signWorkerRecord(secret, record) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Worker control key is unavailable.");
  return createHmac("sha256", secret).update(JSON.stringify(record)).digest("hex");
}

export function verifyWorkerRecord(secret, envelope, binding) {
  if (
    !envelope ||
    typeof envelope.signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(envelope.signature)
  )
    throw new Error("Invalid worker control signature.");
  const signature = signWorkerRecord(secret, envelope.record);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(envelope.signature, "hex")))
    throw new Error("Invalid worker control signature.");
  if (!identityKeys.every((key) => envelope.record?.[key] === binding[key]))
    throw new Error("Worker control identity mismatch.");
  return envelope.record;
}

export function createWorkerLeases(database, workers) {
  if (
    !Array.isArray(workers) ||
    !workers.length ||
    workers.length > 32 ||
    workers.some((id) => typeof id !== "string" || !/^[a-z0-9-]{1,32}$/.test(id)) ||
    new Set(workers).size !== workers.length
  )
    throw new Error("Invalid pre-provisioned worker pool.");
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS workspace_worker_pool (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), workers TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_worker_leases (
      lease_id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      project_id TEXT NOT NULL, session_id TEXT NOT NULL, job_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('leased','quarantined','released'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_worker_exclusive
      ON workspace_worker_leases(worker_id) WHERE state != 'released';
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_session_exclusive
      ON workspace_worker_leases(session_id) WHERE state != 'released';
  `);
  const expected = JSON.stringify([...workers].sort());
  database
    .prepare("INSERT INTO workspace_worker_pool VALUES (1, ?) ON CONFLICT DO NOTHING")
    .run(expected);
  if (
    database.prepare("SELECT workers FROM workspace_worker_pool WHERE singleton=1").get()
      ?.workers !== expected
  )
    throw new Error("Worker pool differs from its durable registry.");
  const read = (leaseId) => {
    const row = database
      .prepare("SELECT * FROM workspace_worker_leases WHERE lease_id=?")
      .get(leaseId);
    if (!row) throw new Error("Unknown worker lease.");
    return {
      leaseId: row.lease_id,
      workerId: row.worker_id,
      ownerId: row.owner_id,
      projectId: row.project_id,
      sessionId: row.session_id,
      jobId: row.job_id,
      state: row.state,
    };
  };
  return {
    claim({ ownerId, projectId, sessionId, jobId }) {
      if (
        ![ownerId, sessionId, jobId].every((id) => UUID.test(id ?? "")) ||
        typeof projectId !== "string" ||
        !/^[A-Za-z0-9_.:-]{1,80}$/.test(projectId)
      )
        throw new Error("Invalid worker lease identity.");
      database.exec("BEGIN IMMEDIATE");
      try {
        if (
          database
            .prepare(
              "SELECT 1 FROM workspace_worker_leases WHERE session_id=? AND state!='released'",
            )
            .get(sessionId)
        )
          throw new Error("Session already has an exclusive worker.");
        const busy = new Set(
          database
            .prepare("SELECT worker_id FROM workspace_worker_leases WHERE state!='released'")
            .all()
            .map((row) => row.worker_id),
        );
        const workerId = workers.find((id) => !busy.has(id));
        if (!workerId) throw new Error("Worker pool exhausted; request refused.");
        const leaseId = randomUUID();
        database
          .prepare("INSERT INTO workspace_worker_leases VALUES (?,?,?,?,?,?,'leased')")
          .run(leaseId, workerId, ownerId, projectId, sessionId, jobId);
        database.exec("COMMIT");
        return read(leaseId);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    read,
    unfinished() {
      return database
        .prepare("SELECT lease_id FROM workspace_worker_leases WHERE state!='released'")
        .all()
        .map((row) => read(row.lease_id));
    },
    quarantine(leaseId) {
      if (
        database
          .prepare(
            "UPDATE workspace_worker_leases SET state='quarantined' WHERE lease_id=? AND state!='released'",
          )
          .run(leaseId).changes !== 1
      )
        throw new Error("Could not quarantine worker lease.");
    },
    release(envelope, secret) {
      const binding = read(envelope?.record?.leaseId);
      const record = verifyWorkerRecord(secret, envelope, binding);
      if (record.outcome !== "terminated_and_wiped" || binding.state === "released")
        throw new Error("Verified termination and workspace wipe are required.");
      if (
        database
          .prepare(
            "UPDATE workspace_worker_leases SET state='released' WHERE lease_id=? AND state!='released'",
          )
          .run(binding.leaseId).changes !== 1
      )
        throw new Error("Could not durably release worker lease.");
    },
  };
}
