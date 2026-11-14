import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { linkIdentityIssues } from "./activation-self-test";

// Uses the hosting platform's standard fetch: the server certificate is checked
// against public trust automatically. There is deliberately no option to supply a
// custom CA or to disable certificate verification. Redirects are refused.

const CONTRACT = "omni.link/v2";
const PATH = "/api/public/omni/link";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SCOPES = ["jobs.cancel", "jobs.read", "protocol.self-test"];
const MAX_REPLY_BYTES = 32768;
const TIMEOUT_MS = 5000;
export type JackboyAction =
  | "handshake"
  | "submit"
  | "run"
  | "status"
  | "cancel"
  | "configuration"
  /** Jackboy omni.permit/v1 actions (session-token signed; the bootstrap key is refused). */
  | "safety"
  | "permit.request"
  | "permit.release";
type Action = JackboyAction;
type JobAction = Exclude<Action, "handshake" | "configuration" | "safety" | "permit.request" | "permit.release">;
/**
 * How long Jackboy itself waits for its Railway runner before answering (mirrors Jackboy's
 * omni-remote-runner: 5 s for the configuration probe, runner limit + 1 s for a `run`).
 */
export const JACKBOY_RUNNER_WAIT_MS = { configuration: 5000, run: 6000 } as const;
/** Room for Jackboy's own start-up, database authorization and reply signing. */
export const JACKBOY_REPLY_HEADROOM_MS = 4000;
/**
 * Mothership's deadline per action. Actions where Jackboy waits on the runner get a longer
 * deadline than Jackboy's own wait, so Jackboy's signed answer (for example "runner did not
 * answer") arrives instead of Mothership giving up first with an unclassified timeout.
 */
export function linkTimeoutMs(action: JackboyAction): number {
  if (action === "configuration" || action === "run")
    return JACKBOY_RUNNER_WAIT_MS[action] + JACKBOY_REPLY_HEADROOM_MS;
  return TIMEOUT_MS;
}
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
  safety?: unknown;
  permit?: unknown;
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
  /** Proposed for Jackboy: a distinct safety denial while its global Kill Switch is on. */
  "kill_switch_on",
  "https_post_required",
  "invalid_request",
  /** Jackboy session refusals (omni.link sessions): nonsecret, no reply contents kept. */
  "grant_unavailable",
  "project_denied",
  "session_limit",
  "session_expired_or_invalid",
  "concurrency_limit",
  "runner_unavailable",
  /** omni.permit/v1 refusals (Jackboy's permit service). */
  "permit_denied",
  "permit_service_unavailable",
  "permit_not_found",
  "replay",
  "action_denied",
  "job_required",
  "scope_invalid",
] as const;
/** Nonsecret permit refusal reasons Jackboy documents for `permit_denied`. */
export const PERMIT_REFUSAL_REASONS = [
  "kill_switch_on",
  "emergency_stop_engaged",
  "code_disabled",
  "not_authorized",
  "approval_expired",
  "owner_scope",
  "scope_invalid",
  "scope_mismatch",
  "job_closed",
  "permit_lapsed",
  "concurrency_limit",
  "daily_limit",
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
  /** Timeout only: the deadline that expired, how long was waited, and whether any reply had begun. */
  readonly limitMs: number | undefined;
  readonly waitedMs: number | undefined;
  readonly phase: "reply" | "body" | undefined;
  /** Permit refusals only: Jackboy's allowlisted reason (advisory; a refusal always fails closed). */
  readonly reason: string | undefined;
  constructor(
    message: string,
    stage: JackboyFailureStage,
    extra: {
      status?: number;
      code?: JackboyRefusalCode;
      limitMs?: number;
      waitedMs?: number;
      phase?: "reply" | "body";
      reason?: string;
    } = {},
  ) {
    super(message);
    this.name = "JackboyLinkError";
    this.stage = stage;
    this.status = extra.status;
    this.code = extra.code;
    this.limitMs = extra.limitMs;
    this.waitedMs = extra.waitedMs;
    this.phase = extra.phase;
    this.reason = extra.reason;
  }
}

/** The allowlisted `reason` of a permit refusal, if any. */
export function permitReason(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    const reason = (parsed as { reason?: unknown } | null)?.reason;
    return (PERMIT_REFUSAL_REASONS as readonly unknown[]).includes(reason) ? (reason as string) : undefined;
  } catch {
    return undefined;
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

/** Whether the configured link identity settings are present and well-formed; values never leave. */
export function configuredLinkIdentityValid(): boolean {
  try {
    assertIdentity({
      origin: process.env["JACKBOY_LINK_ORIGIN"] || "",
      clientId: process.env["OMNI_LINK_CLIENT_ID"] || "",
      projectId: process.env["OMNI_LINK_PROJECT_ID"] || "",
      bootstrap: process.env["OMNI_LINK_BOOTSTRAP_KEY"] || "",
      secret: process.env["OMNI_LINK_HMAC_SECRET"] || "",
    });
    return true;
  } catch {
    return false;
  }
}

/** Names (never values) of link identity settings that are missing or malformed here. */
export function configuredLinkIdentityIssues() {
  return linkIdentityIssues({
    origin: process.env["JACKBOY_LINK_ORIGIN"] || "",
    clientId: process.env["OMNI_LINK_CLIENT_ID"] || "",
    projectId: process.env["OMNI_LINK_PROJECT_ID"] || "",
    bootstrap: process.env["OMNI_LINK_BOOTSTRAP_KEY"] || "",
    secret: process.env["OMNI_LINK_HMAC_SECRET"] || "",
  });
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

/** Abort reasons may be DOMExceptions, which are not `Error` instances on every runtime. */
const isAbort = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  ["TimeoutError", "AbortError"].includes(String((error as { name?: unknown }).name));

async function post(
  c: LinkIdentity,
  options: JackboyLinkOptions,
  headers: Record<string, string>,
  body: string,
  action: Action,
) {
  const send: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const limitMs = options.timeoutMs ?? linkTimeoutMs(action);
  const started = Date.now();
  const timedOut = (phase: "reply" | "body") =>
    new JackboyLinkError("Jackboy link timeout.", "timeout", {
      limitMs,
      waitedMs: Date.now() - started,
      phase,
    });
  let response: Response;
  try {
    response = await send(new URL(PATH, c.origin).href, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(limitMs),
    });
  } catch (error) {
    if (isAbort(error))
      throw timedOut("reply");
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
    if (isAbort(error))
      throw timedOut("body");
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
  return (await sendSignedRaw(config, options, action, token, jobId)).reply;
}

type ExtraFields = Record<string, string | number>;

/** Like sendSigned, also returning a digest of the verified reply proof (for evidence records). */
async function sendSignedRaw(
  config: LinkIdentity,
  options: JackboyLinkOptions,
  action: Action,
  token: string,
  jobId?: string,
  fields: ExtraFields = {},
): Promise<{ reply: Reply; proofDigest: string }> {
  const nonce = randomBytes(16).toString("hex");
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    action,
    projectId: config.projectId,
    ...(jobId ? { jobId } : {}),
    ...(action === "submit" ? { kind: "protocol.self-test" } : {}),
    ...fields,
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
    action,
  );
  if (result.status !== 200 && result.status !== 202) {
    const code = refusalCode(result.body);
    const reason = code === "permit_denied" ? permitReason(result.body) : undefined;
    const extra = {
      status: result.status,
      ...(code ? { code } : {}),
      ...(reason ? { reason } : {}),
    };
    if (result.status === 401)
      throw new JackboyLinkError("Jackboy session rejected.", "http", extra);
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
    !action.startsWith("permit.") &&
    (reply.job?.id !== jobId ||
      !["queued", "running", "completed", "failed", "cancelled", "timed_out"].includes(
        reply.job.status,
      ))
  )
    throw new Error("Jackboy returned an invalid job.");
  return { reply, proofDigest: sha256(result.proof) };
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
    throw new JackboyLinkError(
      "Jackboy configuration targets a different runner.",
      "runner_mismatch",
    );
  await audit(parsed.data ? "configuration_verified" : "configuration_unavailable");
  return parsed.data;
}

const ISO = z.string().datetime({ offset: true });
const HEX64 = z.string().regex(/^[a-f0-9]{64}$/);
const UUID_S = z.string().regex(UUID);

/** Jackboy's signed safety snapshot (`omni.safety/v1`, valid ~30 s). */
const safetySnapshotSchema = z
  .object({
    contract: z.literal("omni.safety/v1"),
    checkedAt: ISO,
    validUntil: ISO,
    killSwitch: z.boolean(),
    emergencyStop: z.boolean(),
    codeEnabled: z.boolean(),
    authorization: z.object({ id: UUID_S, expiresAt: ISO }).strict().nullable(),
    autonomousAllowed: z.boolean(),
    blockedBy: z.string().regex(/^[a-z0-9_]{1,40}$/).nullable(),
    manualDiagnosticsAllowed: z.boolean(),
    activePermits: z.number().int().min(0).max(1000),
  })
  .strict();
export type JackboySafetySnapshot = z.infer<typeof safetySnapshotSchema> & { proofDigest: string };

/** Owner caps OMNI enforces on every permit (Jackboy's OMNI_AUTONOMY_LIMITS must not exceed them). */
export const OMNI_PERMIT_LIMITS = { perCallUsd: 0.5, perTaskUsd: 1, dailyUsd: 5 } as const;
export const PERMIT_CONTRACT = "omni.permit/v1";
export const PERMIT_MAX_TTL_MS = 65_000;

const permitSchema = z
  .object({
    contract: z.literal(PERMIT_CONTRACT),
    id: UUID_S,
    jobId: UUID_S,
    kind: z.enum(["autonomous", "code"]),
    digest: HEX64,
    status: z.literal("active"),
    issuedAt: ISO,
    expiresAt: ISO,
    renewals: z.number().int().min(0),
    limits: z
      .object({ perCallUsd: z.number(), perTaskUsd: z.number(), dailyUsd: z.number() })
      .strict(),
    clientId: z.string(),
    projectId: UUID_S,
    approvalId: z.string().min(1).max(128),
    renewEverySeconds: z.number().int().min(1).max(60),
    signature: HEX64,
  })
  .strict();
export type JackboyPermit = z.infer<typeof permitSchema> & { signatureDigest: string };
export type PermitRequest = {
  jobId: string;
  kind: "autonomous" | "code";
  digest: string;
  estimateUsd: number;
};

/** Canonical bytes Jackboy signs for a permit (see Jackboy's docs/OMNI-PERMIT-CONTRACT.md). */
export function permitSigningMessage(p: {
  id: string;
  jobId: string;
  kind: string;
  digest: string;
  clientId: string;
  projectId: string;
  approvalId: string;
  expiresAt: string;
}): string {
  return [PERMIT_CONTRACT, p.id, p.jobId, p.kind, p.digest, p.clientId, p.projectId, p.approvalId, p.expiresAt].join("\n");
}

function verifySnapshot(raw: unknown, now: number, proofDigest: string): JackboySafetySnapshot {
  const parsed = safetySnapshotSchema.safeParse(raw);
  if (!parsed.success) throw new JackboyLinkError("Jackboy safety snapshot is invalid.", "contract");
  const checked = Date.parse(parsed.data.checkedAt);
  const valid = Date.parse(parsed.data.validUntil);
  if (!(Math.abs(checked - now) <= 60_000) || !(valid > now && valid <= checked + 60_000))
    throw new JackboyLinkError("Jackboy safety snapshot timing is invalid.", "contract");
  return { ...parsed.data, proofDigest };
}

function verifyPermit(
  raw: unknown,
  c: LinkIdentity,
  req: PermitRequest,
  now: number,
  approvalId: string | null,
): JackboyPermit {
  const parsed = permitSchema.safeParse(raw);
  if (!parsed.success) throw new JackboyLinkError("Jackboy permit is invalid.", "contract");
  const p = parsed.data;
  const expires = Date.parse(p.expiresAt);
  if (
    p.clientId !== c.clientId ||
    p.projectId !== c.projectId ||
    (approvalId !== null && p.approvalId !== approvalId) ||
    p.jobId !== req.jobId ||
    p.kind !== req.kind ||
    p.digest !== req.digest ||
    !(expires > now && expires <= now + PERMIT_MAX_TTL_MS) ||
    !(p.limits.perCallUsd > 0 && p.limits.perCallUsd <= OMNI_PERMIT_LIMITS.perCallUsd) ||
    !(p.limits.perTaskUsd > 0 && p.limits.perTaskUsd <= OMNI_PERMIT_LIMITS.perTaskUsd) ||
    !(p.limits.dailyUsd > 0 && p.limits.dailyUsd <= OMNI_PERMIT_LIMITS.dailyUsd)
  )
    throw new JackboyLinkError("Jackboy permit scope, expiry or limits are invalid.", "contract");
  const expected = Buffer.from(hmac(c.secret, permitSigningMessage(p)), "utf8");
  const received = Buffer.from(p.signature, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    throw new JackboyLinkError("Jackboy permit signature is invalid.", "proof");
  return { ...p, signatureDigest: sha256(p.signature) };
}

function assertPermitRequest(r: PermitRequest) {
  if (
    !UUID.test(r.jobId) ||
    !["autonomous", "code"].includes(r.kind) ||
    !/^[a-f0-9]{64}$/.test(r.digest) ||
    !(Number.isFinite(r.estimateUsd) && r.estimateUsd > 0 && r.estimateUsd <= OMNI_PERMIT_LIMITS.perTaskUsd)
  )
    throw new Error("Invalid permit request.");
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

  /** Session-signed `safety` snapshot (Jackboy answers only with a live Step 9 session). */
  async safety(): Promise<JackboySafetySnapshot> {
    await this.connect();
    await this.audit("request_safety");
    const { reply, proofDigest } = await sendSignedRaw(this.config, this.options, "safety", this.session);
    const snapshot = verifySnapshot(reply.safety, Date.now(), proofDigest);
    await this.audit(snapshot.autonomousAllowed ? "safety_allowed" : `safety_blocked`);
    return snapshot;
  }

  /** Request or renew one job's permit; only a signed, scope-matching, capped permit is returned. */
  async requestPermit(req: PermitRequest, approvalId: string | null): Promise<JackboyPermit> {
    assertPermitRequest(req);
    await this.connect();
    const { reply } = await sendSignedRaw(this.config, this.options, "permit.request", this.session, req.jobId, {
      kind: req.kind,
      digest: req.digest,
      estimateUsd: req.estimateUsd,
    });
    return verifyPermit(reply.permit, this.config, req, Date.now(), approvalId);
  }

  /** Close the job's permit at Jackboy (idempotent). */
  async releasePermit(jobId: string): Promise<void> {
    if (!UUID.test(jobId)) throw new Error("Invalid scoped operation.");
    await this.connect();
    await sendSignedRaw(this.config, this.options, "permit.release", this.session, jobId);
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
