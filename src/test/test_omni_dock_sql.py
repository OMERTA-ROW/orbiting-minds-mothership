"""Disposable PostgreSQL only: OMNI Docking Bay pairing, approval, permissions, revocation, replay and isolation checks. Never uses hosted credentials."""
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
H1 = "a" * 64  # code hashes
H2 = "b" * 64
H3 = "c" * 64
FP1 = "1" * 64  # key fingerprints
FP2 = "2" * 64
JWK = '{"kty":"EC","crv":"P-256","x":"x","y":"y"}'


def migrations():
    found = []
    for number in range(20, 100):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    extra = os.environ.get("OMNI_DOCK_SQL")
    if extra:
        found.append(Path(extra))
    return found


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-dock-sql-"))
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
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr)
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text)
        return result.stdout.strip()
    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'
    def caller(uid, aal, amr, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)
    def service(text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE service_role; {text}", ok).splitlines()[-1] if ok else sql(f"SET ROLE service_role; {text}", ok)
    def owner(text, ok=True, amr=FRESH):
        return caller(OWNER, 'aal2', amr, text, ok)
    def claim(code=H1, fp=FP1, label="Goochi iPhone"):
        return service(f"SELECT public.omni_dock_claim('{code}','{label}','ios','{JWK}'::jsonb,'{fp}','1.0',ARRAY['camera.qr']);")
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
        for path in migrations():
            sql(path.read_text())
        assert sql("SELECT to_regclass('public.omni_dock_devices') IS NOT NULL;") == 't', "dock migration missing"
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        invite = lambda h=H1, perms="ARRAY['status.read','jobs.propose','stop.engage']", mins=10: f"SELECT count(*) FROM public.omni_dock_create_invite('{h}','honeycomb_mobile',{perms},{mins});"

        # Device-facing functions are service-only; owner functions are never anonymous.
        for fn in ["omni_dock_claim(text,text,text,jsonb,text,text,text[])", "omni_dock_touch(uuid,text,text,text[],text)", "omni_dock_engage_stop(uuid)", "omni_dock_hold_task(uuid,uuid,text,text,text,text,text)", "omni_dock_log(uuid,text,text,text)"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','execute');") == 'f', (role, fn)
                checks += 1
        for fn in ["omni_dock_create_invite(text,text,text[],integer)", "omni_dock_approve(uuid,text[])", "omni_dock_revoke(uuid,text)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == 'f', fn
            checks += 1
        for t in ["omni_dock_invites", "omni_dock_devices", "omni_dock_nonces", "omni_dock_events"]:
            assert sql(f"SELECT has_table_privilege('anon','public.{t}','select');") == 'f', t
            checks += 1

        # Issuing a code: owner + fresh two-factor, bounded lifetime, known permissions, max three open.
        caller(OTHER, 'aal2', FRESH, invite(), False)
        caller(OWNER, 'aal1', FRESH, invite(), False)
        owner(invite(), False, amr=STALE)
        owner(invite(mins=30), False)
        owner(invite(perms="ARRAY['shell.exec']"), False)
        owner(invite())
        owner(invite(h=H2))
        owner(invite(h=H3))
        owner(invite(h="d" * 64), False)  # fourth open code refused

        # Claim: unknown code refused; valid code consumed once; key reuse refused.
        assert '"code_invalid"' in claim(code="e" * 64)
        r = claim()
        assert '"ok": true' in r, r
        device = r.split('"device_id": "')[1].split('"')[0]
        assert '"code_invalid"' in claim(fp=FP2)  # same code, second time
        assert '"key_in_use"' in claim(code=H2)  # same key, different code
        owner(f"SELECT count(*) FROM public.omni_dock_cancel_invite((SELECT id FROM public.omni_dock_invites WHERE code_hash='{H3}'));")
        assert '"code_invalid"' in claim(code=H3, fp=FP2)

        # Pending device: no permissions, can learn its status, cannot stop or hold tasks.
        assert '"status": "pending"' in service(f"SELECT public.omni_dock_touch('{device}','nonce-aaaaaaaaaaaaaaaa','heartbeat',NULL,NULL);")
        assert '"replay"' in service(f"SELECT public.omni_dock_touch('{device}','nonce-aaaaaaaaaaaaaaaa','heartbeat',NULL,NULL);")
        assert service(f"SELECT public.omni_dock_engage_stop('{device}');") == 'f'
        assert '"not_permitted"' in service(f"SELECT public.omni_dock_hold_task('{device}','99999999-9999-4999-8999-999999999999','code.test','jackboy','Mothership',NULL,'Add a test');")

        # Approval: owner + fresh two-factor; permissions must come from the code's request.
        caller(OTHER, 'aal2', FRESH, f"SELECT count(*) FROM public.omni_dock_approve('{device}',ARRAY['status.read']);", False)
        owner(f"SELECT count(*) FROM public.omni_dock_approve('{device}',ARRAY['status.read']);", False, amr=STALE)
        owner(f"SELECT count(*) FROM public.omni_dock_approve('{device}',ARRAY['files.transfer']);", False)
        owner(f"SELECT count(*) FROM public.omni_dock_approve('{device}',ARRAY['status.read','jobs.propose','stop.engage']);")
        owner(f"SELECT count(*) FROM public.omni_dock_approve('{device}',ARRAY['status.read']);", False)  # already paired
        assert owner(f"SELECT status || '/' || array_to_string(permissions,',') FROM public.omni_dock_devices WHERE id='{device}';").endswith('paired/status.read,jobs.propose,stop.engage')

        # Paired: hold a task (never dispatched), idempotent, conflict refused, secrets refused.
        TASK = "99999999-9999-4999-8999-999999999999"
        hold = lambda text="Add a test", proj="Mothership", tid=TASK: service(f"SELECT public.omni_dock_hold_task('{device}','{tid}','code.test','jackboy','{proj}',NULL,'{text}');")
        assert '"state": "held"' in hold()
        assert '"duplicate": true' in hold()
        assert '"id_conflict"' in hold(proj="Other project")
        assert '"secret_like"' in hold(text="use sk-proj-abcdefghijklmnopqrstu", tid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        assert owner(f"SELECT state || '/' || (source_device = '{device}') FROM public.omni_terminal_tasks WHERE id='{TASK}';").endswith('held/true')
        # Terminal idempotency now compares project too (fix for earlier gap).
        owner(f"SELECT count(*) FROM public.omni_terminal_queue_task('{TASK}','code.test','jackboy','Mothership',NULL,'Add a test');", False)
        owner("SELECT count(*) FROM public.omni_terminal_queue_task('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','code.test','jackboy','Mothership',NULL,'Add a test');")
        owner("SELECT count(*) FROM public.omni_terminal_queue_task('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','code.test','jackboy','Other',NULL,'Add a test');", False)

        # Device may engage (never release) the Emergency Stop.
        owner("SELECT count(*) FROM public.omni_terminal_release_stop('pairing drill');")
        assert service(f"SELECT public.omni_dock_engage_stop('{device}');") == 't'
        assert owner("SELECT emergency_stop FROM public.omni_terminal_controls;").endswith('t')

        # Permissions change needs fresh two-factor and current revision.
        rev = owner(f"SELECT revision FROM public.omni_dock_devices WHERE id='{device}';").splitlines()[-1]
        owner(f"SELECT count(*) FROM public.omni_dock_set_permissions('{device}',ARRAY['status.read'],{rev});", False, amr=STALE)
        owner(f"SELECT count(*) FROM public.omni_dock_set_permissions('{device}',ARRAY['status.read'],{int(rev) + 5});", False)
        owner(f"SELECT count(*) FROM public.omni_dock_set_permissions('{device}',ARRAY['status.read','stop.engage'],{rev});")
        assert '"not_permitted"' in hold(tid="cccccccc-cccc-4ccc-8ccc-cccccccccccc")
        # Mobile companion permissions (0049) are grantable; unknown ones are not.
        rev = owner(f"SELECT revision FROM public.omni_dock_devices WHERE id='{device}';").splitlines()[-1]
        owner(f"SELECT count(*) FROM public.omni_dock_set_permissions('{device}',ARRAY['status.read','shell.run'],{rev});", False)
        owner(f"SELECT count(*) FROM public.omni_dock_set_permissions('{device}',ARRAY['status.read','stop.engage','cloud.read','audit.read','jobs.pause'],{rev});")
        assert owner(f"SELECT array_to_string(permissions,',') FROM public.omni_dock_devices WHERE id='{device}';").endswith('status.read,stop.engage,cloud.read,audit.read,jobs.pause')

        # Revoke: owner only (no fresh code), clears permissions, cancels held device tasks, denies future requests.
        caller(OTHER, 'aal2', FRESH, f"SELECT count(*) FROM public.omni_dock_revoke('{device}','lost');", False)
        owner(f"SELECT count(*) FROM public.omni_dock_revoke('{device}','Phone lost');", amr=STALE)
        assert owner(f"SELECT status || '/' || cardinality(permissions) FROM public.omni_dock_devices WHERE id='{device}';").endswith('revoked/0')
        assert owner(f"SELECT state FROM public.omni_terminal_tasks WHERE id='{TASK}';").endswith('cancelled')
        assert '"revoked"' in service(f"SELECT public.omni_dock_touch('{device}','nonce-bbbbbbbbbbbbbbbb','heartbeat',NULL,NULL);")
        assert service(f"SELECT public.omni_dock_engage_stop('{device}');") == 'f'
        # Same key can pair again only through a new owner code and approval.
        assert '"ok": true' in claim(code=H2)

        # No direct writes; non-owner reads nothing.
        owner(f"UPDATE public.omni_dock_devices SET status='paired' WHERE id='{device}';", False)
        owner(f"INSERT INTO public.omni_dock_events(event,outcome) VALUES ('fake_event','ok');", False)
        owner("SELECT count(*) FROM public.omni_dock_nonces;", False)
        sql(f"UPDATE public.omni_dock_devices SET status='paired', permissions=ARRAY['shell.exec'] WHERE id='{device}';", False)
        checks += 1
        for t in ["omni_dock_invites", "omni_dock_devices", "omni_dock_events"]:
            assert caller(OTHER, 'aal2', FRESH, f"SELECT count(*) FROM public.{t};").endswith('0'), t
        assert caller(OWNER, 'aal1', FRESH, "SELECT count(*) FROM public.omni_dock_devices;").endswith('0')

        # Event log and audit trail.
        events = owner("SELECT string_agg(event || ':' || outcome, ',' ORDER BY created_at) FROM public.omni_dock_events;")
        for needle in ["pair_failed:denied", "pair_claimed:ok", "heartbeat:denied", "device_approved:ok", "job_held:ok", "stop_engage:ok", "device_revoked:ok"]:
            assert needle in events, needle
            checks += 1
        assert owner("SELECT count(*) FROM public.razul_control_audit WHERE record_type='omni_dock';").splitlines()[-1] == '8'

        print(f"PASS: {checks} isolated SQL checks: service-only device functions, owner fresh-two-factor codes/approval/permissions, single-use codes, key reuse refusal, pending devices powerless, replay refusal, held-only device tasks, device stop engage only, revocation cascade, terminal idempotency fix, no direct writes, owner-only reads, audit. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
