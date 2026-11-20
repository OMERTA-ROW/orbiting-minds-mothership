"""Disposable PostgreSQL only: OMNI owner delegation (migration 0062) end to end.
Owner/fresh-MFA consent, exact client/callback, supported scopes only, single-use PKCE-bound codes,
replay revocation, concurrent exchange, expiry, revocation (client and owner), wrong audience/scope,
owner change, held-task creation with idempotency and concurrency, Stop engagement, privileges,
column-level hash hiding and metadata API key separation. Never uses hosted credentials."""
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
CLIENT = "omni-web"
AUD = "omni-mothership"
CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback"
CH = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
CH2 = "A" * 43
TASK = "aaaaaaaa-0000-4000-8000-0000000000a1"


def migrations():
    found = []
    for number in range(20, 100):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        if number in (62, 63) and os.environ.get("OMNI_DELEGATION_SQL"):
            continue
        found.append(paths[0])
    extra = os.environ.get("OMNI_DELEGATION_SQL")
    if extra:
        found.append(Path(extra))
    return found


def h(ch):
    return ch * 64


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-delegation-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT="55452", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0

    def sql(text, ok=True):
        nonlocal checks
        checks += 1
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode:
            raise AssertionError(result.stderr + "\n" + text)
        if not ok and not result.returncode:
            raise AssertionError("Expected SQL denial: " + text)
        lines = [l for l in result.stdout.strip().splitlines() if not re.match(r"^(SET|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|BEGIN|COMMIT)$", l)]
        return lines[-1] if lines else ""

    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'

    def caller(uid, aal, amr, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def authorize(code_hash, scopes="ARRAY['tasks:write','safety:emergency-stop']", uid=OWNER, aal="aal2", amr=None, client=CLIENT, cb=CB, ch=CH, ok=True):
        return caller(uid, aal, amr or FRESH, f"SELECT public.omni_delegation_authorize('{client}','{AUD}','{cb}',{scopes},'{code_hash}','{ch}')->>'code_id';", ok)

    def exchange(code_hash, token_hash, ch=CH, client=CLIENT, cb=CB, prefix="omnid_aaaaaa"):
        return service(f"SELECT public.omni_delegation_exchange('{code_hash}','{ch}','{client}','{cb}','{token_hash}','{prefix}')::text;")

    def use(token_hash, scope="tasks:write", aud=AUD):
        return service(f"SELECT public.omni_delegation_use('{token_hash}','{aud}','{scope}')->>'status';")

    def hold(token_hash, task=TASK, agent="jackboy", title="Review PR", instr="Review the open pull request", repo="NULL", aud=AUD):
        r = "NULL" if repo == "NULL" else f"'{repo}'"
        return service(f"SELECT public.omni_delegation_hold_task('{token_hash}','{aud}','{task}','{agent}','{title}','{instr}',{r})::text;")

    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55452 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        """)  # the hosted database grants new public tables to these roles by default
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        audit0 = int(sql("SELECT count(*) FROM public.razul_control_audit;"))

        # Privileges: service-only functions are not callable by anon/authenticated; consent is not anon.
        for fn in ["omni_delegation_exchange(text,text,text,text,text,text)", "omni_delegation_use(text,text,text)",
                   "omni_delegation_hold_task(text,text,uuid,text,text,text,text)", "omni_delegation_engage_stop(text,text)",
                   "omni_delegation_status(text)", "omni_delegation_revoke(text)", "omni_delegation_owner_ok(uuid)"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','execute');") == "f", (fn, role)
            assert sql(f"SELECT has_function_privilege('service_role','public.{fn}','execute');") == "t", fn
        assert sql("SELECT has_function_privilege('anon','public.omni_delegation_authorize(text,text,text,text[],text,text)','execute');") == "f"
        assert sql("SELECT has_function_privilege('anon','public.omni_delegation_owner_revoke(uuid)','execute');") == "f"
        caller(OWNER, "aal2", FRESH, "SELECT count(*) FROM public.omni_delegation_codes;", False)
        caller(OWNER, "aal2", FRESH, "SELECT token_hash FROM public.omni_delegations;", False)
        caller(OWNER, "aal2", FRESH, "SELECT * FROM public.omni_delegations;", False)
        sql("SET ROLE anon; SELECT id FROM public.omni_delegations;", False)
        for role in ["anon", "authenticated"]:
            for priv in ["insert", "update", "delete"]:
                assert sql(f"SELECT has_table_privilege('{role}','public.omni_delegations','{priv}') OR has_table_privilege('{role}','public.omni_delegation_codes','{priv}');") == "f", (role, priv)
            assert sql(f"SELECT has_column_privilege('{role}','public.omni_delegations','token_hash','select');") == "f", role

        # Consent: owner + aal2 + fresh authenticator code; exact client and callback; supported scopes only.
        authorize(h("1"), aal="aal1", ok=False)
        authorize(h("1"), amr=STALE, ok=False)
        authorize(h("1"), uid=OTHER, ok=False)
        authorize(h("1"), client="omni-evil", ok=False)
        authorize(h("1"), cb=CB + "/x", ok=False)
        authorize(h("1"), cb="https://omni-orbit-command-companion.lovable.app.evil.example/mothership/callback", ok=False)
        authorize(h("1"), scopes="ARRAY['chat:write']", ok=False)
        authorize(h("1"), scopes="ARRAY['tasks:approve','tasks:write']", ok=False)
        authorize(h("1"), scopes="ARRAY['tasks:write','tasks:write']", ok=False)
        authorize(h("1"), scopes="ARRAY[]::text[]", ok=False)
        authorize(h("1"), ch="short", ok=False)
        assert sql("SELECT count(*) FROM public.omni_delegation_codes;") == "0"

        code1 = authorize(h("1"))
        assert sql(f"SELECT expires_at <= created_at + interval '60 seconds' AND used_at IS NULL FROM public.omni_delegation_codes WHERE id='{code1}';") == "t"

        # Exchange: wrong PKCE verifier burns the code; a later correct attempt is refused as reuse.
        assert '"pkce_mismatch"' in exchange(h("1"), h("a"), ch=CH2)
        assert '"code_already_used"' in exchange(h("1"), h("a"))
        assert sql("SELECT count(*) FROM public.omni_delegations;") == "0"

        # Wrong client/callback at exchange is refused (and burns).
        authorize(h("2"))
        assert '"client_mismatch"' in exchange(h("2"), h("a"), cb=CB + "?x=1")
        # Unknown code.
        assert '"unknown_code"' in exchange(h("9"), h("a"))
        # Expired code.
        authorize(h("3"))
        sql(f"UPDATE public.omni_delegation_codes SET created_at=now()-interval '2 minutes', expires_at=now()-interval '61 seconds' WHERE code_hash='{h('3')}';")
        assert '"code_expired"' in exchange(h("3"), h("a"))

        # Success: hash-only bearer, 15-minute lifetime, exact scopes, audited issue.
        authorize(h("4"))
        out = exchange(h("4"), h("a"))
        assert '"ok": true' in out and '"tasks:write"' in out and '"safety:emergency-stop"' in out, out
        assert sql(f"SELECT expires_at = issued_at + interval '15 minutes' AND audience='{AUD}' AND client_id='{CLIENT}' AND owner_id='{OWNER}' FROM public.omni_delegations WHERE token_hash='{h('a')}';") == "t"
        assert use(h("a")) == "valid"
        assert use(h("a"), "safety:emergency-stop") == "valid"

        # Replay of a used code revokes what it issued.
        assert '"code_already_used"' in exchange(h("4"), h("b"))
        assert use(h("a")) == "revoked"
        assert sql(f"SELECT revoked_reason FROM public.omni_delegations WHERE token_hash='{h('a')}';") == "code_replay"

        # Concurrent exchange of one code: exactly one issues, the race is treated as replay and revoked.
        authorize(h("5"))
        procs = [subprocess.Popen(["psql", "-X", "-At", "-c", f"SET ROLE service_role; BEGIN; SELECT public.omni_delegation_exchange('{h('5')}','{CH}','{CLIENT}','{CB}','{tok}','omnid_cccccc')::text; SELECT pg_sleep(0.6); COMMIT;"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for tok in (h("c"), h("d"))]
        outs = [p.communicate()[0] for p in procs]
        checks += 1
        assert sum('"ok": true' in o for o in outs) == 1, outs
        assert sum('"code_already_used"' in o for o in outs) == 1, outs
        assert sql(f"SELECT count(*) FROM public.omni_delegations WHERE code_id=(SELECT id FROM public.omni_delegation_codes WHERE code_hash='{h('5')}') AND revoked_reason='code_replay';") == "1"

        # A fresh issue with only tasks:write; one current delegation per owner/client (supersedes).
        authorize(h("6"), scopes="ARRAY['tasks:write']")
        assert '"ok": true' in exchange(h("6"), h("e"))
        authorize(h("7"), scopes="ARRAY['tasks:write']")
        assert '"ok": true' in exchange(h("7"), h("f"))
        assert use(h("e")) == "revoked"
        assert sql(f"SELECT revoked_reason FROM public.omni_delegations WHERE token_hash='{h('e')}';") == "superseded"
        F = h("f")

        # Scope, audience, malformed and unknown tokens fail.
        assert use(F, "safety:emergency-stop") == "scope_missing"
        assert '"scope_missing"' in service(f"SELECT public.omni_delegation_read_tasks('{F}','{AUD}',NULL)::text;")
        assert use(F, "chat:write") == "scope_missing"
        assert use(F, aud="other-audience") == "wrong_audience"
        assert use("not-a-hash") == "invalid"
        assert use(h("0")) == "invalid"
        assert '"scope_missing"' in service(f"SELECT public.omni_delegation_engage_stop('{F}','{AUD}')::text;")

        # Held task: stored held as agent.handoff, owned by the delegation owner, audited.
        out = hold(F)
        assert '"ok": true' in out and '"duplicate": false' in out and '"held"' in out, out
        assert sql(f"SELECT kind||'|'||state||'|'||created_by||'|'||(source_delegation IS NOT NULL) FROM public.omni_terminal_tasks WHERE id='{TASK}';") == f"agent.handoff|held|{OWNER}|true"
        assert sql(f"SELECT count(*) FROM public.razul_control_audit WHERE action='task_held_delegated' AND record_id='{TASK}' AND actor_id='{OWNER}';") == "1"
        # Idempotent retry; changed content under the same key conflicts.
        assert '"duplicate": true' in hold(F)
        assert '"id_conflict"' in hold(F, instr="Something different entirely")
        assert sql(f"SELECT count(*) FROM public.razul_control_audit WHERE action='task_held_delegated' AND record_id='{TASK}';") == "1"
        # An owner-created task id cannot be claimed through a delegation.
        owner_task = "aaaaaaaa-0000-4000-8000-0000000000b2"
        caller(OWNER, "aal2", FRESH, f"SELECT id FROM public.omni_terminal_queue_task('{owner_task}','agent.handoff','razul','Proj',NULL,'Owner instructions');")
        assert '"id_conflict"' in hold(F, task=owner_task, agent="razul", title="Proj", instr="Owner instructions")
        # Validation: agents, sizes, repository shape, secret-like text.
        assert '"agent_not_accepted"' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c3", agent="omni")
        assert '"invalid_task"' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c3", title="x" * 121)
        assert '"invalid_task"' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c3", instr="ab")
        assert '"invalid_task"' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c3", repo="not a repo")
        assert '"secret_like"' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c3", instr="use sk-abcdefghijklmnop please")
        assert '"ok": true' in hold(F, task="aaaaaaaa-0000-4000-8000-0000000000c4", repo="OMERTA-ROW/mothership")

        # Concurrent identical holds: one insert, one duplicate, no error.
        T5 = "aaaaaaaa-0000-4000-8000-0000000000c5"
        procs = [subprocess.Popen(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", f"SET ROLE service_role; BEGIN; SELECT public.omni_delegation_hold_task('{F}','{AUD}','{T5}','jax','Same','Same instructions',NULL)::text; SELECT pg_sleep(0.6); COMMIT;"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        res = [p.communicate() for p in procs]
        checks += 1
        assert all(p.returncode == 0 for p in procs), res
        assert sum('"duplicate": false' in o for o, _ in res) == 1 and sum('"duplicate": true' in o for o, _ in res) == 1, res

        # Daily limit of 20 delegated tasks per owner.
        made = int(sql(f"SELECT count(*) FROM public.omni_terminal_tasks WHERE source_delegation IS NOT NULL;"))
        for i in range(20 - made):
            assert '"ok": true' in hold(F, task=f"bbbbbbbb-0000-4000-8000-{i:012d}", title=f"Bulk {i}", instr="Bulk held task")
        assert '"daily_limit"' in hold(F, task="bbbbbbbb-0000-4000-8000-999999999999", title="One more", instr="Bulk held task")

        # Expiry is enforced by the server clock.
        sql(f"UPDATE public.omni_delegations SET issued_at=now()-interval '20 minutes', expires_at=now()-interval '5 minutes' WHERE token_hash='{F}';")
        assert use(F) == "expired"
        assert '"expired"' in hold(F, task="cccccccc-0000-4000-8000-000000000001")

        # Stop scope: engage only; same controls row, triggers fire, audited.
        authorize(h("8"), scopes="ARRAY['safety:emergency-stop']")
        assert '"ok": true' in exchange(h("8"), h("1"))
        G = h("1")
        assert '"scope_missing"' in hold(G, task="cccccccc-0000-4000-8000-000000000002")
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false WHERE id=1;")
        out = service(f"SELECT public.omni_delegation_engage_stop('{G}','{AUD}')::text;")
        assert '"ok": true' in out, out
        assert sql(f"SELECT emergency_stop AND changed_by='{OWNER}' FROM public.omni_terminal_controls WHERE id=1;") == "t"
        assert sql("SELECT count(*) FROM public.razul_control_audit WHERE action='emergency_stop_engage_delegated';") == "1"
        assert '"wrong_audience"' in service(f"SELECT public.omni_delegation_engage_stop('{G}','other')::text;")

        # Status: safe metadata only.
        st = service(f"SELECT public.omni_delegation_status('{G}')::text;")
        assert '"owner_verified": true' in st and "token_hash" not in st and G not in st, st
        assert service(f"SELECT coalesce(public.omni_delegation_status('{h('0')}')::text,'null');") == "null"

        # Client revocation is immediate and idempotent; audited once.
        r1 = service(f"SELECT public.omni_delegation_revoke('{G}')::text;")
        assert '"already_revoked": false' in r1, r1
        assert use(G, "safety:emergency-stop") == "revoked"
        assert '"already_revoked": true' in service(f"SELECT public.omni_delegation_revoke('{G}')::text;")
        assert '"found": false' in service(f"SELECT public.omni_delegation_revoke('{h('0')}')::text;")
        assert sql("SELECT count(*) FROM public.razul_control_audit WHERE action='delegation_revoke';") == "1"

        # Owner revocation from the Mothership; owner-only, idempotent; other users read nothing.
        authorize(h("9"), scopes="ARRAY['tasks:write']")
        assert '"ok": true' in exchange(h("9"), h("2"))
        H = h("2")
        did = sql(f"SELECT id FROM public.omni_delegations WHERE token_hash='{H}';")
        caller(OTHER, "aal2", FRESH, f"SELECT public.omni_delegation_owner_revoke('{did}');", False)
        caller(OWNER, "aal1", FRESH, f"SELECT public.omni_delegation_owner_revoke('{did}');", False)
        assert caller(OTHER, "aal2", FRESH, "SELECT count(*) FROM public.omni_delegations;") == "0"
        assert int(caller(OWNER, "aal2", FRESH, "SELECT count(*) FROM public.omni_delegations;")) >= 1
        assert caller(OWNER, "aal2", FRESH, f"SELECT token_prefix FROM public.omni_delegations WHERE id='{did}';") == "omnid_aaaaaa"
        assert '"already_revoked": false' in caller(OWNER, "aal2", FRESH, f"SELECT public.omni_delegation_owner_revoke('{did}')::text;")
        assert use(H) == "revoked"
        assert '"already_revoked": true' in caller(OWNER, "aal2", FRESH, f"SELECT public.omni_delegation_owner_revoke('{did}')::text;")

        # Owner change (role removed): delegation stops working and is revoked; exchange refused.
        authorize(h("b"), scopes="ARRAY['tasks:write']")
        assert '"ok": true' in exchange(h("b"), h("3"))
        # Consent is rate limited: 10 codes per owner per 10 minutes.
        authorize(h("c"), scopes="ARRAY['tasks:write']", ok=False)
        sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
        authorize(h("c"), scopes="ARRAY['tasks:write']")
        sql("UPDATE public.omni_delegation_codes SET created_at=now(), expires_at=now()+interval '60 seconds' WHERE code_hash='" + h("c") + "';")
        sql(f"DELETE FROM public.user_roles WHERE user_id='{OWNER}' AND role='owner';")
        assert use(h("3")) == "owner_unverified"
        assert sql(f"SELECT revoked_reason FROM public.omni_delegations WHERE token_hash='{h('3')}';") == "owner_changed"
        assert '"owner_unverified"' in exchange(h("c"), h("4"))
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner');")
        assert use(h("3")) == "revoked"  # restoring the role does not revive it

        # Direct writes are refused to signed-in users.
        caller(OWNER, "aal2", FRESH, f"UPDATE public.omni_delegations SET revoked_at=NULL;", False)
        caller(OWNER, "aal2", FRESH, f"INSERT INTO public.omni_delegation_codes(owner_id,client_id,audience,redirect_uri,scopes,code_hash,code_challenge,expires_at) VALUES('{OWNER}','{CLIENT}','{AUD}','{CB}',ARRAY['tasks:write'],'{h('d')}','{CH}',now()+interval '30 seconds');", False)

        KEY = "ab" * 32
        # Metadata API keys stay separate: delegation scopes are not key scopes, delegation hashes are not keys.
        caller(OWNER, "aal2", FRESH, f"SELECT public.omni_api_key_issue('Bad',ARRAY['tasks:write'],'{KEY}','omni_eeee',30,false);", False)
        caller(OWNER, "aal2", FRESH, f"SELECT public.omni_api_key_issue('Never',ARRAY['health'],'{KEY}','omni_eeee',NULL,true);")
        assert service(f"SELECT coalesce(public.omni_api_key_verify('{KEY}','health')::text,'null');") != "null"
        assert service(f"SELECT coalesce(public.omni_api_key_verify('{KEY}','tasks:write')::text,'null');") == "null"
        assert use(KEY) == "invalid"
        assert service(f"SELECT coalesce(public.omni_api_key_verify('{h('f')}','health')::text,'null');") == "null"

        # A separate read grant can see this owner's web-created tasks, not owner-created or
        # other-owner tasks. It cannot create tasks or survive revocation.
        sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
        authorize(h("d"), scopes="ARRAY['tasks:read']")
        assert '"ok": true' in exchange(h("d"), h("5"))
        R = h("5")
        foreign = "aaaaaaaa-0000-4000-8000-0000000000ee"
        sql(f"INSERT INTO public.omni_terminal_tasks(id,created_by,kind,agent,project_label,instructions,source_delegation) SELECT '{foreign}','{OTHER}','agent.handoff','jax','Other task','Other instructions',id FROM public.omni_delegations WHERE token_hash='{R}';")
        def read_tasks(token, task="NULL", aud=AUD):
            return service(f"SELECT public.omni_delegation_read_tasks('{token}','{aud}',{task})::text;")
        result = read_tasks(R)
        assert TASK in result and owner_task not in result and foreign not in result, result
        assert '"tasks": []' in read_tasks(R, f"'{foreign}'")
        assert TASK in read_tasks(R, f"'{TASK}'")
        sql(f"INSERT INTO public.omni_task_handoffs(task_id,created_by,job_kind,payload_digest,status) VALUES('{TASK}','{OWNER}','test','{h('a')}','sending');")
        result = read_tasks(R, f"'{TASK}'")
        assert '"handoff":' in result and '"status": "sending"' in result, result
        assert '"scope_missing"' in hold(R)
        assert '"wrong_audience"' in read_tasks(R, aud="wrong")
        assert '"invalid"' in read_tasks(KEY)
        assert sql("SELECT has_function_privilege('authenticated','public.omni_delegation_read_tasks(text,text,uuid)','execute');") == "f"
        assert sql("SELECT has_function_privilege('anon','public.omni_delegation_read_tasks(text,text,uuid)','execute');") == "f"
        assert sql("SELECT has_function_privilege('service_role','public.omni_delegation_read_tasks(text,text,uuid)','execute');") == "t"
        sql(f"UPDATE public.omni_delegations SET issued_at=now()-interval '20 minutes', expires_at=now()-interval '5 minutes' WHERE token_hash='{R}';")
        assert '"expired"' in read_tasks(R)
        sql(f"UPDATE public.omni_delegations SET issued_at=now(), expires_at=now()+interval '15 minutes' WHERE token_hash='{R}';")
        service(f"SELECT public.omni_delegation_revoke('{R}');")
        assert '"revoked"' in read_tasks(R)
        authorize(h("e"), scopes="ARRAY['tasks:read','tasks:write','safety:emergency-stop']")
        assert '"tasks:read"' in exchange(h("e"), h("6"))
        assert TASK in read_tasks(h("6"))

        assert int(sql("SELECT count(*) FROM public.razul_control_audit;")) > audit0
        print(f"PASS: {checks} isolated SQL checks: owner/fresh-MFA consent, exact client/callback, supported scopes only, single-use PKCE codes, replay revocation, concurrent exchange, expiry, client/owner revocation, scope/audience/owner-change refusals, held tasks with idempotency/concurrency/limits, Stop engagement, privileges, hash hiding and API key separation. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
