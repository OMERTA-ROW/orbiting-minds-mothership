import { request as httpsRequest } from "node:https";
import { z } from "zod";
import { dispatchHmac } from "./jackboy-dispatch.server";

const contract = "jackboy.dispatch-callback/v2";
const path = "/api/public/omni/callback";
export const callbackSnapshotSchema = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().uuid(),
    grantId: z.string().uuid(),
    jobId: z.string().uuid(),
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .max(200),
    payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["quarantined", "cancelled"]),
  })
  .strict();

export async function sendDispatchCallback(
  config: { origin: string; ca: Buffer; clientId: string; secret: string },
  snapshot: z.infer<typeof callbackSnapshotSchema>,
) {
  const url = new URL(config.origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !config.ca.length ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.clientId) ||
    config.secret.length < 32
  )
    throw new Error("Invalid callback TLS or credential configuration.");
  const validated = callbackSnapshotSchema.parse(snapshot);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ contract, ...validated });
  const signature = await dispatchHmac(
    config.secret,
    `${contract}\nPOST\n${path}\n${config.clientId}\n${timestamp}\n${nonce}\n${body}`,
  );
  const response = await new Promise<{ status: number; body: string; proof: string }>(
    (resolve, reject) => {
      const request = httpsRequest(
        new URL(path, url),
        {
          method: "POST",
          ca: config.ca,
          timeout: 5000,
          headers: {
            "content-type": "application/json",
            "x-omni-contract": contract,
            "x-omni-client": config.clientId,
            "x-omni-timestamp": timestamp,
            "x-omni-nonce": nonce,
            "x-omni-signature": signature,
          },
        },
        (res) => {
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 8192) request.destroy(new Error("Callback response too large."));
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf8"),
              proof:
                typeof res.headers["x-omni-proof"] === "string" ? res.headers["x-omni-proof"] : "",
            }),
          );
        },
      );
      request.on("timeout", () => request.destroy(new Error("Callback timed out.")));
      request.on("error", reject);
      request.end(body);
    },
  );
  if (response.status !== 200) throw new Error(`Callback failed with HTTP ${response.status}.`);
  const expected = await dispatchHmac(
    config.secret,
    `${contract}\nresponse\n${nonce}\n200\n${response.body}`,
  );
  if (!/^[a-f0-9]{64}$/.test(response.proof)) throw new Error("Invalid callback proof.");
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++)
    mismatch |= expected.charCodeAt(i) ^ response.proof.charCodeAt(i);
  if (mismatch) throw new Error("Invalid callback proof.");
  z.object({
    contract: z.literal(contract),
    requestNonce: z.literal(nonce),
    status: z.literal(validated.status),
  })
    .strict()
    .parse(JSON.parse(response.body));
  return { status: validated.status };
}
