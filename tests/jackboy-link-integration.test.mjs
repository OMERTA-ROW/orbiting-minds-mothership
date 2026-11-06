// Run with JACKBOY_TEST_ROOT pointing at an installed isolated Jackboy checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";

// Test-only transport: trusts one local test certificate. Production uses the
// platform fetch with public certificate validation and no CA option.
const trustingFetch = (ca) => (url, init) =>
  new Promise((resolveFetch, reject) => {
    const req = httpsRequest(
      url,
      { method: init.method, headers: init.headers, ca, signal: init.signal },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolveFetch(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: Object.entries(res.headers).filter(([, v]) => typeof v === "string"),
            }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });

test("Mothership client against real Jackboy handler over verified TLS and isolated PGlite", async (t) => {
  const root = process.env["JACKBOY_TEST_ROOT"];
  if (!root) return t.skip("JACKBOY_TEST_ROOT is required for cross-repository integration");
  const jackboy = resolve(root);
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith("@/") && context.parentURL?.includes(jackboy))
        return next(pathToFileURL(join(jackboy, "src", specifier.slice(2) + ".ts")).href, context);
      if (
        specifier.startsWith("./") &&
        context.parentURL?.endsWith(".ts") &&
        !specifier.endsWith(".ts")
      )
        return next(new URL(specifier + ".ts", context.parentURL).href, context);
      return next(specifier, context);
    },
  });
  const { PGlite } = await import(
    pathToFileURL(join(jackboy, "node_modules/@electric-sql/pglite/dist/index.js"))
  );
  const { handleOmniLink } = await import(
    pathToFileURL(join(jackboy, "src/lib/omni-session.server.ts"))
  );
  const { createLinkServer } = await import(
    pathToFileURL(join(jackboy, "scripts/omni-link-server.mjs"))
  );
  const { JackboyLink } = await import("../src/lib/jackboy-link.server.ts");
  const db = new PGlite();
  const dir = await mkdtemp(join(tmpdir(), "mothership-link-test-"));
  const previous = process.env["OMNI_LINK_NODE_RUNNER_ENABLED"];
  process.env["OMNI_LINK_NODE_RUNNER_ENABLED"] = "true";
  let server;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE owner_projects(id uuid primary key,created_by uuid,active boolean);
      CREATE TABLE user_roles(user_id uuid,role text);
      CREATE TABLE automation_policy(id int primary key,paused boolean);
      CREATE TABLE omni_callback_nonces(nonce text primary key,received_at timestamptz default now());
      CREATE TABLE site_log(id uuid default gen_random_uuid(),actor text,action text,category text,status text,summary text,project_id uuid,detail jsonb);`);
    await db.exec(
      await readFile(join(jackboy, "drizzle/migrations/0030_omni_sessions.sql"), "utf8"),
    );
    const project = "11111111-1111-4111-8111-111111111111";
    const owner = "22222222-2222-4222-8222-222222222222";
    const approval = "33333333-3333-4333-8333-333333333333";
    const job = "44444444-4444-4444-8444-444444444444";
    await db.query("INSERT INTO owner_projects VALUES($1,$2,true)", [project, owner]);
    await db.query("INSERT INTO user_roles VALUES($1,'owner')", [owner]);
    await db.exec("INSERT INTO automation_policy VALUES(1,false)");
    const expiry = Date.now() + 3600000;
    const c = {
      clientId: "mothership-test",
      projectId: project,
      ownerId: owner,
      approvalId: approval,
      approvalExpiresAt: new Date(expiry).toISOString(),
      bootstrap: "b".repeat(64),
      secret: "s".repeat(64),
    };
    const store = async (op, args) =>
      (
        await db.query("SELECT omni_link_action($1,$2::jsonb) AS result", [
          op,
          JSON.stringify(args),
        ])
      ).rows[0].result;
    const key = join(dir, "key.pem"),
      cert = join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=IP:127.0.0.1,DNS:localhost",
      ],
      { stdio: "ignore" },
    );
    const otherKey = join(dir, "other-key.pem");
    const otherCert = join(dir, "other-cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        otherKey,
        "-out",
        otherCert,
        "-days",
        "1",
        "-subj",
        "/CN=untrusted",
      ],
      { stdio: "ignore" },
    );
    let corruptProof = false;
    server = createLinkServer(
      { key: await readFile(key), cert: await readFile(cert) },
      "https://127.0.0.1:0",
      async (request) => {
        const response = await handleOmniLink(request, c, store);
        if (corruptProof) response.headers.set("X-Omni-Proof", "0".repeat(64));
        return response;
      },
    );
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const origin = `https://127.0.0.1:${server.address().port}`;
    const config = {
      origin,
      clientId: c.clientId,
      projectId: project,
      bootstrap: c.bootstrap,
      secret: c.secret,
      approvalExpiresAt: expiry,
    };
    const trusted = { fetch: trustingFetch(await readFile(cert)) };
    const events = [];
    const client = new JackboyLink(config, async (event, id) => events.push([event, id]), trusted);
    await t.test("handshake and fixed self-test persist and return audited status", async () => {
      await client.connect();
      assert.equal((await client.execute("submit", job)).status, "queued");
      assert.equal((await client.execute("run", job)).status, "completed");
      assert.equal((await client.execute("status", job)).result.passed, true);
      assert(events.some(([event]) => event === "result_completed"));
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM site_log WHERE action='omni.link.completed'",
          )
        ).rows[0].n,
        1,
      );
    });
    await t.test("rejects untrusted certificate and wrong scoped credentials", async () => {
      const badCa = new JackboyLink(config, async () => {}, {
        fetch: trustingFetch(await readFile(otherCert)),
      });
      await assert.rejects(badCa.connect());
      const platformDefault = new JackboyLink(config, async () => {});
      await assert.rejects(platformDefault.connect(), /connection failed/);
      const wrongNameServer = createLinkServer(
        { key: await readFile(otherKey), cert: await readFile(otherCert) },
        "https://127.0.0.1:0",
        (request) => handleOmniLink(request, c, store),
      );
      await new Promise((done) => wrongNameServer.listen(0, "127.0.0.1", done));
      try {
        const wrongName = new JackboyLink(
          {
            ...config,
            origin: `https://127.0.0.1:${wrongNameServer.address().port}`,
          },
          async () => {},
          { fetch: trustingFetch(await readFile(otherCert)) },
        );
        await assert.rejects(wrongName.connect());
      } finally {
        await new Promise((done) => wrongNameServer.close(done));
      }
      const badKey = new JackboyLink(
        { ...config, bootstrap: "x".repeat(64) },
        async () => {},
        trusted,
      );
      await assert.rejects(badKey.connect());
    });
    await t.test("rejects a response with an invalid HMAC proof", async () => {
      corruptProof = true;
      try {
        const badProof = new JackboyLink(config, async () => {}, trusted);
        await assert.rejects(badProof.connect(), /proof is invalid/);
      } finally {
        corruptProof = false;
      }
    });
    await t.test("failed pre-request audit prevents outgoing handshake", async () => {
      const before = (await db.query("SELECT count(*)::int AS n FROM omni_link_sessions")).rows[0]
        .n;
      const blocked = new JackboyLink(
        config,
        async () => {
          throw Error("audit unavailable");
        },
        trusted,
      );
      await assert.rejects(blocked.connect(), /audit unavailable/);
      assert.equal(
        (await db.query("SELECT count(*)::int AS n FROM omni_link_sessions")).rows[0].n,
        before,
      );
    });
    await t.test("cancel remains terminal and a new session can recover job status", async () => {
      const id = "55555555-5555-4555-8555-555555555555";
      assert.equal((await client.execute("submit", id)).status, "queued");
      assert.equal((await client.execute("cancel", id)).status, "cancelled");
      const fresh = new JackboyLink(config, async () => {}, trusted);
      assert.equal((await fresh.execute("status", id)).status, "cancelled");
    });
    await t.test(
      "expired session is rejected and an explicit new session recovers status",
      async () => {
        await db.exec("UPDATE omni_link_sessions SET expires_at=now()-interval '1 second'");
        await assert.rejects(client.execute("status", job), /session rejected/);
        const renewed = new JackboyLink(config, async () => {}, trusted);
        assert.equal((await renewed.execute("status", job)).status, "completed");
      },
    );
    await t.test(
      "post-commit audit failure reports an uncertain outcome without repeating work",
      async () => {
        const id = "66666666-6666-4666-8666-666666666666";
        const uncertain = new JackboyLink(
          config,
          async (event) => {
            if (event === "result_queued") throw Error("audit unavailable; reconcile");
          },
          trusted,
        );
        await assert.rejects(uncertain.execute("submit", id), /reconcile/);
        const fresh = new JackboyLink(config, async () => {}, trusted);
        assert.equal((await fresh.execute("status", id)).status, "queued");
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM omni_inbound_jobs WHERE id=$1", [id]))
            .rows[0].n,
          1,
        );
      },
    );
    await t.test("expired grant and mismatched project are rejected", async () => {
      assert.throws(
        () => new JackboyLink({ ...config, approvalExpiresAt: Date.now() - 1 }, async () => {}),
      );
      const other = new JackboyLink({ ...config, projectId: owner }, async () => {}, trusted);
      await assert.rejects(other.connect());
    });
  } finally {
    if (server) await new Promise((done) => server.close(done));
    if (previous === undefined) delete process.env["OMNI_LINK_NODE_RUNNER_ENABLED"];
    else process.env["OMNI_LINK_NODE_RUNNER_ENABLED"] = previous;
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
