import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Uses the hosting platform's standard fetch: the server certificate is checked
// against public trust automatically. There is deliberately no option to supply a
// custom CA or to disable certificate verification. Redirects are refused.

const CONTRACT = "omni.link/v2";
const PATH = "/api/public/omni/link";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SCOPES = ["jobs.cancel", "jobs.read", "protocol.self-test"];
const MAX_REPLY_BYTES = 32768;
const TIMEOUT_MS = 5000;
type Action = "handshake" | "submit" | "run" | "status" | "cancel" | "configuration";
type JobAction = Exclude<Action, "handshake" | "configuration">;
export type JackboyLinkConfig = {
  origin: string;
  clientId: string;
  projectId: string;
  bootstrap: string;
  secret: string;
  approvalExpiresAt: number;
};
type LinkIdentity = Omit<JackboyLinkConfig, "approvalExpiresAt">;
export type JackboyConfigurationConfig = LinkIdentity & { runnerOrigin: string };
type Fetch = (input: string, init: RequestInit) => Promise<Response>;
/** Test seam only; never populated from environment settings. */
export type JackboyLinkOptions = { fetch?: Fetch; timeoutMs?: number };
type Audit = (event: string, jobId?: string) => Promise<void>;
type Reply = {
  contract: string;
  requestNonce: string;
  sessionToken?: string;
  expiresAt?: string;
  capabilities?: string[];
  ready?: boolean;
  projectId?: string;
  execution?: string;
  configuration?: unknown;
  job?: {
    id: string;
    status: string;
    result?: { passed: boolean; checks: number; runner: string } | null;
  };
};
/** Nonsecret reason codes Jackboy returns on refusal; anything else is reported as unrecognized. */
export const JACKBOY_REFUSAL_CODES = [
  "link_disabled",
  "configuration_check_unavailable",
  "authentication_failed",
  "project_or_action_denied",
  "configuration_scope_denied",
  "https_post_required",
  "invalid_request",
] as const;
export type JackboyRefusalCode = (typeof JACKBOY_REFUSAL_CODES)[number];
export type JackboyFailureStage =
  | "audit"
  | "connection"
  | "timeout"
  | "redirect"
  | "too_large"
  | "http"
  | "proof"
  | "contract"
  | "runner_mismatch";

/** A link failure with a safe stage, HTTP status and allowlisted refusal code; never reply contents. */
export class JackboyLinkError extends Error {
  readonly stage: JackboyFailureStage;
  readonly status: number | undefined;
  readonly code: JackboyRefusalCode | undefined;
  constructor(
    message: string,
    stage: JackboyFailureStage,
    extra: { status?: number; code?: JackboyRefusalCode } = {},
  ) {
    super(message);
    this.name = "JackboyLinkError";
    this.stage = stage;
    this.status = extra.status;
    this.code = extra.code;
  }
}

/** Only an exact allowlisted `{ "error": code }` is kept. */
export function refusalCode(body: string): JackboyRefusalCode | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const code = (parsed as { error?: unknown }).error;
    return (JACKBOY_REFUSAL_CODES as readonly unknown[]).includes(code)
      ? (code as JackboyRefusalCode)
      : undefined;
  } catch {
    return undefined;
  }
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");

function assertIdentity(c: LinkIdentity) {
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
    c.secret === c.bootstrap
  )
    throw new Error("Jackboy scoped link identity is invalid.");
}

function assertConfig(c: JackboyLinkConfig) {
  assertIdentity(c);
  if (
    !Number.isFinite(c.approvalExpiresAt) ||
    c.approvalExpiresAt <= Date.now() ||
    c.approvalExpiresAt > Date.now() + 86400_000
  )
    throw new Error("Jackboy scoped link configuration is invalid or expired.");
}

const PRIVATE_SUFFIXES = [".localhost", ".internal", ".local", ".lan", ".home.arpa"];

/** Configured origins must be public HTTPS DNS names on the default port. */
export function assertPublicLinkOrigin(origin: string) {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    throw new Error("Jackboy link address must be a public HTTPS address.");
  }
  const host = u.hostname.toLowerCase();
  if (
    u.protocol !== "https:" ||
    u.port !== "" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !host.includes(".") ||
    host === "localhost" ||
    PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[") ||
    host.includes(":")
  )
    throw new Error("Jackboy link address must be a public HTTPS address.");
}

export async function configuredJackboyLink(): Promise<JackboyLinkConfig> {
  if (process.env["JACKBOY_LINK_ENABLED"] !== "true") throw new Error("Jackboy link is disabled.");
  const c: JackboyLinkConfig = {
    origin: process.env["JACKBOY_LINK_ORIGIN"] || "",
    clientId: process.env["OMNI_LINK_CLIENT_ID"] || "",
    projectId: process.env["OMNI_LINK_PROJECT_ID"] || "",
    bootstrap: process.env["OMNI_LINK_BOOTSTRAP_KEY"] || "",
    secret: process.env["OMNI_LINK_HMAC_SECRET"] || "",
    approvalExpiresAt: Date.parse(process.env["OMNI_LINK_APPROVAL_EXPIRES_AT"] || ""),
  };
  assertPublicLinkOrigin(c.origin);
  assertConfig(c);
  return c;
}

export function configuredJackboyConfiguration(): JackboyConfigurationConfig {
  const c = {
    origin: process.env["JACKBOY_LINK_ORIGIN"] || "",
    runnerOrigin: process.env["JACKBOY_LINK_RUNNER_ORIGIN"] || "",
    clientId: process.env["OMNI_LINK_CLIENT_ID"] || "",
    projectId: process.env["OMNI_LINK_PROJECT_ID"] || "",
    bootstrap: process.env["OMNI_LINK_BOOTSTRAP_KEY"] || "",
    secret: process.env["OMNI_LINK_HMAC_SECRET"] || "",
  };
  assertPublicLinkOrigin(c.origin);
  assertPublicLinkOrigin(c.runnerOrigin);
  assertIdentity(c);
  if (new URL(c.origin).origin === new URL(c.runnerOrigin).origin)
    throw new Error("Jackboy and runner origins must be separate.");
  return c;
}

export async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REPLY_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new JackboyLinkError("Jackboy response too large.", "too_large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REPLY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new JackboyLinkError("Jackboy response too large.", "too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

async function post(
  c: LinkIdentity,
  options: JackboyLinkOptions,
  headers: Record<string, string>,
  body: string,
) {
  const send: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  let response: Response;
  try {
    response = await send(new URL(PATH, c.origin).href, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      throw new JackboyLinkError("Jackboy link timeout.", "timeout");
    throw new JackboyLinkError("Jackboy link connection failed.", "connection");
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => {});
    throw new JackboyLinkError("Jackboy link refused a redirect.", "redirect");
  }
  let text: string;
  try {
    text = await readCapped(response);
  } catch (error) {
    if (error instanceof JackboyLinkError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      throw new JackboyLinkError("Jackboy link timeout.", "timeout");
    throw new JackboyLinkError("Jackboy link connection failed.", "connection");
  }
  return { status: response.status, body: text, proof: response.headers.get("x-omni-proof") || "" };
}

async function sendSigned(
  config: LinkIdentity,
  options: JackboyLinkOptions,
  action: Action,
  token: string,
  jobId?: string,
): Promise<Reply> {
  const nonce = randomBytes(16).toString("hex");
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    action,
    projectId: config.projectId,
    ...(jobId ? { jobId } : {}),
    ...(action === "submit" ? { kind: "protocol.self-test" } : {}),
  });
  const message = `${CONTRACT}\nPOST\n${PATH}\n${ts}\n${nonce}\n${sha256(token)}\n${body}`;
  const result = await post(
    config,
    options,
    {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-omni-client": config.clientId,
      "x-omni-timestamp": ts,
      "x-omni-nonce": nonce,
      "x-omni-signature": hmac(config.secret, message),
    },
    body,
  );
  if (result.status !== 200 && result.status !== 202) {
    const code = refusalCode(result.body);
    const extra = code ? { status: result.status, code } : { status: result.status };
    if (result.status === 401) throw new JackboyLinkError("Jackboy session rejected.", "http", extra);
    throw new JackboyLinkError(`Jackboy request failed (HTTP ${result.status}).`, "http", extra);
  }
  const expected = hmac(
    config.secret,
    `${CONTRACT}\nresponse\n${nonce}\n${result.status}\n${result.body}`,
  );
  const received = Buffer.from(result.proof, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted))
    throw new JackboyLinkError("Jackboy response proof is invalid.", "proof");
  let reply: Reply;
  try {
    reply = JSON.parse(result.body);
  } catch {
    throw new JackboyLinkError("Jackboy response is not valid JSON.", "contract");
  }
  if (!reply || typeof reply !== "object" || Array.isArray(reply))
    throw new JackboyLinkError("Jackboy response contract is invalid.", "contract");
  if (reply.contract !== CONTRACT || reply.requestNonce !== nonce)
    throw new JackboyLinkError("Jackboy response contract is invalid.", "contract");
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

const runnerConfigurationSchema = z
  .object({
    runnerOrigin: z.string(),
    runnerMode: z.boolean(),
    nodeRunnerEnabled: z.boolean(),
    remoteRunnerSecretConfigured: z.boolean(),
    runtimeAvailable: z.boolean(),
  })
  .strict()
  .nullable();

export async function checkJackboyRunnerConfiguration(
  c: JackboyConfigurationConfig,
  audit: Audit,
  options: JackboyLinkOptions = {},
) {
  assertIdentity(c);
  assertPublicLinkOrigin(c.origin);
  assertPublicLinkOrigin(c.runnerOrigin);
  if (new URL(c.origin).origin === new URL(c.runnerOrigin).origin)
    throw new Error("Jackboy and runner origins must be separate.");
  await audit("request_configuration");
  const reply = await sendSigned(c, options, "configuration", c.bootstrap);
  const parsed = runnerConfigurationSchema.safeParse(reply.configuration);
  if (!parsed.success || reply.execution !== "none" || reply.projectId !== c.projectId)
    throw new JackboyLinkError("Jackboy configuration response is invalid.", "contract");
  if (parsed.data && parsed.data.runnerOrigin !== new URL(c.runnerOrigin).origin)
    throw new JackboyLinkError("Jackboy configuration targets a different runner.", "runner_mismatch");
  await audit(parsed.data ? "configuration_verified" : "configuration_unavailable");
  return parsed.data;
}

export class JackboyLink {
  private session = "";
  private expiresAt = 0;
  private readonly config: JackboyLinkConfig;
  private readonly audit: Audit;
  private readonly options: JackboyLinkOptions;
  constructor(config: JackboyLinkConfig, audit: Audit, options: JackboyLinkOptions = {}) {
    this.config = config;
    this.audit = audit;
    this.options = options;
    assertConfig(config);
  }

  private async send(action: Action, token: string, jobId?: string): Promise<Reply> {
    assertConfig(this.config);
    return sendSigned(this.config, this.options, action, token, jobId);
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
