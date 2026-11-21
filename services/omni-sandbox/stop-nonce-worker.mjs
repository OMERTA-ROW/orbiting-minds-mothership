import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(workerData.database);
database.exec(`PRAGMA busy_timeout = ${workerData.busyTimeout}; PRAGMA synchronous = FULL`);
const find = database.prepare("SELECT 1 FROM nonces WHERE nonce=?");
const insert = database.prepare(
  "INSERT INTO nonces(nonce, seen_at) VALUES (?, ?) ON CONFLICT DO NOTHING",
);
parentPort.on("message", ({ id, nonce }) => {
  try {
    if (find.get(nonce)) {
      parentPort.postMessage({ id, accepted: false });
      return;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      const { changes } = insert.run(nonce, Date.now());
      database.exec("COMMIT");
      parentPort.postMessage({ id, accepted: changes === 1 });
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    parentPort.postMessage({ id, error: error.message, errcode: error.errcode });
  }
});
