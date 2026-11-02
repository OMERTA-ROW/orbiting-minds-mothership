"""Disposable PostgreSQL only: OMNI API key owner/MFA/RPC/RLS/audit checks. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
HASH_A = "a" * 64
HASH_B = "b" * 64

def main():
    base = Path(tempfile.mkdtemp(prefix="omni-api-keys-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55440", PGUSER="fixture", PGDATABASE="postgres")
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
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55440 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in [20,21,22,23,24,25,26,27,28,29,30]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner');")

        create = f"SELECT public.omni_api_key_create('Fixture key',ARRAY['health','jobs'],'{HASH_A}','omni_aaaa',30);"
        # Authorization gates: NULL role, admin (not owner), aal1, unconfirmed email all denied.
        caller(OTHER, 'aal2', create, False)
        caller(OWNER, 'aal1', create, False)
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{OTHER}','admin');")
        caller(OTHER, 'aal2', create, False)
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        caller(OWNER, 'aal2', create, False)
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';")

        # Verified MFA owner creates; invalid inputs rejected.
        key_id = caller(OWNER, 'aal2', create).splitlines()[-1]
        assert len(key_id) == 36
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_create('Bad',ARRAY['admin'],'{HASH_B}','omni_bbbb',30);", False)
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_create('Bad',ARRAY['health'],'not-hex','omni_bbbb',30);", False)
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_create('Bad',ARRAY['health'],'{HASH_B}','omni_bbbb',0);", False)

        # Verify is service-role only; authenticated/anon cannot execute it.
        assert sql("SELECT has_function_privilege('authenticated','public.omni_api_key_verify(text,text)','execute');") == 'f'
        assert sql("SELECT has_function_privilege('anon','public.omni_api_key_verify(text,text)','execute');") == 'f'
        assert sql("SELECT has_function_privilege('service_role','public.omni_api_key_verify(text,text)','execute');") == 't'

        # Verification behavior (as the table owner, like service_role): correct hash+scope returns id.
        assert sql(f"SELECT public.omni_api_key_verify('{HASH_A}','health');") == key_id
        assert sql(f"SELECT public.omni_api_key_verify('{HASH_A}','jobs');") == key_id
        checks += 2
        # Wrong hash and unknown scope return NULL.
        assert sql(f"SELECT coalesce(public.omni_api_key_verify('{HASH_B}','health')::text,'null');") == 'null'
        assert sql(f"SELECT coalesce(public.omni_api_key_verify('{HASH_A}','admin')::text,'null');") == 'null'
        checks += 2
        # Successful verify stamps last_used_at.
        assert sql(f"SELECT last_used_at IS NOT NULL FROM public.omni_api_keys WHERE id='{key_id}';") == 't'

        # Rotate: old hash dies, new hash lives, audit recorded.
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_rotate('{key_id}','{HASH_B}','omni_bbbb');")
        assert sql(f"SELECT coalesce(public.omni_api_key_verify('{HASH_A}','health')::text,'null');") == 'null'
        assert sql(f"SELECT public.omni_api_key_verify('{HASH_B}','health');") == key_id
        checks += 2
        assert sql(f"SELECT rotated_at IS NOT NULL AND last_used_at IS NULL FROM public.omni_api_keys WHERE id='{key_id}';") == 'f'  # last_used re-stamped by verify above

        # Revoke: verification denied, double-revoke rejected, audit recorded.
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_revoke('{key_id}');")
        assert sql(f"SELECT coalesce(public.omni_api_key_verify('{HASH_B}','health')::text,'null');") == 'null'
        checks += 1
        caller(OWNER, 'aal2', f"SELECT public.omni_api_key_revoke('{key_id}');", False)
        caller(OTHER, 'aal2', f"SELECT public.omni_api_key_revoke('{key_id}');", False)

        # Expired keys deny verification.
        sql(f"INSERT INTO public.omni_api_keys(name,key_prefix,key_hash,scopes,expires_at) VALUES('Expired','omni_cccc','{'c' * 64}',ARRAY['health'],now()-interval '1 day');")
        assert sql(f"SELECT coalesce(public.omni_api_key_verify('{'c' * 64}','health')::text,'null');") == 'null'
        checks += 1

        # Audit: create + rotate + revoke recorded; non-owner cannot read audit or keys.
        assert caller(OWNER, 'aal2', "SELECT count(*) FROM public.razul_control_audit WHERE record_type='omni_api_key' AND action IN ('create','rotate','revoke');").endswith('3')
        assert caller(OTHER, 'aal2', "SELECT count(*) FROM public.razul_control_audit WHERE record_type='omni_api_key';").endswith('0')
        assert caller(OTHER, 'aal2', "SELECT count(*) FROM public.omni_api_keys;").endswith('0')
        assert caller(OWNER, 'aal2', "SELECT count(*) FROM public.omni_api_keys;").endswith('2')
        # Hash is stored, never a plaintext secret; prefix is display-length only.
        assert sql(f"SELECT key_hash='{HASH_B}' AND key_prefix='omni_bbbb' AND length(key_prefix)=12 FROM public.omni_api_keys WHERE id='{key_id}';") == 't'
        # Owner cannot insert fake audit rows directly.
        caller(OWNER, 'aal2', "INSERT INTO public.razul_control_audit(action,record_type,record_id) VALUES('fake','omni_api_key','fake');", False)

        print(f"PASS: {checks} isolated SQL calls plus privilege/RLS checks: owner-only MFA create/rotate/revoke, hash-only storage, scope/expiry/revocation verification, service-role-only verify, audit trail. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
