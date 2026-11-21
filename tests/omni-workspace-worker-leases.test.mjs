import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createWorkerLeases, signWorkerRecord } from "../services/omni-sandbox/worker-leases.mjs";

const identity = () => ({
  ownerId: randomUUID(),
  sessionId: randomUUID(),
  jobId: randomUUID(),
  projectId: "omni",
});
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-lease-"));
  const file = path.join(dir, "leases.sqlite");
  const db = new DatabaseSync(file);
  const pool = createWorkerLeases(db, ["one", "two"]);
  return {
    file,
    db,
    pool,
    close() {
      db.close();
      fs.rmSync(dir, { recursive: true });
    },
  };
}
test("exclusive worker allocation refuses exhaustion and duplicate session assignment", () => {
  const f = fixture();
  try {
    const owner = identity();
    const first = f.pool.claim(owner);
    assert.throws(() => f.pool.claim({ ...owner, jobId: randomUUID() }), /Session already/);
    const second = f.pool.claim(identity());
    assert.notEqual(first.workerId, second.workerId);
    assert.throws(() => f.pool.claim(identity()), /pool exhausted/);
  } finally {
    f.close();
  }
});
test("only a bound authenticated empty-and-wiped acknowledgement releases a lease", () => {
  const f = fixture();
  const key = "a".repeat(48);
  try {
    const lease = f.pool.claim(identity());
    const record = { ...lease, outcome: "terminated_and_wiped" };
    assert.throws(() => f.pool.release({ record, signature: "0".repeat(64) }, key), /signature/);
    const wrong = { ...record, ownerId: randomUUID() };
    assert.throws(
      () => f.pool.release({ record: wrong, signature: signWorkerRecord(key, wrong) }, key),
      /mismatch/,
    );
    const failed = { ...record, outcome: "cleanup_failed" };
    assert.throws(
      () => f.pool.release({ record: failed, signature: signWorkerRecord(key, failed) }, key),
      /wipe/,
    );
    f.pool.quarantine(lease.leaseId);
    f.pool.release({ record, signature: signWorkerRecord(key, record) }, key);
    assert.equal(f.pool.read(lease.leaseId).state, "released");
    assert.throws(
      () => f.pool.release({ record, signature: signWorkerRecord(key, record) }, key),
      /wipe/,
    );
  } finally {
    f.close();
  }
});
test("restart retains unfinished leases, never makes crashed workers available", () => {
  const f = fixture();
  try {
    const lease = f.pool.claim(identity());
    const other = new DatabaseSync(f.file);
    try {
      const recovered = createWorkerLeases(other, ["one", "two"]);
      assert.equal(recovered.unfinished()[0].leaseId, lease.leaseId);
      recovered.quarantine(lease.leaseId);
      recovered.claim(identity());
      assert.throws(() => recovered.claim(identity()), /pool exhausted/);
      assert.throws(() => createWorkerLeases(other, ["three"]), /durable registry/);
    } finally {
      other.close();
    }
  } finally {
    f.close();
  }
});
test("a released job cannot be claimed again under another lease or session", () => {
  const f = fixture();
  const secret = "k".repeat(48);
  try {
    const binding = f.pool.claim(identity());
    const record = { ...binding, outcome: "terminated_and_wiped" };
    f.pool.release({ record, signature: signWorkerRecord(secret, record) }, secret);
    assert.throws(() => f.pool.claim({ ...identity(), jobId: binding.jobId }), /durable claim/);
  } finally {
    f.close();
  }
});
test("concurrent processes cannot double-allocate either worker", async () => {
  const f = fixture();
  try {
    const module = new URL("../services/omni-sandbox/worker-leases.mjs", import.meta.url).href;
    const source = `
      import { DatabaseSync } from "node:sqlite";
      import { createWorkerLeases } from ${JSON.stringify(module)};
      const db = new DatabaseSync(process.argv[1]);
      try { console.log(JSON.stringify(createWorkerLeases(db, ["one","two"]).claim(JSON.parse(process.argv[2])))); }
      catch(e) { if (!e.message.includes("pool exhausted")) throw e; console.log("exhausted"); }
      finally { db.close(); }
    `;
    const results = await Promise.all(
      Array.from(
        { length: 8 },
        () =>
          new Promise((resolve, reject) => {
            const proc = spawn(process.execPath, [
              "--input-type=module",
              "-e",
              source,
              f.file,
              JSON.stringify(identity()),
            ]);
            let output = "",
              errors = "";
            proc.stdout.on("data", (part) => {
              output += part;
            });
            proc.stderr.on("data", (part) => {
              errors += part;
            });
            proc.once("error", reject);
            proc.once("exit", (code) =>
              code === 0 ? resolve(output.trim()) : reject(new Error(errors)),
            );
          }),
      ),
    );
    const claims = results.filter((line) => line !== "exhausted").map((line) => JSON.parse(line));
    assert.equal(claims.length, 2);
    assert.equal(new Set(claims.map((lease) => lease.workerId)).size, 2);
    assert.equal(results.filter((line) => line === "exhausted").length, 6);
  } finally {
    f.close();
  }
});
