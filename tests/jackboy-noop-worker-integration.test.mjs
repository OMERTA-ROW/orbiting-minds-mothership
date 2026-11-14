// Run with node --import tsx --test and JACKBOY_TEST_ROOT pointing to an installed Jackboy checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { registerHooks } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test(
  "Jackboy stop revokes the permit and cancels an actually running no-op",
  { timeout: 120000 },
  async (t) => {
    const root = process.env.JACKBOY_TEST_ROOT;
    if (!root) return t.skip("JACKBOY_TEST_ROOT is required");
    const jackboy = resolve(root);
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier.startsWith("@/") && context.parentURL?.includes(jackboy))
          return next(
            pathToFileURL(join(jackboy, "src", specifier.slice(2) + ".ts")).href,
            context,
          );
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
    const { supabaseStubs } = await import(
      pathToFileURL(join(jackboy, "tests/helpers/staging-pg.mjs"))
    );
    const { handleOmniLink } = await import(
      pathToFileURL(join(jackboy, "src/lib/omni-session.server.ts"))
    );
    const { handleOmniPermit } = await import(
      pathToFileURL(join(jackboy, "src/lib/omni-permit.server.ts"))
    );
    const { JackboyLink } = await import("../src/lib/jackboy-link.server.ts");
    const { handleNoopWorker } = await import("../src/lib/omni-noop-broker.server.ts");
    const { runNoopWorkerOnce } = await import("../src/lib/omni-noop-worker.ts");
    const jack = new PGlite();
    const mother = new PGlite();
    const owner = "11111111-1111-4111-8111-111111111111";
    const project = "33333333-3333-4333-8333-333333333333";
    const approval = "44444444-4444-4444-8444-444444444444";
    const proofJob = "55555555-5555-4555-8555-555555555555";
    const secret = "e".repeat(64),
      bootstrap = "b".repeat(64);
    const token = `omni_worker_${"a".repeat(64)}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiry = new Date(Date.now() + 3600000);
    const cfg = {
      clientId: "OMNI",
      projectId: project,
      ownerId: owner,
      approvalId: approval,
      approvalExpiresAt: expiry.toISOString(),
      bootstrap,
      secret,
    };
    try {
      await jack.exec(supabaseStubs);
      const seen = new Set();
      const jackMigrations = (await readdir(join(jackboy, "drizzle/migrations")))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .filter((f) => {
          const name = f.slice(5);
          if (name !== "migration.sql" && seen.has(name)) return false;
          seen.add(name);
          return true;
        });
      for (const f of jackMigrations)
        await jack.exec(await readFile(join(jackboy, "drizzle/migrations", f), "utf8"));
      await jack.query("INSERT INTO auth.users(id,email) VALUES ($1,'o@x.test')", [owner]);
      await jack.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'owner')", [owner]);
      await jack.exec(
        "INSERT INTO public.automation_policy(id,paused) VALUES(1,false) ON CONFLICT(id) DO NOTHING",
      );
      await jack.query(
        "INSERT INTO public.owner_projects(id,name,created_by) VALUES($1,'OMNI',$2)",
        [project, owner],
      );
      await jack.query(
        "INSERT INTO public.omni_link_approval(id,approval_id,expires_at,saved_by,saved_at) VALUES(1,$1,$2,$3,now()-interval '1 hour')",
        [approval, expiry.toISOString(), owner],
      );
      await jack.query(
        `INSERT INTO public.omni_inbound_jobs(id,client_id,project_id,approval_id,kind,status,deadline,updated_at,result)
      VALUES($1,'OMNI',$2,$3,'protocol.self-test','completed',now(),now()-interval '10 minutes','{"passed":true,"checks":3,"runner":"restricted-protocol-self-test"}')`,
        [proofJob, project, approval],
      );
      await jack.query(
        "INSERT INTO public.owner_passkeys(user_id,credential_id,public_key) VALUES($1,'cred-1','pk')",
        [owner],
      );
      await jack.exec(
        "ALTER TABLE public.code_runtime_controls DISABLE TRIGGER USER; UPDATE public.code_runtime_controls SET enabled=true,kill_switch=false; ALTER TABLE public.code_runtime_controls ENABLE TRIGGER USER; ALTER TABLE public.automation_policy DISABLE TRIGGER USER; UPDATE public.automation_policy SET paused=false WHERE id=1; ALTER TABLE public.automation_policy ENABLE TRIGGER USER",
      );
      await mother.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
      CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`);
      await mother.exec(await readFile(".lovable/pending/owner-invitations.sql", "utf8"));
      const files = await readdir("drizzle/migrations");
      for (const n of [
        ...Array.from({ length: 15 }, (_, i) => i + 20),
        36,
        47,
        48,
        51,
        53,
        54,
        55,
        56,
        57,
      ]) {
        const file = files.find(
          (f) => f.startsWith(`${String(n).padStart(4, "0")}_`) && f.endsWith(".sql"),
        );
        assert.ok(file, `Missing Mothership migration ${n}`);
        await mother.exec(await readFile(join("drizzle/migrations", file), "utf8"));
      }
      await mother.query("INSERT INTO auth.users VALUES($1,'owner@fixture.invalid',now())", [
        owner,
      ]);
      await mother.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'owner')", [owner]);
      await mother.exec(`INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'t',1);
      INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true);
      UPDATE public.omni_agents SET status='enrolled' WHERE id='omni';
      INSERT INTO public.activation_approvals(step) SELECT g FROM generate_series(1,10) g ON CONFLICT(step) DO NOTHING;
      UPDATE public.activation_approvals SET status='approved',decided_at=now()-interval '10 minutes',revision=1,
        approval_expires_at=CASE WHEN step=7 THEN now()+interval '1 hour' END;
      INSERT INTO public.activation_approval_checks(step,status,evidence_version,checked_at,summary,deployment_mode)
        VALUES(8,'passed',2,now()-interval '5 minutes','ok','runner_only');
      UPDATE public.activation_activations SET status='active',step_revision=1,step7_revision=1,window_ends_at=now()+interval '1 hour';`);
      await mother.query(
        "INSERT INTO public.omni_noop_workers(name,key_hash,created_by,expires_at) VALUES('fixture',$1,$2,now()+interval '1 hour')",
        [tokenHash, owner],
      );
      await mother.query(
        "INSERT INTO public.omni_noop_jobs(owner_id,duration_ms) VALUES($1,10000)",
        [owner],
      );
      const fetchJack = async (url, init) => {
        const request = new Request(url, init),
          raw = await request.clone().text();
        if (JSON.parse(raw).action === "handshake")
          return handleOmniLink(
            request,
            cfg,
            async (op, args) =>
              (
                await jack.query("SELECT public.omni_link_action($1,$2::jsonb) r", [
                  op,
                  JSON.stringify(args),
                ])
              ).rows[0].r,
            async () => true,
            {},
          );
        return handleOmniPermit(
          request,
          raw,
          cfg,
          async (op, args) =>
            (
              await jack.query("SELECT public.omni_execution_permit_action($1,$2::jsonb) r", [
                op,
                JSON.stringify(args),
              ])
            ).rows[0].r,
          {},
        );
      };
      const link = new JackboyLink(
        {
          origin: "https://jackboy.example.com",
          clientId: "OMNI",
          projectId: project,
          bootstrap,
          secret,
          approvalExpiresAt: expiry.getTime(),
        },
        async () => {},
        { fetch: fetchJack },
      );
      await link.connect();
      const grant = (
        await jack.query(
          "INSERT INTO public.step_up_grants(user_id,action,target,credential_id,expires_at) VALUES($1,'omni_autonomy',$2,'cred-1',now()+interval '5 minutes') RETURNING id",
          [owner, `omni-autonomy:${approval}`],
        )
      ).rows[0].id;
      assert.equal(
        (
          await jack.query(
            "SELECT public.omni_autonomy_authorization_action('authorize',$1,'OMNI',$2,$3,true,NULL) r",
            [owner, project, grant],
          )
        ).rows[0].r.ok,
        true,
      );
      const deps = {
        action: async (hash, action, job) =>
          (
            await mother.query("SELECT public.omni_noop_worker_action($1,$2,$3) r", [
              hash,
              action,
              job ?? null,
            ])
          ).rows[0].r,
        safety: async () => {
          const s = await link.safety();
          await mother.query(
            "SELECT public.jackboy_safety_record_v2('poll',$1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,NULL,'cross-test')",
            [
              s.killSwitch,
              s.emergencyStop,
              s.codeEnabled,
              s.autonomousAllowed,
              s.manualDiagnosticsAllowed,
              s.blockedBy,
              s.authorization?.expiresAt ?? null,
              s.activePermits,
              s.checkedAt,
              s.validUntil,
              s.proofDigest,
            ],
          );
          return s.autonomousAllowed;
        },
        permit: async (job, first) => {
          const req = {
            jobId: job,
            kind: "autonomous",
            digest: "9903e100e835979c05c1664f2eac28a97ba4884a56e0f62807a22e43b04d8633",
            estimateUsd: 1,
          };
          const p = await link.requestPermit(req, approval);
          const r = await mother.query(
            "SELECT public.jackboy_permit_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r",
            [
              job,
              req.kind,
              req.digest,
              p.id,
              p.expiresAt,
              p.renewals,
              p.limits.perCallUsd,
              p.limits.perTaskUsd,
              p.limits.dailyUsd,
              p.signatureDigest,
            ],
          );
          assert.equal(r.rows[0].r, first ? "issued" : "renewed");
        },
        release: async (job) => {
          await link.releasePermit(job);
          await mother.query(
            "SELECT public.jackboy_permit_close($1,'released','released_by_omni')",
            [job],
          );
        },
      };
      const started = performance.now();
      const running = runNoopWorkerOnce(
        "https://mothership.example/api/public/omni/noop-worker",
        token,
        async (url, init) => handleNoopWorker(new Request(url, init), deps),
      );
      let id;
      for (let n = 0; n < 100; n++) {
        const rows = await mother.query(
          "SELECT id FROM public.omni_noop_jobs WHERE status='running'",
        );
        if (rows.rows.length) {
          id = rows.rows[0].id;
          break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      }
      assert.ok(id, "worker must actually start");
      await jack.query("SELECT public.engage_code_kill_switch($1)", [owner]);
      assert.equal(
        (await jack.query("SELECT status FROM public.omni_execution_permits WHERE job_id=$1", [id]))
          .rows[0].status,
        "revoked",
      );
      assert.equal(await running, "cancelled");
      assert.ok(
        performance.now() - started < 8000,
        "running timer must stop before its 10-second duration",
      );
      assert.equal(
        (await mother.query("SELECT status FROM public.omni_noop_jobs WHERE id=$1", [id])).rows[0]
          .status,
        "cancelled",
      );
      assert.equal(
        (
          await mother.query(
            "SELECT count(*)::int n FROM public.razul_control_audit WHERE action='noop_cancelled' AND record_id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await jack.close();
      await mother.close();
    }
  },
);
