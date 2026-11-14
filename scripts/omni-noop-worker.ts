import { runNoopWorkerOnce } from "../src/lib/omni-noop-worker";

const endpoint = process.env["OMNI_NOOP_BROKER_URL"] ?? "";
const token = process.env["OMNI_NOOP_WORKER_TOKEN"] ?? "";
try {
  const outcome = await runNoopWorkerOnce(endpoint, token);
  console.log(`No-op worker: ${outcome}`);
  if (outcome === "cancelled" || outcome === "completion_unconfirmed") process.exitCode = 1;
} catch {
  console.error("No-op worker could not start.");
  process.exitCode = 1;
}
