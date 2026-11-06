import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env["JACKBOY_TEST_ROOT"]) throw new Error("JACKBOY_TEST_ROOT is required");
const { PGlite } = await import(
  pathToFileURL(
    join(
      resolve(process.env["JACKBOY_TEST_ROOT"]),
      "node_modules/@electric-sql/pglite/dist/index.js",
    ),
  )
);
const { handleJackboyDispatch, dispatchHmac } =
  await import("../src/lib/jackboy-dispatch.server.ts");

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid, email_confirmed_at timestamptz);
  CREATE TABLE public.user_roles(user_id uuid, role text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('test.user_id', true),'')::uuid
  $$;
  CREATE FUNCTION public.is_razul_owner() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT current_setting('test.mfa',true) = 'aal2' AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'
    ) AND EXISTS (
      SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
    )
  $$;
  CREATE TABLE public.razul_control_audit(actor_id uuid, action text, record_type text, record_id text);
`);
await db.exec(
  await readFile(
    new URL("../drizzle/migrations/0031_jackboy_dispatch_quarantine.sql", import.meta.url),
    "utf8",
  ),
);
const owner = "11111111-1111-4111-8111-111111111111";
const grant = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const job = "44444444-4444-4444-8444-444444444444";
const localOwner = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);
const nonce = () => crypto.randomUUID().replaceAll("-", "");
async function call(op, options = {}) {
  const args = [
    op,
    options.nonce ?? nonce(),
    options.grant ?? grant,
    options.job ?? job,
    options.owner ?? owner,
    options.project ?? project,
    options.repo ?? "acme/repo",
    options.kind ?? "test",
    options.digest ?? digest,
  ];
  return (
    await db.query(
      "SELECT public.jackboy_dispatch_quarantine($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result",
      args,
    )
  ).rows[0].result;
}
beforeEach(async () => {
  await db.exec(
    "TRUNCATE jackboy_dispatch_jobs,jackboy_dispatch_nonces,jackboy_dispatch_grants,razul_control_audit,public.user_roles,auth.users",
  );
  await db.query("INSERT INTO auth.users VALUES ($1,now())", [localOwner]);
  await db.query("INSERT INTO public.user_roles VALUES ($1,'owner')", [localOwner]);
  await db.query("SELECT set_config('test.user_id',$1,false),set_config('test.mfa','aal2',false)", [
    localOwner,
  ]);
  await db.query(
    `INSERT INTO jackboy_dispatch_grants
    (id,owner_id,jackboy_owner_id,project_id,job_id,repo,kind,payload_digest,expires_at)
    VALUES ($1,$2,$3,$4,$5,'acme/repo','test',$6,now()+interval '10 minutes')`,
    [grant, localOwner, owner, project, job, digest],
  );
});
after(() => db.close());

test("accepted jobs remain quarantined, duplicate submission is idempotent and cancellation is terminal", async () => {
  assert.deepEqual(await call("submit"), { id: job, status: "quarantined" });
  assert.deepEqual(await call("submit"), { id: job, status: "quarantined" });
  assert.deepEqual(await call("cancel"), { id: job, status: "cancelled" });
  assert.deepEqual(await call("submit"), { id: job, status: "cancelled" });
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_jobs")).rows[0].n,
    1,
  );
  assert.equal((await db.query("SELECT count(*)::int AS n FROM razul_control_audit")).rows[0].n, 4);
});

test("missing, mismatched, expired and revoked grants reject without intake", async () => {
  for (const options of [
    { owner: localOwner },
    { project: localOwner },
    { job: localOwner },
    { repo: "other/repo" },
    { kind: "code" },
    { digest: "b".repeat(64) },
    { grant: localOwner },
  ])
    await assert.rejects(call("submit", options));
  await db.exec("UPDATE jackboy_dispatch_grants SET expires_at=now()-interval '1 second'");
  await assert.rejects(call("submit"));
  await db.exec(
    "UPDATE jackboy_dispatch_grants SET expires_at=now()+interval '1 minute',revoked_at=now()",
  );
  await assert.rejects(call("submit"));
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_jobs")).rows[0].n,
    0,
  );
});

test("revoked owner role or unconfirmed owner identity deny intake", async () => {
  await db.exec("DELETE FROM public.user_roles");
  await assert.rejects(call("submit"));
  await db.query("INSERT INTO public.user_roles VALUES ($1,'owner')", [localOwner]);
  await db.exec("UPDATE auth.users SET email_confirmed_at=NULL");
  await assert.rejects(call("submit"));
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_jobs")).rows[0].n,
    0,
  );
});

test("owner grant requires MFA and commits its audit with approval and revocation", async () => {
  const second = "77777777-7777-4777-8777-777777777777";
  const args = [
    "issue",
    second,
    owner,
    project,
    job,
    "acme/repo",
    digest,
    new Date(Date.now() + 600000).toISOString(),
  ];
  const sql = "SELECT jackboy_dispatch_owner_grant($1,$2,$3,$4,$5,$6,$7,$8) AS result";
  await db.exec("SELECT set_config('test.mfa','aal1',false)");
  await assert.rejects(db.query(sql, args));
  await db.exec("SELECT set_config('test.mfa','aal2',false)");
  await db.exec(
    "ALTER TABLE razul_control_audit ADD CONSTRAINT refuse_audit CHECK (false) NOT VALID",
  );
  await assert.rejects(db.query(sql, args));
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_grants WHERE id=$1", [second]))
      .rows[0].n,
    0,
  );
  await db.exec("ALTER TABLE razul_control_audit DROP CONSTRAINT refuse_audit");
  assert.equal((await db.query(sql, args)).rows[0].result.revoked, false);
  assert.equal(
    (await db.query(sql, ["revoke", second, null, null, null, null, null, null])).rows[0].result
      .revoked,
    true,
  );
  assert.equal((await db.query("SELECT count(*)::int AS n FROM razul_control_audit")).rows[0].n, 2);
});

test("nonce replay and conflicting job identity are rejected", async () => {
  const n = nonce();
  await call("submit", { nonce: n });
  await assert.rejects(call("submit", { nonce: n }));
  const other = "66666666-6666-4666-8666-666666666666";
  await db.query(
    `INSERT INTO jackboy_dispatch_grants
    (id,owner_id,jackboy_owner_id,project_id,job_id,repo,kind,payload_digest,expires_at)
    VALUES ($1,$2,$3,$4,$5,'acme/repo','test',$6,now()+interval '5 minutes')`,
    [other, localOwner, owner, project, job, digest],
  );
  await assert.rejects(call("submit", { grant: other }));
});

test("failed audit rolls back nonce and job", async () => {
  await db.exec(
    "ALTER TABLE razul_control_audit ADD CONSTRAINT refuse_audit CHECK (false) NOT VALID",
  );
  try {
    await assert.rejects(call("submit"));
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_jobs")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM jackboy_dispatch_nonces")).rows[0].n,
      0,
    );
  } finally {
    await db.exec("ALTER TABLE razul_control_audit DROP CONSTRAINT refuse_audit");
  }
});

test("callback preparation and acknowledgement require MFA, current state, grant and durable audit", async () => {
  await call("submit");
  const snapshot = (op, status = null) =>
    db.query("SELECT jackboy_dispatch_callback_snapshot($1,$2,$3) AS result", [op, job, status]);
  await db.exec("SELECT set_config('test.mfa','aal1',false)");
  await assert.rejects(snapshot("prepare"));
  await db.exec("SELECT set_config('test.mfa','aal2',false)");
  assert.equal((await snapshot("prepare")).rows[0].result.status, "quarantined");
  await call("cancel");
  await assert.rejects(snapshot("ack", "quarantined"));
  await db.exec(
    "ALTER TABLE razul_control_audit ADD CONSTRAINT refuse_audit CHECK (false) NOT VALID",
  );
  try {
    await assert.rejects(snapshot("prepare"));
    await assert.rejects(snapshot("ack", "cancelled"));
  } finally {
    await db.exec("ALTER TABLE razul_control_audit DROP CONSTRAINT refuse_audit");
  }
  assert.equal((await snapshot("ack", "cancelled")).rows[0].result.status, "cancelled");
  await db.exec("UPDATE jackboy_dispatch_grants SET revoked_at=now()");
  await assert.rejects(snapshot("prepare"));
});

test("browser roles cannot access records or invoke quarantine", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege($1,'public.jackboy_dispatch_jobs','select') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege($1,'public.jackboy_dispatch_quarantine(text,text,uuid,uuid,uuid,uuid,text,text,text)','execute') AS allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
  }
});

test("signed handler admits only the scoped transaction, rejects tampering and replay", async () => {
  const settings = { clientId: "test-client", secret: "s".repeat(64) };
  const input = {
    contract: "jackboy.dispatch/v2",
    action: "submit",
    ownerId: owner,
    projectId: project,
    grantId: grant,
    jobId: job,
    repo: "acme/repo",
    kind: "test",
    payloadDigest: digest,
  };
  const n = nonce();
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(input);
  const sig = await dispatchHmac(
    settings.secret,
    `jackboy.dispatch/v2\nPOST\n/api/public/jackboy/dispatch\n${settings.clientId}\n${ts}\n${n}\n${body}`,
  );
  const request = (raw = body, signature = sig) =>
    new Request("https://mothership.test/api/public/jackboy/dispatch", {
      method: "POST",
      headers: {
        "x-jackboy-client": settings.clientId,
        "x-jackboy-timestamp": ts,
        "x-jackboy-nonce": n,
        "x-jackboy-signature": signature,
      },
      body: raw,
    });
  const store = async (requestNonce, i) =>
    call(i.action, {
      nonce: requestNonce,
      grant: i.grantId,
      job: i.jobId,
      owner: i.ownerId,
      project: i.projectId,
      repo: i.repo,
      kind: i.kind,
      digest: i.payloadDigest,
    });
  assert.equal((await handleJackboyDispatch(request(), null, store)).status, 503);
  assert.equal(
    (await handleJackboyDispatch(request(body.replace("acme/repo", "evil/repo")), settings, store))
      .status,
    401,
  );
  const response = await handleJackboyDispatch(request(), settings, store);
  assert.equal(response.status, 202);
  const resultBody = await response.text();
  assert.equal(
    response.headers.get("x-jackboy-proof"),
    await dispatchHmac(settings.secret, `jackboy.dispatch/v2\nresponse\n${n}\n202\n${resultBody}`),
  );
  assert.equal(JSON.parse(resultBody).job.status, "quarantined");
  assert.equal((await handleJackboyDispatch(request(), settings, store)).status, 503);
});
