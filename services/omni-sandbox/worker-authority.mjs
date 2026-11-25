import { verifySessionRecord, verifyWorkerRecord } from "./worker-leases.mjs";

function renewableAuthority(secret, binding, verify, permanentRevocation = false) {
  let sequence = -1;
  let deadline = 0;
  let revoked = false;
  return (envelope) => {
    if (revoked) throw new Error("Worker authority already revoked.");
    try {
      const record = verify(secret, envelope, binding);
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
    } catch (error) {
      revoked = permanentRevocation;
      throw error;
    }
  };
}

export function renewableWorkerAuthority(secret, binding) {
  return renewableAuthority(secret, binding, verifyWorkerRecord);
}

export function renewableSessionAuthority(secret, binding) {
  return renewableAuthority(
    secret,
    binding,
    (key, envelope, identity) => {
      const record = verifySessionRecord(key, envelope, identity);
      if (record.kind !== "session_authority") throw new Error("Invalid session authority kind.");
      return record;
    },
    true,
  );
}
