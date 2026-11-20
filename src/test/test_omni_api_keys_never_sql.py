"""Disposable PostgreSQL only: OMNI API key "Never expires" (migration 0061) end to end.
Checks older finite keys survive unchanged, owner/MFA issue of finite and never-expiring keys,
verification, revocation and rejected mixed expiry shapes. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
OLD, FIN, NEV, EXP = "a" * 64, "b" * 64, "c" * 64, "d" * 64


def migration(number):
    paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
    assert len(paths) == 1, f"expected one migration {number:04d}"
    return paths[0].read_text()


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-api-keys-never-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT="55441", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        nonlocal checks
        checks += 1
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode:
            raise AssertionError(result.stderr)
        if not ok and not result.returncode:
            raise AssertionError(f"Expected SQL denial: {text}")
        return result.stdout.strip()

    def caller(uid, aal, text, ok=True):
        out = sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; {text}", ok)
        return out.splitlines()[-1] if out else out

    def verify(key_hash, scope="health"):
        return sql(f"SELECT coalesce(public.omni_api_key_verify('{key_hash}','{scope}')::text,'null');")

    def issue(name, key_hash, prefix, days, never):
        d = "NULL" if days is None else str(days)
        n = "NULL" if never is None else ("true" if never else "false")
        return f"SELECT public.omni_api_key_issue('{name}',ARRAY['health','jobs'],'{key_hash}','{prefix}',{d},{n});"

    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55441 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in range(20, 31):
            sql(migration(number))
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")

        # An older finite key made before 0061 keeps its exact expiry afterwards.
        old_id = caller(OWNER, "aal2", f"SELECT public.omni_api_key_create('Older key',ARRAY['health'],'{OLD}','omni_aaaa',30);")
        old_expiry = sql(f"SELECT expires_at::text FROM public.omni_api_keys WHERE id='{old_id}';")

        sql(os.environ.get("MIGRATION_0061_SQL") and Path(os.environ["MIGRATION_0061_SQL"]).read_text() or migration(61))

        assert sql(f"SELECT expires_at::text || '|' || never_expires FROM public.omni_api_keys WHERE id='{old_id}';") == f"{old_expiry}|false"
        assert verify(OLD) == old_id

        # Authorization stays owner + MFA (aal2) only.
        caller(OWNER, "aal1", issue("No MFA", NEV, "omni_cccc", None, True), False)
        caller(OTHER, "aal2", issue("Not owner", NEV, "omni_cccc", None, True), False)
        assert sql("SELECT has_function_privilege('anon','public.omni_api_key_issue(text,text[],text,text,integer,boolean)','execute');") == "f"
        assert sql("SELECT has_function_privilege('authenticated','public.omni_api_key_verify(text,text)','execute');") == "f"
        assert sql("SELECT has_function_privilege('service_role','public.omni_api_key_verify(text,text)','execute');") == "t"

        # Mixed or missing expiry choices are refused.
        caller(OWNER, "aal2", issue("Both", NEV, "omni_cccc", 30, True), False)
        caller(OWNER, "aal2", issue("Neither", NEV, "omni_cccc", None, False), False)
        caller(OWNER, "aal2", issue("Unknown", NEV, "omni_cccc", None, None), False)
        caller(OWNER, "aal2", issue("Too long", NEV, "omni_cccc", 366, False), False)
        caller(OWNER, "aal2", f"SELECT public.omni_api_key_issue('Bad scope',ARRAY['health','admin'],'{NEV}','omni_cccc',NULL,true);", False)

        # Finite key: stored with an expiry ~N days out, verifies.
        fin_id = caller(OWNER, "aal2", issue("Finite", FIN, "omni_bbbb", 90, False))
        assert sql(f"SELECT never_expires = false AND expires_at BETWEEN now() + interval '89 days' AND now() + interval '91 days' FROM public.omni_api_keys WHERE id='{fin_id}';") == "t"
        assert verify(FIN, "jobs") == fin_id

        # Never-expiring key: NULL expiry, flag set, hash-only, verifies, audited distinctly.
        nev_id = caller(OWNER, "aal2", issue("Forever", NEV, "omni_cccc", None, True))
        assert sql(f"SELECT never_expires AND expires_at IS NULL AND key_hash='{NEV}' AND key_prefix='omni_cccc' FROM public.omni_api_keys WHERE id='{nev_id}';") == "t"
        assert verify(NEV) == nev_id
        assert verify(NEV, "admin") == "null"
        assert sql(f"SELECT action FROM public.razul_control_audit WHERE record_id='{nev_id}';") == "create_no_expiry"
        assert sql(f"SELECT action FROM public.razul_control_audit WHERE record_id='{fin_id}';") == "create"

        # Inconsistent shapes cannot be stored even by the table owner.
        sql(f"UPDATE public.omni_api_keys SET expires_at=NULL WHERE id='{fin_id}';", False)
        sql(f"UPDATE public.omni_api_keys SET never_expires=false WHERE id='{nev_id}';", False)
        sql(f"UPDATE public.omni_api_keys SET expires_at=now()+interval '1 day' WHERE id='{nev_id}';", False)

        # Rotation keeps "never expires"; revocation stops it.
        caller(OWNER, "aal2", f"SELECT public.omni_api_key_rotate('{nev_id}','{'e' * 64}','omni_eeee');")
        assert verify(NEV) == "null"
        assert verify("e" * 64) == nev_id
        assert sql(f"SELECT never_expires AND expires_at IS NULL FROM public.omni_api_keys WHERE id='{nev_id}';") == "t"
        caller(OWNER, "aal2", f"SELECT public.omni_api_key_revoke('{nev_id}');")
        assert verify("e" * 64) == "null"
        caller(OWNER, "aal2", f"SELECT public.omni_api_key_revoke('{nev_id}');", False)

        # Expired finite keys still fail; revoking a finite key still works.
        sql(f"INSERT INTO public.omni_api_keys(name,key_prefix,key_hash,scopes,expires_at) VALUES('Expired','omni_dddd','{EXP}',ARRAY['health'],now()-interval '1 day');")
        assert verify(EXP) == "null"
        caller(OWNER, "aal2", f"SELECT public.omni_api_key_revoke('{fin_id}');")
        assert verify(FIN, "jobs") == "null"

        # Non-owner reads nothing.
        assert caller(OTHER, "aal2", "SELECT count(*) FROM public.omni_api_keys;") == "0"
        assert caller(OWNER, "aal2", "SELECT count(*) FROM public.omni_api_keys;") == "4"

        print(f"PASS: {checks} isolated SQL checks: older finite key preserved, owner/MFA-only issue, finite and never-expiring create/verify/rotate/revoke, mixed expiry refused, shape constraint. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
