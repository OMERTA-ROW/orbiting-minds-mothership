import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";

const CONTRACT = "omni.link/v2";
const PATH = "/api/public/omni/link";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SCOPES = ["jobs.cancel", "jobs.read", "protocol.self-test"];
type Action = "handshake" | "submit" | "run" | "status" | "cancel";
type JobAction = Exclude<Action, "handshake">;
type Config = {
  origin: string;
  ca: string | Buffer;
  clientId: string;
  projectId: string;
  bootstrap: string;
  secret: string;
  approvalExpiresAt: number;
};
type Audit = (event: string, jobId?: string) => Promise<void>;
type Reply = {
  contract: string;
  requestNonce: string;
  sessionToken?: string;
  expiresAt?: string;
  capabilities?: string[];
  ready?: boolean;
  job?: {
    id: string;
    status: string;
    result?: { passed: boolean; checks: number; runner: string } | null;
  };
};
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");

function assertConfig(c: Config) {
  const u = new URL(c.origin);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(c.clientId) ||
    !UUID.test(c.projectId) ||
    !/^[-_a-zA-Z0-9]{32,256}$/.test(c.bootstrap) ||
    c.secret.length < 32 ||
    c.secret === c.bootstrap ||
    !c.ca.length ||
    !Number.isFinite(c.approvalExpiresAt) ||
    c.approvalExpiresAt <= Date.now() ||
    c.approvalExpiresAt > Date.now() + 86400_000
  )
    throw new Error("Jackboy scoped link configuration is invalid or expired.");
}

export async function configuredJackboyLink(): Promise<Config> {
  if (process.env["JACKBOY_LINK_ENABLED"] !== "true") throw new Error("Jackboy link is disabled.");
  const caPath = process.env["JACKBOY_LINK_CA_FILE"];
  if (!caPath) throw new Error("Jackboy link CA is not configured.");
  const c: Config = {
    origin: process.env["JACKBOY_LINK_ORIGIN"] || "",
    ca: await readFile(caPath),
    clientId: process.env["OMNI_LINK_CLIENT_ID"] || "",
    projectId: process.env["OMNI_LINK_PROJECT_ID"] || "",
    bootstrap: process.env["OMNI_LINK_BOOTSTRAP_KEY"] || "",
    secret: process.env["OMNI_LINK_HMAC_SECRET"] || "",
    approvalExpiresAt: Date.parse(process.env["OMNI_LINK_APPROVAL_EXPIRES_AT"] || ""),
  };
  assertConfig(c);
  return c;
}

function post(c: Config, headers: Record<string, string>, body: string) {
  return new Promise<{ status: number; body: string; proof: string }>((resolve, reject) => {
    const req = httpsRequest(
      new URL(PATH, c.origin),
      { method: "POST", ca: c.ca, headers, timeout: 5000 },
      (res) => {
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 32768) req.destroy(new Error("response too large"));
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
    req.on("timeout", () => req.destroy(new Error("link timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

export class JackboyLink {
  private session = "";
  private expiresAt = 0;
  private readonly config: Config;
  private readonly audit: Audit;
  constructor(config: Config, audit: Audit) {
    this.config = config;
    this.audit = audit;
    assertConfig(config);
  }

  private async send(action: Action, token: string, jobId?: string): Promise<Reply> {
    assertConfig(this.config);
    const nonce = randomBytes(16).toString("hex");
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      action,
      projectId: this.config.projectId,
      ...(jobId ? { jobId } : {}),
      ...(action === "submit" ? { kind: "protocol.self-test" } : {}),
    });
    const message = `${CONTRACT}\nPOST\n${PATH}\n${ts}\n${nonce}\n${sha256(token)}\n${body}`;
    const result = await post(
      this.config,
      {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-omni-client": this.config.clientId,
        "x-omni-timestamp": ts,
        "x-omni-nonce": nonce,
        "x-omni-signature": hmac(this.config.secret, message),
      },
      body,
    );
    if (result.status === 401) throw new Error("Jackboy session rejected.");
    if (result.status !== 200 && result.status !== 202)
      throw new Error(`Jackboy request failed (HTTP ${result.status}).`);
    const expected = hmac(
      this.config.secret,
      `${CONTRACT}\nresponse\n${nonce}\n${result.status}\n${result.body}`,
    );
    const received = Buffer.from(result.proof, "utf8");
    const wanted = Buffer.from(expected, "utf8");
    if (received.length !== wanted.length || !timingSafeEqual(received, wanted))
      throw new Error("Jackboy response proof is invalid.");
    const reply: Reply = JSON.parse(result.body);
    if (reply.contract !== CONTRACT || reply.requestNonce !== nonce)
      throw new Error("Jackboy response contract is invalid.");
    if (
      jobId &&
      (reply.job?.id !== jobId ||
        !["queued", "running", "completed", "failed", "cancelled", "timed_out"].includes(
          reply.job.status,
        ))
    )
      throw new Error("Jackboy returned an invalid job.");
    return reply;
  }

  async connect() {
    if (this.session && this.expiresAt > Date.now() + 5000) return;
    this.session = "";
    await this.audit("connecting");
    const reply = await this.send("handshake", this.config.bootstrap);
    const expiry = Date.parse(reply.expiresAt || "");
    if (
      !/^[a-f0-9]{64}$/.test(reply.sessionToken || "") ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + 305_000 ||
      expiry > this.config.approvalExpiresAt + 5000 ||
      !reply.ready ||
      !Array.isArray(reply.capabilities) ||
      reply.capabilities.length !== SCOPES.length ||
      [...reply.capabilities].sort().join(",") !== SCOPES.join(",")
    )
      throw new Error("Jackboy session is not ready or is invalid.");
    await this.audit("connected");
    this.session = reply.sessionToken!;
    this.expiresAt = expiry;
  }

  async execute(action: JobAction, jobId: string) {
    if (!["submit", "run", "status", "cancel"].includes(action) || !UUID.test(jobId))
      throw new Error("Invalid scoped operation.");
    await this.audit(`request_${action}`, jobId);
    await this.connect();
    const reply = await this.send(action, this.session, jobId);
    await this.audit(`result_${reply.job!.status}`, jobId);
    const result = reply.job!.result;
    if (
      result != null &&
      (typeof result.passed !== "boolean" ||
        !Number.isInteger(result.checks) ||
        result.checks < 0 ||
        result.checks > 3 ||
        result.runner !== "restricted-protocol-self-test")
    )
      throw new Error("Jackboy returned an invalid self-test result.");
    return {
      id: reply.job!.id,
      status: reply.job!.status,
      result:
        result == null
          ? null
          : { passed: result.passed, checks: result.checks, runner: result.runner },
    };
  }
}
