"""Disposable PostgreSQL only: pending migration 0075 (.lovable/pending/0075_claude_engine_terminal_fusion.sql; Claude for
the private OMNI text agent and Dread/Draco Fusion sessions) on top of migrations 0019 and 0020–0074. Checks every
reservation refusal, the shared 50-cent / 500-cent caps across sources, engines bound at Fusion approval, settle-once,
service-only grants, metadata-only ledger rows and real two-session races (Stop vs reserve, cancel vs reserve).
Never uses hosted credentials."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PENDING = ROOT / ".lovable/pending/0075_claude_engine_terminal_fusion.sql"
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
PROJECT = "33333333-3333-4333-8333-333333333333"
OTHER_PROJECT = "44444444-3333-4333-8333-333333333333"
DEFAULT = "openai/gpt-6-astra"
SONNET = "claude-sonnet-5-5"
OPUS = "claude-opus-5-5"
PORT = "55475"


def migrations():
    found = []
    for number in range(20, 75):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    assert found[-1].name.startswith("0074_"), found[-1]
    return found


def main():
    base = Path(tempfile.mkdtemp(prefix="claude-terminal-fusion-sql-"))
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

    def background(text):
        return subprocess.Popen(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'

    def caller(uid, text, ok=True, amr=FRESH):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='aal2'; SET request.jwt.claim.amr='{amr}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def j(text):
        return json.loads(service(text))

    def agent_run(rid, status="running", owner=OWNER, project=PROJECT):
        sql(f"INSERT INTO public.omni_agent_runs(id, owner_id, project_id, model, message, consent, status) VALUES ('{rid}','{owner}','{project}','{DEFAULT}','Hello there',true,'{status}');")

    def reserve_agent(rid, model=SONNET, chars=3000):
        return j(f"SELECT public.claude_reserve_agent_run('{rid}','{model}',{chars},1024)::text;")

    def reserve_turn(tid, chars=3000):
        return j(f"SELECT public.claude_reserve_fusion_turn('{tid}',{chars},1024)::text;")

    def settle(source, rid, status="completed", i="20", o="5"):
        return j(f"SELECT public.claude_settle_source('{source}','{rid}','{status}',{i},{o})::text;")

    def create(dread=DEFAULT, draco=DEFAULT, first="draco", n=4, uid=OWNER, ok=True, amr=FRESH):
        return caller(uid, f"SELECT public.omni_fusion_session_create('Plan the rollout','{first}',{n},'{dread}','{draco}');", ok, amr=amr)

    def begin(sid):
        return json.loads(caller(OWNER, f"SELECT public.omni_fusion_turn_begin('{sid}')::text;", amr=STALE))

    def finish(tid, status="completed", reply="A reply"):
        r = "NULL" if reply is None else f"$r${reply}$r$"
        return j(f"SELECT public.omni_fusion_turn_finish('{tid}','{status}',{r},1,1,2,NULL,NULL,'gw',NULL,NULL)::text;")

    def stop_session(sid):
        caller(OWNER, f"SELECT public.omni_fusion_session_stop('{sid}');", amr=STALE)

    def rid(n):
        return f"{n:08d}-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

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
        sql((ROOT / "drizzle/migrations/0000_ai_generation_circuit_breaker.sql").read_text())
        sql("""CREATE TABLE public.beta_access (user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false,
              paused boolean NOT NULL DEFAULT false, approved_at timestamptz);
              CREATE TABLE public.beta_projects (id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text, brief text, UNIQUE (id, owner_id));""")
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        sql((ROOT / "drizzle/migrations/0019_omni_agent_runs.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(PENDING.read_text())
        sql(f"""INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now());
              INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');
              INSERT INTO public.beta_projects VALUES('{PROJECT}','{OWNER}','Fixture','Safe'),('{OTHER_PROJECT}','{OTHER}','Other','Safe');
              INSERT INTO public.beta_access(user_id, ai_approved, paused) VALUES('{OWNER}', true, false),('{OTHER}', true, false);
              INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false) ON CONFLICT (id) DO UPDATE SET emergency_stop=false;""")

        # Grants: reservations and settlement are service-only; the cap core is callable by no API role.
        for fn in ["claude_reserve_agent_run(uuid,text,integer,integer)", "claude_reserve_fusion_turn(uuid,integer,integer)",
                   "claude_settle_source(text,uuid,text,integer,integer)"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','execute');") == "f", (role, fn)
            assert sql(f"SELECT has_function_privilege('service_role','public.{fn}','execute');") == "t", fn
        core = "claude_reserve_core(text,uuid,uuid,text,text,integer,integer)"
        for role in ["anon", "authenticated", "service_role"]:
            assert sql(f"SELECT has_function_privilege('{role}','public.{core}','execute');") == "f", role
        create5 = "omni_fusion_session_create(text,text,integer,text,text)"
        assert sql(f"SELECT has_function_privilege('anon','public.{create5}','execute');") == "f"
        assert sql(f"SELECT has_function_privilege('authenticated','public.{create5}','execute');") == "t"
        for t in ["claude_usage", "omni_fusion_sessions", "omni_fusion_turns"]:
            for priv in ["insert", "update", "delete"]:
                assert sql(f"SELECT has_table_privilege('authenticated','public.{t}','{priv}');") == "f", (t, priv)
        caller(OWNER, f"SELECT public.claude_reserve_agent_run('{rid(1)}','{SONNET}',10,10);", False)

        # Owner switches and prices (cents per million tokens). 3,000 chars -> 1,200 in + 1,024 out -> 2 cents on Sonnet.
        for agent in ["omni", "dread", "draco"]:
            assert json.loads(caller(OWNER, f"SELECT public.claude_owner_set_engine('{agent}','{SONNET}',true)::text;"))["ok"]
        assert json.loads(caller(OWNER, f"SELECT public.claude_owner_set_price('{SONNET}',300,1500)::text;"))["ok"]
        assert json.loads(caller(OWNER, f"SELECT public.claude_owner_set_price('{OPUS}',1500,7500)::text;"))["ok"]

        # --- Private OMNI text agent ---
        R = rid(1)
        assert reserve_agent(R)["reason"] == "invalid_request"  # no such run
        agent_run(R, status="queued")
        assert reserve_agent(R)["reason"] == "run_not_running"
        sql(f"UPDATE public.omni_agent_runs SET status='running' WHERE id='{R}';")
        assert reserve_agent(R, model=DEFAULT)["reason"] == "invalid_request"
        assert reserve_agent(R, model="claude-haiku-5-5")["reason"] == "invalid_request"
        assert reserve_agent(R, chars=0)["reason"] == "invalid_request"
        assert reserve_agent(R, chars=200001)["reason"] == "invalid_request"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert reserve_agent(R)["reason"] == "emergency_stop_engaged"
        sql("DELETE FROM public.omni_terminal_controls;")
        assert reserve_agent(R)["reason"] == "emergency_stop_engaged"  # missing Stop row = engaged
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false);")
        sql(f"UPDATE public.beta_access SET ai_approved=false WHERE user_id='{OWNER}';")
        assert reserve_agent(R)["reason"] == "ai_not_approved"
        sql(f"UPDATE public.beta_access SET paused=true, ai_approved=true WHERE user_id='{OWNER}';")
        assert reserve_agent(R)["reason"] == "ai_not_approved"
        sql(f"UPDATE public.beta_access SET paused=false WHERE user_id='{OWNER}';")
        caller(OWNER, f"SELECT public.claude_owner_set_engine('omni','{SONNET}',false);")
        assert reserve_agent(R)["reason"] == "engine_not_enabled"
        caller(OWNER, f"SELECT public.claude_owner_set_engine('omni','{OPUS}',true);")
        assert reserve_agent(R)["reason"] == "engine_not_enabled"  # switch is on for Opus, not Sonnet
        caller(OWNER, f"SELECT public.claude_owner_set_engine('omni','{SONNET}',true);")
        sql(f"UPDATE public.claude_prices SET confirmed_at = now() - interval '31 days' WHERE model='{SONNET}';")
        assert reserve_agent(R)["reason"] == "price_not_confirmed"
        sql(f"UPDATE public.claude_prices SET confirmed_at = now() - interval '29 days' WHERE model='{SONNET}';")
        # A member (admin role, not the owner) never gets Claude, even with their own run.
        RO = rid(2)
        agent_run(RO, owner=OTHER, project=OTHER_PROJECT)
        sql(f"INSERT INTO public.claude_engine_settings(owner_id, agent_id, model, enabled) VALUES ('{OTHER}','omni','{SONNET}',true);")
        assert reserve_agent(RO)["reason"] == "owner_unverified"
        assert sql("SELECT count(*) FROM public.claude_usage;") == "0"  # refusals leave nothing behind

        ok = reserve_agent(R)
        assert ok == {"ok": True, "estimate_cents": 2}, ok
        assert sql(f"SELECT model FROM public.omni_agent_runs WHERE id='{R}';") == SONNET
        assert sql(f"SELECT source||'/'||agent_id||'/'||status FROM public.claude_usage WHERE run_id='{R}';") == "agent/omni/reserved"
        assert reserve_agent(R)["reason"] == "already_reserved"
        assert settle("fusion", R)["reason"] == "not_reserved"  # wrong source
        assert settle("chat", R)["reason"] == "invalid_request"  # chat keeps claude_settle
        assert settle("agent", R, status="reserved")["reason"] == "invalid_request"
        out = settle("agent", R)
        assert out["ok"] and out["actual_cents"] == 1, out  # ceil((20*300 + 5*1500)/1e6)
        assert settle("agent", R)["reason"] == "already_settled"
        assert sql(f"SELECT count(*) FROM public.razul_control_audit WHERE action='claude_settle_agent_completed' AND record_id='{R}';") == "1"

        # Unknown usage (aborted or failed call) is charged at the full estimate.
        R3 = rid(3)
        agent_run(R3)
        assert reserve_agent(R3)["ok"]
        assert settle("agent", R3, status="cancelled", i="NULL", o="NULL")["actual_cents"] == 2

        # Per-call cap: Opus on a long prompt estimates above 50 cents and is refused before any ledger row.
        caller(OWNER, f"SELECT public.claude_owner_set_engine('omni','{OPUS}',true);")
        R4 = rid(4)
        agent_run(R4)
        big = reserve_agent(R4, model=OPUS, chars=200000)
        assert big["reason"] == "call_cap" and big["estimate_cents"] > 50, big
        assert sql(f"SELECT count(*) FROM public.claude_usage WHERE run_id='{R4}';") == "0"
        assert sql(f"SELECT model FROM public.omni_agent_runs WHERE id='{R4}';") == DEFAULT
        caller(OWNER, f"SELECT public.claude_owner_set_engine('omni','{SONNET}',true);")

        # --- Fusion sessions: engines bound at approval ---
        create(dread=SONNET, uid=OTHER, ok=False)
        create(dread=SONNET, ok=False, amr=STALE)
        create(dread="claude-haiku-5-5", ok=False)
        caller(OWNER, f"SELECT public.claude_owner_set_engine('dread','{SONNET}',false);")
        create(dread=SONNET, ok=False)  # switch off at approval time
        caller(OWNER, f"SELECT public.claude_owner_set_engine('dread','{SONNET}',true);")
        create(dread=OPUS, ok=False)  # switch is for Sonnet
        sql(f"UPDATE public.claude_prices SET confirmed_at = now() - interval '31 days' WHERE model='{SONNET}';")
        create(dread=SONNET, ok=False)
        sql(f"UPDATE public.claude_prices SET confirmed_at = now() WHERE model='{SONNET}';")
        assert sql("SELECT count(*) FROM public.omni_fusion_sessions;") == "0"  # refused approvals leave nothing
        S1 = create(dread=SONNET, draco=DEFAULT, first="draco", n=4)
        assert sql(f"SELECT dread_engine||'/'||draco_engine FROM public.omni_fusion_sessions WHERE id='{S1}';") == f"{SONNET}/{DEFAULT}"
        assert sql(f"SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_session_claude_bound' AND record_id='{S1}';") == "1"
        assert sql(f"SELECT count(*) FROM public.razul_control_audit WHERE action='fusion_session_approved' AND record_id='{S1}';") == "1"

        t1 = begin(S1)
        assert t1["ok"] and t1["agent_id"] == "draco" and t1["model"] == DEFAULT, t1
        assert reserve_turn(t1["turn_id"])["reason"] == "invalid_request"  # current engine: no Claude ledger row
        finish(t1["turn_id"], reply="Draco plan")
        t2 = begin(S1)
        assert t2["agent_id"] == "dread" and t2["model"] == SONNET, t2
        assert sql(f"SELECT model FROM public.omni_fusion_turns WHERE id='{t2['turn_id']}';") == SONNET
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert reserve_turn(t2["turn_id"])["reason"] == "emergency_stop_engaged"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        assert reserve_turn("aaaaaaaa-0000-4000-8000-000000000000")["reason"] == "turn_not_found"
        r2 = reserve_turn(t2["turn_id"])
        assert r2 == {"ok": True, "estimate_cents": 2}, r2
        assert sql(f"SELECT source||'/'||agent_id||'/'||model FROM public.claude_usage WHERE run_id='{t2['turn_id']}';") == f"fusion/dread/{SONNET}"
        assert reserve_turn(t2["turn_id"])["reason"] == "already_reserved"
        assert settle("fusion", t2["turn_id"])["ok"]
        finish(t2["turn_id"], reply="Dread review")
        assert reserve_turn(t2["turn_id"])["reason"] == "turn_finished"

        # Turning the switch off mid-session refuses the next Claude reply (approval doesn't override the switch).
        t3 = begin(S1)
        assert t3["agent_id"] == "draco"
        finish(t3["turn_id"], reply="Draco again")
        t4 = begin(S1)
        assert t4["agent_id"] == "dread" and t4["model"] == SONNET
        caller(OWNER, f"SELECT public.claude_owner_set_engine('dread','{SONNET}',false);")
        assert reserve_turn(t4["turn_id"])["reason"] == "engine_not_enabled"
        caller(OWNER, f"SELECT public.claude_owner_set_engine('dread','{SONNET}',true);")
        stop_session(S1)
        assert reserve_turn(t4["turn_id"])["reason"] == "session_stopped"
        finish(t4["turn_id"], "cancelled", reply=None)

        # The existing 3-argument approval still works and binds the current engine for both.
        S2 = caller(OWNER, "SELECT public.omni_fusion_session_create('Second','dread',2);")
        assert sql(f"SELECT dread_engine||'/'||draco_engine FROM public.omni_fusion_sessions WHERE id='{S2}';") == f"{DEFAULT}/{DEFAULT}"
        t = begin(S2)
        assert t["model"] == DEFAULT
        finish(t["turn_id"], "failed", reply=None)
        stop_session(S2)

        # --- Shared daily cap: chat, agent and Fusion draw on one 500-cent rolling 24 hours ---
        spent = int(sql("SELECT coalesce(sum(coalesce(actual_cents, estimate_cents)),0) FROM public.claude_usage;"))
        fill = 498 - spent
        n = 0
        while fill > 0:
            n += 1
            cents = min(50, fill)
            sql(f"INSERT INTO public.claude_usage(owner_id, run_id, agent_id, model, estimate_cents, source) VALUES ('{OWNER}','{rid(900 + n)}','omni','{SONNET}',{cents},'chat');")
            fill -= cents
        R5, R6 = rid(5), rid(6)
        agent_run(R5)
        agent_run(R6)
        assert reserve_agent(R5)["ok"]  # 498 + 2 = 500: allowed
        assert reserve_agent(R6)["reason"] == "daily_cap"  # 500 + 2: refused
        S3 = create(dread=SONNET, first="dread", n=2)
        t = begin(S3)
        assert reserve_turn(t["turn_id"])["reason"] == "daily_cap"  # Fusion shares the same total
        finish(t["turn_id"], "failed", reply=None)
        # Rolling window: spending older than 24 hours no longer counts.
        sql(f"UPDATE public.claude_usage SET reserved_at = now() - interval '25 hours' WHERE source='chat';")
        assert reserve_agent(R6)["ok"]
        stop_session(S3)

        # Ledger and audit rows hold metadata only.
        cols = sql("SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='claude_usage';")
        for banned in ["message", "reply", "prompt", "text", "content"]:
            assert banned not in cols.split(","), cols
        assert sql("SELECT count(*) FROM public.razul_control_audit WHERE record_id LIKE '%Hello%' OR action LIKE '%Hello%';") == "0"

        # --- Races with real concurrent sessions ---
        # 1) Stop engaged and held by another session: the reservation waits, then sees the Stop and refuses.
        R7 = rid(7)
        agent_run(R7)
        bg = background("BEGIN; UPDATE public.omni_terminal_controls SET emergency_stop=true WHERE id=1; SELECT pg_sleep(1.5); COMMIT;")
        time.sleep(0.4)
        t0 = time.time()
        out = reserve_agent(R7)
        waited = time.time() - t0
        bg.communicate(timeout=10)
        assert out["reason"] == "emergency_stop_engaged" and waited > 0.6, (out, waited)
        assert sql(f"SELECT count(*) FROM public.claude_usage WHERE run_id='{R7}';") == "0"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")

        # 2) Cancel holds the run row: the reservation waits, then sees the run is no longer running.
        R8 = rid(8)
        agent_run(R8)
        bg = background(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; BEGIN; SELECT public.cancel_omni_agent_run('{R8}'); SELECT pg_sleep(1.5); COMMIT;")
        time.sleep(0.4)
        t0 = time.time()
        out = reserve_agent(R8)
        waited = time.time() - t0
        bg.communicate(timeout=10)
        assert out["reason"] == "run_not_running" and waited > 0.6, (out, waited)
        assert sql(f"SELECT count(*) FROM public.claude_usage WHERE run_id='{R8}';") == "0"

        # 3) Reservation holds the Stop row (FOR SHARE): engaging Stop waits until it commits; the reply's
        #    1-second poll then sees the Stop. The reservation itself never outlives a Stop that committed first.
        R9 = rid(9)
        agent_run(R9)
        bg = background(f"SET ROLE service_role; BEGIN; SELECT public.claude_reserve_agent_run('{R9}','{SONNET}',3000,1024); SELECT pg_sleep(1.5); COMMIT;")
        time.sleep(0.4)
        t0 = time.time()
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true WHERE id=1;")
        waited = time.time() - t0
        bg.communicate(timeout=10)
        assert waited > 0.6, waited
        assert sql(f"SELECT status FROM public.claude_usage WHERE run_id='{R9}';") == "reserved"
        assert sql("SELECT emergency_stop FROM public.omni_terminal_controls WHERE id=1;") == "t"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")

        # 4) Fusion stop vs reservation: a stop that commits first wins.
        caller(OWNER, f"SELECT public.claude_owner_set_engine('draco','{SONNET}',true);")
        sql("UPDATE public.claude_usage SET reserved_at = now() - interval '25 hours';")
        S4 = create(draco=SONNET, first="draco", n=2)
        t = begin(S4)
        bg = background(f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}'; SET request.jwt.claim.aal='aal2'; BEGIN; SELECT public.omni_fusion_session_stop('{S4}'); SELECT pg_sleep(1.5); COMMIT;")
        time.sleep(0.4)
        t0 = time.time()
        out = reserve_turn(t["turn_id"])
        waited = time.time() - t0
        bg.communicate(timeout=10)
        assert out["reason"] == "session_stopped" and waited > 0.6, (out, waited)
        finish(t["turn_id"], "cancelled", reply=None)

        print(f"Claude terminal/Fusion SQL checks passed: {checks}")
    finally:
        if started:
            subprocess.run(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "stop"], preexec_fn=demote, capture_output=True)
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    main()
