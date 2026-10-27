"""Disposable local PostgreSQL acceptance checks; never connects to hosted Cloud.
Run: python3 src/test/test_omni_agent_sql.py
Requires PostgreSQL binaries; launches only a temporary local Unix socket.
"""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
PROJECT = "33333333-3333-4333-8333-333333333333"
RUN = "44444444-4444-4444-8444-444444444444"

def main():
    base = Path(tempfile.mkdtemp(prefix="omni-agent-sql-"))
    # Database bootstrap cannot run as root. Numeric fixture UID owns only this tmp directory.
    demote = None
    if os.getuid() == 0:
        os.chown(base, 65534, 65534)
        def demote():
            os.setgid(65534)
            os.setuid(65534)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55438", PGUSER="fixture", PGDATABASE="postgres")
    def sql(text, ok=True):
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial")
        return result.stdout.strip()
    def caller(uid, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; {text}", ok)
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55438 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
          CREATE TABLE public.beta_projects(id uuid,owner_id uuid,name text,brief text,UNIQUE(id,owner_id));
          CREATE TABLE public.beta_access(user_id uuid PRIMARY KEY,ai_approved boolean,paused boolean);
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        sql((ROOT / ".lovable/pending/omni-agent.sql").read_text())
        # Explicit fictional identities only in this isolated local database, never hosted fixtures.
        sql(f"INSERT INTO auth.users VALUES('{USER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.owner_config VALUES(1,'owner@fixture.invalid'); INSERT INTO public.beta_projects VALUES('{PROJECT}','{USER}','Fixture','Safe'); INSERT INTO public.beta_access VALUES('{USER}',true,false),('{OTHER}',true,false);")
        start = f"SELECT status FROM public.start_omni_agent_run('{RUN}','{PROJECT}','Omni connection test',true);"
        caller(USER, start, False)  # AI approval cannot substitute for membership.
        caller(OTHER, "SELECT public.claim_owner();", False)
        assert caller(USER, "SELECT public.claim_owner();").endswith("t")
        assert caller(USER, start).endswith("queued")
        assert caller(USER, start).endswith("queued")
        assert sql("SELECT count(*) FROM public.omni_agent_runs;") == "1"  # Stable dedupe.
        caller(USER, start.replace("Omni connection test", "Changed task"), False)
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{OTHER}','tester');")
        caller(OTHER, start, False)  # Foreign project/run denied even with role/AI approval.
        assert caller(OTHER, "SELECT count(*) FROM public.omni_agent_runs;").endswith("0")
        caller(USER, f"UPDATE public.omni_agent_runs SET status='completed' WHERE id='{RUN}';", False)
        caller(USER, f"INSERT INTO public.omni_agent_runs(id,owner_id,project_id,model,message,consent) VALUES(gen_random_uuid(),'{USER}','{PROJECT}','fake','fake result',true);", False)
        sql(f"UPDATE public.beta_access SET paused=true WHERE user_id='{USER}';")
        caller(USER, start.replace(RUN,"55555555-5555-4555-8555-555555555555"), False)
        sql(f"DELETE FROM public.user_roles WHERE user_id='{USER}';")
        assert caller(USER, f"SELECT status FROM public.cancel_omni_agent_run('{RUN}');").endswith("cancelled")
        assert caller(USER, f"SELECT status FROM public.cancel_omni_agent_run('{RUN}');").endswith("cancelled")
        caller(OTHER, f"SELECT public.cancel_omni_agent_run('{RUN}');", False)
        print("PASS: 15 isolated PostgreSQL checks: bootstrap, membership, ownership, consent-bound request, dedupe/conflict, forged writes, pause and revocation-safe cancellation. No hosted database touched.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()