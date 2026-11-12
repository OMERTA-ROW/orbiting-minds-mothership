"""Disposable PostgreSQL only: owner authenticator recovery codes (hash-only, fresh-MFA creation, service-only consumption, lockout, restore, append-only audit). Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
H = lambda n: format(n, "064x")

def main():
    base = Path(tempfile.mkdtemp(prefix="owner-mfa-sql-"))
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
        nonlocal checks
        checks += 1
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()
    now = int(time.time())
    FRESH = f'[{{"method":"oauth","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'
    def caller(uid, aal, amr, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)
    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)
    hashes = "ARRAY[" + ",".join(f"'{H(i)}'" for i in range(1, 11)) + "]"
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55447 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 33)) + [39, 40]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")

        # Browser roles can never read code hashes or call the server-only steps.
        assert sql("SELECT has_table_privilege('authenticated','public.owner_mfa_recovery_codes','select');") == 'f'
        assert sql("SELECT has_table_privilege('anon','public.owner_mfa_recovery_events','select');") == 'f'
        for priv in ("insert", "update", "delete", "truncate"):
            assert sql(f"SELECT has_table_privilege('authenticated','public.owner_mfa_recovery_events','{priv}');") == 'f'
        assert sql("SELECT has_function_privilege('authenticated','public.owner_mfa_consume_recovery_code(uuid,text)','execute');") == 'f'
        assert sql("SELECT has_function_privilege('authenticated','public.owner_mfa_finish_recovery(uuid,text,integer,boolean)','execute');") == 'f'
        assert sql("SELECT has_function_privilege('anon','public.owner_mfa_set_recovery_codes(text[])','execute');") == 'f'

        # Creating codes needs owner + aal2 + a TOTP check in the last 15 minutes.
        caller(OWNER, 'aal1', FRESH, f"SELECT public.owner_mfa_set_recovery_codes({hashes});", False)
        caller(OWNER, 'aal2', STALE, f"SELECT public.owner_mfa_set_recovery_codes({hashes});", False)
        caller(OTHER, 'aal2', FRESH, f"SELECT public.owner_mfa_set_recovery_codes({hashes});", False)
        caller(OWNER, 'aal2', FRESH, "SELECT public.owner_mfa_set_recovery_codes(ARRAY['abc']);", False)
        caller(OWNER, 'aal2', FRESH, f"SELECT public.owner_mfa_set_recovery_codes(ARRAY[{','.join([repr(H(1))]*10)}]);", False)
        assert caller(OWNER, 'aal2', FRESH, f"SELECT public.owner_mfa_set_recovery_codes({hashes});").endswith('10')
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.owner_mfa_recovery_status();").endswith('10')
        assert caller(OTHER, 'aal1', FRESH, "SELECT remaining FROM public.owner_mfa_recovery_status();").endswith('0')

        # Consumption: single use, owner only, wrong codes logged.
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(1)}');").endswith('accepted')
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(1)}');").endswith('invalid')
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OTHER}','{H(2)}');").endswith('not_owner')
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.owner_mfa_recovery_status();").endswith('9')

        # A failed provider removal restores the code; a success is recorded.
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(2)}');").endswith('accepted')
        service(f"SELECT public.owner_mfa_finish_recovery('{OWNER}','{H(2)}',0,false);")
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.owner_mfa_recovery_status();").endswith('9')
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(2)}');").endswith('accepted')
        service(f"SELECT public.owner_mfa_finish_recovery('{OWNER}','{H(2)}',1,true);")

        # Five wrong codes in an hour lock recovery, even for a valid code.
        for i in range(4):
            assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(900 + i)}');").endswith('invalid')
        assert service(f"SELECT public.owner_mfa_consume_recovery_code('{OWNER}','{H(3)}');").endswith('locked')
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.owner_mfa_recovery_status();").endswith('8')

        # Audit: owner reads own rows at aal2 only; nobody can edit or delete.
        assert caller(OWNER, 'aal1', FRESH, "SELECT count(*) FROM public.owner_mfa_recovery_events;").endswith('0')
        events = caller(OWNER, 'aal2', FRESH, "SELECT string_agg(event, ',' ORDER BY created_at, event) FROM public.owner_mfa_recovery_events;")
        for e in ("codes_created", "recovery_refused", "recovery_failed", "recovery_completed", "recovery_locked"):
            assert e in events, events
        assert caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.owner_mfa_recovery_events;").endswith('0')
        service("UPDATE public.owner_mfa_recovery_events SET detail='x';", False)
        service("DELETE FROM public.owner_mfa_recovery_events;", False)
        sql("DELETE FROM public.owner_mfa_recovery_events;", False)  # trigger blocks even the table owner
        caller(OWNER, 'aal2', FRESH, f"INSERT INTO public.owner_mfa_recovery_events(user_id,event) VALUES('{OWNER}','codes_created');", False)

        # Replacing codes invalidates every earlier code.
        caller(OWNER, 'aal2', FRESH, "SELECT public.owner_mfa_set_recovery_codes(ARRAY[" + ",".join(f"'{H(i)}'" for i in range(101, 111)) + "]);")
        assert sql(f"SELECT count(*) FROM public.owner_mfa_recovery_codes WHERE code_hash='{H(4)}';") == '0'

        # --- Two-step sign-in for every account (migrations 0042/0043). ---
        MEMBER = "33333333-3333-4333-8333-333333333333"
        UNCONF = "44444444-4444-4444-8444-444444444444"
        for number in (42, 43):
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{MEMBER}','member@fixture.invalid',now()),('{UNCONF}','unconfirmed@fixture.invalid',NULL);")
        mh = "ARRAY[" + ",".join(f"'{H(i)}'" for i in range(201, 211)) + "]"
        for fn in ("account_mfa_consume_recovery_code(uuid,text)", "account_mfa_record_disabled(uuid,integer,boolean)", "account_mfa_assert_step_up()"):
            assert sql(f"SELECT has_function_privilege('authenticated','public.{fn}','execute');") == 'f', fn
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == 'f', fn
        assert sql("SELECT has_function_privilege('anon','public.account_mfa_set_recovery_codes(text[])','execute');") == 'f'
        # A member (no role) can create codes, but only at aal2 with a code from the last 15 minutes.
        caller(MEMBER, 'aal1', FRESH, f"SELECT public.account_mfa_set_recovery_codes({mh});", False)
        caller(MEMBER, 'aal2', STALE, f"SELECT public.account_mfa_set_recovery_codes({mh});", False)
        assert caller(MEMBER, 'aal2', FRESH, f"SELECT public.account_mfa_set_recovery_codes({mh});").endswith('10')
        assert caller(MEMBER, 'aal1', FRESH, "SELECT remaining FROM public.account_mfa_recovery_status();").endswith('10')
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.account_mfa_recovery_status();").endswith('10')
        assert caller(UNCONF, 'aal1', FRESH, "SELECT coalesce(remaining,0) FROM public.account_mfa_recovery_status();").endswith('0')
        # At most 5 replacements per hour.
        for _ in range(4):
            caller(MEMBER, 'aal2', FRESH, f"SELECT public.account_mfa_set_recovery_codes({mh});")
        caller(MEMBER, 'aal2', FRESH, f"SELECT public.account_mfa_set_recovery_codes({mh});", False)
        # Consumption: single use, bound to the account, verified email required.
        assert service(f"SELECT public.account_mfa_consume_recovery_code('{MEMBER}','{H(201)}');").endswith('accepted')
        assert service(f"SELECT public.account_mfa_consume_recovery_code('{MEMBER}','{H(201)}');").endswith('invalid')
        assert service(f"SELECT public.account_mfa_consume_recovery_code('{MEMBER}','{H(101)}');").endswith('invalid')  # owner's code
        assert service(f"SELECT public.account_mfa_consume_recovery_code('{UNCONF}','{H(202)}');").endswith('unverified')
        assert caller(MEMBER, 'aal1', FRESH, "SELECT remaining FROM public.account_mfa_recovery_status();").endswith('9')
        # Turning off deletes the account's codes only; a failed attempt is recorded and deletes nothing.
        service(f"SELECT public.account_mfa_record_disabled('{MEMBER}',1,false);")
        assert caller(MEMBER, 'aal1', FRESH, "SELECT remaining FROM public.account_mfa_recovery_status();").endswith('9')
        service(f"SELECT public.account_mfa_record_disabled('{MEMBER}',1,true);")
        assert caller(MEMBER, 'aal1', FRESH, "SELECT coalesce(remaining,0) FROM public.account_mfa_recovery_status();").endswith('0')
        assert caller(OWNER, 'aal1', FRESH, "SELECT remaining FROM public.account_mfa_recovery_status();").endswith('10')
        # History: own rows only, at aal2 only.
        assert caller(MEMBER, 'aal1', FRESH, "SELECT count(*) FROM public.owner_mfa_recovery_events;").endswith('0')
        member_events = caller(MEMBER, 'aal2', FRESH, "SELECT string_agg(DISTINCT event, ',') FROM public.owner_mfa_recovery_events;")
        for e in ("codes_created", "recovery_refused", "mfa_disabled", "mfa_disable_failed"):
            assert e in member_events, member_events
        assert caller(MEMBER, 'aal2', FRESH, f"SELECT count(*) FROM public.owner_mfa_recovery_events WHERE user_id <> '{MEMBER}';").endswith('0')

        print(f"PASS: {checks} isolated SQL checks: hash-only storage, browser denial, fresh-MFA owner creation, single-use service consumption, restore on failed removal, 5-per-hour lock, owner-only aal2 audit reads, append-only audit, replacement invalidation; member codes at aal2+fresh only, 5/hour replacement cap, verified-email consumption, disable deletes own codes, own-aal2 history. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
