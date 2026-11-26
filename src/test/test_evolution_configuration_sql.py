"""Real disposable PostgreSQL checks only; never uses hosted credentials or repositories."""
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
    base = Path(tempfile.mkdtemp(prefix="evolution-config-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55486", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0
    def sql(text, ok=True):
        nonlocal checks
        checks += 1
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected denial: " + text)
        return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
    def caller(uid, text, ok=True, aal="aal2"):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; {text}", ok)
    def save(project, revision, source="", output="dist"):
        return f"SELECT revision FROM public.evolution_config_save('{project}',{revision},'{source}','main','bun run build','{output}');"
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55486 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
          CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
          CREATE TABLE public.user_roles(user_id uuid,role text);
          CREATE FUNCTION public.is_razul_owner() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
            SELECT coalesce(current_setting('request.jwt.claim.aal',true),'')='aal2'
             AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='owner')
             AND EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) $$;
        """)
        sql((ROOT / "drizzle/migrations/0001_limited_beta_owner_isolation.sql").read_text())
        sql((ROOT / "drizzle/migrations/0075_evolution_project_configuration.sql").read_text())
        sql((ROOT / "drizzle/migrations/0076_evolution_configuration_audit_alignment.sql").read_text())
        # Hosted databases may inherit grants: reproduce and remove them explicitly.
        sql("GRANT ALL ON public.evolution_project_configs TO anon,authenticated;")
        sql((ROOT / "drizzle/migrations/0077_evolution_configuration_privilege_hardening.sql").read_text())
        assert sql("SELECT has_table_privilege('anon','public.evolution_project_configs','SELECT');") == "f"
        assert sql("SELECT has_table_privilege('authenticated','public.evolution_project_configs','INSERT');") == "f"
        sql(f"INSERT INTO auth.users VALUES('{OWNER}',now()),('{OTHER}',now()); INSERT INTO public.user_roles VALUES('{OWNER}','owner');")
        caller(OTHER, "SELECT public.evolution_project_create('Denied','');", False)
        caller(OWNER, "SELECT public.evolution_project_create('Denied','');", False, aal="aal1")
        sql("SET ROLE anon; SELECT public.evolution_project_create('Denied','');", False)
        project = caller(OWNER, "SELECT public.evolution_project_create('Disposable configuration test','No repository import');")
        assert caller(OWNER, save(project, 0)) == "1"
        assert caller(OWNER, save(project, 1, "https://github.com/owner/authorized.git")) == "2"
        assert caller(OWNER, "SELECT count(*) FROM public.evolution_project_configs;") == "2"
        assert caller(OTHER, "SELECT count(*) FROM public.evolution_project_configs;") == "0"
        caller(OTHER, save(project, 2), False)
        caller(OWNER, save(project, 1), False)
        caller(OWNER, save(project, 2), False, aal="aal1")
        caller(OWNER, "UPDATE public.evolution_project_configs SET branch='tampered';", False)
        caller(OWNER, "DELETE FROM public.evolution_project_configs;", False)
        caller(OWNER, save(project, 2, "https://secret@github.com/owner/repo"), False)
        caller(OWNER, save(project, 2, output="../dist"), False)
        assert sql("SELECT count(*) FROM public.beta_audit WHERE capability='evolution_project_configs';") == "2"
        assert sql("SELECT count(*) FROM public.beta_audit WHERE capability='beta_projects';") == "1"
        # A competing revision waits on the project lock, then refuses stale expectedRevision.
        first = subprocess.Popen(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c",
          f"BEGIN; SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; SET request.jwt.claim.aal='aal2'; {save(project, 2)} SELECT pg_sleep(1); COMMIT;"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep';") == "1": break
            time.sleep(0.03)
        else: raise AssertionError("Race was not reproduced")
        caller(OWNER, save(project, 2), False)
        out, err = first.communicate(timeout=10)
        assert first.returncode == 0, err
        assert sql("SELECT count(*) FROM public.evolution_project_configs;") == "3"
        assert sql("SELECT count(*) FROM public.beta_audit WHERE capability='evolution_project_configs';") == "3"
        sql(f"DELETE FROM public.user_roles WHERE user_id='{OWNER}';")
        caller(OWNER, save(project, 3), False)
        assert caller(OWNER, "SELECT count(*) FROM public.evolution_project_configs;") == "0"
        print(f"PASS: {checks} isolated SQL checks including owner/MFA isolation, immutable revisions, automatic audit and a real concurrent stale-write refusal.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()