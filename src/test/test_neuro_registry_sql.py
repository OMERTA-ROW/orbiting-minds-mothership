"""Disposable PostgreSQL coverage; never uses hosted credentials or real owner records."""
import json
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
    base = Path(tempfile.mkdtemp(prefix="neuro-registry-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55489", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    def sql(text, ok=True):
        nonlocal checks
        checks += 1
        r = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and r.returncode: raise AssertionError(r.stderr)
        if not ok and not r.returncode: raise AssertionError("Expected denial: " + text)
        return r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    def caller(uid, text, ok=True, aal="aal2"):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; {text}", ok)
    def profile(version):
        return json.dumps(dict(knowledge="Owner-selected knowledge only", reasoning="Review only", memory="No agent memory reads", learning="Off", evaluations="Owner recorded evidence", version=version, evidence="Disposable test only")).replace("'", "''")
    def change(action, expected, target=0, version="1", note="Owner reviewed scope and evidence"):
        return f"SELECT public.neuro_change('{action}','{cid}',{expected},{target},'{profile(version)}'::jsonb,'{note}');"
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55489 -c listen_addresses=''", "-w", "start"])
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
          CREATE TABLE public.evolution_directory(id uuid PRIMARY KEY,owner_id uuid,name text);
        """)
        sql((ROOT / "drizzle/migrations/0079_neuro_private_registry.sql").read_text())
        sql((ROOT / "drizzle/migrations/0080_neuro_registry_indexes.sql").read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}',now()),('{OTHER}',now()); INSERT INTO public.user_roles VALUES('{OWNER}','owner'); INSERT INTO public.evolution_directory VALUES(gen_random_uuid(),'{OWNER}','Owned project'),(gen_random_uuid(),'{OTHER}','Other project');")
        caller(OTHER, "SELECT public.neuro_register_ecosystem();", False)
        caller(OWNER, "SELECT public.neuro_register_ecosystem();", False, aal="aal1")
        sql("SET ROLE anon; SELECT public.neuro_register_ecosystem();", False)
        assert caller(OWNER, "SELECT public.neuro_register_ecosystem();") == "14"
        assert caller(OWNER, "SELECT public.neuro_register_ecosystem();") == "14"
        for key in ["omni", "code", "jackboy", "evolution", "razul", "guardian", "jax", "hercules", "cyberlink", "honeycomb", "legacy", "x-federal"]:
            assert caller(OWNER, f"SELECT count(*) FROM public.neuro_components WHERE pathway_key='{key}';") == "1"
        assert caller(OWNER, "SELECT count(*) FROM public.neuro_components WHERE name='Other project';") == "0"
        assert caller(OTHER, "SELECT count(*) FROM public.neuro_components;") == "0"
        assert caller(OWNER, "SELECT count(*) FROM public.neuro_components;", aal="aal1") == "0"
        for table in ["neuro_components", "neuro_revisions", "neuro_reviews"]:
            assert sql(f"SELECT has_table_privilege('anon','public.{table}','SELECT');") == "f"
            assert sql(f"SELECT has_table_privilege('authenticated','public.{table}','INSERT');") == "f"
        cid = caller(OWNER, "SELECT public.neuro_register('voice-vault','Voice Vault Brain Guild');")
        assert caller(OWNER, change("propose", 0)) == "1"
        caller(OTHER, change("propose", 0), False)
        caller(OWNER, change("propose", 0), False, aal="aal1")
        caller(OWNER, change("approved", 0, 1), False)
        caller(OWNER, change("rollback", 0, 1), False)
        assert caller(OWNER, change("scope_review", 0, 1)) == "1"
        assert caller(OWNER, change("approved", 0, 1)) == "1"
        assert caller(OWNER, f"SELECT active_revision FROM public.neuro_components WHERE id='{cid}';") == "1"
        assert caller(OWNER, change("propose", 1, version="2")) == "2"
        assert caller(OWNER, change("scope_review", 1, 2)) == "2"
        assert caller(OWNER, change("approved", 1, 2)) == "2"
        assert caller(OWNER, change("rollback", 2, 1)) == "1"
        assert caller(OWNER, f"SELECT profile->>'version' FROM public.neuro_revisions WHERE component_id='{cid}' AND revision=(SELECT active_revision FROM public.neuro_components WHERE id='{cid}');") == "1"
        caller(OWNER, change("approved", 2, 2), False)
        caller(OWNER, "UPDATE public.neuro_components SET autonomy_enabled=true;", False)
        sql("UPDATE public.neuro_components SET autonomy_enabled=true;", False)
        sql("UPDATE public.neuro_components SET integration_status='connected';", False)
        sql("UPDATE public.neuro_revisions SET digest=repeat('0',64);", False)
        sql("DELETE FROM public.neuro_reviews;", False)
        caller(OWNER, f"SELECT public.neuro_change('propose','{cid}',1,0,'{{\"autonomy\":true}}'::jsonb,'Denied');", False)
        # Real race: first approval holds the component lock; competing stale approval must refuse.
        assert caller(OWNER, change("propose", 1, version="3")) == "3"
        assert caller(OWNER, change("scope_review", 1, 3)) == "3"
        first = subprocess.Popen(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", f"BEGIN; SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; SET request.jwt.claim.aal='aal2'; {change('approved',1,3)} SELECT pg_sleep(1); COMMIT;"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep';") == "1": break
            time.sleep(0.03)
        else: raise AssertionError("Race was not reproduced")
        caller(OWNER, change("approved", 1, 3), False)
        out, err = first.communicate(timeout=10)
        assert first.returncode == 0, err
        assert caller(OWNER, f"SELECT count(*) FROM public.neuro_reviews WHERE component_id='{cid}' AND action='approved' AND revision=3;") == "1"
        caller(OWNER, change("scope_review", 3, 2), False)
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        caller(OWNER, change("propose", 3), False)
        assert caller(OWNER, "SELECT count(*) FROM public.neuro_components;") == "0"
        print(f"PASS: {checks} disposable SQL checks: owner/MFA isolation, distinct pathways, immutable digest/audit, scope review, approval, rollback, concurrency, autonomy off.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()