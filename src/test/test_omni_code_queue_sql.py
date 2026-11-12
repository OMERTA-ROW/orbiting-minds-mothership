"""Disposable PostgreSQL only: OMNI CODE queue and Mac folder-plan guards (off by default, no lease while off/stopped/paused/unapproved, never Jackboy, 24 h always-on, append-only history, frozen plans, per-step destructive confirmation, 30-day narrow grants). Never uses hosted credentials."""
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
    base = Path(tempfile.mkdtemp(prefix="omni-code-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55449", PGUSER="fixture", PGDATABASE="postgres")
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
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55449 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 35)) + [36, 47, 48]:
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
        G = '/Users/me/Downloads'
        def job(kind='code_task', agent='omni'):
            return sql(f"INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title) VALUES('{OWNER}','{agent}','{kind}','t') RETURNING id;").splitlines()[0]
        lease = lambda j: f"UPDATE public.omni_code_jobs SET status='leased', lease_expires_at=now()+interval '2 minutes' WHERE id='{j}';"

        # Off by default.
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        deny(f"INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title) VALUES('{OWNER}','jackboy','code_task','t');")
        deny(f"INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title,status) VALUES('{OWNER}','omni','code_task','t','running');")
        j = job()
        deny(lease(j))  # always-on off
        # Always-on needs stop released, kill switch on, and ends within 24 h.
        deny("UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '1 hour';")  # no stop row = engaged
        sql("INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'t',1); INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true);")
        deny("UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '25 hours';")
        deny("UPDATE public.omni_code_service SET always_on=true, always_on_until=NULL;")
        ok("UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '24 hours' - interval '1 minute';")
        deny(lease(j))  # agent paused by default
        sql("UPDATE public.omni_agents SET status='enrolled';")
        ok(lease(j))
        # File changes need approval; they are always marked destructive.
        a = job('file_apply')
        assert sql(f"SELECT destructive FROM public.omni_code_jobs WHERE id='{a}';") == 't'
        deny(lease(a))
        ok(f"UPDATE public.omni_code_jobs SET approved_at=now(), approved_by='{OWNER}' WHERE id='{a}';")
        ok(lease(a))
        # Back-off is enforced.
        r = job()
        ok(f"UPDATE public.omni_code_jobs SET status='retry_wait', not_before=now()+interval '1 minute' WHERE id='{r}';")
        deny(lease(r))
        # Agent pause pauses its jobs; Emergency Stop stops active jobs and turns always-on off.
        ok("UPDATE public.omni_agents SET status='paused' WHERE id='omni';")
        assert sql("SELECT count(*) FROM public.omni_code_jobs WHERE status IN ('leased','running','queued','retry_wait');") == '0'
        sql("UPDATE public.omni_agents SET status='enrolled' WHERE id='omni';")
        ok(f"UPDATE public.omni_code_jobs SET status='queued' WHERE id='{j}';")
        ok(lease(j))
        ok("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{j}';") == 'stopped'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        deny(f"UPDATE public.omni_code_jobs SET status='queued' WHERE id='{j}';")  # finished stays finished
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        # Kill switch also halts.
        ok("UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '1 hour';")
        ok("UPDATE public.omni_workspace_settings SET terminal_enabled=false;")
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        # History is append-only.
        sql(f"INSERT INTO public.omni_code_job_events(job_id,agent_id,actor,event) VALUES('{j}','omni','system','lease');")
        deny("UPDATE public.omni_code_job_events SET event='x';")
        deny("DELETE FROM public.omni_code_job_events;")
        # Folder grants: narrow, at most 30 days, never widened; revocation permanent.
        for bad in ['/', '/Users/me', '/Users/me/Library/Mail', '/Users/me/.ssh', '/Users/me/a/../b', '/Users/Shared/x', '/Volumes/x']:
            deny(f"INSERT INTO public.omni_mac_folder_grants(owner_id,path,mode,expires_at) VALUES('{OWNER}','{bad}','read',now()+interval '1 day');")
        deny(f"INSERT INTO public.omni_mac_folder_grants(owner_id,path,mode,expires_at) VALUES('{OWNER}','{G}','organize',now()+interval '31 days');")
        g = ok(f"INSERT INTO public.omni_mac_folder_grants(owner_id,path,mode,expires_at) VALUES('{OWNER}','{G}','organize',now()+interval '7 days') RETURNING id;").splitlines()[0]
        deny(f"UPDATE public.omni_mac_folder_grants SET path='/Users/me/Documents' WHERE id='{g}';")
        deny(f"UPDATE public.omni_mac_folder_grants SET expires_at=expires_at+interval '1 day' WHERE id='{g}';")
        # Plans: frozen ops, destructive steps confirmed one by one.
        ops = '[{"kind":"move","from":"/Users/me/Downloads/a","to":"/Users/me/Downloads/D/a"},{"kind":"trash","from":"/Users/me/Downloads/c"}]'
        H = 'a' * 64
        p = ok(f"INSERT INTO public.omni_file_plans(owner_id,grant_id,ops,plan_sha256) VALUES('{OWNER}','{g}','{ops}','{H}') RETURNING id;").splitlines()[0]
        deny(f"UPDATE public.omni_file_plans SET ops='[]' WHERE id='{p}';")
        deny(f"UPDATE public.omni_file_plans SET status='applying' WHERE id='{p}';")
        deny(f"UPDATE public.omni_file_plans SET status='approved', approved_at=now(), approved_by='{OWNER}' WHERE id='{p}';")
        deny(f"UPDATE public.omni_file_plans SET status='approved', approved_at=now(), approved_by='{OWNER}', confirmed_destructive='{{0}}' WHERE id='{p}';")
        ok(f"UPDATE public.omni_file_plans SET status='approved', approved_at=now(), approved_by='{OWNER}', confirmed_destructive='{{1}}' WHERE id='{p}';")
        ok(f"UPDATE public.omni_mac_folder_grants SET revoked_at=now() WHERE id='{g}';")
        deny(f"UPDATE public.omni_mac_folder_grants SET revoked_at=NULL WHERE id='{g}';")
        p2 = sql(f"INSERT INTO public.omni_file_plans(owner_id,grant_id,ops,plan_sha256) VALUES('{OWNER}','{g}','[]','{H}') RETURNING id;").splitlines()[0]
        deny(f"UPDATE public.omni_file_plans SET status='approved', approved_at=now(), approved_by='{OWNER}' WHERE id='{p2}';")  # grant revoked
        sql(f"INSERT INTO public.omni_file_journal(plan_id,op_index,op,result) VALUES('{p}',0,'{{}}','applied');")
        deny("DELETE FROM public.omni_file_journal;")
        # Signed-in users read only; no direct writes.
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title) VALUES('{OWNER}','omni','code_task','t');", False)
        checks += 1
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; UPDATE public.omni_code_service SET always_on=true;", False)

        print(f"PASS: {checks} isolated SQL checks: CODE off by default, no lease while off/stopped/paused/unapproved/backing off, Jackboy refused, 24 h always-on, Emergency Stop/kill switch/pause halts, append-only history and journal, narrow 30-day grants, frozen plans with per-step destructive confirmation, no direct user writes. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
