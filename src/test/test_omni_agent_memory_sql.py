"""Disposable PostgreSQL only: per-agent OMNI memory owner/aal2 gate, agent isolation, secret refusal, real delete and metadata-only append-only audit. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"

def main():
    base = Path(tempfile.mkdtemp(prefix="omni-memory-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55447", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0
    def sql(text, ok=True):
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()
    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'
    NOMFA = f'[{{"method":"password","timestamp":{now}}}]'
    def caller(uid, aal, amr, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55447 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 35)) + [36, 45]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        def save(agent="omni", title="Test command", body="Run the tests first", src="owner_typed", ref=""):
            return f"SELECT public.omni_memory_save('{agent}','note','{title}','{body}','{src}','{ref}');"

        # Anonymous cannot call any memory function; nobody but the service reads the table directly.
        for fn in ["omni_memory_save(text,text,text,text,text,text)", "omni_memory_list(text)", "omni_memory_delete(uuid,text)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == 'f', fn
            checks += 1
        assert sql("SELECT has_table_privilege('authenticated','public.omni_agent_memories','select');") == 'f'
        checks += 1

        # Admin (not owner) and aal1 owner are refused.
        caller(OTHER, 'aal2', FRESH, save(), False)
        caller(OWNER, 'aal1', FRESH, save(), False)
        caller(OWNER, 'aal1', FRESH, "SELECT count(*) FROM public.omni_memory_list('omni');", False)

        # Owner saves to two agents; unknown agents and secrets are refused.
        omni_id = caller(OWNER, 'aal2', STALE, save()).splitlines()[-1]
        caller(OWNER, 'aal2', STALE, save(agent="jackboy", title="Jackboy only", body="Use project id from owner"))
        caller(OWNER, 'aal2', STALE, save(agent="everyone"), False)
        caller(OWNER, 'aal2', STALE, save(body="token sk-proj-abcdefghijklmnopqrstu"), False)
        caller(OWNER, 'aal2', STALE, save(ref="eyJhbGciOiJIUzI1NiIsInR5cCI6"), False)
        caller(OWNER, 'aal2', STALE, save(src="telepathy"), False)

        # Each list returns only that agent's rows.
        assert caller(OWNER, 'aal2', STALE, "SELECT string_agg(DISTINCT agent_id, ',') || ':' || count(*) FROM public.omni_memory_list('omni');").endswith('omni:1')
        assert caller(OWNER, 'aal2', STALE, "SELECT string_agg(DISTINCT agent_id, ',') || ':' || count(*) FROM public.omni_memory_list('jackboy');").endswith('jackboy:1')
        assert caller(OWNER, 'aal2', STALE, "SELECT count(*) FROM public.omni_memory_list('jax');").endswith('0')
        caller(OWNER, 'aal2', STALE, "SELECT count(*) FROM public.omni_memory_list(NULL);", False)

        # Delete is scoped to the named agent and really removes the text.
        caller(OWNER, 'aal2', STALE, f"SELECT public.omni_memory_delete('{omni_id}','jackboy');", False)
        caller(OWNER, 'aal2', STALE, f"SELECT public.omni_memory_delete('{omni_id}','omni');")
        caller(OWNER, 'aal2', STALE, f"SELECT public.omni_memory_delete('{omni_id}','omni');", False)
        assert sql(f"SELECT count(*) FROM public.omni_agent_memories WHERE id='{omni_id}';") == '0'
        checks += 1

        # Audit: metadata only, append-only, owner reads own, admin reads none.
        assert sql("SELECT string_agg(event || ':' || n, ',' ORDER BY event) FROM (SELECT event, count(*) n FROM public.omni_agent_memory_audit GROUP BY event) a;") == 'deleted:1,retrieved:3,saved:2'
        checks += 1
        assert sql("SELECT count(*) FROM information_schema.columns WHERE table_name='omni_agent_memory_audit' AND column_name IN ('title','body','body_sha256');") == '0'
        checks += 1
        sql("DELETE FROM public.omni_agent_memory_audit;", False)
        checks += 1
        assert caller(OWNER, 'aal2', STALE, "SELECT count(*) FROM public.omni_agent_memory_audit;").endswith('6')
        assert caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_agent_memory_audit;").endswith('0')

        print(f"PASS: {checks} isolated SQL checks: anonymous/admin/aal1 denial, no direct table reads, one-agent lists, unknown-agent and secret refusal, agent-scoped real delete, metadata-only append-only audit. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
