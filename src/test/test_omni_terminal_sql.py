"""Disposable PostgreSQL only: OMNI Terminal Emergency Stop/task/log owner, fresh-MFA, isolation and audit checks. Never uses hosted credentials."""
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
    base = Path(tempfile.mkdtemp(prefix="omni-terminal-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55443", PGUSER="fixture", PGDATABASE="postgres")
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
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55443 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in range(20, 34):
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        SESSION = "33333333-3333-4333-8333-333333333333"
        TASK = "44444444-4444-4444-8444-444444444444"
        def queue(tid=TASK, kind="code.test", agent="jackboy", text="Add a regression test"):
            return f"SELECT count(*) FROM public.omni_terminal_queue_task('{tid}', '{kind}', '{agent}', 'Mothership', NULL, '{text}');"

        # Anonymous cannot execute any terminal function.
        for fn in ["omni_terminal_engage_stop(text)", "omni_terminal_release_stop(text)", "omni_terminal_queue_task(uuid,text,text,text,text,text)", "omni_terminal_cancel_task(uuid)", "omni_terminal_record(uuid,text,text,text)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == 'f', fn
            checks += 1

        # No row yet: the server gate reads nothing, which counts as engaged.
        assert caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_controls;").endswith('0')

        # Admin (not owner) and aal1 owner are refused everywhere.
        caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_engage_stop('x');", False)
        caller(OWNER, 'aal1', FRESH, "SELECT count(*) FROM public.omni_terminal_engage_stop('x');", False)
        caller(OTHER, 'aal2', FRESH, queue(), False)
        caller(OTHER, 'aal2', FRESH, f"SELECT public.omni_terminal_record('{SESSION}','status','ok','');", False)

        # Engaging needs only the owner (no fresh code); releasing needs fresh two-factor and a reason.
        caller(OWNER, 'aal2', STALE, "SELECT count(*) FROM public.omni_terminal_engage_stop('drill');")
        assert caller(OWNER, 'aal2', STALE, "SELECT emergency_stop FROM public.omni_terminal_controls;").endswith('t')
        caller(OWNER, 'aal2', STALE, "SELECT count(*) FROM public.omni_terminal_release_stop('checked');", False)
        caller(OWNER, 'aal2', NOMFA, "SELECT count(*) FROM public.omni_terminal_release_stop('checked');", False)
        caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_release_stop('');", False)
        caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_release_stop('sk-proj-abcdefghijklmnopqrstu');", False)
        caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_release_stop('self-test window');")
        assert caller(OWNER, 'aal2', FRESH, "SELECT emergency_stop FROM public.omni_terminal_controls;").endswith('f')
        caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.omni_terminal_engage_stop('done');")
        assert caller(OWNER, 'aal2', FRESH, "SELECT emergency_stop::text || '/' || revision FROM public.omni_terminal_controls;").endswith('true/3')

        # Tasks: held only, CODE must target Jackboy, secrets refused, idempotent, cancel once.
        caller(OWNER, 'aal2', FRESH, queue())
        caller(OWNER, 'aal2', FRESH, queue())  # same request again: no duplicate
        caller(OWNER, 'aal2', FRESH, queue(text="Something different"), False)
        caller(OWNER, 'aal2', FRESH, queue(tid="55555555-5555-4555-8555-555555555555", agent="jax"), False)
        caller(OWNER, 'aal2', FRESH, queue(tid="55555555-5555-4555-8555-555555555555", text="key sk-proj-abcdefghijklmnopqrstu"), False)
        caller(OWNER, 'aal2', FRESH, queue(tid="66666666-6666-4666-8666-666666666666", kind="agent.handoff", agent="razul", text="Summarize findings"))
        assert caller(OWNER, 'aal2', FRESH, "SELECT count(*) || '/' || count(*) FILTER (WHERE state='held') FROM public.omni_terminal_tasks;").endswith('2/2')
        caller(OWNER, 'aal2', FRESH, f"SELECT count(*) FROM public.omni_terminal_cancel_task('{TASK}');")
        caller(OWNER, 'aal2', FRESH, f"SELECT count(*) FROM public.omni_terminal_cancel_task('{TASK}');", False)
        caller(OWNER, 'aal2', FRESH, "UPDATE public.omni_terminal_tasks SET state='held';", False)
        caller(OWNER, 'aal2', FRESH, f"INSERT INTO public.omni_terminal_tasks(id,created_by,kind,agent,project_label,instructions) VALUES ('77777777-7777-4777-8777-777777777777','{OWNER}','code.test','jackboy','x','xyz');", False)
        sql("INSERT INTO public.omni_terminal_tasks(id,created_by,kind,agent,project_label,instructions,state) VALUES ('88888888-8888-4888-8888-888888888888','" + OWNER + "','code.test','jackboy','x','xyz','dispatched');", False)
        checks += 1

        # Log: owner records, secrets refused, no direct writes.
        caller(OWNER, 'aal2', FRESH, f"SELECT public.omni_terminal_record('{SESSION}','status','ok','Emergency Stop: ENGAGED');")
        caller(OWNER, 'aal2', FRESH, f"SELECT public.omni_terminal_record('{SESSION}','sk-proj-abcdefghijklmnopqrstu','denied','');", False)
        caller(OWNER, 'aal2', FRESH, f"SELECT public.omni_terminal_record('{SESSION}','status','maybe','');", False)
        caller(OWNER, 'aal2', FRESH, f"INSERT INTO public.omni_terminal_log(session_id,actor_id,command,outcome) VALUES ('{SESSION}','{OWNER}','x','ok');", False)
        caller(OWNER, 'aal2', FRESH, "UPDATE public.omni_terminal_controls SET emergency_stop=false;", False)

        # Read isolation: the admin sees nothing.
        for t in ["omni_terminal_controls", "omni_terminal_tasks", "omni_terminal_log"]:
            assert caller(OTHER, 'aal2', FRESH, f"SELECT count(*) FROM public.{t};").endswith('0'), t
        assert caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.razul_control_audit WHERE record_type='omni_terminal';").endswith('0')

        # Audit trail: 3 stop changes, 2 holds, 1 cancel.
        assert caller(OWNER, 'aal2', FRESH, "SELECT string_agg(action || ':' || n, ',' ORDER BY action) FROM (SELECT action, count(*) n FROM public.razul_control_audit WHERE record_type='omni_terminal' GROUP BY action) a;").endswith(
            'emergency_stop_engage:2,emergency_stop_release:1,task_cancel:1,task_held:2')

        print(f"PASS: {checks} isolated SQL checks: anonymous/admin/aal1 denial, fail-closed default, owner engage without fresh code, release needs fresh two-factor + reason, secret refusal, held-only tasks, CODE→Jackboy rule, idempotent queue, single cancel, no direct writes, owner-only reads, audit trail. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
