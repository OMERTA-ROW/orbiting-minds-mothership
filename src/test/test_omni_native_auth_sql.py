"""Disposable PostgreSQL only: native OMNI browser approval, PKCE exchange and device rotation."""
import hashlib
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
X1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
Y1 = "AQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
X2 = "AgECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
Y2 = "AwECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
CHALLENGE = "A" * 43
PERMISSIONS = "ARRAY['status.read','jobs.propose']"
JWK1 = {"crv": "P-256", "kty": "EC", "x": X1, "y": Y1}
JWK2 = {"crv": "P-256", "kty": "EC", "x": X2, "y": Y2}


def fingerprint(jwk):
    canonical = json.dumps(jwk, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def migrations():
    found = []
    for number in range(20, 75):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    assert found[-1].name.startswith("0074_"), found[-1]
    found.append(ROOT / ".lovable/pending/0075_claude_engine_terminal_fusion.sql")
    found.append(ROOT / ".lovable/pending/0076_omni_native_cli_authorization.sql")
    return found


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-native-auth-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT="55453", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        result = subprocess.run(
            ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text],
            env=env,
            capture_output=True,
            text=True,
        )
        if ok and result.returncode:
            raise AssertionError(result.stderr)
        if not ok and not result.returncode:
            raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()

    now = int(time.time())
    fresh = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    stale = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'

    def caller(uid, aal, amr, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(
            f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; "
            f"SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}",
            ok,
        )

    def owner(text, ok=True, amr=fresh):
        return caller(OWNER, "aal2", amr, text, ok)

    def service(text, ok=True):
        nonlocal checks
        checks += 1
        result = sql(f"SET ROLE service_role; {text}", ok)
        return result.splitlines()[-1] if ok else result

    started = False

    def authorize(
        code_hash,
        nonce_hash,
        jwk,
        rotation=None,
        permissions=PERMISSIONS,
        port=49152,
    ):
        public = "'" + json.dumps(jwk, separators=(",", ":")) + "'::jsonb"
        rotate_sql = "NULL" if rotation is None else f"'{rotation}'::uuid"
        return (
            "SELECT public.omni_native_authorize("
            f"'omni-native-cli','omni-mothership',{port},'{code_hash}','{CHALLENGE}',"
            f"'{nonce_hash}',{int(time.time() * 1000)},{public},'{fingerprint(jwk)}',"
            f"'OMNI CLI','macos',{permissions},{rotate_sql});"
        )

    def exchange(code_hash, challenge=CHALLENGE, port=49152):
        return service(
            "SELECT public.omni_native_exchange("
            f"'{code_hash}','{challenge}','omni-native-cli','omni-mothership',{port});"
        )

    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(
            [
                "pg_ctl",
                "-D",
                str(base / "db"),
                "-l",
                str(base / "server.log"),
                "-o",
                f"-k {base} -p 55453 -c listen_addresses=''",
                "-w",
                "start",
            ]
        )
        started = True
        sql(
            """CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
              $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS
              $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),
                   'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
            CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
            CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;"""
        )
        sql((ROOT / "drizzle/migrations/0000_ai_generation_circuit_breaker.sql").read_text())
        sql(
            """CREATE TABLE public.beta_access (
                 user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false,
                 paused boolean NOT NULL DEFAULT false, approved_at timestamptz
               );
               CREATE TABLE public.beta_projects (
                 id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text, brief text,
                 UNIQUE (id, owner_id)
               );"""
        )
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        sql((ROOT / "drizzle/migrations/0019_omni_agent_runs.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(
            f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),"
            f"('{OTHER}','other@fixture.invalid',now()); "
            f"INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');"
        )
        assert caller(OWNER, "aal1", fresh, "SELECT public.omni_native_authorization_ready();").endswith("t")
        for role in ["anon", "authenticated"]:
            assert sql(
                f"SELECT has_function_privilege('{role}',"
                "'public.omni_native_exchange(text,text,text,text,integer)','execute');"
            ) == "f"
            checks += 1

        # Consent fails closed for non-owners, missing aal2 and stale TOTP.
        caller(OTHER, "aal2", fresh, authorize("a" * 64, "1" * 64, JWK1), False)
        caller(OWNER, "aal1", fresh, authorize("a" * 64, "1" * 64, JWK1), False)
        owner(authorize("a" * 64, "1" * 64, JWK1), False, amr=stale)

        # Owner consent persists only a code hash and public key; service exchange is one-use.
        assert '"ok": true' in owner(authorize("a" * 64, "1" * 64, JWK1))
        assert service(
            f"SELECT code_hash FROM public.omni_native_authorization_codes WHERE code_hash='{'a' * 64}';"
        ) == "a" * 64
        enrolled = exchange("a" * 64)
        assert '"ok": true' in enrolled and '"status": "paired"' in enrolled, enrolled
        device = json.loads(enrolled)["device_id"]
        assert json.loads(enrolled)["permissions"] == ["jobs.propose", "status.read"]
        assert '"code_already_used"' in exchange("a" * 64)
        assert service(f"SELECT public.omni_native_owner_ok('{OTHER}');") == "f"

        # Bad PKCE and expired codes are consumed and cannot be retried.
        assert '"ok": true' in owner(authorize("b" * 64, "2" * 64, JWK2))
        assert '"pkce_mismatch"' in exchange("b" * 64, "B" * 43)
        assert '"code_already_used"' in exchange("b" * 64)
        assert '"ok": true' in owner(authorize("c" * 64, "3" * 64, JWK2))
        service(
            "UPDATE public.omni_native_authorization_codes "
            "SET created_at=now()-interval '61 seconds', expires_at=now()-interval '2 seconds' "
            f"WHERE code_hash='{'c' * 64}';"
        )
        assert '"code_expired"' in exchange("c" * 64)

        # Rotation preserves approved permissions, increments revision and atomically replaces the key.
        revision = owner(f"SELECT revision FROM public.omni_dock_devices WHERE id='{device}';").splitlines()[-1]
        assert '"ok": true' in owner(
            authorize(
                "d" * 64,
                "4" * 64,
                JWK2,
                rotation=device,
                permissions="ARRAY[]::text[]",
            )
        )
        rotated = exchange("d" * 64)
        assert '"ok": true' in rotated, rotated
        assert json.loads(rotated)["permissions"] == ["jobs.propose", "status.read"]
        assert json.loads(rotated)["revision"] == int(revision) + 1
        assert owner(
            f"SELECT key_fingerprint FROM public.omni_dock_devices WHERE id='{device}';"
        ).endswith(fingerprint(JWK2))

        # A concurrent device change invalidates a previously consented rotation.
        assert '"ok": true' in owner(
            authorize(
                "e" * 64,
                "5" * 64,
                JWK1,
                rotation=device,
                permissions="ARRAY[]::text[]",
            )
        )
        service(
            f"UPDATE public.omni_dock_devices SET revision=revision+1 WHERE id='{device}';"
        )
        assert '"rotation_stale"' in exchange("e" * 64)

        owner(f"SELECT count(*) FROM public.omni_dock_revoke('{device}','CLI retired');")
        assert owner(
            f"SELECT status || '/' || cardinality(permissions) FROM public.omni_dock_devices WHERE id='{device}';"
        ).endswith("revoked/0")
        print(
            f"PASS: {checks} disposable PostgreSQL checks: owner + fresh MFA consent, code hashing, "
            "service-only one-use PKCE exchange, owner isolation, PKCE/expiry refusal, permission-preserving "
            "key rotation, stale-rotation refusal and device revocation."
        )
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
