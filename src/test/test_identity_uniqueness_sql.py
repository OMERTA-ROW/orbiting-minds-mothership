"""Disposable PostgreSQL only: one account per provider identity, idempotent sign-up
records and a single owner. Function bodies mirror the live definitions read on
2026-11-13 (initialize_beta_access, claim_owner). Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

OWNER = "11111111-1111-4111-8111-111111111111"
TWIN = "22222222-2222-4222-8222-222222222222"
OTHER = "33333333-3333-4333-8333-333333333333"


def main():
    base = Path(tempfile.mkdtemp(prefix="identity-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT="55442", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        nonlocal checks
        r = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and r.returncode:
            raise AssertionError(r.stderr)
        if not ok:
            checks += 1
            if not r.returncode:
                raise AssertionError("Expected SQL refusal: " + text)
            return r.stderr
        return r.stdout.strip()

    def as_user(uid, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; {text}", ok)

    def expect(actual, wanted):
        nonlocal checks
        checks += 1
        assert actual == wanted, (actual, wanted)

    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55442 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""
        CREATE ROLE authenticated; CREATE SCHEMA auth;
        GRANT USAGE ON SCHEMA auth, public TO authenticated;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
        CREATE TABLE auth.identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          provider text NOT NULL, provider_id text NOT NULL, CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider));
        CREATE TYPE public.app_role AS ENUM ('owner','admin','tester');
        CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role public.app_role NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE (user_id, role));
        CREATE TABLE public.owner_config(id int PRIMARY KEY CHECK (id = 1), owner_email text);
        CREATE TABLE public.beta_access(user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false);
        CREATE FUNCTION public.initialize_beta_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
        BEGIN
         INSERT INTO public.beta_access(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
         RETURN NEW;
        END;
        $function$;
        CREATE TRIGGER beta_access_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.initialize_beta_access();
        CREATE FUNCTION public.claim_owner() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
        DECLARE u auth.users%ROWTYPE; cfg text;
        BEGIN
          SELECT owner_email INTO cfg FROM public.owner_config WHERE id = 1 FOR UPDATE;
          IF cfg IS NULL THEN RAISE EXCEPTION 'Owner email not configured'; END IF;
          SELECT * INTO u FROM auth.users WHERE id = auth.uid();
          IF u.id IS NULL OR u.email_confirmed_at IS NULL OR lower(u.email) <> lower(cfg) THEN RAISE EXCEPTION 'Not the configured, confirmed owner'; END IF;
          IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN RAISE EXCEPTION 'Owner already assigned'; END IF;
          INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'owner'); RETURN true;
        END $function$;
        GRANT EXECUTE ON FUNCTION public.claim_owner() TO authenticated;
        INSERT INTO public.owner_config VALUES (1, 'owner@fixture.invalid');
        """)

        # Repeated sign-in: the same Google identity can never attach to a second account.
        sql(f"INSERT INTO auth.users VALUES ('{OWNER}','owner@fixture.invalid',now());")
        sql(f"INSERT INTO auth.identities(user_id,provider,provider_id) VALUES ('{OWNER}','google','google-sub-1');")
        err = sql(f"INSERT INTO auth.users VALUES ('{TWIN}','owner@fixture.invalid',now()); INSERT INTO auth.identities(user_id,provider,provider_id) VALUES ('{TWIN}','google','google-sub-1');", False)
        assert "identities_provider_id_provider_unique" in err
        expect(sql("SELECT count(*) FROM auth.identities WHERE provider='google' AND provider_id='google-sub-1';"), "1")
        # psql -c runs the two statements in one implicit transaction, so the twin user rolled back too.
        expect(sql(f"SELECT count(*) FROM auth.users WHERE id='{TWIN}';"), "0")

        # Sign-up records are idempotent: a pre-existing (backfilled) beta row never blocks sign-up or duplicates.
        sql(f"INSERT INTO public.beta_access(user_id) VALUES ('{OTHER}');")
        sql(f"INSERT INTO auth.users VALUES ('{OTHER}','other@fixture.invalid',now());")
        expect(sql(f"SELECT count(*) FROM public.beta_access WHERE user_id='{OTHER}';"), "1")
        expect(sql(f"SELECT count(*) FROM public.beta_access WHERE user_id='{OWNER}';"), "1")

        # Single owner: only the configured, confirmed email; never twice; never a same-email second account.
        as_user(OTHER, "SELECT public.claim_owner();", False)
        expect(as_user(OWNER, "SELECT public.claim_owner();"), "SET\nSET\nt")
        assert "Owner already assigned" in as_user(OWNER, "SELECT public.claim_owner();", False)
        sql(f"INSERT INTO auth.users VALUES ('{TWIN}','OWNER@fixture.invalid',now());")
        assert "Owner already assigned" in as_user(TWIN, "SELECT public.claim_owner();", False)
        expect(sql("SELECT count(*) FROM public.user_roles WHERE role='owner';"), "1")
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{OWNER}','owner');", False)
        # An unconfirmed address cannot claim even before an owner exists.
        sql("DELETE FROM public.user_roles;")
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{TWIN}';")
        assert "Not the configured, confirmed owner" in as_user(TWIN, "SELECT public.claim_owner();", False)

        print(f"PASS: {checks} isolated SQL checks: one account per provider identity, idempotent sign-up records, single confirmed owner, same-email twin refused. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
