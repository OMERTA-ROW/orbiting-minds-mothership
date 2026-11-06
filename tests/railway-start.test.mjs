import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

test("Railway selects Node without changing Lovable or the custom SSR entry", () => {
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(scripts.build, "vite build");
  assert.equal(scripts["build:railway"], "NITRO_PRESET=node-server vite build");
  assert.equal(scripts.start, "NITRO_HOST=0.0.0.0 node .output/server/index.mjs");
  const metadata = JSON.parse(readFileSync(".output/nitro.json", "utf8"));
  assert.equal(metadata.preset, "node-server");
  assert.equal(metadata.serverEntry, "server/index.mjs");
  const config = readFileSync("vite.config.ts", "utf8");
  assert.match(config, /entry: "server"/);
  assert.match(config, /noExternal: \["wavefile"\]/);
});

test(
  "Node production listener serves Mothership and rejects unauthenticated API access",
  {
    timeout: 30_000,
  },
  async () => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const { port } = probe.address();
    await new Promise((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );

    // No inherited credentials, provider configuration, cron secrets or integration grants.
    const child = spawn(process.execPath, [".output/server/index.mjs"], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        NITRO_HOST: "0.0.0.0",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const exited = once(child, "exit");
    try {
      const origin = `http://127.0.0.1:${port}`;
      let response;
      for (let attempt = 0; attempt < 100; attempt++) {
        assert.equal(child.exitCode, null, `Server exited before readiness: ${output}`);
        try {
          response = await fetch(`${origin}/favicon.svg`, { signal: AbortSignal.timeout(1000) });
        } catch (error) {
          if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
        }
        if (response) break;
        await delay(100);
      }
      assert.ok(response, `Server did not listen on Railway PORT: ${output}`);
      assert.equal(response.status, 200);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        readFileSync("public/favicon.svg"),
      );
      const home = await fetch(origin, { signal: AbortSignal.timeout(5000) });
      assert.equal(home.status, 200, output);
      assert.match(home.headers.get("content-type"), /text\/html/);
      const html = await home.text();
      assert.match(html, /<!doctype html>/i);
      assert.match(html, /EVOLUTION/);
      assert.doesNotMatch(html, /This page didn't load/);
      for (const path of ["/api/public/omni/health", "/api/public/omni/jobs"]) {
        for (const headers of [{}, { authorization: "Bearer invalid" }]) {
          const denied = await fetch(`${origin}${path}`, {
            headers,
            signal: AbortSignal.timeout(5000),
          });
          assert.equal(denied.status, 401, output);
          assert.equal(denied.headers.get("cache-control"), "no-store");
          assert.deepEqual(await denied.json(), { error: "A valid OMNI API key is required" });
        }
      }
      const cron = await fetch(`${origin}/api/public/jobs/knowledge-collect`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(cron.status, 500, output);
      assert.equal(await cron.text(), "Server configuration error");
      await delay(200);
      assert.equal(child.exitCode, null, `Server stopped after requests: ${output}`);
    } finally {
      child.kill("SIGTERM");
      const stopped = await Promise.race([
        exited.then(() => true),
        delay(5000, false, { ref: false }),
      ]);
      if (!stopped) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  },
);
