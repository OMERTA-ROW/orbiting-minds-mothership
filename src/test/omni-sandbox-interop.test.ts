/**
 * Signed protocol regression against the quarantined reference service.
 * This does not claim Linux containment.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workspaceRequest } from "@/lib/omni-workspace-link.server";

const port = 18000 + Math.floor(Math.random() * 1000);
const secret = "t".repeat(48);
const cfg = {
  origin: `http://127.0.0.1:${port}`,
  clientId: "mothership-test",
  secret,
  projectId: "omni",
};
let proc: ChildProcess;
let dir: string;
const serviceLogs = new WeakMap<ChildProcess, string>();

async function startService(servicePort: number) {
  const source = `
      import { loadConfig, createSandbox } from "./services/omni-sandbox/server.mjs";
      const sandbox = createSandbox(loadConfig(), { network: "isolated" });
      sandbox.server.listen(Number(process.env.PORT), "127.0.0.1");
      process.on("SIGTERM", () => sandbox.close());
    `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    env: {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      PORT: String(servicePort),
      OMNI_SANDBOX_CLIENT_ID: cfg.clientId,
      OMNI_SANDBOX_HMAC_SECRET: secret,
      OMNI_SANDBOX_ROOT: path.join(dir, "root"),
      OMNI_SANDBOX_ALLOW_NETWORK: "true",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  serviceLogs.set(child, "");
  child.stderr?.on("data", (chunk: Buffer) =>
    serviceLogs.set(child, `${serviceLogs.get(child) ?? ""}${chunk.toString()}`),
  );
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) throw new Error("Reference service exited before starting.");
    if (
      await fetch(`http://127.0.0.1:${servicePort}/healthz`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return child;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error("Reference service did not start.");
}

async function stopService(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill(signal);
  await exit;
}

function signedRequest(nonce: string, action = "agent.stop", projectId = "omni") {
  const body = JSON.stringify({ action, projectId });
  const ts = String(Math.floor(Date.now() / 1000));
  const hash = createHash("sha256").update(body).digest("hex");
  const message = `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n${ts}\n${nonce}\n${hash}`;
  return {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-omni-client": cfg.clientId,
      "x-omni-timestamp": ts,
      "x-omni-nonce": nonce,
      "x-omni-signature": createHmac("sha256", secret).update(message).digest("hex"),
    },
  };
}

describe("quarantined workspace reference", () => {
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-sbx-"));
    proc = await startService(port);
  }, 10_000);

  afterAll(async () => {
    if (proc) await stopService(proc);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses sessions and work even when network isolation is reported or bypass enabled", async () => {
    const sessionId = randomUUID();
    for (const action of ["session.start", "command.run", "step.decide", "chat.send"] as const) {
      await expect(
        workspaceRequest(cfg, action, {
          sessionId,
          jobId: randomUUID(),
          command: "printf synthetic",
          stepId: "cmd",
          approve: true,
        }),
      ).rejects.toThrow(/execution is disabled/i);
    }
    expect(fs.existsSync(path.join(dir, "root", sessionId))).toBe(false);
  });

  it("keeps signed stop and end available", async () => {
    for (const action of ["job.stop", "agent.stop", "session.end"] as const) {
      await expect(
        workspaceRequest(cfg, action, { sessionId: randomUUID() }),
      ).resolves.toMatchObject({ contract: "omni.workspace/v1" });
    }
  });

  it("rejects a wrong signature and a wrong project", async () => {
    await expect(
      workspaceRequest({ ...cfg, secret: "x".repeat(48) }, "agent.stop", {}),
    ).rejects.toThrow(/signature/);
    await expect(
      workspaceRequest({ ...cfg, projectId: "other" }, "agent.stop", {}),
    ).rejects.toThrow(/Wrong project/);
    await expect(
      workspaceRequest({ ...cfg, clientId: "wrong-client" }, "agent.stop", {}),
    ).rejects.toThrow(/signature/);
  });

  it("does not allow payload fields to override the signed action or configured project", async () => {
    await expect(
      workspaceRequest(cfg, "session.start", { action: "health.check" }),
    ).rejects.toThrow(/execution is disabled/i);
    await expect(
      workspaceRequest(cfg, "agent.stop", { projectId: "other" }),
    ).resolves.toMatchObject({ contract: "omni.workspace/v1" });
  });

  it("does not consume a nonce from an invalid signature", async () => {
    const request = signedRequest("f".repeat(32));
    const url = `${cfg.origin}/api/public/omni/workspace`;
    const invalid = {
      ...request,
      headers: { ...request.headers, "x-omni-signature": "0".repeat(64) },
    };
    expect((await fetch(url, invalid)).status).toBe(401);
    expect((await fetch(url, request)).status).toBe(200);
  });

  it("rejects an expired signed request", async () => {
    const body = JSON.stringify({ action: "agent.stop", projectId: "omni" });
    const ts = String(Math.floor(Date.now() / 1000) - 120);
    const nonce = "b".repeat(32);
    const hash = createHash("sha256").update(body).digest("hex");
    const message = `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n${ts}\n${nonce}\n${hash}`;
    const response = await fetch(`${cfg.origin}/api/public/omni/workspace`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-omni-client": cfg.clientId,
        "x-omni-timestamp": ts,
        "x-omni-nonce": nonce,
        "x-omni-signature": createHmac("sha256", secret).update(message).digest("hex"),
      },
      body,
    });
    expect(response.status).toBe(401);
  });

  it("rejects a concurrent replay while the process is running", async () => {
    const request = signedRequest("a".repeat(32));
    const replies = await Promise.all(
      [0, 1].map(() => fetch(`${cfg.origin}/api/public/omni/workspace`, request)),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("atomically rejects concurrent replay across service processes sharing the state volume", async () => {
    const second = await startService(port + 1);
    try {
      const request = signedRequest("c".repeat(32));
      const replies = await Promise.all(
        [port, port + 1].map((p) =>
          fetch(`http://127.0.0.1:${p}/api/public/omni/workspace`, request),
        ),
      );
      expect(
        replies.map((r) => r.status).sort(),
        `First service: ${serviceLogs.get(proc)}; second service: ${serviceLogs.get(second)}`,
      ).toEqual([200, 401]);
    } finally {
      await stopService(second);
    }
  }, 10_000);

  it("fails closed on a concurrent Stop replay when the nonce store is contended", async () => {
    const second = await startService(port + 1);
    try {
      const request = signedRequest("8".repeat(32));
      const replies = await Promise.all(
        [port, port + 1].map((p) =>
          fetch(`http://127.0.0.1:${p}/api/public/omni/workspace`, request),
        ),
      );
      const statuses = replies.map((r) => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([401, 503]).toContain(statuses[1]);
      if (statuses[1] === 503) {
        for (
          let i = 0;
          i < 50 &&
          !`${serviceLogs.get(proc)} ${serviceLogs.get(second)}`.includes(
            "Stop attempted without durable nonce claim",
          );
          i++
        )
          await new Promise((resolve) => setTimeout(resolve, 10));
        const logs = `${serviceLogs.get(proc)} ${serviceLogs.get(second)}`;
        expect(logs).toContain("SQLite code 5");
        expect(logs).toContain("Stop attempted without durable nonce claim; result unverified.");
      }
      expect((await fetch(`${cfg.origin}/api/public/omni/workspace`, request)).status).toBe(401);
    } finally {
      await stopService(second);
    }
  }, 10_000);

  it("rejects a previously accepted request after an abrupt service restart", async () => {
    const request = signedRequest("d".repeat(32));
    const url = `${cfg.origin}/api/public/omni/workspace`;
    expect((await fetch(url, request)).status).toBe(200);
    await stopService(proc, "SIGKILL");
    proc = await startService(port);
    expect((await fetch(url, request)).status).toBe(401);
  }, 10_000);

  it("refuses requests when the durable nonce store cannot be locked", async () => {
    const alreadyClaimed = signedRequest("9".repeat(32));
    const url = `${cfg.origin}/api/public/omni/workspace`;
    expect((await fetch(url, alreadyClaimed)).status).toBe(200);
    const source = `
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]);
      db.exec("BEGIN EXCLUSIVE");
      process.stdout.write("locked\\n");
      process.on("SIGTERM", () => { db.exec("ROLLBACK"); db.close(); process.exit(0); });
      setInterval(() => {}, 1000);
    `;
    const lock = spawn(
      process.execPath,
      ["--input-type=module", "-e", source, path.join(dir, "root", ".state", "nonces.sqlite")],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const request = signedRequest("e".repeat(32));
    try {
      await new Promise<void>((resolve, reject) => {
        lock.stdout.once("data", () => resolve());
        lock.once("exit", () => reject(new Error("SQLite lock process exited before readiness.")));
        lock.once("error", reject);
      });
      const invalid = {
        ...request,
        headers: { ...request.headers, "x-omni-signature": "0".repeat(64) },
      };
      expect((await fetch(`${cfg.origin}/api/public/omni/workspace`, invalid)).status).toBe(401);
      for (const rejected of [
        signedRequest("1".repeat(32), "agent.stop", "other"),
        signedRequest("2".repeat(32), "session.end"),
      ]) {
        expect((await fetch(`${cfg.origin}/api/public/omni/workspace`, rejected)).status).toBe(503);
      }
      expect(serviceLogs.get(proc)).not.toContain("Stop attempted without durable nonce claim");
      const started = Date.now();
      expect((await fetch(`${cfg.origin}/api/public/omni/workspace`, request)).status).toBe(503);
      expect(Date.now() - started).toBeLessThan(2000);
      for (let i = 0; i < 50 && !serviceLogs.get(proc)?.includes("Stop attempted"); i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(serviceLogs.get(proc)).toContain(
        "Sandbox Stop attempted without durable nonce claim; result unverified.",
      );
      expect((await fetch(url, alreadyClaimed)).status).toBe(503);
      expect(serviceLogs.get(proc)).toContain("SQLite code 5");
    } finally {
      await stopService(lock);
    }
    expect((await fetch(url, alreadyClaimed)).status).toBe(401);
    expect((await fetch(`${cfg.origin}/api/public/omni/workspace`, request)).status).toBe(200);
  }, 25_000);
});
