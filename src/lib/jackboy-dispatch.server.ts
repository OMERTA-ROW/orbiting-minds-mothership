import { z } from "zod";

const CONTRACT = "jackboy.dispatch/v2";
const PATH = "/api/public/jackboy/dispatch";
const encoder = new TextEncoder();
const uuid = z.string().uuid();
const inputSchema = z
  .object({
    contract: z.literal(CONTRACT),
    action: z.enum(["submit", "status", "cancel"]),
    ownerId: uuid,
    projectId: uuid,
    grantId: uuid,
    jobId: uuid,
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .max(200),
    kind: z.literal("test"),
    payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type DispatchInput = z.infer<typeof inputSchema>;
type Store = (nonce: string, input: DispatchInput) => Promise<{ id: string; status: string }>;
type Config = { clientId: string; secret: string };

function config(): Config | null {
  if (process.env["JACKBOY_DISPATCH_ENABLED"] !== "true") return null;
  const clientId = process.env["JACKBOY_DISPATCH_CLIENT_ID"] || "";
  const secret = process.env["JACKBOY_DISPATCH_HMAC_SECRET"] || "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId) || secret.length < 32) return null;
  return { clientId, secret };
}

export async function dispatchHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function boundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 2000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new Error("body too large");
      }
      chunks.push(value);
    }
    if (timedOut) throw new Error("body timeout");
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

async function databaseStore(nonce: string, input: DispatchInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  type Rpc = (
    name: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const rpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as Rpc;
  const result = await rpc("jackboy_dispatch_quarantine", {
    _op: input.action,
    _nonce: nonce,
    _grant: input.grantId,
    _job: input.jobId,
    _owner: input.ownerId,
    _project: input.projectId,
    _repo: input.repo,
    _kind: input.kind,
    _digest: input.payloadDigest,
  });
  if (result.error) throw new Error("Dispatch transaction failed.");
  return z.object({ id: uuid, status: z.enum(["quarantined", "cancelled"]) }).parse(result.data);
}

export async function handleJackboyDispatch(
  request: Request,
  settings: Config | null = config(),
  store: Store = databaseStore,
): Promise<Response> {
  const deny = (status: number, error: string) =>
    Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  if (!settings) return deny(503, "dispatch_disabled");
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.pathname !== PATH || url.search || request.method !== "POST")
    return deny(400, "https_post_required");
  const client = request.headers.get("x-jackboy-client") || "";
  const timestamp = request.headers.get("x-jackboy-timestamp") || "";
  const nonce = request.headers.get("x-jackboy-nonce") || "";
  const signature = request.headers.get("x-jackboy-signature") || "";
  if (
    client !== settings.clientId ||
    !/^[0-9]{10}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp) * 1000) > 60_000 ||
    !/^[a-f0-9]{32}$/.test(nonce)
  )
    return deny(401, "authentication_failed");
  let raw: string;
  try {
    raw = await boundedBody(request);
  } catch {
    return deny(400, "invalid_body");
  }
  const expected = await dispatchHmac(
    settings.secret,
    `${CONTRACT}\nPOST\n${PATH}\n${client}\n${timestamp}\n${nonce}\n${raw}`,
  );
  if (!equalHex(signature, expected)) return deny(401, "authentication_failed");
  let input: DispatchInput;
  try {
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return deny(400, "invalid_request");
  }
  try {
    const job = await store(nonce, input);
    if (job.id !== input.jobId || !["quarantined", "cancelled"].includes(job.status))
      throw new Error("Invalid stored job.");
    const status = input.action === "submit" && job.status === "quarantined" ? 202 : 200;
    const body = JSON.stringify({ contract: CONTRACT, requestNonce: nonce, job });
    const proof = await dispatchHmac(
      settings.secret,
      `${CONTRACT}\nresponse\n${nonce}\n${status}\n${body}`,
    );
    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Jackboy-Proof": proof,
      },
    });
  } catch {
    return deny(503, "dispatch_unavailable");
  }
}
