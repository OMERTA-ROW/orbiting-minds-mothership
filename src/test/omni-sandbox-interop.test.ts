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

describe("quarantined workspace reference", () => {
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-sbx-"));
    const source = `
      import { loadConfig, createSandbox } from "./services/omni-sandbox/server.mjs";
      const sandbox = createSandbox(loadConfig(), { network: "isolated" });
      sandbox.server.listen(Number(process.env.PORT), "127.0.0.1");
      process.on("SIGTERM", () => sandbox.close());
    `;
    proc = spawn(process.execPath, ["--input-type=module", "-e", source], {
      env: {
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
        PORT: String(port),
        OMNI_SANDBOX_CLIENT_ID: cfg.clientId,
        OMNI_SANDBOX_HMAC_SECRET: secret,
        OMNI_SANDBOX_ROOT: path.join(dir, "root"),
        OMNI_SANDBOX_ALLOW_NETWORK: "true",
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 50; i++) {
      if (
        await fetch(`${cfg.origin}/healthz`).then(
          (r) => r.ok,
          () => false,
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Reference service did not start.");
  }, 10_000);

  afterAll(async () => {
    if (proc && proc.exitCode === null) {
      const exit = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
      proc.kill("SIGTERM");
      await exit;
    }
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
    const body = JSON.stringify({ action: "agent.stop", projectId: "omni" });
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = "a".repeat(32);
    const hash = createHash("sha256").update(body).digest("hex");
    const message = `omni.workspace/v1\nPOST\n/api/public/omni/workspace\n${ts}\n${nonce}\n${hash}`;
    const headers = {
      "content-type": "application/json",
      "x-omni-client": cfg.clientId,
      "x-omni-timestamp": ts,
      "x-omni-nonce": nonce,
      "x-omni-signature": createHmac("sha256", secret).update(message).digest("hex"),
    };
    const replies = await Promise.all(
      [0, 1].map(() =>
        fetch(`${cfg.origin}/api/public/omni/workspace`, { method: "POST", headers, body }),
      ),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 401]);
  });
});
