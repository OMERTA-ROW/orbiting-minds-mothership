// @vitest-environment node
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordBootObservation,
  trackReplayEvidence,
} from "../services/omni-sandbox/health-evidence.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const identity = {
  machine: "a".repeat(32),
  boot: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pathHash: "b".repeat(64),
};

test("reboot observations require the same machine and state path across different boots", () => {
  const db = new DatabaseSync(":memory:");
  try {
    assert.equal(recordBootObservation(db, identity), "not_observed");
    assert.equal(recordBootObservation(db, identity), "not_observed");
    const after = { ...identity, boot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    assert.equal(recordBootObservation(db, after), "observed");
    assert.equal(recordBootObservation(db, after), "observed");
    assert.equal(recordBootObservation(db, { ...after, pathHash: "c".repeat(64) }), "not_observed");
    assert.equal(recordBootObservation(db, { ...after, machine: "d".repeat(32) }), "not_observed");
    assert.equal(recordBootObservation(db, { ...after, boot: "" }), "unavailable");
  } finally {
    db.close();
  }
});

test("the marker survives reopening its SQLite file but does not assert persistence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-health-test-"));
  const file = path.join(dir, "health.sqlite");
  let db = new DatabaseSync(file);
  try {
    assert.equal(recordBootObservation(db, identity), "not_observed");
    db.close();
    db = new DatabaseSync(file);
    assert.equal(
      recordBootObservation(db, { ...identity, boot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      "observed",
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("replaced or missing SQLite files make the prior observation unavailable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-health-test-"));
  const file = path.join(dir, "health.sqlite");
  const db = new DatabaseSync(file);
  try {
    const report = trackReplayEvidence(db, file);
    assert.equal(report().stateFile, "same_file");
    fs.renameSync(file, path.join(dir, "original.sqlite"));
    fs.writeFileSync(file, "replacement");
    assert.equal(report().stateFile, "changed_or_unavailable");
    assert.equal(report().rebootObservation, "unavailable");
    fs.unlinkSync(file);
    assert.equal(report().stateFile, "changed_or_unavailable");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
