import { z } from "zod";

const reply = z.object({
  ok: z.literal(true),
  job: z.string().uuid().nullable().optional(),
  durationMs: z.number().int().min(1000).max(30000).optional(),
  leaseMs: z.number().int().min(1000).max(5000).optional(),
});
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Outcome = "idle" | "completed" | "cancelled" | "completion_unconfirmed";

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error("cancelled"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** One bounded, side-effect-free synthetic job. Failures abort the actual running timer. */
export async function runNoopWorkerOnce(
  endpoint: string,
  token: string,
  fetcher: Fetch = fetch,
): Promise<Outcome> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Worker endpoint must be HTTPS without credentials or query.");
  if (!/^omni_worker_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid worker identity.");

  const send = async (payload: object) => {
    const started = performance.now();
    const res = await fetcher(url.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!res.ok) throw new Error("broker_refused");
    const value = reply.parse(await res.json());
    if (value.leaseMs && performance.now() - started >= value.leaseMs)
      throw new Error("lease_expired");
    return { ...value, deadline: value.leaseMs ? started + value.leaseMs : undefined };
  };

  const claim = await send({ action: "claim" });
  if (!claim.job) return "idle";
  if (!claim.durationMs || !claim.deadline) throw new Error("invalid_claim");
  const job = claim.job;
  const controller = new AbortController();
  let finished = false;
  let cancelled = false;
  let leaseLost = false;
  let leaseDeadline = claim.deadline;
  let leaseTimer: ReturnType<typeof setTimeout> | undefined;
  const armLease = (deadline: number) => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error("lease_expired");
    clearTimeout(leaseTimer);
    leaseDeadline = deadline;
    leaseTimer = setTimeout(() => {
      leaseLost = true;
      controller.abort();
    }, remaining);
  };
  const work = wait(claim.durationMs + 250, controller.signal).then(
    () => {
      finished = true;
    },
    () => {
      cancelled = true;
    },
  );
  try {
    armLease(claim.deadline);
    while (!finished && !cancelled) {
      await Promise.race([work, wait(1000)]);
      if (!finished && !cancelled) {
        const renewed = await send({ action: "heartbeat", job });
        if (leaseLost || performance.now() >= leaseDeadline) throw new Error("lease_expired");
        if (!renewed.deadline) throw new Error("lease_missing");
        armLease(renewed.deadline);
      }
    }
    if (cancelled || leaseLost || performance.now() >= leaseDeadline)
      throw new Error("lease_expired");
    await send({ action: "complete", job });
    if (leaseLost || performance.now() >= leaseDeadline) throw new Error("lease_expired");
    return "completed";
  } catch {
    controller.abort();
    await work;
    try {
      await send({ action: "cancel", job });
    } catch {
      // The broker may already have cancelled it or be unavailable. Its lease cannot be resumed.
    }
    return finished ? "completion_unconfirmed" : "cancelled";
  } finally {
    clearTimeout(leaseTimer);
  }
}
