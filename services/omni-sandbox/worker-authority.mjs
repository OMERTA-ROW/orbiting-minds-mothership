import { verifyWorkerRecord } from "./worker-leases.mjs";

export function renewableWorkerAuthority(secret, binding) {
  let sequence = -1;
  let deadline = 0;
  return (envelope) => {
    const record = verifyWorkerRecord(secret, envelope, binding);
    if (record.active !== true) throw new Error("Worker authority revoked or stopped.");
    if (!Number.isSafeInteger(record.sequence) || record.sequence < sequence)
      throw new Error("Worker authority replay.");
    const now = Date.now();
    if (
      !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt <= now ||
      record.expiresAt > now + 2000
    )
      throw new Error("Worker authority expired or exceeds its maximum lifetime.");
    if (record.sequence > sequence) {
      sequence = record.sequence;
      deadline = performance.now() + Math.min(2000, record.expiresAt - now);
    }
    if (performance.now() >= deadline) throw new Error("Worker authority renewal expired.");
    return record;
  };
}
