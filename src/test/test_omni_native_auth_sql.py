"""Disposable PostgreSQL only: native OMNI browser approval, PKCE exchange and device rotation."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
X1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
Y1 = "AQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
X2 = "AgECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
Y2 = "AwECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
X3 = "BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
Y3 = "BQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
CHALLENGE = "A" * 43
PERMISSIONS = "ARRAY['status.read','jobs.propose']"
JWK1 = {"crv": "P-256", "kty": "EC", "x": X1, "y": Y1}
JWK2 = {"crv": "P-256", "kty": "EC", "x": X2, "y": Y2}
JWK3 = {"crv": "P-256", "kty": "EC", "x": X3, "y": Y3}


def fingerprint(jwk):
    canonical = json.dumps(jwk, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def migrations():
    found = []
    for number in range(20, 75):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    assert found[-1].name.startswith("0074_"), found[-1]
    found.append(ROOT / ".lovable/pending/0075_claude_engine_terminal_fusion.sql")
    found.append(ROOT / ".lovable/pending/0076_omni_native_cli_authorization.sql")
    found.append(ROOT / ".lovable/pending/0077_omni_native_cli_chat.sql")
    found.append(ROOT / ".lovable/pending/0078_omni_native_device_status.sql")
    found.append(ROOT / ".lovable/pending/0079_omni_native_bound_admission.sql")
    found.append(ROOT / ".lovable/pending/0080_omni_native_chat_finish_authorization.sql")
    return found


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-native-auth-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT="55453", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        result = subprocess.run(
            ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text],
            env=env,
            capture_output=True,
            text=True,
        )
        if ok and result.returncode:
            raise AssertionError(result.stderr)
        if not ok and not result.returncode:
            raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()

    now = int(time.time())
    fresh = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    stale = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'

    def caller(uid, aal, amr, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(
            f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; "
            f"SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}",
            ok,
        )

    def owner(text, ok=True, amr=fresh):
        return caller(OWNER, "aal2", amr, text, ok)

    def service(text, ok=True):
        nonlocal checks
        checks += 1
        result = sql(f"SET ROLE service_role; {text}", ok)
        return result.splitlines()[-1] if ok else result

    started = False

    def authorize(
        code_hash,
        nonce_hash,
        jwk,
        rotation=None,
        permissions=PERMISSIONS,
        port=49152,
    ):
        public = "'" + json.dumps(jwk, separators=(",", ":")) + "'::jsonb"
        rotate_sql = "NULL" if rotation is None else f"'{rotation}'::uuid"
        return (
            "SELECT public.omni_native_authorize("
            f"'omni-native-cli','omni-mothership',{port},'{code_hash}','{CHALLENGE}',"
            f"'{nonce_hash}',{int(time.time() * 1000)},{public},'{fingerprint(jwk)}',"
            f"'OMNI CLI','macos',{permissions},{rotate_sql});"
        )

    def exchange(code_hash, challenge=CHALLENGE, port=49152):
        return service(
            "SELECT public.omni_native_exchange("
            f"'{code_hash}','{challenge}','omni-native-cli','omni-mothership',{port});"
        )

    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(
            [
                "pg_ctl",
                "-D",
                str(base / "db"),
                "-l",
                str(base / "server.log"),
                "-o",
                f"-k {base} -p 55453 -c listen_addresses=''",
                "-w",
                "start",
            ]
        )
        started = True
        sql(
            """CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
              $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS
              $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),
                   'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
            CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
            CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;"""
        )
        sql((ROOT / "drizzle/migrations/0000_ai_generation_circuit_breaker.sql").read_text())
        sql(
            """CREATE TABLE public.beta_access (
                 user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false,
                 paused boolean NOT NULL DEFAULT false, approved_at timestamptz
               );
               CREATE TABLE public.beta_projects (
                 id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text, brief text,
                 UNIQUE (id, owner_id)
               );"""
        )
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        sql((ROOT / "drizzle/migrations/0019_omni_agent_runs.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(
            f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),"
            f"('{OTHER}','other@fixture.invalid',now()); "
            f"INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');"
        )
        project = "33333333-3333-4333-8333-333333333333"
        chat_session = "44444444-4444-4444-8444-444444444444"
        request_id = "55555555-5555-4555-8555-555555555555"
        sql(
            f"INSERT INTO public.beta_access(user_id,ai_approved) VALUES('{OWNER}',true); "
            f"INSERT INTO public.beta_projects(id,owner_id,name,brief) "
            f"VALUES('{project}','{OWNER}','Native fixture project','Private owner project'); "
            f"INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_by) "
            f"VALUES(1,false,'{OWNER}'); "
            f"INSERT INTO public.claude_prices(model,in_cents_per_mtok,out_cents_per_mtok,confirmed_by,confirmed_at) "
            f"VALUES('claude-sonnet-5-5',1000,1000,'{OWNER}',now()); "
            f"INSERT INTO public.claude_engine_settings(owner_id,agent_id,model,enabled) "
            f"VALUES('{OWNER}','omni','claude-sonnet-5-5',true);"
        )
        assert caller(OWNER, "aal1", fresh, "SELECT public.omni_native_authorization_ready();").endswith("t")
        for role in ["anon", "authenticated"]:
            assert sql(
                f"SELECT has_function_privilege('{role}',"
                "'public.omni_native_exchange(text,text,text,text,integer)','execute');"
            ) == "f"
            checks += 1

        # Consent fails closed for non-owners, missing aal2 and stale TOTP.
        caller(OTHER, "aal2", fresh, authorize("a" * 64, "1" * 64, JWK1), False)
        caller(OWNER, "aal1", fresh, authorize("a" * 64, "1" * 64, JWK1), False)
        owner(authorize("a" * 64, "1" * 64, JWK1), False, amr=stale)

        # Owner consent persists only a code hash and public key; service exchange is one-use.
        assert '"ok": true' in owner(authorize("a" * 64, "1" * 64, JWK1))
        assert service(
            f"SELECT code_hash FROM public.omni_native_authorization_codes WHERE code_hash='{'a' * 64}';"
        ) == "a" * 64
        enrolled = exchange("a" * 64)
        assert '"ok": true' in enrolled and '"status": "paired"' in enrolled, enrolled
        device = json.loads(enrolled)["device_id"]
        assert json.loads(enrolled)["permissions"] == ["jobs.propose", "status.read"]
        assert '"code_already_used"' in exchange("a" * 64)
        assert service(f"SELECT public.omni_native_owner_ok('{OTHER}');") == "f"

        # Bad PKCE and expired codes are consumed and cannot be retried.
        assert '"ok": true' in owner(authorize("b" * 64, "2" * 64, JWK2))
        assert '"pkce_mismatch"' in exchange("b" * 64, "B" * 43)
        assert '"code_already_used"' in exchange("b" * 64)
        assert '"ok": true' in owner(authorize("c" * 64, "3" * 64, JWK2))
        service(
            "UPDATE public.omni_native_authorization_codes "
            "SET created_at=now()-interval '61 seconds', expires_at=now()-interval '2 seconds' "
            f"WHERE code_hash='{'c' * 64}';"
        )
        assert '"code_expired"' in exchange("c" * 64)

        # Rotation preserves approved permissions, increments revision and atomically replaces the key.
        revision = owner(f"SELECT revision FROM public.omni_dock_devices WHERE id='{device}';").splitlines()[-1]
        assert '"ok": true' in owner(
            authorize(
                "d" * 64,
                "4" * 64,
                JWK2,
                rotation=device,
                permissions="ARRAY[]::text[]",
            )
        )
        rotated = exchange("d" * 64)
        assert '"ok": true' in rotated, rotated
        assert json.loads(rotated)["permissions"] == ["jobs.propose", "status.read"]
        assert json.loads(rotated)["revision"] == int(revision) + 1
        assert owner(
            f"SELECT key_fingerprint FROM public.omni_dock_devices WHERE id='{device}';"
        ).endswith(fingerprint(JWK2))
        def bound_touch(key, key_revision, nonce, timestamp=None):
            current_ms = int(time.time() * 1000) if timestamp is None else timestamp
            return (
                f"SELECT public.omni_native_bound_touch('{device}','{fingerprint(key)}',"
                f"{key_revision},'{nonce}',{current_ms},'heartbeat',NULL,NULL);"
            )
        for role in ["anon", "authenticated"]:
            assert sql(
                f"SELECT has_function_privilege('{role}',"
                "'public.omni_native_bound_touch(uuid,text,integer,text,bigint,text,text[],text)','execute');"
            ) == "f"
            checks += 1
        assert '"device_changed"' in service(bound_touch(JWK1, revision, "bound-old-key-abcdefghijkl"))
        assert '"device_changed"' in service(bound_touch(JWK2, revision, "bound-old-revision-abcdef"))
        current_revision = int(revision) + 1
        assert '"stale_request"' in service(
            bound_touch(JWK2, current_revision, "bound-stale-time-abcdef", int(time.time() * 1000) - 61000)
        )
        assert '"ok": true' in service(bound_touch(JWK2, current_revision, "bound-current-key-abcdef"))
        assert '"replay"' in service(bound_touch(JWK2, current_revision, "bound-current-key-abcdef"))
        service(f"DELETE FROM public.omni_dock_nonces WHERE device_id='{device}';")
        assert '"replay"' in service(bound_touch(JWK2, current_revision, "bound-current-key-abcdef"))
        held_id = "88888888-8888-4888-8888-888888888888"
        def held_query(key, key_revision):
            return (
                f"SELECT public.omni_native_bound_hold_task('{device}','{fingerprint(key)}',"
                f"{key_revision},'{held_id}','agent.handoff','jax','Fixture project',NULL,'Review the project');"
            )
        assert '"device_changed"' in service(held_query(JWK1, revision))
        assert service(f"SELECT count(*) FROM public.omni_terminal_tasks WHERE id='{held_id}';") == "0"
        assert '"ok": true' in service(held_query(JWK2, current_revision))
        assert '"device_changed"' in service(
            f"SELECT public.omni_native_bound_handoff_status('{device}','{fingerprint(JWK1)}',{revision});"
        )
        assert held_id in service(
            f"SELECT public.omni_native_bound_handoff_status('{device}','{fingerprint(JWK2)}',{current_revision});"
        )
        service(f"UPDATE public.omni_dock_devices SET permissions=permissions || ARRAY['cloud.read','jobs.pause','stop.engage'] WHERE id='{device}';")
        code_job = "99999999-9999-4999-8999-999999999999"
        service(
            f"INSERT INTO public.omni_code_jobs(id,owner_id,agent_id,kind,title) "
            f"VALUES('{code_job}','{OWNER}','omni','code_task','Fixture task');"
        )
        def control_query(key, key_revision, job):
            return (
                f"SELECT public.omni_native_bound_control('{device}','{fingerprint(key)}',"
                f"{key_revision},'stop_job',NULL,'{job}');"
            )
        assert '"device_changed"' in service(control_query(JWK1, revision, code_job))
        assert service(f"SELECT status FROM public.omni_code_jobs WHERE id='{code_job}';") == "queued"
        assert '"not_found"' in service(control_query(JWK2, current_revision, held_id))
        assert service(f"SELECT state FROM public.omni_terminal_tasks WHERE id='{held_id}';") == "held"
        assert '"ok": true' in service(control_query(JWK2, current_revision, code_job))
        assert service(f"SELECT status FROM public.omni_code_jobs WHERE id='{code_job}';") == "stopped"
        assert '"device_changed"' in service(
            f"SELECT public.omni_native_bound_control('{device}','{fingerprint(JWK1)}',"
            f"{revision},'pause_agent','omni',NULL);"
        )
        assert '"paused": "omni"' in service(
            f"SELECT public.omni_native_bound_control('{device}','{fingerprint(JWK2)}',"
            f"{current_revision},'pause_agent','omni',NULL);"
        )
        assert '"remote_action": "agent.stop"' in service(
            f"SELECT public.omni_native_bound_control('{device}','{fingerprint(JWK2)}',"
            f"{current_revision},'stop_agent','omni',NULL);"
        )
        def engage_stop(key, key_revision):
            return (
                f"SELECT public.omni_native_bound_engage_stop('{device}',"
                f"'{fingerprint(key)}',{key_revision});"
            )
        assert service(engage_stop(JWK1, revision)) == "f"
        assert service("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "f"
        assert service(engage_stop(JWK2, current_revision)) == "t"
        assert service("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "t"
        service("UPDATE public.omni_terminal_controls SET emergency_stop=false WHERE id=1;")
        # A transaction admitted on the old revision holds its device lock until
        # commit; a rotation cannot pass it and mutate the device in between.
        concurrent_env = dict(env, PGAPPNAME="native-bound-lock-fixture")
        locked = subprocess.Popen(
            [
                "psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c",
                "SET ROLE service_role; BEGIN; "
                f"SELECT public.omni_native_bound_handoff_status('{device}','{fingerprint(JWK2)}',{current_revision}); "
                "SELECT pg_sleep(2); COMMIT;",
            ],
            env=concurrent_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            for _ in range(100):
                if sql(
                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity "
                    "WHERE application_name='native-bound-lock-fixture' AND wait_event='PgSleep');"
                ) == "t":
                    break
                time.sleep(0.01)
            else:
                raise AssertionError("Bound operation did not reach its locked wait")
            blocked = subprocess.run(
                ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c",
                 "SET ROLE service_role; SET lock_timeout='100ms'; "
                 f"UPDATE public.omni_dock_devices SET revision=revision+1 WHERE id='{device}';"],
                env=env, capture_output=True, text=True,
            )
            assert blocked.returncode != 0 and "lock timeout" in blocked.stderr, blocked.stderr
            checks += 1
        finally:
            output, error = locked.communicate(timeout=10)
            assert locked.returncode == 0, (output, error)
        def read_authorize(key, key_revision):
            return (
                f"SELECT public.omni_native_bound_read_authorize('{device}','{fingerprint(key)}',"
                f"{key_revision},'cloud.read');"
            )
        assert service(read_authorize(JWK2, current_revision)) == "t"
        assert service(read_authorize(JWK1, revision)) == "f"
        service("UPDATE public.omni_terminal_controls SET emergency_stop=true WHERE id=1;")
        assert service(read_authorize(JWK2, current_revision)) == "f"
        assert '"stop_engaged"' in service(held_query(JWK2, current_revision))
        assert '"stop_engaged"' in service(
            f"SELECT public.omni_native_bound_handoff_status('{device}','{fingerprint(JWK2)}',{current_revision});"
        )
        service("UPDATE public.omni_terminal_controls SET emergency_stop=false WHERE id=1;")
        service(f"UPDATE public.omni_dock_devices SET permissions=ARRAY['jobs.propose','status.read'] WHERE id='{device}';")
        now_ms = int(time.time() * 1000)
        nonce = "status-nonce-abcdefghijkl"
        def status_query(key, current_nonce=nonce, timestamp=now_ms):
            return (
                f"SELECT public.omni_native_device_status('{device}','{fingerprint(key)}',"
                f"'{current_nonce}',{timestamp});"
            )
        for role in ["anon", "authenticated"]:
            assert sql(
                f"SELECT has_function_privilege('{role}',"
                "'public.omni_native_device_status(uuid,text,text,bigint)','execute');"
            ) == "f"
            checks += 1
        assert '"device_changed"' in service(status_query(JWK1))
        status = json.loads(service(status_query(JWK2)))
        assert status["ok"] and status["device_id"] == device
        assert status["revision"] == int(revision) + 1
        assert status["key_fingerprint"] == fingerprint(JWK2)
        assert status["permissions"] == ["jobs.propose", "status.read"]
        assert '"replay"' in service(status_query(JWK2))
        service(f"DELETE FROM public.omni_dock_nonces WHERE device_id='{device}';")
        assert '"replay"' in service(status_query(JWK2))
        service(
            f"UPDATE public.omni_dock_devices SET key_fingerprint='{fingerprint(JWK1)}',"
            f"revision=revision+1 WHERE id='{device}';"
        )
        assert '"device_changed"' in service(status_query(JWK2, "status-nonce-race-abcdef"))
        service(
            f"UPDATE public.omni_dock_devices SET key_fingerprint='{fingerprint(JWK2)}',"
            f"revision=revision+1 WHERE id='{device}';"
        )
        assert '"replay"' in service(status_query(JWK2))
        assert '"stale_request"' in service(status_query(JWK2, "status-nonce-stale-abcdef", now_ms - 61000))
        service(f"UPDATE public.omni_dock_devices SET native_client_id=NULL WHERE id='{device}';")
        assert '"not_permitted"' in service(status_query(JWK2, "status-nonce-legacy-abcdef"))
        service(f"UPDATE public.omni_dock_devices SET native_client_id='omni-native-cli' WHERE id='{device}';")
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        assert '"not_permitted"' in service(status_query(JWK2, "status-nonce-owner-abcdef"))
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';")

        # Native-only consent grants the separate chat capability; chat is never added
        # to legacy Dock permissions. Project discovery and chat runs remain owner-scoped.
        assert service("SELECT public.omni_native_chat_ready();") == "t"
        assert '"ok": true' in owner(
            authorize(
                "f" * 64,
                "6" * 64,
                JWK3,
                permissions="ARRAY['chat.send','status.read']",
            )
        )
        chat_enrolled = exchange("f" * 64)
        assert '"ok": true' in chat_enrolled, chat_enrolled
        chat_device = json.loads(chat_enrolled)["device_id"]
        assert json.loads(chat_enrolled)["permissions"] == ["chat.send", "status.read"]
        chat_revision = json.loads(chat_enrolled)["revision"]
        assert '"ok": true' in service(
            f"SELECT public.omni_native_bound_touch('{chat_device}','{fingerprint(JWK3)}',"
            f"{chat_revision},'chat-race-nonce-abcdef',{int(time.time() * 1000)},"
            "'native_chat_request',NULL,NULL);"
        )
        service(f"UPDATE public.omni_dock_devices SET revision=revision+1 WHERE id='{chat_device}';")
        for role in ["anon", "authenticated"]:
            assert sql(
                f"SELECT has_function_privilege('{role}',"
                "'public.omni_native_bound_chat_begin(uuid,text,integer,uuid,uuid,uuid,text,text,integer,integer)','execute');"
            ) == "f"
            checks += 1
        assert '"device_changed"' in service(
            f"SELECT public.omni_native_bound_chat_projects('{chat_device}','{fingerprint(JWK3)}',{chat_revision});"
        )
        assert '"device_changed"' in service(
            f"SELECT public.omni_native_bound_chat_begin('{chat_device}','{fingerprint(JWK3)}',"
            f"{chat_revision},'{request_id}','{chat_session}','{project}',"
            "'omni','claude-sonnet-5-5',1,500);"
        )
        assert service(f"SELECT count(*) FROM public.omni_native_chat_runs WHERE device_id='{chat_device}';") == "0"
        chat_revision += 1
        assert '"name": "Native fixture project"' in service(
            f"SELECT public.omni_native_bound_chat_projects('{chat_device}','{fingerprint(JWK3)}',{chat_revision});"
        )
        project_list = service(f"SELECT public.omni_native_chat_projects('{chat_device}');")
        assert '"name": "Native fixture project"' in project_list, project_list
        assert '"ok": false' in service(
            f"SELECT public.omni_native_chat_projects('{device}');"
        )
        started_run = json.loads(
            service(
                f"SELECT public.omni_native_bound_chat_begin('{chat_device}','{fingerprint(JWK3)}',{chat_revision},'{request_id}',"
                f"'{chat_session}','{project}','omni','claude-sonnet-5-5',1,500);"
            )
        )
        assert started_run["ok"] is True, started_run
        run_id = started_run["run_id"]
        assert started_run["project_name"] == "Native fixture project"
        assert '"duplicate_request"' in service(
            f"SELECT public.omni_native_chat_begin('{chat_device}','{request_id}',"
            f"'{chat_session}','{project}','omni','claude-sonnet-5-5',1,500);"
        )
        reserve = service(
            f"SELECT public.claude_reserve_native_chat('{run_id}',500,1024);"
        )
        assert '"ok": true' in reserve, reserve
        assert service(
            f"SELECT source || '/' || status FROM public.claude_usage WHERE run_id='{run_id}';"
        ) == "native/reserved"
        assert '"ok": true' in service(
            f"SELECT public.claude_settle_source('native','{run_id}','completed',120,12);"
        )
        assert '"guard_released": true' in service(
            f"SELECT public.omni_native_chat_finish_authorized('{run_id}','completed',18,120,12,"
            "NULL,NULL,true,NULL,NULL);"
        )
        assert service(
            "SELECT count(*) FROM public.ai_gateway_state WHERE feature='evolution-omni';"
        ) == "0"
        assert service(
            f"SELECT status || '/' || actual_cents FROM public.claude_usage WHERE run_id='{run_id}';"
        ) == "completed/1"

        # A device revision change (key rotation or permission change) stops an in-flight reply.
        next_request = "66666666-6666-4666-8666-666666666666"
        next_session = "77777777-7777-4777-8777-777777777777"
        in_flight = json.loads(
            service(
                f"SELECT public.omni_native_chat_begin('{chat_device}','{next_request}',"
                f"'{next_session}','{project}','omni','claude-sonnet-5-5',1,100);"
            )
        )
        assert in_flight["ok"] is True, in_flight
        assert '"ok": true' in service(
            f"SELECT public.claude_reserve_native_chat('{in_flight['run_id']}',100,1024);"
        )
        assert '"ok": true' in service(
            f"SELECT public.claude_settle_source('native','{in_flight['run_id']}','completed',120,12);"
        )
        assert '"ok": true' in service(
            f"SELECT public.omni_native_chat_check('{chat_device}','{in_flight['run_id']}');"
        )
        service(
            f"UPDATE public.omni_dock_devices SET revision=revision+1 WHERE id='{chat_device}';"
        )
        assert '"device_rotated"' in service(
            f"SELECT public.omni_native_chat_check('{chat_device}','{in_flight['run_id']}');"
        )
        finalized = json.loads(service(
            f"SELECT public.omni_native_chat_finish_authorized('{in_flight['run_id']}',"
            "'completed',18,120,12,NULL,NULL,true,NULL,NULL);"
        ))
        assert finalized["ok"] and finalized["final_status"] == "denied"
        assert finalized["authorization_reason"] == "device_rotated"
        assert finalized["guard_released"] is True
        assert service(
            f"SELECT status || '/' || reply_chars FROM public.omni_native_chat_runs WHERE id='{in_flight['run_id']}';"
        ) == "denied/0"
        assert service(
            f"SELECT status || '/' || actual_cents FROM public.claude_usage WHERE run_id='{in_flight['run_id']}';"
        ) == "completed/1"
        chat_revision += 1
        conditions = [
            ("emergency_stop_engaged",
             "UPDATE public.omni_terminal_controls SET emergency_stop=true WHERE id=1;",
             "UPDATE public.omni_terminal_controls SET emergency_stop=false WHERE id=1;"),
            ("owner_unverified",
             f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';",
             f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';"),
            ("ai_not_approved",
             f"UPDATE public.beta_access SET paused=true WHERE user_id='{OWNER}';",
             f"UPDATE public.beta_access SET paused=false WHERE user_id='{OWNER}';"),
            ("session_stopped", None, None),
        ]
        for expected_reason, apply_change, restore_change in conditions:
            session = str(uuid.uuid4())
            request = str(uuid.uuid4())
            run = json.loads(service(
                f"SELECT public.omni_native_bound_chat_begin('{chat_device}','{fingerprint(JWK3)}',"
                f"{chat_revision},'{request}','{session}','{project}','omni','claude-sonnet-5-5',1,100);"
            ))
            assert run["ok"], run
            run_id = run["run_id"]
            assert '"ok": true' in service(f"SELECT public.claude_reserve_native_chat('{run_id}',100,1024);")
            assert '"ok": true' in service(
                f"SELECT public.claude_settle_source('native','{run_id}','completed',120,12);"
            )
            assert '"ok": true' in service(f"SELECT public.omni_native_chat_check('{chat_device}','{run_id}');")
            if expected_reason == "session_stopped":
                service(f"UPDATE public.omni_native_chat_sessions SET status='closed' WHERE id='{session}';")
            else:
                sql(apply_change)
            finalized = json.loads(service(
                f"SELECT public.omni_native_chat_finish_authorized('{run_id}',"
                "'completed',18,120,12,NULL,NULL,true,NULL,NULL);"
            ))
            assert finalized["ok"] and finalized["final_status"] == "denied", finalized
            assert finalized["authorization_reason"] == expected_reason, finalized
            assert finalized["guard_released"] is True, finalized
            assert service(
                f"SELECT status || '/' || reply_chars FROM public.omni_native_chat_runs WHERE id='{run_id}';"
            ) == "denied/0"
            if restore_change:
                sql(restore_change)

        unresolved_session = str(uuid.uuid4())
        unresolved_request = str(uuid.uuid4())
        unresolved = json.loads(service(
            f"SELECT public.omni_native_bound_chat_begin('{chat_device}','{fingerprint(JWK3)}',"
            f"{chat_revision},'{unresolved_request}','{unresolved_session}','{project}',"
            "'omni','claude-sonnet-5-5',1,100);"
        ))
        assert unresolved["ok"], unresolved
        unresolved_run = unresolved["run_id"]
        assert '"ok": true' in service(
            f"SELECT public.claude_reserve_native_chat('{unresolved_run}',100,1024);"
        )
        unresolved_finish = json.loads(service(
            f"SELECT public.omni_native_chat_finish_authorized('{unresolved_run}',"
            "'completed',18,120,12,NULL,NULL,false,NULL,NULL);"
        ))
        assert unresolved_finish["final_status"] == "denied"
        assert unresolved_finish["authorization_reason"] == "settlement_unresolved"
        assert unresolved_finish["guard_released"] is False
        assert service(
            "SELECT count(*) FROM public.ai_gateway_state WHERE feature='evolution-omni';"
        ) == "1"
        assert service(
            f"SELECT status FROM public.claude_usage WHERE run_id='{unresolved_run}';"
        ) == "reserved"

        # A concurrent device change invalidates a previously consented rotation.
        assert '"ok": true' in owner(
            authorize(
                "e" * 64,
                "5" * 64,
                JWK1,
                rotation=device,
                permissions="ARRAY[]::text[]",
            )
        )
        service(
            f"UPDATE public.omni_dock_devices SET revision=revision+1 WHERE id='{device}';"
        )
        assert '"rotation_stale"' in exchange("e" * 64)

        owner(f"SELECT count(*) FROM public.omni_dock_revoke('{device}','CLI retired');")
        assert '"not_permitted"' in service(status_query(JWK2, "status-nonce-revoked-abc"))
        assert owner(
            f"SELECT status || '/' || cardinality(permissions) FROM public.omni_dock_devices WHERE id='{device}';"
        ).endswith("revoked/0")
        print(
            f"PASS: {checks} disposable PostgreSQL checks: owner + fresh MFA consent, code hashing, "
            "service-only one-use PKCE exchange, owner isolation, PKCE/expiry refusal, permission-preserving "
            "key rotation, stale-rotation refusal, native-only chat consent, owner project isolation, "
            "Claude reserve/settle, request replay and rotation-stop enforcement, and device revocation."
        )
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
