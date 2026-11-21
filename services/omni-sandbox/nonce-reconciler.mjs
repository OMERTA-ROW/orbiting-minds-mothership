import { Worker } from "node:worker_threads";

export function nonceReconciler(database, busyTimeout) {
  const pending = new Map();
  let id = 0,
    failure;
  const worker = new Worker(new URL("./stop-nonce-worker.mjs", import.meta.url), {
    workerData: { database, busyTimeout },
    execArgv: process.execArgv.filter((arg) => !arg.startsWith("--input-type")),
  });
  const fail = (error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on("error", fail);
  worker.on("exit", (code) => fail(new Error(`Nonce reconciler exited (${code}).`)));
  worker.on("message", (reply) => {
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    if (reply.error)
      request.reject(Object.assign(new Error(reply.error), { errcode: reply.errcode }));
    else request.resolve(reply.accepted);
  });
  return {
    claim(nonce) {
      return new Promise((resolve, reject) => {
        if (failure) {
          reject(failure);
          return;
        }
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
        worker.postMessage({ id: requestId, nonce });
      });
    },
    close: () => worker.terminate(),
  };
}
