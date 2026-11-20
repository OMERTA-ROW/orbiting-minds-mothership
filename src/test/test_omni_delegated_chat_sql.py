"""Disposable PostgreSQL only: migration 0066 (drizzle/migrations/0066_omni_delegated_chat.sql, installed
2026-11-20) on top of migrations up to 0065. chat:write consent, scope separation, owner AI approval,
Emergency Stop, model allowlist, daily limit, the shared one-at-a-time AI guard (including
concurrency and pauses), request-bound re-checks after revocation/expiry/Stop, outcome recording,
privileges and owner-only metadata reads with no stored text. Never uses hosted credentials."""
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPOSED = ROOT / "drizzle/migrations/0066_omni_delegated_chat.sql"
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
CLIENT = "omni-web"
AUD = "omni-mothership"
CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback"
CH = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
MODEL = "openai/gpt-6-astra"
PORT = "55462"


def migrations():
    found = []
    for number in range(20, 66):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    return found


def h(ch):
    return ch * 64


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-chat-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT=PORT, PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        nonlocal checks
        checks += 1
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode:
            raise AssertionError(result.stderr + "\n" + text)
        if not ok and not result.returncode:
            raise AssertionError("Expected SQL denial: " + text)
        lines = [l for l in result.stdout.strip().splitlines() if not re.match(r"^(SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|BEGIN|COMMIT)$", l)]
        return lines[-1] if lines else ""

    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'

    def caller(uid, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='aal2'; SET request.jwt.claim.amr='{FRESH}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def connect(code_ch, token_ch, scopes):
        sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
        caller(OWNER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',{scopes},'{h(code_ch)}','{CH}');")
        out = service(f"SELECT public.omni_delegation_exchange('{h(code_ch)}','{CH}','{CLIENT}','{CB}','{h(token_ch)}','omnid_aaaaaa')::text;")
        assert '"ok": true' in out, out
        return h(token_ch)

    def begin(token, model=MODEL, count=1, chars=10, aud=AUD):
        return service(f"SELECT public.omni_delegation_begin_chat('{token}','{aud}','{model}',{count},{chars})::text;")

    def run_id(out):
        m = re.search(r'"run_id": "([0-9a-f-]{36})"', out)
        assert m, out
        return m.group(1)

    def check(token, run):
        return service(f"SELECT public.omni_delegation_check_chat('{token}','{AUD}','{run}')::text;")

    def finish(run, status="completed", pause="NULL", msg="NULL"):
        return service(f"SELECT public.omni_delegation_finish_chat('{run}','{status}',12,10,4,14,NULL,NULL,'gw-1',{pause},{msg})::text;")

    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p {PORT} -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        """)
        # Tables from earlier migrations that this change reads, exactly as created there.
        sql((ROOT / "drizzle/migrations/0000_ai_generation_circuit_breaker.sql").read_text())
        sql("""CREATE TABLE public.beta_access (user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false,
              paused boolean NOT NULL DEFAULT false, approved_at timestamptz);""")
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        # Before 0066: chat:write is refused at consent and nothing chat-related exists.
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        caller(OWNER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['chat:write'],'{h('0')}','{CH}');", False)
        assert sql("SELECT to_regprocedure('public.omni_delegated_chat_ready()') IS NULL;") == "t"
        sql(PROPOSED.read_text())
        audit0 = int(sql("SELECT count(*) FROM public.razul_control_audit;"))

        # Privileges: admission/check/finish are service-only; the install marker is not anon.
        for fn in ["omni_delegation_begin_chat(text,text,text,integer,integer)", "omni_delegation_check_chat(text,text,uuid)",
                   "omni_delegation_finish_chat(uuid,text,integer,integer,integer,integer,integer,text,text,integer,text)"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','execute');") == "f", (fn, role)
            assert sql(f"SELECT has_function_privilege('service_role','public.{fn}','execute');") == "t", fn
        assert sql("SELECT has_function_privilege('anon','public.omni_delegated_chat_ready()','execute');") == "f"
        assert caller(OWNER, "SELECT public.omni_delegated_chat_ready();") == "t"
        for role in ["anon", "authenticated"]:
            for priv in ["insert", "update", "delete", "truncate"]:
                assert sql(f"SELECT has_table_privilege('{role}','public.omni_delegated_chat_runs','{priv}');") == "f", (role, priv)
        assert sql("SELECT has_table_privilege('anon','public.omni_delegated_chat_runs','select');") == "f"
        caller(OWNER, f"INSERT INTO public.omni_delegated_chat_runs(owner_id,delegation_id,model,message_count,input_chars) VALUES('{OWNER}',gen_random_uuid(),'{MODEL}',1,1);", False)
        cols = sql("SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='omni_delegated_chat_runs';")
        assert "message" not in cols.replace("message_count", "") and "reply," not in cols and "content" not in cols, cols

        # Consent: chat:write is its own scope; four scopes fit; unsupported still refused.
        caller(OWNER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['providers:write'],'{h('1')}','{CH}');", False)
        caller(OWNER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['chat:write','tasks:approve'],'{h('1')}','{CH}');", False)
        caller(OTHER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['chat:write'],'{h('1')}','{CH}');", False)
        ALL4 = connect("2", "a", "ARRAY['chat:write','tasks:read','tasks:write','safety:emergency-stop']")
        TASKS = connect("3", "b", "ARRAY['tasks:write']")
        assert '"scope_missing"' in begin(TASKS)
        assert '"revoked"' in begin(ALL4)  # superseded by the later approval
        T = connect("4", "c", "ARRAY['chat:write']")
        assert '"invalid"' in begin(h("f"))
        assert '"wrong_audience"' in begin(T, aud="other")

        # Owner AI approval and Emergency Stop are required (missing Stop row = engaged).
        sql(f"INSERT INTO public.beta_access(user_id, ai_approved, paused) VALUES('{OWNER}', false, false) ON CONFLICT (user_id) DO UPDATE SET ai_approved=false, paused=false;")
        assert '"ai_not_approved"' in begin(T)
        sql(f"UPDATE public.beta_access SET ai_approved=true, paused=true WHERE user_id='{OWNER}';")
        assert '"ai_not_approved"' in begin(T)
        sql(f"UPDATE public.beta_access SET paused=false WHERE user_id='{OWNER}';")
        sql("DELETE FROM public.omni_terminal_controls;")
        assert '"emergency_stop_engaged"' in begin(T)
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, true);")
        assert '"emergency_stop_engaged"' in begin(T)
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        assert '"model_not_available"' in begin(T, model="google/gemini-3-pro")
        assert '"invalid_request"' in begin(T, count=21)
        assert '"invalid_request"' in begin(T, chars=24001)
        assert sql("SELECT count(*) FROM public.omni_delegated_chat_runs;") == "0"

        # A private OMNI pause (or another request in progress) blocks delegated chat too.
        sql("INSERT INTO public.ai_gateway_state(feature, blocked_status, message) VALUES ('evolution-omni', 402, 'Credits exhausted.');")
        assert '"ai_busy_or_paused"' in begin(T)
        sql("DELETE FROM public.ai_gateway_state;")

        # Admission sets the shared guard; a second request waits; outcome releases it once.
        R1 = run_id(begin(T, count=3, chars=120))
        assert sql("SELECT message FROM public.ai_gateway_state WHERE feature='evolution-omni';").startswith(f"OMNI request {R1} is in progress")
        assert '"ai_busy_or_paused"' in begin(T)
        assert '"ok": true' in check(T, R1)
        assert '"run_not_found"' in check(T, "aaaaaaaa-0000-4000-8000-000000000000")
        assert '"guard_released": true' in finish(R1)
        assert sql("SELECT count(*) FROM public.ai_gateway_state;") == "0"
        assert '"run_not_running"' in finish(R1, "failed")
        assert '"run_finished"' in check(T, R1)
        assert sql(f"SELECT status || ',' || message_count || ',' || input_chars || ',' || total_tokens FROM public.omni_delegated_chat_runs WHERE id='{R1}';") == "completed,3,120,14"
        service("SELECT public.omni_delegation_finish_chat(gen_random_uuid(),'bogus',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);", False)

        # Re-checks fail on Stop, AI approval change, revocation and expiry.
        R2 = run_id(begin(T))
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert '"emergency_stop_engaged"' in check(T, R2)
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        sql(f"UPDATE public.beta_access SET ai_approved=false WHERE user_id='{OWNER}';")
        assert '"ai_not_approved"' in check(T, R2)
        sql(f"UPDATE public.beta_access SET ai_approved=true WHERE user_id='{OWNER}';")
        sql(f"UPDATE public.omni_delegations SET issued_at=now()-interval '20 minutes', expires_at=now()-interval '5 minutes' WHERE token_hash='{T}';")
        assert '"expired"' in check(T, R2)
        sql(f"UPDATE public.omni_delegations SET issued_at=now(), expires_at=now()+interval '15 minutes' WHERE token_hash='{T}';")
        service(f"SELECT public.omni_delegation_revoke('{T}');")
        assert '"revoked"' in check(T, R2)
        # Provider credit refusal keeps the guard as a pause for owner review.
        assert '"paused": true' in finish(R2, "denied", "402", "'Credits exhausted.'")
        assert sql("SELECT blocked_status || ':' || message FROM public.ai_gateway_state;") == "402:Credits exhausted."
        service(f"SELECT public.omni_delegation_finish_chat('{R2}','denied',0,NULL,NULL,NULL,NULL,NULL,NULL,429,'x');", False)
        T2 = connect("5", "d", "ARRAY['chat:write']")
        assert '"ai_busy_or_paused"' in begin(T2)
        sql("DELETE FROM public.ai_gateway_state;")

        # Another run's finish never clears a guard it doesn't own.
        R3 = run_id(begin(T2))
        sql(f"UPDATE public.ai_gateway_state SET message='OMNI request {OTHER} is in progress or its outcome needs owner review. No automatic restart.';")
        assert '"guard_released": false' in finish(R3)
        assert sql("SELECT count(*) FROM public.ai_gateway_state;") == "1"
        sql("DELETE FROM public.ai_gateway_state;")

        # Concurrency: two simultaneous admissions → exactly one run.
        procs = [subprocess.Popen(["psql", "-X", "-At", "-c", f"SET ROLE service_role; SELECT public.omni_delegation_begin_chat('{T2}','{AUD}','{MODEL}',1,5)::text;"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        outs = [p.communicate()[0] for p in procs]
        checks += 2
        assert sum('"ok": true' in o for o in outs) == 1 and sum('"ai_busy_or_paused"' in o for o in outs) == 1, outs
        R4 = re.search(r'"run_id": "([0-9a-f-]{36})"', "".join(outs)).group(1)
        finish(R4)

        # Daily limit: 30 started requests per owner per 24 hours.
        sql(f"INSERT INTO public.omni_delegated_chat_runs(owner_id,delegation_id,model,status,message_count,input_chars,finished_at) SELECT '{OWNER}', id, '{MODEL}', 'completed', 1, 1, now() FROM public.omni_delegations, generate_series(1, 26) WHERE token_hash='{T2}';")
        assert int(sql(f"SELECT count(*) FROM public.omni_delegated_chat_runs WHERE owner_id='{OWNER}';")) == 30
        assert '"daily_limit"' in begin(T2)
        assert sql("SELECT count(*) FROM public.ai_gateway_state;") == "0"

        # Owner reads own metadata; others and anon read nothing.
        assert caller(OWNER, "SELECT count(*) FROM public.omni_delegated_chat_runs;") == "30"
        assert caller(OTHER, "SELECT count(*) FROM public.omni_delegated_chat_runs;") == "0"
        sql("SET ROLE anon; SELECT count(*) FROM public.omni_delegated_chat_runs;", False)

        # Metadata API keys still can't chat (an API key hash is not a delegation).
        KEY = "ab" * 32
        caller(OWNER, f"SELECT public.omni_api_key_issue('Read',ARRAY['health'],'{KEY}','omni_eeee',30,false);")
        assert '"invalid"' in begin(KEY)

        assert int(sql("SELECT count(*) FROM public.razul_control_audit WHERE action LIKE 'chat_%';")) >= 8
        assert int(sql("SELECT count(*) FROM public.razul_control_audit;")) > audit0
        print(f"PASS: {checks} isolated SQL checks for installed 0066: chat:write consent and scope separation, owner AI approval, Emergency Stop, model allowlist, bounds, shared AI guard with pause/ownership/concurrency, re-checks on Stop/approval/expiry/revocation, outcome recording, daily limit, owner-only metadata, API key separation. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
