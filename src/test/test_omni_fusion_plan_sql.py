"""Disposable PostgreSQL only: migration 0067 (drizzle/migrations/0067_omni_fusion_plan_scope.sql, installed
2026-11-20) on top of migrations up to 0065, alone and together with 0066 in both orders.
fusion:plan is its own owner-consented scope; it cannot create/read/hand off tasks, chat (spend),
engage or release the Emergency Stop, or touch permits; the gate refuses while the Stop is engaged
or unreadable and writes only one audit row. Never uses hosted credentials."""
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPOSED = ROOT / "drizzle/migrations/0067_omni_fusion_plan_scope.sql"
CHAT = ROOT / "drizzle/migrations/0066_omni_delegated_chat.sql"
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
CLIENT = "omni-web"
AUD = "omni-mothership"
CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback"
CH = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
MODEL = "openai/gpt-6-astra"
PORT = "55467"


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
    base = Path(tempfile.mkdtemp(prefix="omni-fusion-sql-"))
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
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false) ON CONFLICT (id) DO UPDATE SET emergency_stop=false;")
        sql(f"INSERT INTO public.beta_access(user_id, ai_approved, paused) VALUES('{OWNER}', true, false);")

        def authorize(code_ch, scopes, who=OWNER, ok=True):
            sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
            return caller(who, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',{scopes},'{h(code_ch)}','{CH}');", ok)

        def gate(token, aud=AUD):
            return service(f"SELECT public.omni_delegation_fusion_plan_gate('{token}','{aud}')::text;")

        def use(token, scope):
            return service(f"SELECT public.omni_delegation_use('{token}','{AUD}','{scope}')->>'status';")

        def counts():
            # Every public table's row count except the audit log and the delegation rows themselves.
            names = sql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('razul_control_audit','omni_delegations','omni_delegation_codes');").split(",")
            return {n: sql(f"SELECT count(*) FROM public.{n};") for n in names}

        # Before 0067: fusion:plan is refused at consent and no gate exists.
        authorize("0", "ARRAY['fusion:plan']", ok=False)
        assert sql("SELECT to_regprocedure('public.omni_delegation_fusion_plan_gate(text,text)') IS NULL;") == "t"
        sql(PROPOSED.read_text())

        # Privileges: the gate is service-only; the install marker is not anon.
        for role in ["anon", "authenticated"]:
            assert sql(f"SELECT has_function_privilege('{role}','public.omni_delegation_fusion_plan_gate(text,text)','execute');") == "f", role
        assert sql("SELECT has_function_privilege('service_role','public.omni_delegation_fusion_plan_gate(text,text)','execute');") == "t"
        assert sql("SELECT has_function_privilege('anon','public.omni_fusion_plan_ready()','execute');") == "f"
        assert caller(OWNER, "SELECT public.omni_fusion_plan_ready();") == "t"
        caller(OWNER, f"SELECT public.omni_delegation_fusion_plan_gate('{h('a')}','{AUD}');", False)

        # Consent: owner + fresh code only; its own scope; chat:write still needs 0066.
        authorize("1", "ARRAY['fusion:plan']", who=OTHER, ok=False)
        sql(f"SET request.jwt.claim.sub='{OWNER}'; SET request.jwt.claim.aal='aal1'; SET ROLE authenticated; SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['fusion:plan'],'{h('1')}','{CH}');", False)
        authorize("1", "ARRAY['fusion:plan','chat:write']", ok=False)
        authorize("1", "ARRAY['fusion:plan','tasks:approve']", ok=False)
        authorize("1", "ARRAY['fusion:plan','fusion:plan']", ok=False)
        F = connect("2", "b", "ARRAY['fusion:plan']")
        assert sql(f"SELECT array_to_string(scopes, ',') FROM public.omni_delegations WHERE token_hash='{F}';") == "fusion:plan"

        # Least privilege: fusion:plan alone authorizes nothing else.
        for scope in ["tasks:read", "tasks:write", "safety:emergency-stop", "chat:write"]:
            assert use(F, scope) == "scope_missing", scope
        before = counts()
        stop_before = sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;")
        assert '"scope_missing"' in service(f"SELECT public.omni_delegation_hold_task('{F}','{AUD}',gen_random_uuid(),'jackboy','T','Do things','')::text;")
        assert '"scope_missing"' in service(f"SELECT public.omni_delegation_read_tasks('{F}','{AUD}',NULL)::text;")
        assert '"scope_missing"' in service(f"SELECT public.omni_delegation_engage_stop('{F}','{AUD}')::text;")

        # The gate: admitted only with the Stop released; it never runs, plans, spends or changes the Stop.
        audit0 = int(sql("SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_plan_requested';"))
        out = gate(F)
        assert '"ok": true' in out and '"planner": "not_available"' in out, out
        assert counts() == before, "the Fusion gate must not create tasks, handoffs, permits, AI guards or runs"
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == stop_before
        assert int(sql("SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_plan_requested';")) == audit0 + 1
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert '"emergency_stop_engaged"' in gate(F)
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "t"
        sql("DELETE FROM public.omni_terminal_controls;")
        assert '"emergency_stop_engaged"' in gate(F)  # missing Stop row = engaged
        assert sql("SELECT count(*) FROM public.omni_terminal_controls;") == "0"
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false);")
        assert int(sql("SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_plan_requested';")) == audit0 + 1

        # Other scopes never imply fusion:plan; invalid, foreign-audience, expired, revoked refused.
        T = connect("3", "c", "ARRAY['tasks:read','tasks:write','safety:emergency-stop']")
        assert '"scope_missing"' in gate(T)
        assert '"revoked"' in gate(F)  # superseded by the later approval
        F2 = connect("4", "d", "ARRAY['fusion:plan','tasks:read']")
        assert '"invalid"' in gate(h("f"))
        assert '"invalid"' in gate("not-a-hash")
        assert '"wrong_audience"' in gate(F2, aud="other")
        sql(f"UPDATE public.omni_delegations SET issued_at=now()-interval '20 minutes', expires_at=now()-interval '5 minutes' WHERE token_hash='{F2}';")
        assert '"expired"' in gate(F2)
        F3 = connect("5", "e", "ARRAY['fusion:plan']")
        service(f"SELECT public.omni_delegation_revoke('{F3}');")
        assert '"revoked"' in gate(F3)
        # Owner losing verification revokes it in the same call.
        F4 = connect("6", "f", "ARRAY['fusion:plan']")
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        assert '"owner_unverified"' in gate(F4)
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';")
        assert '"revoked"' in gate(F4)
        # Metadata API keys are not delegations.
        KEY = h("9")
        caller(OWNER, f"SELECT public.omni_api_key_issue('Read',ARRAY['health'],'{KEY}','omni_eeee',30,false);")
        assert '"invalid"' in gate(KEY)

        # With 0066 too (and re-applying 0067 = the other install order): both scopes grantable,
        # five fit, and fusion:plan still cannot chat (chat admission costs money).
        for change in [CHAT, PROPOSED]:
            sql(change.read_text())
            ALL5 = connect("7" if change == CHAT else "8", "1" if change == CHAT else "2",
                           "ARRAY['chat:write','fusion:plan','tasks:read','tasks:write','safety:emergency-stop']")
            assert '"ok": true' in gate(ALL5)
            FO = connect("a" if change == CHAT else "b", "3" if change == CHAT else "4", "ARRAY['fusion:plan']")
            assert '"scope_missing"' in service(f"SELECT public.omni_delegation_begin_chat('{FO}','{AUD}','{MODEL}',1,10)::text;")
            assert sql("SELECT count(*) FROM public.omni_delegated_chat_runs;") == "0"
            assert sql("SELECT count(*) FROM public.ai_gateway_state;") == "0"
            authorize("c", "ARRAY['fusion:plan','chat:write','tasks:read','tasks:write','safety:emergency-stop','tasks:approve']", ok=False)
        print(f"PASS: {checks} isolated SQL checks for installed 0067: separate owner-consented fusion:plan scope (owner, fresh code, no implication either way), cannot create/read/hand off tasks, chat/spend, engage or release the Emergency Stop or write any row except one audit entry; refuses while the Stop is engaged or missing; expiry/revocation/audience/owner checks; API keys refused; works with 0066 in either order. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
