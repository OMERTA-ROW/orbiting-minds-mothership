"""Disposable PostgreSQL only: Step 9/10 activations (owner + fresh MFA, one attempt at a time,
idempotent, revision-bound, rollback on failure/expiry/approval change), Jackboy omni.safety/v1
admission, Jackboy permits (caps, expiry, single active job, no resume after lapse/stop), the
cross-system stop halting autonomous work while the manual terminal keeps its own rules.
Never uses hosted credentials."""
import json
import re
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
D = "a" * 64
A1 = "aaaaaaaa-0000-4000-8000-000000000001"
A2 = "aaaaaaaa-0000-4000-8000-000000000002"
A3 = "aaaaaaaa-0000-4000-8000-000000000003"
P1 = "bbbbbbbb-0000-4000-8000-000000000001"


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-activation-sql-"))
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
        if ok and result.returncode: raise AssertionError(result.stderr + "\n" + text)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text)
        lines = [l for l in result.stdout.strip().splitlines() if not re.match(r"^(SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+)$", l)]
        return lines[-1] if lines else ""
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55449 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 35)) + [36, 47, 48, 51, 53, 54]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        override = os.environ.get("OMNI_ACTIVATION_SQL")
        if override:
            sql(Path(override).read_text())
        else:
            paths = list((ROOT / "drizzle/migrations").glob("*_omni_activation_permits.sql"))
            assert len(paths) == 1
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner');")

        def deny(text):
            nonlocal checks
            checks += 1
            sql(text, False)
        def ok(text):
            nonlocal checks
            checks += 1
            return sql(text)
        def owner(text, mfa=True):
            amr = json.dumps([{"method": "totp", "timestamp": int(time.time()) - (60 if mfa else 3600)}])
            return (f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; SET request.jwt.claim.aal='aal2'; "
                    f"SET request.jwt.claim.amr='{amr}'; {text}")
        def begin(kind, attempt, mfa=True):
            return sql(owner(f"SELECT public.activation_activation_begin('{kind}','{attempt}');", mfa))
        def finish(kind, attempt, good=True, reason="verified"):
            return f"SET ROLE service_role; SELECT public.activation_activation_finish('{kind}','{attempt}',{str(good).lower()},'{reason}','{{}}'::jsonb);"
        def eff(kind):
            return sql(f"SELECT public.activation_effective('{kind}');")
        def poll(paused="false", stop="false", allowed="true", manual="true", observed="now()", expires="now()+interval '30 seconds'"):
            return (f"SELECT public.jackboy_safety_record_v2('poll',{paused},{stop},true,{allowed},{manual},NULL,now()+interval '1 hour',0,NULL,"
                    f"{observed},{expires},'{D}',NULL,'t');")
        def event(nonce, paused="false", stop="true"):
            return f"SELECT public.jackboy_safety_record('event',{paused},{stop},true,NULL,now(),NULL,'{D}','{nonce}','t');"
        def permit(job, kind="code", expires="now()+interval '60 seconds'", per_call="0.5", digest=D, pid=P1, renewals=0):
            return (f"SELECT public.jackboy_permit_record('{job}','{kind}','{digest}','{pid}',{expires},{renewals},{per_call},1,5,'{D}');")
        def decide(step, status, extra=""):
            return f"UPDATE public.activation_approvals SET status='{status}', decided_at=now(), revision=revision+1{extra} WHERE step={step};"
        window = f"INSERT INTO public.omni_autonomy_windows(owner_id,agent_id,started_at,expires_at) VALUES('{OWNER}','omni',now(),now()+interval '15 minutes') RETURNING id;"
        always_on = "UPDATE public.omni_code_service SET always_on=true, always_on_until=now()+interval '1 hour';"
        def job():
            return sql(f"INSERT INTO public.omni_code_jobs(owner_id,agent_id,kind,title) VALUES('{OWNER}','omni','code_task','t') RETURNING id;")
        lease = lambda j: f"UPDATE public.omni_code_jobs SET status='leased', lease_expires_at=now()+interval '2 minutes' WHERE id='{j}';"
        status = lambda j: sql(f"SELECT status FROM public.omni_code_jobs WHERE id='{j}';")
        act = lambda kind: sql(f"SELECT status||'/'||reason FROM public.activation_activations WHERE kind='{kind}';")

        # Fixture: Steps 1-8 approved, Step 7 window open, fresh Step 8 proof; gates open.
        sql("INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'t',1); INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true); UPDATE public.omni_agents SET status='enrolled' WHERE id='omni';")
        sql("INSERT INTO public.activation_approvals(step) SELECT g FROM generate_series(1,10) g ON CONFLICT (step) DO NOTHING;")
        sql("UPDATE public.activation_approvals SET status='approved', decided_at=now()-interval '10 minutes', revision=1, approval_expires_at=CASE WHEN step=7 THEN now()+interval '2 hours' END WHERE step<=8;")
        sql("INSERT INTO public.activation_approval_checks(step,status,evidence_version,checked_at,summary,deployment_mode) VALUES(8,'passed',2,now()-interval '5 minutes','ok','runner_only');")
        assert eff('live_link') == 'f' and sql("SELECT public.activation_autonomy_authorized();") == 'f'

        # Step 9 activation: owner + fresh MFA; refused before Step 9 approval.
        deny(owner(f"SELECT public.activation_activation_begin('live_link','{A1}');", mfa=False))
        checks += 1; assert json.loads(begin('live_link', A1))["reason"] == "step9_not_approved"
        deny("SET ROLE anon; SELECT public.activation_activation_begin('live_link','" + A1 + "');")
        sql(decide(9, 'approved'))
        checks += 1; assert json.loads(begin('live_link', A1)) == {"ok": True, "duplicate": False, "resumed": False}
        # One attempt at a time: a second attempt is busy, the same attempt resumes.
        checks += 1; assert json.loads(begin('live_link', A2))["reason"] == "busy"
        checks += 1; assert json.loads(begin('live_link', A1))["resumed"] is True
        # Only the server (service role) finishes, and only the current attempt.
        deny(owner(f"SELECT public.activation_activation_finish('live_link','{A1}',true,'x','{{}}'::jsonb);"))
        deny(owner("UPDATE public.activation_activations SET status='active';"))
        assert ok(finish('live_link', A2)) == 'superseded'
        assert eff('live_link') == 'f'
        assert ok(finish('live_link', A1)) == 'active'
        assert eff('live_link') == 't'
        assert ok(finish('live_link', A1)) == 'superseded'  # idempotent, no double record
        checks += 1; assert json.loads(begin('live_link', A3))["duplicate"] is True

        # Step 10: needs approval with cap confirmations, then activation; starts nothing.
        checks += 1; assert json.loads(begin('autonomy', A1))["reason"] == "step10_not_approved"
        sql(decide(10, 'approved', ", spend_confirmations=jsonb_build_object('openai_cap_usd',10,'daily_limit_usd',5,'confirmed_at',now())"))
        assert eff('live_link') == 't'  # approving Step 10 does not touch the live link
        checks += 1; assert json.loads(begin('autonomy', A1))["ok"] is True
        assert ok(finish('autonomy', A1)) == 'active'
        assert sql("SELECT public.activation_autonomy_authorized();") == 't'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows;") == '0'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'

        # Authorized is not running: unknown Jackboy safety refuses windows and CODE.
        deny(window); deny(always_on)
        # Stops released but Jackboy does not allow autonomy (e.g. CODE off / not authorized there).
        assert ok(poll(allowed="false")) == 'clear'
        assert sql("SELECT public.jackboy_safety_clear();") == 'f'
        deny(window)
        # Jackboy allows: windows and CODE always-on admitted; leasing still needs a permit.
        assert ok(poll()) == 'clear'
        ok(window); ok(always_on)
        j = job(); k = job()
        deny(lease(j))
        # Permits: caps, expiry, single active job, scope never changes, closed never resumes.
        deny(permit(j, per_call="0.75"))
        deny(permit(j, expires="now()+interval '5 minutes'"))
        deny(permit(j, expires="now()-interval '1 second'"))
        assert ok(permit(j)) == 'issued'
        deny(permit(k, pid=A3))  # one active job at a time
        deny(permit(j, digest="b" * 64))
        assert ok(permit(j, renewals=1)) == 'renewed'
        ok(lease(j))
        deny("SET ROLE authenticated; " + permit(k, pid=A3))
        deny("SET ROLE authenticated; SELECT public.jackboy_permits_enforce();")

        # Agent-initiated workspace jobs need a permit; owner (manual) jobs do not.
        sess = sql(f"INSERT INTO public.omni_workspace_sessions(agent_id,owner_id) VALUES('omni','{OWNER}') RETURNING id;")
        agent_job = lambda jid: f"INSERT INTO public.omni_agent_jobs(id,agent_id,session_id,kind,origin,input,status) VALUES('{jid}','omni','{sess}','command','agent','x','running');"
        manual_job = f"INSERT INTO public.omni_agent_jobs(agent_id,session_id,kind,origin,input,status) VALUES('omni','{sess}','command','owner','status','running') RETURNING id;"
        deny(agent_job(A2))
        mj = ok(manual_job)

        # HARD OVERRIDE: a signed CODE Emergency Stop notice halts everything autonomous.
        assert ok(event("1" * 32)) == 'engaged'
        assert status(j) == 'stopped'
        assert sql(f"SELECT status||'/'||closed_reason FROM public.jackboy_permits WHERE job_id='{j}';") == 'revoked/omni_halt'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        assert sql(f"SELECT status FROM public.omni_agent_jobs WHERE id='{mj}';") == 'running'  # manual untouched
        ok(manual_job)  # CODE stop does not block the manual terminal
        deny(permit(j, renewals=2))  # a revoked permit is never renewed
        deny(window); deny(always_on)
        # Releasing in Jackboy and a new clear reading restarts nothing.
        assert ok(poll()) == 'clear'
        assert status(j) == 'stopped' and status(k) == 'paused'  # held, not resumed
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        assert sql("SELECT always_on FROM public.omni_code_service WHERE id=1;") == 'f'
        deny(permit(j))  # the stopped job cannot get a new permit under the same id

        # Lapse: a permit not renewed in time lapses and its job stops.
        ok(always_on)
        assert ok(permit(k, pid=A3)) == 'issued'
        ok(lease(k))
        sql(f"UPDATE public.jackboy_permits SET expires_at=now()-interval '1 second' WHERE job_id='{k}';")
        deny(f"UPDATE public.omni_code_jobs SET status='running' WHERE id='{k}' AND false; " + lease(job()))  # no permit
        assert ok("SET ROLE service_role; SELECT public.jackboy_permits_enforce();") == '1'
        assert status(k) == 'stopped'
        assert sql(f"SELECT status FROM public.jackboy_permits WHERE job_id='{k}';") == 'lapsed'

        # Stale safety halts and refuses; failure keeps the last known Kill Switch value.
        ok(window)
        sql("UPDATE public.jackboy_safety_state SET expires_at=now()-interval '1 second';")
        deny(window)
        assert ok("SET ROLE service_role; SELECT public.jackboy_safety_enforce_freshness();") == 'unknown'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'

        # Jackboy Kill Switch (verified): manual terminal refused too, until a newer verified reading.
        assert ok(poll(paused="true", manual="false")) == 'paused'
        deny(manual_job)
        assert ok("SET ROLE service_role; SELECT public.jackboy_safety_record('failure',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'timeout');") == 'unknown'
        deny(manual_job)  # still the last verified Kill Switch reading
        assert ok(poll()) == 'clear'
        ok(manual_job)

        # Approval changes roll activations back and halt; re-activation needs the owner again.
        ok(window)
        sql(decide(9, 'pending'))
        assert act('live_link') == 'revoked/step9_changed' and act('autonomy') == 'revoked/step9_changed'
        assert sql("SELECT public.activation_autonomy_authorized();") == 'f'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        sql(decide(9, 'approved'))
        assert eff('live_link') == 'f'
        checks += 1; assert json.loads(begin('live_link', A2))["ok"] is True
        # Approval changed during the attempt: finish rolls back to failed.
        sql(decide(8, 'approved'))
        assert ok(finish('live_link', A2)) == 'failed'
        assert act('live_link') == 'failed/approvals_changed'
        # Attempt expiry: a finish after 90 seconds fails.
        checks += 1; assert json.loads(begin('live_link', A3))["ok"] is True
        sql("UPDATE public.activation_activations SET started_at=now()-interval '2 minutes' WHERE kind='live_link';")
        assert ok(finish('live_link', A3)) == 'failed'
        assert act('live_link') == 'failed/attempt_expired'
        # A failed handshake/safety read never activates.
        checks += 1; assert json.loads(begin('live_link', A1))["ok"] is True
        assert ok(finish('live_link', A1, good=False, reason="handshake_failed")) == 'failed'
        assert eff('live_link') == 'f'
        # Stale Step 8 proof blocks activation.
        sql("UPDATE public.activation_approval_checks SET checked_at=now()-interval '25 hours' WHERE step=8;")
        checks += 1; assert json.loads(begin('live_link', A2))["reason"] == "step8_proof_not_fresh"
        sql("UPDATE public.activation_approval_checks SET checked_at=now()-interval '1 minute' WHERE step=8;")
        # Mothership Emergency Stop blocks activation.
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        checks += 1; assert json.loads(begin('live_link', A2))["reason"] == "mothership_stop_engaged"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        # Re-activate both, then Step 7's window ends: nothing stays in effect.
        checks += 1; assert json.loads(begin('live_link', A2))["ok"] is True
        assert ok(finish('live_link', A2)) == 'active'
        sql(decide(10, 'approved', ", spend_confirmations=jsonb_build_object('openai_cap_usd',10,'daily_limit_usd',5)"))
        checks += 1; assert json.loads(begin('autonomy', A3))["ok"] is True
        # Link fails during the autonomy attempt -> autonomy rolled back.
        checks += 1; assert json.loads(begin('live_link', A1))["duplicate"] is True
        assert ok(finish('autonomy', A3)) == 'active'
        assert sql("SELECT public.activation_autonomy_authorized();") == 't'
        sql("UPDATE public.activation_approvals SET approval_expires_at=now()-interval '1 second' WHERE step=7;")
        assert eff('live_link') == 'f' and sql("SELECT public.activation_autonomy_authorized();") == 'f'
        deny(window)
        sql("UPDATE public.activation_approvals SET approval_expires_at=now()+interval '1 hour' WHERE step=7;")
        assert sql("SELECT public.activation_autonomy_authorized();") == 't'
        # Owner deactivation needs no fresh code (it only makes things safer) and halts.
        ok(window)
        assert ok(owner("SELECT public.activation_activation_revoke('live_link');", mfa=False)) == 'revoked'
        assert act('autonomy') == 'revoked/owner_revoked'
        assert sql("SELECT count(*) FROM public.omni_autonomy_windows WHERE ended_at IS NULL;") == '0'
        deny("SET ROLE anon; SELECT public.activation_activation_revoke('live_link');")
        # Audit trail present; owner can read activations and permits, anon cannot.
        assert int(sql("SELECT count(*) FROM public.razul_control_audit WHERE record_type IN ('activation','jackboy_permit');")) >= 10
        checks += 1; assert sql(owner("SELECT count(*) FROM public.activation_activations;")) == '2'
        deny("SET ROLE anon; SELECT * FROM public.jackboy_permits;")

        print(f"PASS: {checks} isolated SQL checks: Step 9/10 activation (fresh MFA, single attempt, idempotent, revision-bound, rollback on failure/expiry/approval change), Jackboy safety admission, permits (caps, expiry, single job, no resume), stop/lapse/stale halts, manual terminal only refused by a verified Kill Switch. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__": main()
