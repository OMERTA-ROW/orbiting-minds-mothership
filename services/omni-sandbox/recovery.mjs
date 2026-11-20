import fs from "node:fs";
import { delegatedCgroupRoot, openJobCgroupForRecovery } from "./cgroup.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT = /^[A-Za-z0-9_.:-]{1,80}$/;

export function createWorkspaceJournal(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspace_recovery_config (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      cgroup_parent TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_job_journal (
      job_id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('claimed', 'running', 'terminated')),
      updated_at INTEGER NOT NULL
    ) WITHOUT ROWID;
  `);
  const insert = database.prepare(`
    INSERT INTO workspace_job_journal (job_id, project_id, owner_id, session_id, state, updated_at)
    VALUES (?, ?, ?, ?, 'claimed', ?)
  `);
  return {
    claim({ projectId, ownerId, sessionId, jobId }) {
      if (
        typeof projectId !== "string" ||
        !PROJECT.test(projectId) ||
        typeof ownerId !== "string" ||
        !UUID.test(ownerId) ||
        typeof sessionId !== "string" ||
        !UUID.test(sessionId) ||
        typeof jobId !== "string" ||
        !UUID.test(jobId)
      )
        throw new Error("Invalid workspace job identity.");
      insert.run(jobId, projectId, ownerId, sessionId, Date.now());
    },
  };
}

/**
 * Requires an exclusive service lock for the whole lifetime of the service and a
 * dedicated cgroup parent associated with this journal. Never starts or resumes work.
 */
export async function recoverWorkspaceJobs(database, parent, projectId) {
  const root = delegatedCgroupRoot(parent);
  database
    .prepare(
      "INSERT INTO workspace_recovery_config (singleton, cgroup_parent) VALUES (1, ?) ON CONFLICT DO NOTHING",
    )
    .run(root);
  const config = database
    .prepare("SELECT cgroup_parent FROM workspace_recovery_config WHERE singleton = 1")
    .get();
  if (config?.cgroup_parent !== root)
    throw new Error("The delegated parent does not match the durable workspace journal.");

  const jobs = database
    .prepare("SELECT job_id, project_id, state FROM workspace_job_journal")
    .all();
  const byId = new Map(jobs.map((job) => [job.job_id, job]));
  const groups = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith("job-"));
  for (const entry of groups) {
    const id = entry.name.slice(4);
    if (!UUID.test(id) || !byId.has(id))
      throw new Error("Unrecognized job cgroup requires manual investigation.");
  }

  const present = new Set(groups.map((entry) => entry.name.slice(4)));
  const terminate = database.prepare(
    "UPDATE workspace_job_journal SET state = 'terminated', updated_at = ? WHERE job_id = ? AND state IN ('claimed', 'running')",
  );
  for (const job of jobs) {
    if (job.project_id !== projectId)
      throw new Error("Workspace journal contains a job from a different project.");
    if (!present.has(job.job_id)) {
      if (job.state !== "terminated")
        throw new Error("An unfinished workspace job has no cgroup; termination is unverified.");
      continue;
    }
    const group = openJobCgroupForRecovery(root, job.job_id);
    await group.stop();
    if (job.state !== "terminated" && terminate.run(Date.now(), job.job_id).changes !== 1)
      throw new Error("Could not durably record workspace termination.");
    group.remove();
  }
}
