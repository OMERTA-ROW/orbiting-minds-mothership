import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  boundDecision,
  createCommandClaims,
  createDecisionClaims,
} from "../services/omni-sandbox/server.mjs";
import { createWorkspaceJournal } from "../services/omni-sandbox/recovery.mjs";

const ownerId = randomUUID();
const sessionId = randomUUID();
const jobId = randomUUID();
const job = { id: jobId, state: "awaiting_approval", pending: { kind: "command" } };
const session = { id: sessionId, ownerId, jobs: new Map([[jobId, job]]) };
const decision = { projectId: "omni", ownerId, sessionId, jobId, approve: true };

test("a decision must match its owner, project, session and pending job", () => {
  assert.equal(boundDecision("omni", session, decision), job);
  for (const change of [
    { ownerId: randomUUID() },
    { ownerId: undefined },
    { projectId: "other" },
    { sessionId: randomUUID() },
    { jobId: randomUUID() },
    { approve: "true" },
  ]) {
    assert.throws(() => boundDecision("omni", session, { ...decision, ...change }));
  }
});

test("a consumed or non-pending decision cannot be reused", () => {
  const consumed = { ...job, pending: null };
  assert.throws(() =>
    boundDecision("omni", { ...session, jobs: new Map([[jobId, consumed]]) }, decision),
  );
  const running = { ...job, state: "running" };
  assert.throws(() =>
    boundDecision("omni", { ...session, jobs: new Map([[jobId, running]]) }, decision),
  );
});

test("decision claims survive reopening and are shared by independent database connections", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-decision-"));
  const file = path.join(dir, "claims.sqlite");
  let first;
  let second;
  try {
    first = new DatabaseSync(file);
    second = new DatabaseSync(file);
    const claimFirst = createDecisionClaims(first);
    const claimSecond = createDecisionClaims(second);
    const request = { ...decision, stepId: "cmd" };
    assert.equal(claimFirst(request), true);
    assert.equal(claimSecond(request), false);
    assert.equal(claimSecond({ ...request, ownerId: randomUUID() }), false);
    assert.equal(claimSecond({ ...request, jobId: randomUUID() }), true);
    first.close();
    first = undefined;
    second.close();
    second = undefined;
    first = new DatabaseSync(file);
    assert.equal(createDecisionClaims(first)(request), false);
  } finally {
    first?.close();
    second?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent processes cannot both claim the same decision", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-decision-race-"));
  const file = path.join(dir, "claims.sqlite");
  const db = new DatabaseSync(file);
  createDecisionClaims(db);
  db.close();
  const serviceUrl = new URL("../services/omni-sandbox/server.mjs", import.meta.url).href;
  const script = `
    import { DatabaseSync } from "node:sqlite";
    import { createDecisionClaims } from ${JSON.stringify(serviceUrl)};
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL");
    const claimed = createDecisionClaims(db)(JSON.parse(process.argv[2]));
    db.close();
    console.log(claimed ? "claimed" : "duplicate");
  `;
  const request = JSON.stringify({ ...decision, stepId: "cmd" });
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, file, request]);
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (errors += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(output.trim()) : reject(new Error(`Worker failed: ${errors}`)),
      );
    });
  try {
    assert.deepEqual((await Promise.all([run(), run()])).sort(), ["claimed", "duplicate"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an owner-bound command decision and job claim commit together", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const claim = createCommandClaims(db);
    const request = { ...decision, stepId: "cmd" };
    assert.throws(() => claim("omni", session, { ...request, ownerId: randomUUID() }));
    assert.throws(() => claim("omni", session, { ...request, stepId: "other" }));
    assert.throws(() => claim("omni", session, { ...request, approve: false }));
    assert.equal(claim("omni", session, request), true);
    assert.equal(claim("omni", session, request), false);
    const row = db
      .prepare("SELECT owner_id, project_id, session_id, job_id, state FROM workspace_job_journal")
      .get();
    assert.deepEqual(
      { ...row },
      {
        owner_id: ownerId,
        project_id: "omni",
        session_id: sessionId,
        job_id: jobId,
        state: "claimed",
      },
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_claims").get().n, 1);
  } finally {
    db.close();
  }
});

test("a failed job claim rolls back its decision claim", () => {
  const db = new DatabaseSync(":memory:");
  try {
    createWorkspaceJournal(db).claim(decision);
    const claim = createCommandClaims(db);
    assert.throws(() => claim("omni", session, { ...decision, stepId: "cmd" }));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_claims").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workspace_job_journal").get().n, 1);
  } finally {
    db.close();
  }
});

test("concurrent processes commit only one combined decision and job claim", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-command-claim-race-"));
  const file = path.join(dir, "claims.sqlite");
  const db = new DatabaseSync(file);
  createCommandClaims(db);
  db.close();
  const serviceUrl = new URL("../services/omni-sandbox/server.mjs", import.meta.url).href;
  const request = JSON.stringify({ ...decision, stepId: "cmd" });
  const script = `
    import { DatabaseSync } from "node:sqlite";
    import { createCommandClaims } from ${JSON.stringify(serviceUrl)};
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL");
    const request = JSON.parse(process.argv[2]);
    const job = { id: request.jobId, state: "awaiting_approval", pending: { kind: "command" } };
    const session = { id: request.sessionId, ownerId: request.ownerId, jobs: new Map([[job.id, job]]) };
    console.log(createCommandClaims(db)(request.projectId, session, request) ? "claimed" : "duplicate");
    db.close();
  `;
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, file, request]);
      let output = "";
      let errors = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (errors += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(output.trim()) : reject(new Error(`Worker failed: ${errors}`)),
      );
    });
  try {
    assert.deepEqual((await Promise.all([run(), run()])).sort(), ["claimed", "duplicate"]);
    const reopened = new DatabaseSync(file);
    try {
      assert.equal(reopened.prepare("SELECT COUNT(*) AS n FROM decision_claims").get().n, 1);
      assert.equal(reopened.prepare("SELECT COUNT(*) AS n FROM workspace_job_journal").get().n, 1);
    } finally {
      reopened.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
