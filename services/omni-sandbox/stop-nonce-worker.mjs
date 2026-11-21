import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(workerData.database);
database.exec(`PRAGMA busy_timeout = ${workerData.busyTimeout}; PRAGMA synchronous = FULL`);
const find = database.prepare("SELECT 1 FROM nonces WHERE nonce=?");
const insert = database.prepare(
  "INSERT INTO nonces(nonce, seen_at) VALUES (?, ?) ON CONFLICT DO NOTHING",
);
let unavailable;
parentPort.on("message", ({ id, nonce }) => {
  let phase = "committed lookup";
  try {
    if (unavailable) throw unavailable;
    if (find.get(nonce)) {
      parentPort.postMessage({ id, accepted: false });
      return;
    }
    phase = "writer acquisition";
    database.exec("BEGIN IMMEDIATE");
    try {
      phase = "insert";
      const { changes } = insert.run(nonce, Date.now());
      phase = "commit";
      database.exec("COMMIT");
      parentPort.postMessage({ id, accepted: changes === 1 });
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch (rollbackError) {
        unavailable = rollbackError;
        phase = "rollback";
        throw rollbackError;
      }
      throw error;
    }
  } catch (error) {
    if (error.errcode === 5 && !unavailable) {
      let committed, lookupError;
      try {
        // One read reconciles a completed competing claim; no write is retried.
        database.exec("PRAGMA busy_timeout = 0");
        committed = find.get(nonce);
      } catch (failure) {
        lookupError = failure;
      } finally {
        try {
          database.exec(`PRAGMA busy_timeout = ${workerData.busyTimeout}`);
        } catch (failure) {
          unavailable = failure;
          lookupError = failure;
        }
      }
      if (lookupError) {
        parentPort.postMessage({
          id,
          error: lookupError.message,
          errcode: lookupError.errcode,
          phase: "post-contention committed lookup",
        });
        return;
      }
      if (committed) {
        parentPort.postMessage({ id, accepted: false });
        return;
      }
    }
    parentPort.postMessage({ id, error: error.message, errcode: error.errcode, phase });
  }
});
