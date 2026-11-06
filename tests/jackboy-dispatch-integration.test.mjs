import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";

test("signed dispatch quarantines an explicitly authorized job across verified local TLS", async () => {
  const root = resolve(process.env["JACKBOY_TEST_ROOT"] || "");
  if (!process.env["JACKBOY_TEST_ROOT"]) throw new Error("JACKBOY_TEST_ROOT is required");
  registerHooks({
    resolve(specifier, context, next) {
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
    pathToFileURL(join(root, "node_modules/@electric-sql/pglite/dist/index.js"))
  );
  const { OmniDispatchClient } = await import(
    pathToFileURL(join(root, "src/lib/omni-dispatch-client.server.ts"))
  );
  const { handleDispatchCallback } = await import(
    pathToFileURL(join(root, "src/lib/omni-dispatch-callback.server.ts"))
  );
  const { sendDispatchCallback } = await import("../src/lib/jackboy-dispatch-callback.server.ts");
  const { dispatchPayloadDigest: jackboyDigest } = await import(
    pathToFileURL(join(root, "src/lib/omni-dispatch-digest.ts"))
  );
  const { dispatchPayloadDigest: mothershipDigest } =
    await import("../src/lib/jackboy-dispatch-digest.ts");
  const { handleJackboyDispatch } = await import("../src/lib/jackboy-dispatch.server.ts");
  const jackboy = new PGlite();
  const mothership = new PGlite();
  const dir = await mkdtemp(join(tmpdir(), "dispatch-tls-"));
  let server;
  const owner = "11111111-1111-4111-8111-111111111111";
  const project = "22222222-2222-4222-8222-222222222222";
  const job = "33333333-3333-4333-8333-333333333333";
  const step = "44444444-4444-4444-8444-444444444444";
  const localOwner = "55555555-5555-4555-8555-555555555555";
  try {
    await jackboy.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE user_roles(user_id uuid, role text);
      CREATE TABLE agent_projects(id uuid PRIMARY KEY, created_by uuid, enrolled boolean, repo_url text);
      CREATE TABLE omni_jobs(id uuid PRIMARY KEY, project_id uuid, kind text, repo text,
        instructions text, status text, sent_at timestamptz, code_request_id uuid);
      CREATE TABLE automation_policy(id int, paused boolean);
      CREATE TABLE owner_passkeys(user_id uuid, credential_id text);
      CREATE TABLE step_up_grants(id uuid PRIMARY KEY, user_id uuid, action text, target text,
        credential_id text, used_at timestamptz, expires_at timestamptz);
      CREATE TABLE site_log(actor text, action text, category text, status text,
        summary text, project_id uuid, detail jsonb);
    `);
    await jackboy.exec(
      await readFile(join(root, "drizzle/migrations/0044_omni_dispatch_grants.sql"), "utf8"),
    );
    await jackboy.query("INSERT INTO user_roles VALUES ($1,'owner')", [owner]);
    await jackboy.query(
      "INSERT INTO agent_projects VALUES ($1,$2,true,'https://github.com/acme/repo')",
      [project, owner],
    );
    await jackboy.query(
      "INSERT INTO omni_jobs VALUES ($1,$2,'test','acme/repo','bounded request','queued',NULL,NULL)",
      [job, project],
    );
    await jackboy.exec("INSERT INTO automation_policy VALUES (1,false)");
    await jackboy.query("INSERT INTO owner_passkeys VALUES ($1,'device')", [owner]);
    await jackboy.query(
      "INSERT INTO step_up_grants VALUES ($1,$2,'omni_dispatch',$3,'device',NULL,now()+interval '5 minutes')",
      [step, owner, `omni-job:${job}`],
    );
    const issued = (
      await jackboy.query("SELECT omni_dispatch_grant_action('issue',$1,$2,$3) AS result", [
        owner,
        job,
        step,
      ])
    ).rows[0].result;

    await mothership.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid, email_confirmed_at timestamptz);
      CREATE TABLE public.user_roles(user_id uuid, role text);
      CREATE TABLE public.razul_control_audit(actor_id uuid, action text, record_type text, record_id text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.user_id',true),'')::uuid
      $$;
      CREATE FUNCTION public.is_razul_owner() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT current_setting('test.mfa',true) = 'aal2' AND EXISTS (
          SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'
        ) AND EXISTS (
          SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
        )
      $$;
    `);
    await mothership.exec(
      await readFile(
        new URL("../drizzle/migrations/0031_jackboy_dispatch_quarantine.sql", import.meta.url),
        "utf8",
      ),
    );
    await mothership.query("INSERT INTO auth.users VALUES ($1,now())", [localOwner]);
    await mothership.query("INSERT INTO public.user_roles VALUES ($1,'owner')", [localOwner]);
    await mothership.query(
      "SELECT set_config('test.user_id',$1,false),set_config('test.mfa','aal2',false)",
      [localOwner],
    );
    const payload = {
      ownerId: owner,
      projectId: project,
      grantId: issued.id,
      jobId: job,
      repo: "acme/repo",
      kind: "test",
      instructions: issued.instructions,
    };
    const payloadDigest = await jackboyDigest(payload);
    assert.equal(payloadDigest, await mothershipDigest(payload));
    assert.notEqual(
      payloadDigest,
      await mothershipDigest({ ...payload, instructions: "altered request" }),
    );
    assert.notEqual(payloadDigest, await mothershipDigest({ ...payload, projectId: localOwner }));
    const { instructions, ...scopeFields } = payload;
    assert.equal(instructions, "bounded request");
    const scope = { ...scopeFields, payloadDigest };
    await mothership.query(`SELECT jackboy_dispatch_owner_grant('issue',$1,$2,$3,$4,$5,$6,$7)`, [
      scope.grantId,
      owner,
      project,
      job,
      scope.repo,
      scope.payloadDigest,
      issued.expiresAt,
    ]);
    const settings = { clientId: "isolated-client", secret: "s".repeat(64) };
    const store = async (nonce, input) =>
      (
        await mothership.query(
          "SELECT jackboy_dispatch_quarantine($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result",
          [
            input.action,
            nonce,
            input.grantId,
            input.jobId,
            input.ownerId,
            input.projectId,
            input.repo,
            input.kind,
            input.payloadDigest,
          ],
        )
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
        "subjectAltName=DNS:localhost",
      ],
      { stdio: "ignore" },
    );
    server = createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const request = new Request(`https://localhost${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: Buffer.concat(chunks),
          });
          const reply =
            req.url === "/api/public/omni/callback"
              ? await handleDispatchCallback(request, settings, async (nonce, input) => {
                  const checked = (
                    await jackboy.query(
                      "SELECT omni_dispatch_grant_action('check',$1,$2,$3) AS result",
                      [input.ownerId, input.jobId, input.grantId],
                    )
                  ).rows[0].result;
                  if (
                    !checked.valid ||
                    checked.projectId !== input.projectId ||
                    checked.repo !== input.repo ||
                    (await jackboyDigest({ ...checked, grantId: checked.id })) !==
                      input.payloadDigest
                  )
                    throw new Error("invalid callback scope");
                  await jackboy.query(
                    "SELECT omni_dispatch_callback_record($1,$2,$3,$4,$5,$6,$7)",
                    [
                      nonce,
                      input.ownerId,
                      input.projectId,
                      input.jobId,
                      input.grantId,
                      input.repo,
                      input.status,
                    ],
                  );
                })
              : await handleJackboyDispatch(request, settings, store);
          res.writeHead(reply.status, Object.fromEntries(reply.headers));
          res.end(await reply.text());
        } catch {
          res.writeHead(500);
          res.end();
        }
      },
    );
    await new Promise((resolveListen) => server.listen(0, "localhost", resolveListen));
    const origin = `https://localhost:${server.address().port}`;
    const audit = [];
    let received = 0;
    server.on("request", () => {
      received++;
    });
    const authorize = async (value) => {
      if (JSON.stringify(value) !== JSON.stringify(scope)) return false;
      const result = await jackboy.query(
        "SELECT omni_dispatch_grant_action('check',$1,$2,$3) AS result",
        [value.ownerId, value.jobId, value.grantId],
      );
      return result.rows[0].result.valid;
    };
    const client = new OmniDispatchClient(
      { origin, ca: await readFile(cert), ...settings },
      authorize,
      async (event) => audit.push(event),
    );
    const auditBlocked = new OmniDispatchClient(
      { origin, ca: await readFile(cert), ...settings },
      authorize,
      async () => {
        throw new Error("audit unavailable");
      },
    );
    await assert.rejects(auditBlocked.send("submit", scope), /audit unavailable/);
    assert.equal(received, 0);
    const wrongSecret = new OmniDispatchClient(
      { origin, ca: await readFile(cert), ...settings, secret: "x".repeat(64) },
      authorize,
      async () => {},
    );
    await assert.rejects(wrongSecret.send("submit", scope), /HTTP 401/);
    await assert.rejects(
      client.send("submit", { ...scope, projectId: localOwner }),
      /grant unavailable/,
    );
    await assert.rejects(
      client.send("submit", { ...scope, payloadDigest: "b".repeat(64) }),
      /grant unavailable/,
    );
    assert.deepEqual(await client.send("submit", scope), { id: job, status: "quarantined" });
    assert.deepEqual(await client.send("submit", scope), { id: job, status: "quarantined" });
    assert.deepEqual(await client.send("cancel", scope), { id: job, status: "cancelled" });
    assert.deepEqual(await client.send("status", scope), { id: job, status: "cancelled" });
    assert.equal(
      (await mothership.query("SELECT count(*)::int AS n FROM jackboy_dispatch_jobs")).rows[0].n,
      1,
    );
    assert.equal(
      (await mothership.query("SELECT count(*)::int AS n FROM razul_control_audit")).rows[0].n,
      5,
    );
    assert.equal(audit.length, 8);
    const snapshot = (
      await mothership.query(
        "SELECT jackboy_dispatch_callback_snapshot('prepare',$1,NULL) AS result",
        [job],
      )
    ).rows[0].result;
    await assert.rejects(sendDispatchCallback({ origin, ca: "invalid", ...settings }, snapshot));
    await assert.rejects(
      sendDispatchCallback(
        { origin, ca: await readFile(cert), ...settings, secret: "x".repeat(64) },
        snapshot,
      ),
      /HTTP 401/,
    );
    assert.deepEqual(
      await sendDispatchCallback({ origin, ca: await readFile(cert), ...settings }, snapshot),
      { status: "cancelled" },
    );
    await mothership.query("SELECT jackboy_dispatch_callback_snapshot('ack',$1,$2)", [
      job,
      "cancelled",
    ]);
    assert.equal(
      (await jackboy.query("SELECT status FROM omni_dispatch_receipts")).rows[0].status,
      "cancelled",
    );
    assert.equal(
      (await jackboy.query("SELECT count(*)::int AS n FROM omni_dispatch_callback_nonces")).rows[0]
        .n,
      1,
    );
    await jackboy.query("SELECT omni_dispatch_grant_action('revoke',$1,$2,$3)", [
      owner,
      job,
      issued.id,
    ]);
    await assert.rejects(
      sendDispatchCallback({ origin, ca: await readFile(cert), ...settings }, snapshot),
      /HTTP 503/,
    );
    await assert.rejects(client.send("submit", scope), /grant unavailable/i);
    const untrusted = new OmniDispatchClient(
      { origin, ca: "invalid", ...settings },
      async () => true,
      async () => {},
    );
    await assert.rejects(untrusted.send("status", scope));
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await jackboy.close();
    await mothership.close();
    await rm(dir, { recursive: true, force: true });
  }
});
