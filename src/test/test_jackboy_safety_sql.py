"""Disposable PostgreSQL only: Jackboy safety state fails closed (missing/unknown/stale/paused/CODE stop
refuse autonomy windows, CODE always-on and CODE leasing), non-clear readings halt windows and CODE jobs,
signed notices can only report a stop, notice replays are rejected, older clear readings never override,
Step 10 gates admission, and signed-in users cannot write. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
D = "a" * 64

def main():
    base = Path(tempfile.mkdtemp(prefix="jackboy-safety-sql-"))
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
        for number in list(range(20, 35)) + [36, 47, 48, 51]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        override = os.environ.get("JACKBOY_SAFETY_SQL")
        if override:
            sql(Path(override).read_text())
        else:
            for name in ["*_jackboy_safety_state.sql", "*_jackboy_safety_halt_agent_jobs.sql"]:
                paths = list((ROOT / "drizzle/migrations").glob(name))
                assert len(paths) == 1, name
                sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner');")
        def deny(text):
            nonlocal checks
            checks += 1
            sql(text, False)
        def ok(text):
            nonlocal checks
            checks += 1
            return sql(text)
        def record(source, paused, stop, observed="now()", expires="now()+interval '2 minutes'", nonce="NULL", digest=f"'{D}'"):
            return f"SELECT public.jackboy_safety_record('{source}',{paused},{stop},false,NULL,{observed},{expires},{digest},{nonce},'t');"
        window = f"INSERT INTO public.omni_autonomy_windows(owner_id,agent_id,started_at,expires_at) VALUES('{OWNER}','omni',now(),now()+interval '15 minutes') RETURNING id;"
        always_on = "UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '1 hour';"
        def job():
            return sql(f"INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title) VALUES('{OWNER}','omni','code_task','t') RETURNING id;").splitlines()[0]
        lease = lambda j: f"UPDATE public.omni_code_jobs SET status='leased', lease_expires_at=now()+interval '2 minutes' WHERE id='{j}';"
        approve_all = "UPDATE public.activation_approvals SET status='approved', decided_at=now(), approval_expires_at=CASE WHEN step=7 THEN now()+interval '1 hour' ELSE NULL END;"

        # Starts unknown; every other gate open except Jackboy safety and Step 10.
        sql("INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'t',1); INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true); UPDATE public.omni_agents SET status='enrolled' WHERE id='omni';")
        assert sql("SELECT state FROM public.jackboy_safety_state WHERE id=1;") == 'unknown'
        assert sql("SELECT public.jackboy_safety_clear();") == 'f'
        sql("INSERT INTO public.activation_approvals(step) SELECT g FROM generate_series(1,10) g ON CONFLICT (step) DO NOTHING;")
        assert sql("SELECT public.activation_autonomy_authorized();") == 'f'
        sql(approve_all)
        assert sql("SELECT public.activation_autonomy_authorized();") == 't'
        deny(window)  # unknown safety
        deny(always_on)

        # Fresh signed clear poll: admission allowed only with Step 10 in effect.
        assert ok(record('poll', 'false', 'false')) == 'clear'
        assert sql("SELECT public.jackboy_safety_clear();") == 't'
        sql("UPDATE public.activation_approvals SET status='pending' WHERE step=10;")
        deny(window)
        deny(always_on)
        sql("UPDATE public.activation_approvals SET approval_expires_at=now()-interval '1 minute' WHERE step=7; UPDATE public.activation_approvals SET status='approved' WHERE step=10;")
        deny(window)  # Step 7 window ended
        sql(approve_all)
        ok(window)
        ok(always_on)
        j = job()
        ok(lease(j))
        q = job()
        sess = sql(f"INSERT INTO public.omni_workspace_sessions(agent_id,owner_id) VALUES('omni','{OWNER}') RETURNING id;").splitlines()[0]
        aj = sql(f"INSERT INTO public.omni_agent_jobs(agent_id,session_id,kind,origin,input,status) VALUES('omni','{sess}','command','agent','x','running') RETURNING id;").splitlines()[0]
        mj = sql(f"INSERT INTO public.omni_agent_jobs(agent_id,session_id,kind,origin,input,status) VALUES('omni','{sess}','command','owner','status','running') RETURNING id;").splitlines()[0]

        # A signed CODE stop notice halts: windows end, active jobs stop, queued jobs are held.
        assert ok(record('event', 'false', 'true', nonce="'" + "1" * 32 + "'", expires="NULL")) == 'engaged'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        assert sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{j}';") == 'stopped'
        assert sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{q}';") == 'paused'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        assert sql(f"SELECT status FROM public.omni_agent_jobs WHERE id='{aj}';") == 'stopped'
        assert sql(f"SELECT status FROM public.omni_agent_jobs WHERE id='{mj}';") == 'running'  # manual terminal untouched
        assert sql(f"SELECT ended_at IS NULL FROM public.omni_workspace_sessions WHERE id='{sess}';") == 't'
        assert sql("SELECT end_reason FROM public.omni_autonomy_windows LIMIT 1;") == 'jackboy_safety'
        deny(window)
        deny(always_on)
        # Replay rejected; a notice can never report clear; unsigned/no-digest refused.
        deny(record('event', 'false', 'true', nonce="'" + "1" * 32 + "'", expires="NULL"))
        deny(record('event', 'false', 'false', nonce="'" + "2" * 32 + "'"))
        deny(record('event', 'false', 'true', nonce="'" + "3" * 32 + "'", digest="NULL"))
        deny(record('event', 'false', 'true', nonce="NULL"))
        # An older clear reading cannot override the newer stop.
        assert ok(record('poll', 'false', 'false', observed="now()-interval '1 minute'")) == 'ignored_older'
        assert sql("SELECT state FROM public.jackboy_safety_state;") == 'engaged'
        # Out-of-range times and long clear expiries refused.
        deny(record('poll', 'false', 'false', observed="now()+interval '5 minutes'"))
        deny(record('poll', 'false', 'false', expires="now()+interval '10 minutes'"))
        deny(record('poll', 'false', 'false', expires="NULL"))
        # Global pause is a stop too; null fields read as unknown.
        assert ok(record('poll', 'true', 'false')) == 'paused'
        deny(window)
        assert ok(record('poll', 'NULL', 'false')) == 'unknown'
        deny(window)
        # Failure halts.
        assert ok(record('poll', 'false', 'false')) == 'clear'
        ok(window)
        assert ok("SELECT public.jackboy_safety_record('failure',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'timeout');") == 'unknown'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        # Stale: an expired clear reading becomes unknown on enforcement and halts.
        assert ok(record('poll', 'false', 'false')) == 'clear'
        ok(window)
        sql("UPDATE public.jackboy_safety_state SET expires_at=now()-interval '1 second', observed_at=now()-interval '2 minutes';")
        assert sql("SELECT public.jackboy_safety_clear();") == 'f'
        deny(window)  # stale blocks even before enforcement runs
        assert ok("SELECT public.jackboy_safety_enforce_freshness();") == 'unknown'
        assert sql("SELECT source FROM public.jackboy_safety_state;") == 'stale'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        # Clearing never restarts anything: held jobs stay paused, stopped jobs stay stopped.
        assert ok(record('poll', 'false', 'false')) == 'clear'
        assert sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{q}';") == 'paused'
        assert sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{j}';") == 'stopped'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        # Audit rows recorded for transitions and every notice.
        assert int(sql("SELECT count(*) FROM public.razul_control_audit WHERE record_type='jackboy_safety';")) >= 6
        # Signed-in users (even the owner) can read but never write or record.
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; UPDATE public.jackboy_safety_state SET state='clear';", False)
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; " + record('poll', 'false', 'false'), False)
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; SELECT public.jackboy_safety_enforce_freshness();", False)
        checks += 1
        sql("SET ROLE anon; SELECT * FROM public.jackboy_safety_state;", False)

        print(f"PASS: {checks} isolated SQL checks: Jackboy safety fails closed (unknown/stale/paused/CODE stop), Step 10 and Step 7 window gate admission, stop notices halt windows and CODE jobs, replays and clear notices refused, older clears ignored, clearing restarts nothing, no user writes. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
