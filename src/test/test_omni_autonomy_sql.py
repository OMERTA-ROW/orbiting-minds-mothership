"""Disposable PostgreSQL only: Autonomous Mode window guards (15/30/60 only, never Jackboy, Emergency Stop/kill switch/agent pause end windows, no reopening or extending). Never uses hosted credentials."""
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
    base = Path(tempfile.mkdtemp(prefix="omni-autonomy-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55448", PGUSER="fixture", PGDATABASE="postgres")
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
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55448 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 35)) + [36, 47]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        def deny(text):
            nonlocal checks
            checks += 1
            sql(text, False)
        def ok(text):
            nonlocal checks
            checks += 1
            return sql(text)
        W = lambda agent, mins: f"INSERT INTO public.omni_autonomy_windows(owner_id,agent_id,started_at,expires_at) VALUES('{OWNER}','{agent}',now(),now()+interval '{mins} minutes') RETURNING id;"
        open_count = lambda: sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;")

        # Default state: Emergency Stop row missing (unreadable = engaged), terminal off, agents paused.
        deny(W('omni', 15))
        sql("INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'test',1);")
        deny(W('omni', 15))  # kill switch row missing
        sql("INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true);")
        deny(W('omni', 15))  # agent paused
        sql("UPDATE public.omni_agents SET status='enrolled';")
        deny(W('jackboy', 15))  # never Jackboy
        for bad in [5, 45, 61, 120]:
            deny(W('omni', bad))
        for good in [15, 30, 60]:
            ok(W('omni', good))
            assert open_count() == '1'
            sql("UPDATE public.omni_autonomy_windows SET ended_at=now(), end_reason='test' WHERE ended_at IS NULL;")
        # Cannot extend, reassign or reopen.
        wid = ok(W('omni', 15)).splitlines()[0]
        deny(f"UPDATE public.omni_autonomy_windows SET expires_at=expires_at+interval '5 minutes' WHERE id='{wid}';")
        deny(f"UPDATE public.omni_autonomy_windows SET agent_id='jackboy' WHERE id='{wid}';")
        ok(f"UPDATE public.omni_autonomy_windows SET expires_at=expires_at-interval '5 minutes' WHERE id='{wid}';")  # shortening is allowed
        # Emergency Stop ends every open window.
        ok("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert open_count() == '0'
        assert sql(f"SELECT end_reason FROM public.omni_autonomy_windows WHERE id='{wid}';") == 'emergency_stop'
        deny(f"UPDATE public.omni_autonomy_windows SET ended_at=NULL WHERE id='{wid}';")
        deny(W('omni', 15))
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        # Kill switch ends windows.
        ok(W('omni', 30))
        ok("UPDATE public.omni_workspace_settings SET terminal_enabled=false;")
        assert open_count() == '0'
        deny(W('omni', 15))
        sql("UPDATE public.omni_workspace_settings SET terminal_enabled=true;")
        # Pausing the agent ends only its window.
        ok(W('omni', 60))
        ok("UPDATE public.omni_agents SET status='paused' WHERE id='omni';")
        assert open_count() == '0'
        assert sql("SELECT end_reason FROM public.omni_autonomy_windows ORDER BY started_at DESC, id LIMIT 1;") in ('agent_paused',)
        # Signed-in users still cannot write windows directly.
        sql("UPDATE public.omni_agents SET status='enrolled' WHERE id='omni';")
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; " + W('omni', 15), False)

        print(f"PASS: {checks} isolated SQL checks: fail-closed defaults, 15/30/60-only windows, Jackboy excluded, no extend/reassign/reopen, Emergency Stop, kill switch and agent pause end windows, no direct user writes. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
