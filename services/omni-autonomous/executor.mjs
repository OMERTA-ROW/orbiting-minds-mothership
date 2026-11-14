import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import { pathToFileURL } from "node:url";

export const RELEASE = "omni-bounded-plan-1";
export const PATH = "/omni-autonomous/v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const BINARIES = [
  "/usr/bin/true",
  "/usr/bin/false",
  "/usr/bin/sleep",
  "/usr/bin/printf",
  "/usr/bin/python3",
];
const mac = (key, text) => createHmac("sha256", key).update(text).digest("hex");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const equal = (a, b) =>
  typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const exact = (object, keys) =>
  object &&
  typeof object === "object" &&
  !Array.isArray(object) &&
  Object.keys(object).sort().join(",") === [...keys].sort().join(",");

export function parsePlan(value, now = Date.now()) {
  if (
    !exact(value, ["jobId", "projectId", "expiresAt", "release", "commands"]) ||
    !UUID.test(value.jobId) ||
    !UUID.test(value.projectId) ||
    value.release !== RELEASE ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now ||
    Date.parse(value.expiresAt) > now + 60_000 ||
    !Array.isArray(value.commands) ||
    value.commands.length < 1 ||
    value.commands.length > 5
  )
    throw new Error("Invalid bounded plan");
  let total = 0;
  const commands = value.commands.map((command) => {
    if (
      !exact(command, ["argv", "timeoutMs"]) ||
      !Array.isArray(command.argv) ||
      command.argv.length < 1 ||
      command.argv.length > 16 ||
      !BINARIES.includes(command.argv[0]) ||
      command.argv.some(
        (arg) => typeof arg !== "string" || arg.includes("\0") || Buffer.byteLength(arg) > 2048,
      ) ||
      !Number.isInteger(command.timeoutMs) ||
      command.timeoutMs < 100 ||
      command.timeoutMs > 10_000
    )
      throw new Error("Invalid command");
    total += command.timeoutMs;
    return { argv: command.argv, timeoutMs: command.timeoutMs };
  });
  if (total > 30_000) throw new Error("Plan exceeds wall-clock budget");
  return {
    jobId: value.jobId,
    projectId: value.projectId,
    expiresAt: value.expiresAt,
    release: value.release,
    commands,
  };
}
export const planHash = (plan) => hash(JSON.stringify(plan));

/** No host root, network, service files, credentials, or production workspace is mounted. */
export async function runIsolated(command, signal, workspace) {
  const argv = [
    "--as=536870912",
    "--cpu=10",
    "--nproc=32",
    "--fsize=1048576",
    "--nofile=64",
    "--",
    "bwrap",
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--clearenv",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind-try",
    "/lib64",
    "/lib64",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--bind",
    workspace,
    "/workspace",
    "--chdir",
    "/workspace",
    "--uid",
    "65534",
    "--gid",
    "65534",
    "--cap-drop",
    "ALL",
    "--setenv",
    "PATH",
    "/usr/bin:/bin",
    "--",
    ...command.argv,
  ];
  return new Promise((resolve, reject) => {
    const process = spawn("prlimit", argv, {
      uid: 65534,
      gid: 65534,
      env: { PATH: "/usr/bin:/bin" },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let exceeded = false;
    let timedOut = false;
    const stop = () => {
      if (process.pid) {
        try {
          globalThis.process.kill(-process.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") reject(error);
        }
      }
    };
    const capture = (chunk) => {
      if (Buffer.byteLength(output) + chunk.length > 8192) {
        exceeded = true;
        stop();
      } else output += chunk.toString("utf8");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, command.timeoutMs);
    signal.addEventListener("abort", stop, { once: true });
    process.stdout.on("data", capture);
    process.stderr.on("data", capture);
    process.on("error", reject);
    process.on("close", (code, terminationSignal) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve({
        exitCode: code,
        signal: terminationSignal,
        output,
        exceeded,
        timedOut,
        cancelled: signal.aborted,
      });
    });
    if (signal.aborted) stop();
  });
}

export async function permissionRequest(config, operation, plan) {
  const { outcome, ...approvedPlan } = plan;
  const nonce = randomBytes(16).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const path = "/api/public/omni/link";
  const body = JSON.stringify({
    action: "execution-control",
    projectId: plan.projectId,
    audience: "executor",
    operation,
    args: {
      jobId: plan.jobId,
      planSha256: planHash(approvedPlan),
      ...(operation === "finish" ? { outcome } : {}),
    },
  });
  const response = await config.fetch(new URL(path, config.jackboyOrigin), {
    method: "POST",
    body,
    redirect: "error",
    signal: AbortSignal.timeout(1500),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.permissionToken}`,
      "X-Omni-Client": config.clientId,
      "X-Omni-Timestamp": timestamp,
      "X-Omni-Nonce": nonce,
      "X-Omni-Signature": mac(
        config.permissionSecret,
        `omni.link/v2\nPOST\n${path}\n${timestamp}\n${nonce}\n${hash(config.permissionToken)}\n${body}`,
      ),
    },
  });
  const text = await cappedBody(response, 16384);
  if (
    !response.ok ||
    !equal(
      response.headers.get("X-Omni-Proof"),
      mac(config.permissionSecret, `omni.link/v2\nresponse\n${nonce}\n${response.status}\n${text}`),
    )
  )
    throw new Error("Permission proof failed");
  const reply = JSON.parse(text);
  if (
    reply.contract !== "omni.link/v2" ||
    reply.requestNonce !== nonce ||
    reply.state?.projectId !== plan.projectId ||
    !Number.isFinite(Date.parse(reply.state?.checkedAt)) ||
    Date.now() - Date.parse(reply.state.checkedAt) > 2000 ||
    Date.parse(reply.state.checkedAt) > Date.now() + 1000
  )
    throw new Error("Stale permission state");
  if (operation === "finish") {
    if (!["completed", "failed", "cancelled"].includes(reply.state.jobState))
      throw new Error("Terminal job outcome is unverified");
    return reply.state.jobState;
  }
  return (
    reply.state.allowed === true &&
    reply.state.emergencyStop === false &&
    reply.state.killSwitch === false
  );
}

async function cappedBody(message, limit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of message.body ?? message) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error("Body limit exceeded");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function newWorkspace(prefix) {
  const directory = await fs.mkdtemp(`/tmp/${prefix}-`);
  await fs.chown(directory, 65534, 65534);
  return directory;
}

export function createExecutor(
  config,
  {
    run = runIsolated,
    permission = permissionRequest,
    workspace: makeWorkspace = newWorkspace,
  } = {},
) {
  const jobs = new Map();
  const nonces = new Map();
  let verifying = false;
  let draining = false;
  async function selfTest() {
    if (jobs.size || verifying || draining) throw new Error("Executor is occupied");
    verifying = true;
    let workspace;
    try {
      workspace = await makeWorkspace("omni-self-test");
      const check = await run(
        {
          argv: [
            "/usr/bin/python3",
            "-c",
            "import os,socket,resource; assert os.getuid()!=0; assert not os.path.exists('/app'); assert not os.path.exists('/root'); assert len(os.environ)<5\nfor kind,cap in [(resource.RLIMIT_AS,536870912),(resource.RLIMIT_CPU,10),(resource.RLIMIT_NPROC,32),(resource.RLIMIT_FSIZE,1048576),(resource.RLIMIT_NOFILE,64)]:\n assert 0<resource.getrlimit(kind)[0]<=cap\ns=socket.socket(); s.settimeout(.2)\ntry: s.connect(('1.1.1.1',443)); raise AssertionError('network open')\nexcept OSError: pass",
          ],
          timeoutMs: 3000,
        },
        new AbortController().signal,
        workspace,
      );
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 100);
      const started = Date.now();
      let cancellation;
      try {
        cancellation = await run(
          {
            argv: [
              "/usr/bin/python3",
              "-c",
              "import os,time; child=os.fork()\nif child==0:\n time.sleep(.5); open('/workspace/child-survived','w').write('unsafe'); os._exit(0)\ntime.sleep(10)",
            ],
            timeoutMs: 1000,
          },
          abort.signal,
          workspace,
        );
      } finally {
        clearTimeout(timer);
      }
      const cancellationMs = Date.now() - started;
      await new Promise((resolve) => setTimeout(resolve, 600));
      const childSurvived = await fs.stat(`${workspace}/child-survived`).then(
        () => true,
        (error) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        },
      );
      return {
        passed:
          check.exitCode === 0 &&
          !check.exceeded &&
          cancellation.cancelled &&
          cancellationMs < 1500 &&
          !childSurvived,
        release: RELEASE,
      };
    } finally {
      verifying = false;
      if (workspace) await fs.rm(workspace, { recursive: true, force: true });
    }
  }
  async function runPlan(input) {
    const plan = parsePlan(input);
    if (!config.enabled || config.reviewedRelease !== RELEASE || draining || verifying)
      throw new Error("Autonomous execution is disabled");
    const id = plan.jobId;
    if (jobs.has(id) || jobs.size) throw new Error("Job duplicate or executor occupied");
    const abort = new AbortController();
    const job = { hash: planHash(plan), abort, done: null };
    jobs.set(id, job);
    job.done = (async () => {
      const outputs = [];
      let workspace;
      let outcome = "failed";
      let monitor;
      let claimed = false;
      try {
        if (!(await permission(config, "claim", plan))) throw new Error("Permission denied");
        claimed = true;
        workspace = await makeWorkspace("omni-plan");
        let polling = false;
        monitor = setInterval(() => {
          if (Date.now() >= Date.parse(plan.expiresAt)) abort.abort();
          if (polling) return;
          polling = true;
          permission(config, "permission", plan)
            .then((allowed) => {
              if (!allowed) abort.abort();
            })
            .catch(() => abort.abort())
            .finally(() => {
              polling = false;
            });
        }, 250);
        for (const command of plan.commands) {
          if (
            abort.signal.aborted ||
            Date.now() >= Date.parse(plan.expiresAt) ||
            !(await permission(config, "permission", plan))
          ) {
            abort.abort();
            break;
          }
          const result = await run(command, abort.signal, workspace);
          outputs.push(result);
          if (result.exitCode !== 0 || result.exceeded || result.cancelled) break;
        }
        outcome = abort.signal.aborted
          ? "cancelled"
          : outputs.length === plan.commands.length &&
              outputs.every((result) => result.exitCode === 0 && !result.exceeded)
            ? "completed"
            : "failed";
      } finally {
        clearInterval(monitor);
        if (workspace) await fs.rm(workspace, { recursive: true, force: true });
        try {
          if (claimed) {
            const recorded = await permission(config, "finish", { ...plan, outcome });
            if (
              typeof recorded === "string" &&
              ["completed", "failed", "cancelled"].includes(recorded)
            )
              outcome = recorded;
            else if (recorded !== true) throw new Error("Terminal job outcome is unverified");
          }
        } finally {
          jobs.delete(id);
        }
      }
      return { jobId: id, outcome, outputs, providerCostUsd: 0 };
    })();
    return job.done;
  }
  async function cancel(args) {
    if (!UUID.test(args.jobId) || !/^[a-f0-9]{64}$/.test(args.planSha256))
      throw new Error("Invalid cancellation");
    const job = jobs.get(args.jobId);
    if (!job) throw new Error("Cancellation is unverified on this executor instance");
    if (job.hash !== args.planSha256) throw new Error("Cancellation scope mismatch");
    job.abort.abort();
    await job.done;
    return { cancelled: true };
  }
  async function handle(request) {
    const plain = (status, error) => Response.json({ error }, { status });
    try {
      const raw = await cappedBody(request, 16384);
      const nonce = request.headers.get("X-Executor-Nonce") ?? "";
      const ts = request.headers.get("X-Executor-Timestamp") ?? "";
      if (
        new URL(request.url).pathname !== PATH ||
        request.method !== "POST" ||
        new URL(request.url).search ||
        !/^[a-f0-9]{32}$/.test(nonce) ||
        !/^\d{10}$/.test(ts) ||
        Math.abs(Date.now() - Number(ts) * 1000) > 30_000 ||
        !equal(
          request.headers.get("X-Executor-Signature"),
          mac(config.controlSecret, `omni.autonomous/v1\n${PATH}\n${ts}\n${nonce}\n${raw}`),
        )
      )
        return plain(401, "authentication_failed");
      for (const [key, at] of nonces) if (Date.now() - at > 60_000) nonces.delete(key);
      if (nonces.has(nonce) || nonces.size > 100) return plain(409, "replay_or_rate_limit");
      nonces.set(nonce, Date.now());
      const input = JSON.parse(raw);
      if (!exact(input, ["operation", "args"])) return plain(400, "invalid_request");
      const result =
        input.operation === "inspect"
          ? {
              release: RELEASE,
              enabled: config.enabled === true,
              reviewedRelease: config.reviewedRelease ?? null,
            }
          : input.operation === "self-test"
            ? await selfTest()
            : input.operation === "run"
              ? await runPlan(input.args)
              : input.operation === "cancel"
                ? await cancel(input.args)
                : null;
      if (!result) return plain(400, "invalid_request");
      const body = JSON.stringify(result);
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Executor-Proof": mac(
            config.controlSecret,
            `omni.autonomous/v1\nresponse\n${nonce}\n200\n${body}`,
          ),
        },
      });
    } catch {
      return plain(503, "executor_refused");
    }
  }
  async function close() {
    draining = true;
    for (const job of jobs.values()) job.abort.abort();
    await Promise.allSettled([...jobs.values()].map((job) => job.done));
  }
  return { handle, close, runPlan, cancel, selfTest };
}

export function loadConfig(env = process.env) {
  const config = {
    enabled: env.OMNI_AUTONOMOUS_ENABLED === "true",
    reviewedRelease: env.OMNI_AUTONOMY_REVIEWED_RELEASE,
    controlSecret: env.OMNI_EXECUTOR_CONTROL_SECRET,
    permissionSecret: env.OMNI_EXECUTOR_PERMISSION_SECRET,
    permissionToken: env.OMNI_EXECUTOR_PERMISSION_TOKEN,
    clientId: env.OMNI_LINK_CLIENT_ID,
    jackboyOrigin: env.JACKBOY_LINK_ORIGIN,
    fetch: globalThis.fetch,
  };
  if (
    ![config.controlSecret, config.permissionSecret].every(
      (key) => typeof key === "string" && key.length >= 32,
    ) ||
    config.controlSecret === config.permissionSecret ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(config.permissionToken ?? "") ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.clientId ?? "") ||
    !/^https:\/\/[A-Za-z0-9.-]+$/.test(config.jackboyOrigin ?? "")
  )
    throw new Error("Executor configuration is invalid");
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const executor = createExecutor(loadConfig());
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/healthz" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ service: "omni-autonomous", release: RELEASE }));
        return;
      }
      const body = await cappedBody(req, 16384);
      const response = await executor.handle(
        new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers,
          body,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(400);
      res.end("Request refused");
    }
  });
  server.requestTimeout = 40_000;
  server.headersTimeout = 5000;
  server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
  const stop = async () => {
    server.close();
    await executor.close();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
