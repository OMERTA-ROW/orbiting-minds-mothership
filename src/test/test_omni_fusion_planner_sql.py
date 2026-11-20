"""Disposable PostgreSQL only: proposed migration 0069 (.lovable/pending/0069_omni_fusion_rules_planner.sql,
Fusion phase 1 rules-only plan context) on top of every installed migration (through 0068).
The context check admits only a valid fusion:plan delegation, a released Emergency Stop, the same
owner's OMNI-created held task with no Jackboy handover, and at most 10 plans a day; it returns task
metadata plus a digest (never task text), writes exactly one audit row, and changes nothing else.
Never uses hosted credentials."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPOSED = ROOT / ".lovable/pending/0069_omni_fusion_rules_planner.sql"
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
CLIENT = "omni-web"
AUD = "omni-mothership"
CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback"
CH = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
MODEL = "openai/gpt-6-astra"
PORT = "55469"


def migrations():
    found = []
    for number in range(20, 69):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    return found


def h(ch):
    return ch * 64


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-fusion-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)

        def demote():
            os.setgid(1000)
            os.setuid(1000)

    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)

    env = dict(os.environ, PGHOST=str(base), PGPORT=PORT, PGUSER="fixture", PGDATABASE="postgres")
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

    def caller(uid, text, ok=True):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='aal2'; SET request.jwt.claim.amr='{FRESH}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def connect(code_ch, token_ch, scopes):
        sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
        caller(OWNER, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',{scopes},'{h(code_ch)}','{CH}');")
        out = service(f"SELECT public.omni_delegation_exchange('{h(code_ch)}','{CH}','{CLIENT}','{CB}','{h(token_ch)}','omnid_aaaaaa')::text;")
        assert '"ok": true' in out, out
        return h(token_ch)

    def begin(token, model=MODEL, count=1, chars=10, aud=AUD):
        return service(f"SELECT public.omni_delegation_begin_chat('{token}','{aud}','{model}',{count},{chars})::text;")

    def run_id(out):
        m = re.search(r'"run_id": "([0-9a-f-]{36})"', out)
        assert m, out
        return m.group(1)

    def check(token, run):
        return service(f"SELECT public.omni_delegation_check_chat('{token}','{AUD}','{run}')::text;")

    def finish(run, status="completed", pause="NULL", msg="NULL"):
        return service(f"SELECT public.omni_delegation_finish_chat('{run}','{status}',12,10,4,14,NULL,NULL,'gw-1',{pause},{msg})::text;")

    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p {PORT} -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        """)
        # Tables from earlier migrations that this change reads, exactly as created there.
        sql((ROOT / "drizzle/migrations/0000_ai_generation_circuit_breaker.sql").read_text())
        sql("""CREATE TABLE public.beta_access (user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false,
              paused boolean NOT NULL DEFAULT false, approved_at timestamptz);""")
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false) ON CONFLICT (id) DO UPDATE SET emergency_stop=false;")
        sql(f"INSERT INTO public.beta_access(user_id, ai_approved, paused) VALUES('{OWNER}', true, false);")

        def authorize(code_ch, scopes, who=OWNER, ok=True):
            sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
            return caller(who, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',{scopes},'{h(code_ch)}','{CH}');", ok)

        def ctx(token, task, aud=AUD):
            out = service(f"SELECT public.omni_delegation_fusion_plan_context('{token}','{aud}',{task})::text;")
            return json.loads(out)

        def hold(token, title="Plan me", instr="Investigate the flaky test", agent="sabrina", repo=""):
            out = service(f"SELECT public.omni_delegation_hold_task('{token}','{AUD}',gen_random_uuid(),'{agent}','{title}','{instr}','{repo}')::text;")
            data = json.loads(out)
            assert data.get("ok") is True, out
            return data["task"]["id"] if "task" in data else data["id"]

        def proposed():
            return int(sql("SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_plan_proposed';"))

        def counts():
            names = sql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('razul_control_audit','omni_delegations','omni_delegation_codes');").split(",")
            return {n: sql(f"SELECT count(*) FROM public.{n};") for n in names}

        # Before 0069: no context function, no planner marker.
        assert sql("SELECT to_regprocedure('public.omni_delegation_fusion_plan_context(text,text,uuid)') IS NULL;") == "t"
        assert sql("SELECT to_regprocedure('public.omni_fusion_planner_ready()') IS NULL;") == "t"
        sql(PROPOSED.read_text())
        sql(PROPOSED.read_text())  # re-applying is harmless

        # Privileges: both functions are service-only.
        for fn in ["public.omni_delegation_fusion_plan_context(text,text,uuid)", "public.omni_fusion_planner_ready()"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','{fn}','execute');") == "f", (fn, role)
            assert sql(f"SELECT has_function_privilege('service_role','{fn}','execute');") == "t", fn
            assert sql(f"SELECT prosecdef AND proconfig::text LIKE '%search_path=%' FROM pg_proc WHERE oid='{fn}'::regprocedure;") == "t", fn
        caller(OWNER, f"SELECT public.omni_delegation_fusion_plan_context('{h('a')}','{AUD}',gen_random_uuid());", False)
        assert service("SELECT public.omni_fusion_planner_ready();") == "t"

        # A writer delegation creates held tasks; the Fusion delegation reads them (newer approval revokes older,
        # so issue the planner delegation with both scopes, then separately test fusion-only).
        W = connect("1", "a", "ARRAY['tasks:write','fusion:plan']")
        t1 = hold(W, title="Fix it", instr="Investigate the flaky test")
        t_code = hold(W, title="Build", instr="Run the unit tests", agent="jackboy", repo="acme/app")
        before = counts()
        stop_before = sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;")
        audit0 = proposed()
        out = ctx(W, f"'{t1}'")
        assert out["ok"] is True, out
        assert out["task"]["id"] == t1 and out["task"]["agentId"] == "sabrina" and out["task"]["state"] == "held"
        assert out["task"]["kind"] == "agent.handoff" and out["task"]["hasRepository"] is False
        assert out["task"]["inputDigest"] == hashlib.sha256("Fix it\nInvestigate the flaky test".encode()).hexdigest()
        assert "Investigate" not in json.dumps(out) and "Fix it" not in json.dumps(out), "task text must never be returned"
        assert sorted(out["scopes"]) == ["fusion:plan", "tasks:write"]
        assert out["plansUsed"] == 1 and out["dailyLimit"] == 10
        assert set(out) == {"ok", "delegation_id", "scopes", "task", "stopCheckedAt", "plansUsed", "dailyLimit"}
        assert counts() == before, "the context check must not create or change tasks, handovers, permits, guards or runs"
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == stop_before
        assert proposed() == audit0 + 1
        assert sql(f"SELECT record_type||':'||record_id FROM public.razul_control_audit WHERE action='fusion_plan_proposed' ORDER BY occurred_at DESC LIMIT 1;") == f"omni_terminal:{t1}"
        code = ctx(W, f"'{t_code}'")
        assert code["task"]["agentId"] == "jackboy" and code["task"]["hasRepository"] is True, code
        assert sql(f"SELECT state FROM public.omni_terminal_tasks WHERE id='{t1}';") == "held"

        # Emergency Stop engaged or missing: refused, no audit, Stop untouched.
        a = proposed()
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert ctx(W, f"'{t1}'") == {"ok": False, "reason": "emergency_stop_engaged"}
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "t"
        sql("DELETE FROM public.omni_terminal_controls;")
        assert ctx(W, f"'{t1}'") == {"ok": False, "reason": "emergency_stop_engaged"}
        assert sql("SELECT count(*) FROM public.omni_terminal_controls;") == "0"
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false);")
        assert proposed() == a

        # Owner isolation and task eligibility: same answer for unknown, other owner's and terminal-made tasks.
        other = "33333333-3333-4333-8333-333333333333"
        sql(f"INSERT INTO public.omni_terminal_tasks(id, created_by, kind, agent, project_label, instructions, source_delegation) SELECT '{other}', '{OTHER}', kind, agent, 'x', 'other owner', source_delegation FROM public.omni_terminal_tasks WHERE id='{t1}';")
        local = "44444444-4444-4444-8444-444444444444"
        sql(f"INSERT INTO public.omni_terminal_tasks(id, created_by, kind, agent, project_label, instructions) VALUES ('{local}', '{OWNER}', 'agent.handoff', 'jax', 'x', 'made on the terminal');")
        for tid in ["gen_random_uuid()", f"'{other}'", f"'{local}'"]:
            assert ctx(W, tid) == {"ok": False, "reason": "task_not_found"}, tid
        assert ctx(W, "NULL") == {"ok": False, "reason": "invalid_request"}
        assert proposed() == a

        # Cancelled or already handed over: refused, nothing changed.
        t2 = hold(W, title="Cancel me", instr="Will be cancelled")
        sql(f"UPDATE public.omni_terminal_tasks SET state='cancelled', cancelled_at=now() WHERE id='{t2}';")
        assert ctx(W, f"'{t2}'") == {"ok": False, "reason": "task_not_held"}
        t3 = hold(W, title="Sent", instr="Already with Jackboy", agent="jackboy")
        sql(f"INSERT INTO public.omni_task_handoffs(task_id, created_by, job_kind, payload_digest, status) VALUES ('{t3}', '{OWNER}', 'test', '{h('c')}', 'queued');")
        assert ctx(W, f"'{t3}'") == {"ok": False, "reason": "task_already_handed_off"}
        assert sql(f"SELECT status FROM public.omni_task_handoffs WHERE task_id='{t3}';") == "queued"
        assert proposed() == a

        # Delegation checks: scope separation both ways, invalid, audience, expiry, revocation, owner, API keys.
        T = connect("2", "b", "ARRAY['tasks:read','tasks:write','safety:emergency-stop']")
        assert ctx(T, f"'{t1}'") == {"ok": False, "reason": "scope_missing"}
        assert ctx(W, f"'{t1}'") == {"ok": False, "reason": "revoked"}  # superseded by the later approval
        F = connect("3", "c", "ARRAY['fusion:plan']")
        assert ctx(F, f"'{t1}'")["ok"] is True  # same owner, earlier delegation's task
        for scope in ["tasks:read", "tasks:write", "safety:emergency-stop", "chat:write"]:
            assert service(f"SELECT public.omni_delegation_use('{F}','{AUD}','{scope}')->>'status';") == "scope_missing", scope
        assert ctx(h("f"), f"'{t1}'") == {"ok": False, "reason": "invalid"}
        assert ctx("not-a-hash", f"'{t1}'") == {"ok": False, "reason": "invalid"}
        assert ctx(F, f"'{t1}'", aud="other") == {"ok": False, "reason": "wrong_audience"}
        sql(f"UPDATE public.omni_delegations SET issued_at=now()-interval '20 minutes', expires_at=now()-interval '5 minutes' WHERE token_hash='{F}';")
        assert ctx(F, f"'{t1}'") == {"ok": False, "reason": "expired"}
        F2 = connect("4", "d", "ARRAY['fusion:plan']")
        service(f"SELECT public.omni_delegation_revoke('{F2}');")
        assert ctx(F2, f"'{t1}'") == {"ok": False, "reason": "revoked"}
        F3 = connect("5", "e", "ARRAY['fusion:plan']")
        sql(f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{OWNER}';")
        assert ctx(F3, f"'{t1}'") == {"ok": False, "reason": "owner_unverified"}
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{OWNER}';")
        KEY = h("9")
        caller(OWNER, f"SELECT public.omni_api_key_issue('Read',ARRAY['health'],'{KEY}','omni_eeee',30,false);")
        assert ctx(KEY, f"'{t1}'") == {"ok": False, "reason": "invalid"}

        # Daily limit: 10 proposals per owner per 24 hours (refusals don't count); older ones age out.
        F4 = connect("6", "1", "ARRAY['fusion:plan','tasks:read']")
        used = int(sql(f"SELECT count(*) FROM public.razul_control_audit WHERE actor_id='{OWNER}' AND action='fusion_plan_proposed';"))
        for i in range(used, 10):
            r = ctx(F4, f"'{t1}'")
            assert r["ok"] is True and r["plansUsed"] == i + 1, r
        assert ctx(F4, f"'{t1}'") == {"ok": False, "reason": "daily_limit"}
        assert proposed() == 10
        sql("UPDATE public.razul_control_audit SET occurred_at=occurred_at-interval '25 hours' WHERE action='fusion_plan_proposed' AND id=(SELECT id FROM public.razul_control_audit WHERE action='fusion_plan_proposed' ORDER BY occurred_at LIMIT 1);", ok=True)
        r = ctx(F4, f"'{t1}'")
        assert r["ok"] is True and r["plansUsed"] == 10, r
        assert sorted(r["scopes"]) == ["fusion:plan", "tasks:read"]
        assert sql("SELECT count(*) FROM pg_indexes WHERE indexname='razul_control_audit_fusion_plan_idx';") == "1"
        # Nothing executable: no task state changed, no handovers other than the fixture, Stop released.
        assert sql("SELECT count(*) FROM public.omni_task_handoffs;") == "1"
        assert sql("SELECT string_agg(DISTINCT state, ',') FROM public.omni_terminal_tasks;") == "cancelled,held"
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "f"
        print(f"PASS: {checks} isolated SQL checks for proposed 0069 (Fusion rules-only plan context): service-only functions, fusion:plan only (no scope implied either way), Emergency Stop engaged/missing refused, owner isolation (unknown/other-owner/terminal-made tasks look the same), held-only and not handed over, 10/day limit, digest instead of task text, one audit row per proposal and no other row or Stop change. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
