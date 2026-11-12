// OMNI cloud sandbox — reference implementation of omni.workspace/v1 for Railway.
// Zero dependencies (Node 22+). Runs owner-approved commands for Mothership in
// per-session, non-root, network-isolated child processes. Never merges, deploys
// or runs anything without an approved step. See README.md in this folder.
import http from "node:http";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const CONTRACT = "omni.workspace/v1";
export const PATH = "/api/public/omni/workspace";
const VERSION = "0.1.0";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;
const SANDBOX_ENV_NAMES = ["HOME", "LANG", "PATH", "TERM"];

const int = (v, d, min, max) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export function loadConfig(env = process.env) {
  const c = {
    port: int(env.PORT, 8080, 1, 65535),
    clientId: env.OMNI_SANDBOX_CLIENT_ID ?? "",
    secret: env.OMNI_SANDBOX_HMAC_SECRET ?? "",
    projectId: env.OMNI_SANDBOX_PROJECT_ID ?? "omni",
    root: env.OMNI_SANDBOX_ROOT ?? "/sandbox",
    uidBase: int(env.OMNI_SANDBOX_UID_BASE, 20000, 1000, 60000),
    limits: {
      commandTimeoutSec: int(env.OMNI_SANDBOX_COMMAND_TIMEOUT_SEC, 60, 1, 300),
      cpuSec: int(env.OMNI_SANDBOX_CPU_SEC, 60, 1, 300),
      memoryMb: int(env.OMNI_SANDBOX_MEMORY_MB, 2048, 64, 8192),
      maxProcesses: int(env.OMNI_SANDBOX_MAX_PROCESSES, 128, 8, 512),
      fileSizeMb: int(env.OMNI_SANDBOX_FILE_MB, 200, 1, 2048),
      outputCapBytes: int(env.OMNI_SANDBOX_OUTPUT_CAP_BYTES, 262144, 1024, 1048576),
      maxSessions: int(env.OMNI_SANDBOX_MAX_SESSIONS, 3, 1, 5),
      idleMinutes: 10,
      sessionMinutes: 60,
    },
    // Explicit, owner-set escape hatch; Mothership's self-test refuses an open network.
    allowNetwork: env.OMNI_SANDBOX_ALLOW_NETWORK === "true",
    githubToken: env.GITHUB_TOKEN ?? "",
    repoAllowlist: (env.OMNI_REPO_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter((s) => REPO.test(s)),
    providers: {
      openai: {
        key: env.OPENAI_API_KEY ?? "",
        model: env.OPENAI_MODEL ?? "",
        inCents: Number(env.OPENAI_PRICE_IN_CENTS_PER_MTOK),
        outCents: Number(env.OPENAI_PRICE_OUT_CENTS_PER_MTOK),
      },
      anthropic: {
        key: env.ANTHROPIC_API_KEY ?? "",
        model: env.ANTHROPIC_MODEL ?? "",
        inCents: Number(env.ANTHROPIC_PRICE_IN_CENTS_PER_MTOK),
        outCents: Number(env.ANTHROPIC_PRICE_OUT_CENTS_PER_MTOK),
      },
    },
    fetch: globalThis.fetch,
  };
  if (!/^[A-Za-z0-9_.:-]{3,80}$/.test(c.clientId)) throw new Error("OMNI_SANDBOX_CLIENT_ID is missing or invalid.");
  if (c.secret.length < 32) throw new Error("OMNI_SANDBOX_HMAC_SECRET must be at least 32 characters.");
  return c;
}

const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const hmac = (k, t) => createHmac("sha256", k).update(t).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---------------------------------------------------------------- isolation

/** argv that runs `bash -c "$OMNI_CMD"` as `uid` with limits and, when possible, no network. */
function sandboxArgv(c, uid, net) {
  const L = c.limits;
  const ulimits = `ulimit -t ${L.cpuSec} -v ${L.memoryMb * 1024} -u ${L.maxProcesses} -f ${L.fileSizeMb * 1024} -n 256 -c 0`;
  const inner = ["/bin/bash", "--noprofile", "--norc", "-c", `${ulimits} && exec /bin/bash --noprofile --norc -c "$OMNI_CMD"`];
  const drop = ["setpriv", `--reuid=${uid}`, `--regid=${uid}`, "--clear-groups", "--inh-caps=-all", "--"];
  return net === "isolated" ? [...drop, "unshare", "--user", "--map-current-user", "--net", "--", ...inner] : [...drop, ...inner];
}

function sandboxEnv(home, command) {
  return { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: home, LANG: "C.UTF-8", TERM: "dumb", OMNI_CMD: command };
}

/** Probe once at boot: can we cut the network for an unprivileged child? */
export function detectNetwork(c) {
  const dir = fs.mkdtempSync("/tmp/omni-probe-");
  fs.chownSync(dir, c.uidBase, c.uidBase);
  const [cmd, ...args] = sandboxArgv(c, c.uidBase, "isolated");
  const r = spawnSync(cmd, args, { env: sandboxEnv(dir, "true"), cwd: dir, timeout: 5000 });
  fs.rmSync(dir, { recursive: true, force: true });
  return r.status === 0 ? "isolated" : "open";
}

/** Live probe for the self-test: uid, network and the environment the child can see. */
function probe(c, net) {
  const dir = fs.mkdtempSync("/tmp/omni-probe-");
  const uid = c.uidBase;
  fs.chownSync(dir, uid, uid);
  const script =
    'id -u; (exec 3<>/dev/tcp/1.1.1.1/443) 2>/dev/null && echo NET_OPEN || echo NET_BLOCKED; ' +
    'env | cut -d= -f1 | grep -v "^OMNI_CMD$" | grep -v "^PWD$" | grep -v "^SHLVL$" | grep -v "^_$" | sort | tr "\\n" ","';
  const [cmd, ...args] = sandboxArgv(c, uid, net);
  const r = spawnSync(cmd, args, { env: sandboxEnv(dir, script), cwd: dir, timeout: 5000, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const lines = (r.stdout ?? "").trim().split("\n");
  return {
    uid: Number.parseInt(lines[0] ?? "-1", 10),
    networkBlocked: lines[1] === "NET_BLOCKED",
    envNames: (lines[2] ?? "").split(",").filter(Boolean),
    exitCode: r.status ?? -1,
  };
}

// ---------------------------------------------------------------- state

export function createSandbox(c, opts = {}) {
  const net = opts.network ?? detectNetwork(c);
  const sessions = new Map();
  const nonces = new Map();
  const status = { providers: {}, github: { configured: Boolean(c.githubToken), repositories: [], checkedAt: null } };
  fs.mkdirSync(c.root, { recursive: true, mode: 0o711 });
  fs.mkdirSync(path.join(c.root, ".mirrors"), { recursive: true, mode: 0o700 });

  const slotFree = () => {
    for (let i = 1; i <= c.limits.maxSessions; i++)
      if (![...sessions.values()].some((s) => s.slot === i)) return i;
    return null;
  };

  function killJob(job, reason) {
    if (job.proc && job.state === "running") {
      try { process.kill(-job.proc.pid, "SIGKILL"); } catch {}
      job.state = "stopped";
      job.events.push({ stream: "system", text: `Stopped (${reason}).` });
    } else if (job.state === "awaiting_approval" || job.state === "queued") job.state = "stopped";
  }
  function endSession(s, reason) {
    for (const j of s.jobs.values()) killJob(j, reason);
    spawnSync("pkill", ["-KILL", "-u", String(s.uid)]);
    fs.rmSync(s.dir, { recursive: true, force: true });
    fs.rmSync(s.mirror, { recursive: true, force: true });
    sessions.delete(s.id);
  }
  const reaper = setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values())
      if (now - s.lastAt > c.limits.idleMinutes * 60_000 || now - s.startedAt > c.limits.sessionMinutes * 60_000)
        endSession(s, "timeout");
    for (const [n, t] of nonces) if (now - t > 300_000) nonces.delete(n);
  }, 15_000);
  reaper.unref();

  function getSession(id) {
    const s = sessions.get(id);
    if (!s) throw new Refusal("Session not found or already ended.");
    s.lastAt = Date.now();
    return s;
  }
  function newJob(s, jobId, kind) {
    if (!UUID.test(jobId ?? "")) throw new Refusal("Invalid job ID.");
    if (s.jobs.has(jobId)) return s.jobs.get(jobId);
    const job = { id: jobId, kind, state: "queued", events: [], steps: [], proc: null, pending: null, outBytes: 0 };
    s.jobs.set(jobId, job);
    return job;
  }

  function run(s, job, command) {
    job.state = "running";
    job.steps.push({ id: `cmd-${job.steps.length}`, kind: "command", title: command.slice(0, 200), body: command, status: "done" });
    const [cmd, ...args] = sandboxArgv(c, s.uid, net);
    const proc = spawn(cmd, args, { cwd: s.work, env: sandboxEnv(s.dir, command), detached: true, stdio: ["ignore", "pipe", "pipe"] });
    job.proc = proc;
    const cap = c.limits.outputCapBytes;
    const onData = (stream) => (buf) => {
      if (job.outBytes >= cap) return;
      const text = buf.toString("utf8").slice(0, cap - job.outBytes);
      job.outBytes += Buffer.byteLength(text);
      job.events.push({ stream, text });
      if (job.outBytes >= cap) {
        job.events.push({ stream: "system", text: `Output cap of ${cap} bytes reached; command stopped.` });
        try { process.kill(-proc.pid, "SIGKILL"); } catch {}
      }
    };
    proc.stdout.on("data", onData("stdout"));
    proc.stderr.on("data", onData("stderr"));
    const timer = setTimeout(() => {
      job.events.push({ stream: "system", text: `Time limit of ${c.limits.commandTimeoutSec}s reached; command stopped.` });
      try { process.kill(-proc.pid, "SIGKILL"); } catch {}
    }, c.limits.commandTimeoutSec * 1000);
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (job.state === "stopped") job.exit = -1;
      else {
        job.exit = code ?? -1;
        job.state = code === 0 ? "done" : "failed";
      }
      job.events.push({ stream: "exit", code: job.exit, signal: signal ?? null });
    });
  }

  // -------------------------------------------------------------- git

  const gitEnv = () => {
    const env = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", GIT_TERMINAL_PROMPT: "0" };
    if (c.githubToken) {
      const basic = Buffer.from(`x-access-token:${c.githubToken}`).toString("base64");
      Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` });
    }
    return env;
  };
  const SAFE_GIT = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.file.allow=never"];
  const git = (cwd, args) =>
    new Promise((resolve) => {
      const p = spawn("git", [...SAFE_GIT, ...args], { cwd, env: gitEnv(), stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      const t = setTimeout(() => p.kill("SIGKILL"), 120_000);
      p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? -1, out, err: err.replaceAll(c.githubToken || "\u0000", "[redacted]") }); });
    });

  async function checkout(s, job, repository, ref) {
    job.state = "running";
    const step = (title, body, ok = true) => job.steps.push({ id: `co-${job.steps.length}`, kind: "result", title, body, status: ok ? "done" : "failed" });
    try {
      if (!REPO.test(repository) || !REF.test(ref)) throw new Error("Invalid repository or branch name.");
      if (!c.repoAllowlist.includes(repository)) throw new Error(`${repository} is not in OMNI_REPO_ALLOWLIST.`);
      if (!c.githubToken) throw new Error("GITHUB_TOKEN is not set on the sandbox service.");
      fs.rmSync(s.mirror, { recursive: true, force: true });
      const clone = await git(path.dirname(s.mirror), ["clone", "--depth", "50", "--no-recurse-submodules", "--branch", ref, `https://github.com/${repository}.git`, s.mirror]);
      if (clone.code !== 0) throw new Error(`Clone failed: ${clone.err.slice(0, 400)}`);
      const head = await git(s.mirror, ["rev-parse", "HEAD"]);
      fs.rmSync(s.work, { recursive: true, force: true });
      spawnSync("cp", ["-a", s.mirror, s.work]);
      spawnSync("chown", ["-R", `${s.uid}:${s.uid}`, s.work]);
      s.repo = { fullName: repository, ref, commit: head.out.trim() };
      step(`Checked out ${repository}@${ref}`, `Commit ${s.repo.commit}. Commands now run in this copy.`);
      job.state = "done";
    } catch (e) {
      step("Checkout failed", e instanceof Error ? e.message : "error", false);
      job.state = "failed";
    }
  }

  async function proposePr(s, job, title) {
    job.state = "running";
    if (!s.repo) {
      job.steps.push({ id: "pr-none", kind: "result", title: "No repository", body: "Start the session with a repository first.", status: "failed" });
      job.state = "failed";
      return;
    }
    // Diff is computed as the session user, inside the sandbox; the patch is untrusted data.
    const script = 'git add -A >/dev/null 2>&1; git -c core.hooksPath=/dev/null diff --cached --binary HEAD';
    const [cmd, ...args] = sandboxArgv(c, s.uid, net);
    const r = spawnSync(cmd, args, { cwd: s.work, env: sandboxEnv(s.dir, script), timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    const patch = r.stdout?.toString("utf8") ?? "";
    if (!patch.trim()) {
      job.steps.push({ id: "pr-empty", kind: "result", title: "Nothing to propose", body: "No changes in the sandbox copy.", status: "failed" });
      job.state = "failed";
      return;
    }
    job.pending = { kind: "pr", title, patch };
    const branch = `omni/${s.id.slice(0, 8)}-${Date.now().toString(36)}`;
    job.pending.branch = branch;
    job.steps.push({ id: "pr-diff", kind: "diff", title: `Proposed changes for ${s.repo.fullName}`, body: patch.slice(0, 16000), status: "done" });
    job.steps.push({
      id: "pr",
      kind: "result",
      title: `Open draft pull request "${title}"`,
      body: `Pushes branch ${branch} to ${s.repo.fullName} and opens a DRAFT pull request against ${s.repo.ref}. Never merges.`,
      gated: "pull_request",
      status: "pending_approval",
    });
    job.state = "awaiting_approval";
  }

  async function openPr(s, job) {
    const p = job.pending;
    job.pending = null;
    job.state = "running";
    const step = (title, body, ok = true) => job.steps.push({ id: `pr-${job.steps.length}`, kind: "result", title, body, status: ok ? "done" : "failed" });
    try {
      const patchFile = path.join(c.root, ".mirrors", `${s.id}.patch`);
      fs.writeFileSync(patchFile, p.patch, { mode: 0o600 });
      const steps = [
        ["checkout", "-b", p.branch],
        ["apply", "--index", "--binary", patchFile],
        ["-c", "user.name=OMNI Sandbox", "-c", "user.email=omni-sandbox@users.noreply.github.com", "commit", "-m", p.title],
        ["push", "origin", `HEAD:refs/heads/${p.branch}`],
      ];
      for (const a of steps) {
        const r = await git(s.mirror, a);
        if (r.code !== 0) throw new Error(`git ${a.find((x) => !x.startsWith("-") && !x.includes("=")) ?? ""} failed: ${r.err.slice(0, 300)}`);
      }
      fs.rmSync(patchFile, { force: true });
      const res = await c.fetch(`https://api.github.com/repos/${s.repo.fullName}/pulls`, {
        method: "POST",
        headers: { authorization: `Bearer ${c.githubToken}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "omni-sandbox" },
        body: JSON.stringify({ title: p.title, head: p.branch, base: s.repo.ref, draft: true, body: "Opened by the OMNI cloud sandbox after owner approval in Mothership. Review before merging; OMNI never merges." }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || typeof j.html_url !== "string") throw new Error(`GitHub refused the pull request (HTTP ${res.status}).`);
      step("Draft pull request opened", j.html_url);
      job.state = "done";
    } catch (e) {
      step("Pull request not opened", e instanceof Error ? e.message : "error", false);
      job.state = "failed";
    }
  }

  // -------------------------------------------------------------- providers

  async function verifyProviders() {
    for (const id of ["openai", "anthropic"]) {
      const p = c.providers[id];
      const entry = { configured: Boolean(p.key && p.model), verified: false, model: p.model || null, pricing: p.inCents > 0 && p.outCents > 0, checkedAt: null };
      if (entry.configured) {
        try {
          const res = await c.fetch(id === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models", {
            headers: id === "openai" ? { authorization: `Bearer ${p.key}` } : { "x-api-key": p.key, "anthropic-version": "2023-06-01" },
            signal: AbortSignal.timeout(10_000),
          });
          await res.body?.cancel().catch(() => {});
          entry.verified = res.ok;
        } catch {}
        entry.checkedAt = new Date().toISOString();
      }
      status.providers[id] = entry;
    }
    const repos = [];
    for (const r of c.repoAllowlist.slice(0, 20)) {
      let access = false;
      if (c.githubToken)
        try {
          const res = await c.fetch(`https://api.github.com/repos/${r}`, { headers: { authorization: `Bearer ${c.githubToken}`, "user-agent": "omni-sandbox" }, signal: AbortSignal.timeout(10_000) });
          const j = await res.json().catch(() => ({}));
          access = res.ok && j?.permissions?.push === true;
        } catch {}
      repos.push({ fullName: r, access });
    }
    status.github = { configured: Boolean(c.githubToken), repositories: repos, checkedAt: new Date().toISOString() };
  }

  async function chat(s, job, text) {
    job.state = "running";
    const id = s.provider;
    const p = c.providers[id];
    const st = status.providers[id];
    const fail = (msg) => {
      job.steps.push({ id: "chat-err", kind: "result", title: "Model not available", body: msg, status: "failed" });
      job.state = "failed";
    };
    if (!p || !st?.verified) return fail("This session has no verified model provider. Start a session with OpenAI or Claude after the self-test shows it connected.");
    if (!st.pricing) return fail("Set the provider price variables on the sandbox service so spend can be counted.");
    s.history.push({ role: "user", content: text });
    const system =
      "You are OMNI, a coding agent working in an isolated, network-less Linux sandbox. The owner approves every command. " +
      "To propose one shell command, put it alone in a fenced block tagged omni-command. Never ask for or print secrets.";
    try {
      const msgs = s.history.slice(-20);
      const res =
        id === "openai"
          ? await c.fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
              body: JSON.stringify({ model: p.model, max_completion_tokens: 1500, messages: [{ role: "system", content: system }, ...msgs] }),
              signal: AbortSignal.timeout(90_000),
            })
          : await c.fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({ model: p.model, max_tokens: 1500, system, messages: msgs }),
              signal: AbortSignal.timeout(90_000),
            });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return fail(`${id === "openai" ? "OpenAI" : "Claude"} returned HTTP ${res.status}.`);
      const reply = id === "openai" ? (j.choices?.[0]?.message?.content ?? "") : (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const inT = id === "openai" ? j.usage?.prompt_tokens : j.usage?.input_tokens;
      const outT = id === "openai" ? j.usage?.completion_tokens : j.usage?.output_tokens;
      const cents = Math.ceil(((inT ?? 0) * p.inCents + (outT ?? 0) * p.outCents) / 1_000_000);
      s.history.push({ role: "assistant", content: reply });
      job.steps.push({ id: "msg", kind: "message", title: "", body: reply.slice(0, 16000), costCents: Math.min(cents, 1000), model: p.model, status: "done" });
      const m = /```omni-command\n([\s\S]*?)```/.exec(reply);
      if (m && m[1].trim()) {
        job.pending = { kind: "command", command: m[1].trim().slice(0, 2000) };
        job.steps.push({ id: "cmd", kind: "command", title: job.pending.command.slice(0, 200), body: job.pending.command, status: "pending_approval" });
        job.state = "awaiting_approval";
      } else job.state = "done";
    } catch {
      fail("The model did not answer in time.");
    }
  }

  // -------------------------------------------------------------- replies

  function jobReply(job) {
    const steps = [...job.steps];
    job.steps = [];
    let cursor = Number.parseInt(job.cursor ?? "0", 10) || 0;
    let bytes = 0;
    while (cursor < job.events.length && bytes < 12_000) {
      const e = job.events[cursor];
      if (e.stream === "exit")
        steps.push({ id: `exit-${cursor}`, kind: "result", title: `Exit code ${e.code}`, body: e.signal ? `Signal ${e.signal}` : "", exitCode: Math.max(-1, Math.min(255, e.code)), status: e.code === 0 ? "done" : "failed" });
      else {
        const body = e.text.slice(0, 12_000);
        bytes += Buffer.byteLength(body);
        steps.push({ id: `out-${cursor}`, kind: "output", title: "", body, stream: e.stream, status: "done" });
      }
      cursor++;
    }
    job.cursor = String(cursor);
    const finished = ["done", "failed", "stopped"].includes(job.state) && cursor >= job.events.length;
    const st = job.state === "awaiting_approval" || job.state === "queued" ? "queued" : finished ? job.state : "running";
    return { job: { status: st, cursor: job.cursor }, steps };
  }

  async function handle(action, b) {
    switch (action) {
      case "health.check": {
        const pr = probe(c, net);
        return {
          health: {
            service: "omni-sandbox",
            version: VERSION,
            isolation: { network: net === "isolated" && pr.networkBlocked ? "isolated" : "open", uid: pr.uid, perSessionUser: true, envNames: pr.envNames, probeExitCode: pr.exitCode },
            limits: c.limits,
            providers: ["openai", "anthropic"].map((id) => ({ id, ...(status.providers[id] ?? { configured: false, verified: false, model: null, pricing: false, checkedAt: null }) })),
            github: status.github,
            autonomy: "off",
            merge: "never",
          },
        };
      }
      case "session.start": {
        if (!UUID.test(b.sessionId ?? "")) throw new Refusal("Invalid session ID.");
        if (net !== "isolated" && !c.allowNetwork) throw new Refusal("Network isolation is unavailable on this host; commands are refused.");
        let s = sessions.get(b.sessionId);
        if (!s) {
          const slot = slotFree();
          if (!slot) throw new Refusal(`At most ${c.limits.maxSessions} sessions at once.`);
          const uid = c.uidBase + slot;
          const dir = path.join(c.root, b.sessionId);
          fs.mkdirSync(dir, { mode: 0o700 });
          const work = path.join(dir, "work");
          fs.mkdirSync(work, { mode: 0o700 });
          spawnSync("chown", ["-R", `${uid}:${uid}`, dir]);
          const provider = ["openai", "anthropic"].includes(b.provider) ? b.provider : "none";
          s = { id: b.sessionId, slot, uid, dir, work, mirror: path.join(c.root, ".mirrors", b.sessionId), provider, jobs: new Map(), history: [], repo: null, startedAt: Date.now(), lastAt: Date.now() };
          sessions.set(s.id, s);
        }
        const model = s.provider === "none" ? null : (c.providers[s.provider].model || null);
        return { session: { sandboxId: `sbx-${s.id.slice(0, 8)}`, sandboxName: `omni-sandbox uid ${s.uid}`, model } };
      }
      case "repo.checkout": {
        const s = getSession(b.sessionId);
        const job = newJob(s, b.jobId, "checkout");
        void checkout(s, job, String(b.repository ?? ""), String(b.ref ?? "main"));
        return jobReply(job);
      }
      case "command.run": {
        const s = getSession(b.sessionId);
        const command = String(b.command ?? "").slice(0, 2000);
        if (!command.trim()) throw new Refusal("Empty command.");
        const job = newJob(s, b.jobId, "command");
        if (job.state === "queued") {
          // Never runs on arrival: the owner approves each command (autonomy is ignored).
          job.pending = { kind: "command", command };
          job.steps.push({ id: "cmd", kind: "command", title: command.slice(0, 200), body: command, status: "pending_approval" });
          job.state = "awaiting_approval";
        }
        return jobReply(job);
      }
      case "chat.send": {
        const s = getSession(b.sessionId);
        const job = newJob(s, b.jobId, "chat");
        if (job.state === "queued") void chat(s, job, String(b.text ?? "").slice(0, 4000));
        return jobReply(job);
      }
      case "pr.propose": {
        const s = getSession(b.sessionId);
        const job = newJob(s, b.jobId, "pr");
        if (job.state === "queued") void proposePr(s, job, String(b.title ?? "OMNI changes").slice(0, 120));
        return jobReply(job);
      }
      case "step.decide": {
        const s = getSession(b.sessionId);
        const job = s.jobs.get(b.jobId);
        if (!job || !job.pending) throw new Refusal("Nothing is waiting for a decision.");
        const want = job.pending.kind === "pr" ? "pr" : "cmd";
        if (b.stepId !== want) throw new Refusal("That step is not waiting.");
        if (b.approve !== true) {
          job.pending = null;
          job.state = "stopped";
          job.steps.push({ id: `rej-${Date.now()}`, kind: "result", title: "Rejected by owner", body: "Nothing was run.", status: "failed" });
        } else if (job.pending.kind === "pr") void openPr(s, job);
        else {
          const { command } = job.pending;
          job.pending = null;
          run(s, job, command);
        }
        return jobReply(job);
      }
      case "events.poll": {
        const s = getSession(b.sessionId);
        const job = s.jobs.get(b.jobId);
        if (!job) throw new Refusal("Job not found.");
        return jobReply(job);
      }
      case "job.stop": {
        const s = sessions.get(b.sessionId);
        if (s) for (const j of s.jobs.values()) if (!b.jobId || j.id === b.jobId) killJob(j, "owner");
        return {};
      }
      case "agent.stop": {
        for (const s of sessions.values()) for (const j of s.jobs.values()) killJob(j, "owner");
        return {};
      }
      case "session.end": {
        const s = sessions.get(b.sessionId);
        if (s) endSession(s, "owner");
        return {};
      }
      default:
        throw new Refusal("Unknown action.");
    }
  }

  // -------------------------------------------------------------- HTTP

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      return;
    }
    if (req.method !== "POST" || req.url !== PATH) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (d) => {
      size += d.length;
      if (size > 65536) req.destroy();
      else chunks.push(d);
    });
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const h = (n) => String(req.headers[n] ?? "");
      const ts = h("x-omni-timestamp");
      const nonce = h("x-omni-nonce");
      const message = `${CONTRACT}\nPOST\n${PATH}\n${ts}\n${nonce}\n${sha256(raw)}`;
      const fresh = /^\d{10}$/.test(ts) && Math.abs(Date.now() / 1000 - Number(ts)) <= 60;
      if (h("x-omni-client") !== c.clientId || !fresh || !/^[0-9a-f]{32}$/.test(nonce) || nonces.has(nonce) || !safeEqual(h("x-omni-signature"), hmac(c.secret, message))) {
        res.writeHead(401).end();
        return;
      }
      nonces.set(nonce, Date.now());
      let status = 200;
      let payload;
      try {
        const b = JSON.parse(raw);
        if (b.projectId !== c.projectId) throw new Refusal("Wrong project.");
        payload = { contract: CONTRACT, requestNonce: nonce, steps: [], ...(await handle(String(b.action), b)) };
      } catch (e) {
        status = 409;
        payload = { contract: CONTRACT, requestNonce: nonce, error: e instanceof Refusal ? e.message : "Request failed.", steps: [] };
      }
      const text = JSON.stringify(payload);
      res.writeHead(status, { "content-type": "application/json", "x-omni-proof": hmac(c.secret, `${CONTRACT}\nresponse\n${nonce}\n${status}\n${text}`) }).end(text);
    });
  });

  return {
    server,
    network: net,
    verifyProviders,
    close: () => {
      clearInterval(reaper);
      for (const s of [...sessions.values()]) endSession(s, "shutdown");
      server.close();
    },
  };
}

class Refusal extends Error {}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.getuid?.() !== 0) {
    console.error("omni-sandbox must start as root so it can drop each command to an unprivileged per-session user.");
    process.exit(1);
  }
  const c = loadConfig();
  const sb = createSandbox(c);
  console.log(`omni-sandbox ${VERSION}: network ${sb.network}; ${c.repoAllowlist.length} allowed repositories`);
  if (sb.network !== "isolated" && !c.allowNetwork) console.warn("Network isolation unavailable: sessions will be refused.");
  void sb.verifyProviders();
  setInterval(() => void sb.verifyProviders(), 10 * 60_000).unref();
  sb.server.listen(c.port, () => console.log(`listening on :${c.port}`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { sb.close(); process.exit(0); });
}
