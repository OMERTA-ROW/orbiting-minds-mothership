/**
 * Historical execution assertions retained while the unsafe reference service is quarantined.
 * The opt-in image test runs these unchanged against a disposable Linux service. These tests are
 * insufficient to establish containment and must be expanded before enabling it.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { workspaceRequest } from "@/lib/omni-workspace-link.server";
import { evaluateSandboxHealth, type RemoteReply } from "@/lib/omni-workspace";

const SECRET = "t".repeat(48);
const ownerId = "f1b3d943-c6ee-4ed1-abce-f08ba1493734";
const externalOrigin = process.env["OMNI_WORKSPACE_TEST_ORIGIN"];
const cfg = {
  origin: externalOrigin ?? "",
  clientId: "mothership-test",
  secret: SECRET,
  projectId: "omni",
};
let dir = "";

async function call(
  action: Parameters<typeof workspaceRequest>[1],
  payload: Record<string, unknown>,
) {
  return workspaceRequest(cfg, action, payload);
}

async function runApproved(sessionId: string, command: string) {
  const jobId = randomUUID();
  const queued = await call("command.run", { sessionId, jobId, command, autonomous: true });
  const steps: RemoteReply["steps"] = [...queued.steps];
  const decided = await call("step.decide", {
    ownerId,
    sessionId,
    jobId,
    stepId: "cmd",
    approve: true,
  });
  steps.push(...decided.steps);
  let status = decided.job?.status;
  for (
    let i = 0;
    i < 100 && status !== "done" && status !== "failed" && status !== "stopped";
    i++
  ) {
    await new Promise((r) => setTimeout(r, 100));
    const r = await call("events.poll", { sessionId, jobId });
    steps.push(...r.steps);
    status = r.job?.status;
  }
  return {
    jobId,
    queued,
    status,
    steps,
    out: (stream: string) =>
      steps
        .filter((s) => s.stream === stream)
        .map((s) => s.body)
        .join(""),
  };
}

const suite = process.env["OMNI_WORKSPACE_HISTORICAL_TEST"] === "1" ? describe : describe.skip;

suite("quarantined historical sandbox execution contract (requires containment repair)", () => {
  let sessionId = "";
  beforeAll(() => {
    const testRoot = process.env["OMNI_WORKSPACE_TEST_ROOT"];
    if (
      process.platform !== "linux" ||
      !externalOrigin ||
      new URL(externalOrigin).hostname !== "127.0.0.1" ||
      !testRoot ||
      !path.isAbsolute(testRoot)
    )
      throw new Error("Historical image tests require a disposable Linux loopback fixture.");
    dir = testRoot;
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
    const s = await call("session.start", {
      ownerId,
      sessionId,
      agentId: "omni",
      provider: "none",
    });
    expect(s.session?.sandboxId).toMatch(/^sbx-/);
    const jobId = randomUUID();
    const q = await call("command.run", {
      sessionId,
      jobId,
      command: "touch ran",
      autonomous: true,
    });
    expect(q.steps[0]).toMatchObject({ kind: "command", status: "pending_approval" });
    expect(q.job?.status).toBe("queued");
    const rej = await call("step.decide", {
      ownerId,
      sessionId,
      jobId,
      stepId: "cmd",
      approve: false,
    });
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
    const net = await runApproved(
      sessionId,
      'timeout 2 bash -c "exec 3<>/dev/tcp/1.1.1.1/443" 2>/dev/null && echo OPEN || echo BLOCKED',
    );
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
    await call("step.decide", { ownerId, sessionId, jobId, stepId: "cmd", approve: true });
    await call("job.stop", { sessionId, jobId });
    await new Promise((r) => setTimeout(r, 300));
    const r = await call("events.poll", { sessionId, jobId });
    expect(r.job?.status).toBe("stopped");
    expect(r.steps.map((s) => s.body).join("")).not.toContain("finished");
  });

  it("refuses repositories outside the allow-list", async () => {
    const jobId = randomUUID();
    const first = await call("repo.checkout", {
      sessionId,
      jobId,
      repository: "someone/else",
      ref: "main",
    });
    await new Promise((r) => setTimeout(r, 200));
    const later = await call("events.poll", { sessionId, jobId });
    const r = { steps: [...first.steps, ...later.steps] };
    expect(later.job?.status).toBe("failed");
    expect(r.steps.some((s) => s.status === "failed" && /ALLOWLIST/.test(s.body))).toBe(true);
  });

  it("refuses chat when the model provider is not verified", async () => {
    const jobId = randomUUID();
    await call("chat.send", { sessionId, jobId, text: "hello" });
    const r = await call("events.poll", { sessionId, jobId });
    expect(r.job?.status).toBe("failed");
  });

  it("rejects wrong signatures and replayed requests", async () => {
    await expect(
      workspaceRequest({ ...cfg, secret: "x".repeat(48) }, "health.check", {}),
    ).rejects.toThrow(/signature/);
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
    const first = await fetch(`${cfg.origin}/api/public/omni/workspace`, {
      method: "POST",
      headers,
      body,
    });
    const second = await fetch(`${cfg.origin}/api/public/omni/workspace`, {
      method: "POST",
      headers,
      body,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  it("keeps sessions apart: one session cannot read another's files", async () => {
    const other = randomUUID();
    await call("session.start", { ownerId, sessionId: other, agentId: "omni", provider: "none" });
    await runApproved(sessionId, "echo private > note.txt");
    const peek = await runApproved(
      other,
      `cat ${path.join(dir, "root", sessionId, "work", "note.txt")} 2>&1 || true`,
    );
    expect(peek.out("stdout")).not.toContain("private");
    await call("session.end", { sessionId: other });
  });

  it("ends the session and refuses further work", async () => {
    await call("session.end", { sessionId });
    await expect(
      call("command.run", { sessionId, jobId: randomUUID(), command: "echo hi" }),
    ).rejects.toThrow(/refused/);
  });
});
