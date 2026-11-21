import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

if (process.platform !== "linux" || process.env.OMNI_WORKSPACE_WORKER_SMOKE !== "1")
  throw new Error("This smoke check requires a disposable Linux fixture.");
const timestamp = process.env.OMNI_WORKER_SMOKE_TIMESTAMP;
if (!/^\d{10}$/.test(timestamp ?? ""))
  throw new Error("A request-bound fixture timestamp is required.");
const phase = process.argv[2];
if (!["claim", "replay"].includes(phase)) throw new Error("Invalid smoke phase.");
const secret = "t".repeat(48);
const nonce = "a".repeat(32);
const route = "/api/public/omni/workspace";
const raw = JSON.stringify({
  action: "session.start", projectId: "omni", ownerId: "f1b3d943-c6ee-4ed1-abce-f08ba1493734",
  sessionId: "a1b3d943-c6ee-4ed1-abce-f08ba1493734", agentId: "omni", provider: "none",
});
const signature = createHmac("sha256", secret)
  .update(`omni.workspace/v1\nPOST\n${route}\n${timestamp}\n${nonce}\n${createHash("sha256").update(raw).digest("hex")}`)
  .digest("hex");
const response = await fetch(`http://127.0.0.1:18801${route}`, {
  method: "POST", body: raw, headers: {
    "x-omni-client": "mothership-test", "x-omni-timestamp": timestamp,
    "x-omni-nonce": nonce, "x-omni-signature": signature,
  },
});
assert.equal(response.status, phase === "claim" ? 409 : 401);
if (phase === "claim") {
  const text = await response.text();
  assert.match(JSON.parse(text).error, /Workspace execution is disabled/);
  assert.equal(response.headers.get("x-omni-proof"), createHmac("sha256", secret)
    .update(`omni.workspace/v1\nresponse\n${nonce}\n409\n${text}`).digest("hex"));
}
console.log(`Packaged entrypoint ${phase}: passed (execution remains refused).`);
