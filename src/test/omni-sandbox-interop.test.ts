// @vitest-environment node
/**
 * End-to-end on this machine (not Railway): Mothership's signed workspace client talks to the
 * reference sandbox service in services/omni-sandbox. Proves the contract, approval-before-run,
 * streamed stdout/stderr, exit codes, limits, stop, network isolation and signature refusal.
 * Skips when not root (the service needs root to drop each command to a per-session user).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workspaceRequest } from "@/lib/omni-workspace-link.server";
import { evaluateSandboxHealth, type RemoteReply } from "@/lib/omni-workspace";

const root = process.getuid?.() === 0;
const PORT = 18000 + Math.floor(Math.random() * 1000);
const SECRET = "t".repeat(48);
const cfg = { origin: `http://127.0.0.1:${PORT}`, clientId: "mothership-test", secret: SECRET, projectId: "omni" };
let proc: ChildProcess | null = null;
let dir = "";

async function call(action: Parameters<typeof workspaceRequest>[1], payload: Record<string, unknown>) {
  return workspaceRequest(cfg, action, payload);
}

async function runApproved(sessionId: string, command: string) {
  const jobId = randomUUID();
  const queued = await call("command.run", { sessionId, jobId, command, autonomous: true });
  const steps: RemoteReply["steps"] = [...queued.steps];
  const decided = await call("step.decide", { sessionId, jobId, stepId: "cmd", approve: true });
  steps.push(...decided.steps);
  let status = decided.job?.status;
  for (let i = 0; i < 100 && status !== "done" && status !== "failed" && status !== "stopped"; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const r = await call("events.poll", { sessionId, jobId });
    steps.push(...r.steps);
    status = r.job?.status;
  }
  return { jobId, queued, status, steps, out: (stream: string) => steps.filter((s) => s.stream === stream).map((s) => s.body).join("") };
}

describe.skipIf(!root)("cloud sandbox reference service (local end-to-end)", () => {
  let sessionId = "";
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-sbx-"));
    fs.chmodSync(dir, 0o711);
    proc = spawn("node", ["services/omni-sandbox/server.mjs"], {
      env: {
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
        PORT: String(PORT),
        OMNI_SANDBOX_CLIENT_ID: cfg.clientId,
        OMNI_SANDBOX_HMAC_SECRET: SECRET,
        OMNI_SANDBOX_ROOT: path.join(dir, "root"),
        OMNI_SANDBOX_COMMAND_TIMEOUT_SEC: "2",
        OMNI_REPO_ALLOWLIST: "example/allowed",
        OPENAI_API_KEY: "sk-test-not-real-key-0000000000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`${cfg.origin}/healthz`).then((r) => r.ok, () => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, 15_000);
  afterAll(() => {
    proc?.kill("SIGTERM");
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes the self-test: isolated network, non-root user, no leaked settings, bounded limits", async () => {
    const r = await call("health.check", {});
    expect(r.health).toBeDefined();
    const verdict = evaluateSandboxHealth(r.health!);
    expect(verdict.failures).toEqual([]);
    expect(r.health!.isolation.envNames).not.toContain("OPENAI_API_KEY");
  });

  it("starts a session and never runs a command before approval", async () => {
    sessionId = randomUUID();
    const s = await call("session.start", { sessionId, agentId: "omni", provider: "none" });
    expect(s.session?.sandboxId).toMatch(/^sbx-/);
    const jobId = randomUUID();
    const q = await call("command.run", { sessionId, jobId, command: "touch ran", autonomous: true });
    expect(q.steps[0]).toMatchObject({ kind: "command", status: "pending_approval" });
    expect(q.job?.status).toBe("queued");
    const rej = await call("step.decide", { sessionId, jobId, stepId: "cmd", approve: false });
    expect(rej.steps.some((x) => x.title === "Rejected by owner")).toBe(true);
    const check = await runApproved(sessionId, "test -e ran && echo RAN || echo NOT_RUN");
    expect(check.out("stdout")).toContain("NOT_RUN");
  });

  it("streams stdout and stderr separately and reports the exit code", async () => {
    const r = await runApproved(sessionId, "echo hello; echo oops >&2; id -u; exit 3");
    expect(r.out("stdout")).toContain("hello");
    expect(r.out("stderr")).toContain("oops");
    expect(Number(r.out("stdout").trim().split("\n").pop())).toBeGreaterThan(0);
    expect(r.steps.find((s) => s.kind === "result")?.exitCode).toBe(3);
    expect(r.status).toBe("failed");
  });

  it("has no network and cannot read the service's settings", async () => {
    const net = await runApproved(sessionId, 'timeout 2 bash -c "exec 3<>/dev/tcp/1.1.1.1/443" 2>/dev/null && echo OPEN || echo BLOCKED');
    expect(net.out("stdout")).toContain("BLOCKED");
    const env = await runApproved(sessionId, "env; cat /proc/1/environ 2>&1 | head -c 200; echo");
    expect(env.out("stdout") + env.out("stderr")).not.toContain(SECRET);
    expect(env.out("stdout")).not.toContain("OMNI_SANDBOX_HMAC_SECRET");
  });

  it("enforces the time limit", async () => {
    const r = await runApproved(sessionId, "sleep 10; echo late");
    expect(r.out("stdout")).not.toContain("late");
    expect(r.out("system")).toMatch(/Time limit/);
    expect(r.steps.find((s) => s.kind === "result")?.exitCode).toBe(-1);
  }, 10_000);

  it("stops a running command", async () => {
    const jobId = randomUUID();
    await call("command.run", { sessionId, jobId, command: "sleep 1.5; echo finished" });
    await call("step.decide", { sessionId, jobId, stepId: "cmd", approve: true });
    await call("job.stop", { sessionId, jobId });
    await new Promise((r) => setTimeout(r, 300));
    const r = await call("events.poll", { sessionId, jobId });
    expect(r.job?.status).toBe("stopped");
    expect(r.steps.map((s) => s.body).join("")).not.toContain("finished");
  });

  it("refuses repositories outside the allow-list", async () => {
    const jobId = randomUUID();
    await call("repo.checkout", { sessionId, jobId, repository: "someone/else", ref: "main" });
    await new Promise((r) => setTimeout(r, 200));
    const r = await call("events.poll", { sessionId, jobId });
    expect(r.steps.some((s) => s.status === "failed" && /ALLOWLIST/.test(s.body))).toBe(true);
  });

  it("refuses chat when the model provider is not verified", async () => {
    const jobId = randomUUID();
    await call("chat.send", { sessionId, jobId, text: "hello" });
    const r = await call("events.poll", { sessionId, jobId });
    expect(r.job?.status).toBe("failed");
  });

  it("rejects wrong signatures and replayed requests", async () => {
    await expect(workspaceRequest({ ...cfg, secret: "x".repeat(48) }, "health.check", {})).rejects.toThrow(/signature/);
    const body = JSON.stringify({ action: "health.check", projectId: "omni" });
    const { createHash, createHmac } = await import("node:crypto");
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = "a".repeat(32);
    const msg = `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n${ts}\n${nonce}\n${createHash("sha256").update(body).digest("hex")}`;
    const headers = {
      "content-type": "application/json",
      "x-omni-client": cfg.clientId,
      "x-omni-timestamp": ts,
      "x-omni-nonce": nonce,
      "x-omni-signature": createHmac("sha256", SECRET).update(msg).digest("hex"),
    };
    const first = await fetch(`${cfg.origin}/api/public/omni/workspace`, { method: "POST", headers, body });
    const second = await fetch(`${cfg.origin}/api/public/omni/workspace`, { method: "POST", headers, body });
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  it("ends the session and refuses further work", async () => {
    await call("session.end", { sessionId });
    await expect(call("command.run", { sessionId, jobId: randomUUID(), command: "echo hi" })).rejects.toThrow(/refused/);
  });
});
