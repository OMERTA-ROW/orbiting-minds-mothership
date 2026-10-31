"""Disposable PostgreSQL only: owner/MFA/RPC/RLS checks. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
SENTINEL = "33333333-3333-4333-8333-333333333333"

def main():
    base = Path(tempfile.mkdtemp(prefix="razul-owner-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55439", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0
    def sql(text, ok=True):
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial")
        return result.stdout.strip()
    def caller(uid, aal, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; {text}", ok)
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55439 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in [20,21,22,23,24,25,26,27,28,29]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'); INSERT INTO public.razul_sentinels(id,name,token_hash,scopes,expires_at) VALUES('{SENTINEL}','Fixture sentinel','{'a' * 64}',ARRAY['health'],now()+interval '1 hour');")
        operations = [
            "SELECT public.razul_pause('fixture');",
            "SELECT public.razul_resume();",
            "SELECT public.razul_configure(40,90,ARRAY['vulnerability'],ARRAY[]::text[]);",
            f"SELECT public.razul_enroll_sentinel('Fixture new',ARRAY['health'],'{'b' * 64}',1);",
            f"SELECT public.razul_revoke_sentinel('{SENTINEL}');",
            f"SELECT public.razul_dispatch_scout('{SENTINEL}','angeltech','Fixture review only');",
            "SELECT public.razul_upsert_passport('Fixture','Ops','purpose',ARRAY[]::text[],'architecture',NULL,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'unknown',ARRAY[]::text[],'fixture');",
            "SELECT public.razul_set_subscription('omni',ARRAY['vulnerability'],40,true);",
        ]
        for operation in operations:
            caller(OTHER, 'aal2', operation, False)  # NULL role cannot pass.
            caller(OWNER, 'aal1', operation, False)
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{OTHER}','admin');")
        for operation in operations: caller(OTHER, 'aal2', operation, False)
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        caller(OWNER, 'aal2', operations[0], False)
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';")
        for operation in [operations[0],operations[2],operations[5],operations[6],operations[7]]: caller(OWNER, 'aal2', operation)
        assert caller(OWNER, 'aal2', "SELECT count(*) FROM public.razul_control_audit;").endswith('4')
        assert caller(OTHER, 'aal2', "SELECT count(*) FROM public.razul_control_audit;").endswith('0')
        assert caller(OTHER, 'aal2', "SELECT count(*) FROM public.razul_project_passports;").endswith('0')
        assert caller(OWNER, 'aal2', "SELECT count(*) FROM public.razul_project_passports;").endswith('1')
        assert caller(OWNER, 'aal2', "SELECT status||'/'||guardian_status FROM public.razul_dispatch_queue;").endswith('blocked-guardian/unavailable')
        caller(OWNER, 'aal2', "INSERT INTO public.razul_control_audit(action,record_type,record_id) VALUES('fake','fake','fake');", False)
        assert sql("SELECT has_function_privilege('anon','public.razul_pause(text)','execute');") == 'f'
        assert caller(OWNER, 'aal2', "SELECT public.is_razul_owner();").endswith('t')
        sql(f"DELETE FROM public.user_roles WHERE user_id='{OWNER}';")
        caller(OWNER, 'aal2', operations[0], False)
        print(f"PASS: {checks} isolated SQL calls plus anonymous execute denial: NULL role/admin/aal1/unconfirmed/revoked owner blocked; verified MFA owner controls, RLS, audit and Guardian default deny. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()