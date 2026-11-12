"""Disposable PostgreSQL only: Activation Approvals owner/fresh-MFA/order/expiry/cascade/audit checks. Never uses hosted credentials."""
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"

def main():
    base = Path(tempfile.mkdtemp(prefix="activation-approvals-sql-"))
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
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()
    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'
    NOMFA = f'[{{"method":"password","timestamp":{now}}}]'
    def caller(uid, aal, amr, text, ok=True, seed_evidence=True):
        nonlocal checks
        checks += 1
        match = re.search(r"activation_approval_decide\((\d+), '([a-z]+)'", text)
        if seed_evidence and match and int(match.group(1)) in (1, 2, 4, 8) and match.group(2) == "approve":
            step = int(match.group(1))
            sql(f"""INSERT INTO public.activation_approval_checks
                (step,status,evidence_version,checked_at,summary,details,deployment_mode)
                VALUES ({step},'passed',2,now(),'isolated fixture check','[]'::jsonb,'runner_only')
                ON CONFLICT(step) DO UPDATE SET status='passed',evidence_version=2,
                  checked_at=now(),deployment_mode='runner_only';""")
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)
    def decide(step, action, extra="NULL, false, false", note="''"):
        return f"SELECT count(*) FROM public.activation_approval_decide({step}, '{action}', {note}, {extra});"
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55441 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in range(20, 33):
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql((ROOT / "drizzle/migrations/0051_activation_approval_checks.sql").read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")

        # Denials: anonymous, admin (not owner), aal1, stale MFA, password-only.
        assert sql("SELECT has_function_privilege('anon','public.activation_approval_decide(integer,text,text,timestamptz,boolean,boolean)','execute');") == 'f'
        checks += 1
        caller(OTHER, 'aal2', FRESH, decide(1, 'approve'), False, seed_evidence=False)
        caller(OWNER, 'aal1', FRESH, decide(1, 'approve'), False, seed_evidence=False)
        caller(OWNER, 'aal2', STALE, decide(1, 'approve'), False, seed_evidence=False)
        caller(OWNER, 'aal2', NOMFA, decide(1, 'approve'), False, seed_evidence=False)

        for role in ('anon', 'authenticated'):
            assert sql(f"SELECT has_function_privilege('{role}','public.activation_approval_record_check(integer,text,integer,text,jsonb,text,uuid)','execute');") == 'f'
            checks += 1
        sql(f"SELECT public.activation_approval_record_check(2,'passed',2,'fixture','[]'::jsonb,'runner_only','{OWNER}');")
        sql("ALTER TABLE public.razul_control_audit ADD CONSTRAINT fixture_deny_check_audit CHECK (action <> 'check_failed') NOT VALID;")
        try:
            sql(f"SELECT public.activation_approval_record_check(2,'failed',2,'fixture','[]'::jsonb,'runner_only','{OWNER}');", False)
            checks += 1
            assert sql("SELECT status FROM public.activation_approval_checks WHERE step=2;") == 'passed'
            checks += 1
        finally:
            sql("ALTER TABLE public.razul_control_audit DROP CONSTRAINT fixture_deny_check_audit;")

        # A caller cannot directly approve a technical step without fresh service evidence.
        caller(OWNER, 'aal2', FRESH, decide(1, 'approve'), False, seed_evidence=False)
        # Order: step 2 cannot be approved before step 1.
        caller(OWNER, 'aal2', FRESH, decide(2, 'approve'), False)
        caller(OWNER, 'aal2', FRESH, decide(1, 'approve'))
        caller(OWNER, 'aal2', FRESH, decide(1, 'approve'))  # fresh recheck is allowed
        # Secret-looking note refused.
        caller(OWNER, 'aal2', FRESH, decide(2, 'approve', note="'sk-proj-abcdefghijklmnopqrstu'"), False)
        # Failed Step 2 remains retryable; a fresh passing check unlocks it.
        caller(OWNER, 'aal2', FRESH, decide(2, 'fail'))
        caller(OWNER, 'aal2', FRESH, decide(2, 'fail'))
        sql("UPDATE public.activation_approval_checks SET evidence_version=1 WHERE step=2;")
        caller(OWNER, 'aal2', FRESH, decide(2, 'approve'), False, seed_evidence=False)
        sql("UPDATE public.activation_approval_checks SET evidence_version=2,checked_at=now()+interval '5 minutes' WHERE step=2;")
        caller(OWNER, 'aal2', FRESH, decide(2, 'approve'), False, seed_evidence=False)
        caller(OWNER, 'aal2', FRESH, decide(2, 'approve'))
        for s in range(3, 7):
            caller(OWNER, 'aal2', FRESH, decide(s, 'approve'))

        # Step 7 expiry window: missing, past and >24h rejected; 23h accepted.
        caller(OWNER, 'aal2', FRESH, decide(7, 'approve'), False)
        caller(OWNER, 'aal2', FRESH, decide(7, 'approve', "now() - interval '1 minute', false, false"), False)
        caller(OWNER, 'aal2', FRESH, decide(7, 'approve', "now() + interval '24 hours 1 minute', false, false"), False)
        caller(OWNER, 'aal2', FRESH, decide(7, 'approve', "now() + interval '23 hours', false, false"))
        caller(OWNER, 'aal2', FRESH, decide(8, 'approve'))
        caller(OWNER, 'aal2', FRESH, decide(9, 'approve'))

        # Step 10 requires both spend confirmations.
        caller(OWNER, 'aal2', FRESH, decide(10, 'approve', "NULL, true, false"), False)
        caller(OWNER, 'aal2', FRESH, decide(10, 'approve', "NULL, true, true"))
        assert caller(OWNER, 'aal2', FRESH, "SELECT spend_confirmations->>'openai_cap_usd' || '/' || (spend_confirmations->>'daily_limit_usd') FROM public.activation_approvals WHERE step=10;").endswith('10/5')
        assert caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.activation_approvals WHERE status='approved';").endswith('10')

        # Revoking step 4 resets steps 4-10 and writes cascade audit rows.
        caller(OWNER, 'aal2', FRESH, decide(4, 'revoke'))
        assert caller(OWNER, 'aal2', FRESH, "SELECT string_agg(status, ',' ORDER BY step) FROM public.activation_approvals;").endswith(
            'approved,approved,approved,' + ','.join(['pending'] * 7))
        assert caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.razul_control_audit WHERE record_type='activation_approval' AND action='revoke_cascade';").endswith('6')
        caller(OWNER, 'aal2', FRESH, decide(4, 'revoke'), False)  # already pending

        # Failing step 3 locks step 4.
        caller(OWNER, 'aal2', FRESH, decide(3, 'fail'))
        caller(OWNER, 'aal2', FRESH, decide(4, 'approve'), False)

        # Expired step-7 window locks step 8.
        sql("UPDATE public.activation_approvals SET status='approved' WHERE step BETWEEN 3 AND 6; UPDATE public.activation_approvals SET status='approved', approval_expires_at=now()-interval '1 minute' WHERE step=7;")
        caller(OWNER, 'aal2', FRESH, decide(8, 'approve'), False)

        # Read isolation and no direct writes.
        assert sql("SELECT has_table_privilege('authenticated','public.activation_approval_checks','SELECT');") == 'f'
        checks += 1
        assert sql("SELECT has_table_privilege('anon','public.activation_approval_checks','SELECT');") == 'f'
        checks += 1
        assert caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.activation_approvals;").endswith('0')
        assert caller(OTHER, 'aal2', FRESH, "SELECT count(*) FROM public.razul_control_audit WHERE record_type='activation_approval';").endswith('0')
        caller(OWNER, 'aal2', FRESH, "UPDATE public.activation_approvals SET status='approved' WHERE step=8;", False)
        caller(OWNER, 'aal2', FRESH, "INSERT INTO public.activation_approvals(step) VALUES (1) ON CONFLICT DO NOTHING;", False)
        assert caller(OWNER, 'aal2', FRESH, "SELECT count(*) FROM public.razul_control_audit WHERE record_type='activation_approval' AND action='approve' AND actor_id='" + OWNER + "';").endswith('11')

        print(f"PASS: {checks} isolated SQL checks: anon/admin/aal1/stale/password-only denial, service-evidence prerequisite, failed Step 2 retry, strict order, secret-note refusal, 24h expiry bound, step-10 spend confirmations, cascade revoke/fail, expired-window lock, owner-only reads, no direct writes, audit trail. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
