"""Disposable PostgreSQL only: installed migrations 0072–0073 (owner-approved Dread/Draco Fusion sessions) on top of
every earlier migration. Owner/aal2 + fresh-code approval, 2–4 replies, alternating speakers, one reply at a
time, Emergency Stop / AI approval / shared guard at begin and re-check, attempt/session/daily limits,
service-only outcomes, stop/delete, owner isolation and privileges. Never uses hosted credentials."""
import json
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
PORT = "55472"


def migrations():
    found = []
    for number in range(20, 74):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    assert found[-1].name.startswith("0073_"), found[-1]
    return found


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-fusion-duo-sql-"))
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
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'

    def caller(uid, text, ok=True, aal="aal2", amr=FRESH):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def create(topic="Plan the rollout", first="draco", n=4, uid=OWNER, ok=True, amr=FRESH):
        return caller(uid, f"SELECT public.omni_fusion_session_create('{topic}','{first}',{n});", ok, amr=amr)

    def begin(sid, uid=OWNER, amr=STALE):
        return json.loads(caller(uid, f"SELECT public.omni_fusion_turn_begin('{sid}')::text;", amr=amr))

    def check(tid, uid=OWNER):
        return json.loads(caller(uid, f"SELECT public.omni_fusion_turn_check('{tid}')::text;", amr=STALE))

    def finish(tid, status="completed", reply="A reply", pause="NULL", msg="NULL"):
        r = "NULL" if reply is None else f"$r${reply}$r$"
        return json.loads(service(f"SELECT public.omni_fusion_turn_finish('{tid}','{status}',{r},1,1,2,NULL,NULL,'gw',{pause},{msg})::text;"))

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
              paused boolean NOT NULL DEFAULT false, approved_at timestamptz);""")
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for path in migrations():
            sql(path.read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false) ON CONFLICT (id) DO UPDATE SET emergency_stop=false;")
        sql(f"INSERT INTO public.beta_access(user_id, ai_approved, paused) VALUES('{OWNER}', true, false);")

        # Privileges: outcomes are service-only; nobody writes the tables directly; anon has nothing.
        fin = "omni_fusion_turn_finish(uuid,text,text,integer,integer,integer,integer,text,text,integer,text)"
        for role in ["anon", "authenticated"]:
            assert sql(f"SELECT has_function_privilege('{role}','public.{fin}','execute');") == "f", role
        for fn in ["omni_fusion_session_create(text,text,integer)", "omni_fusion_turn_begin(uuid)", "omni_fusion_turn_check(uuid)", "omni_fusion_session_stop(uuid)", "omni_fusion_session_delete(uuid)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == "f", fn
        for t in ["omni_fusion_sessions", "omni_fusion_turns"]:
            for priv in ["insert", "update", "delete"]:
                assert sql(f"SELECT has_table_privilege('authenticated','public.{t}','{priv}');") == "f", (t, priv)
            assert sql(f"SELECT has_table_privilege('anon','public.{t}','select');") == "f", t

        # Approval: owner, aal2 and a code from the last 15 minutes; bounded inputs; secret refusal.
        create(uid=OTHER, ok=False)
        caller(OWNER, "SELECT public.omni_fusion_session_create('x','draco',2);", False, aal="aal1")
        create(ok=False, amr=STALE)
        create(n=1, ok=False)
        create(n=5, ok=False)
        create(first="omni", ok=False)
        create(topic="key sk-proj-abcdefghijklmnopqrstuvwxyz", ok=False)
        S1 = create(first="draco", n=2)
        create(ok=False)  # one open session at a time

        # Begin: Stop, AI approval and the shared guard are required; nothing is recorded on refusal.
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert begin(S1)["reason"] == "emergency_stop_engaged"
        sql("DELETE FROM public.omni_terminal_controls;")
        assert begin(S1)["reason"] == "emergency_stop_engaged"  # missing Stop row = engaged
        sql("INSERT INTO public.omni_terminal_controls(id, emergency_stop) VALUES (1, false);")
        sql(f"UPDATE public.beta_access SET ai_approved=false WHERE user_id='{OWNER}';")
        assert begin(S1)["reason"] == "ai_not_approved"
        sql(f"UPDATE public.beta_access SET ai_approved=true WHERE user_id='{OWNER}';")
        sql("INSERT INTO public.ai_gateway_state(feature, blocked_status, message) VALUES ('evolution-omni', 402, 'Credits exhausted.');")
        assert begin(S1)["reason"] == "ai_busy_or_paused"
        sql("DELETE FROM public.ai_gateway_state;")
        caller(OTHER, f"SELECT public.omni_fusion_turn_begin('{S1}');", False, amr=STALE)  # not the owner
        assert sql("SELECT count(*) FROM public.omni_fusion_turns;") == "0"

        # Turn 1: Draco (owner's choice); one reply at a time; guard held until the outcome.
        t1 = begin(S1)
        assert t1["ok"] and t1["agent_id"] == "draco" and t1["turn_no"] == 1 and t1["transcript"] == [], t1
        assert begin(S1)["reason"] == "reply_in_progress"
        assert sql("SELECT count(*) FROM public.ai_gateway_state WHERE feature='evolution-omni';") == "1"
        assert check(t1["turn_id"])["ok"] is True
        caller(OTHER, f"SELECT public.omni_fusion_turn_check('{t1['turn_id']}');", False, amr=STALE)
        assert check("aaaaaaaa-0000-4000-8000-000000000000")["reason"] == "turn_not_found"
        caller(OWNER, f"SELECT public.omni_fusion_turn_finish('{t1['turn_id']}','completed','x',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);", False)
        service(f"SELECT public.omni_fusion_turn_finish('{t1['turn_id']}','completed',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);", False)
        assert finish(t1["turn_id"], reply="Draco plan")["guard_released"] is True
        assert finish(t1["turn_id"])["reason"] == "turn_not_running"
        assert check(t1["turn_id"])["reason"] == "turn_finished"

        # A failed attempt doesn't count as a reply and stores no text; the same speaker retries.
        t2 = begin(S1)
        assert t2["agent_id"] == "dread" and t2["turn_no"] == 2
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert check(t2["turn_id"])["reason"] == "emergency_stop_engaged"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        finish(t2["turn_id"], "denied", reply=None)
        assert sql(f"SELECT reply IS NULL FROM public.omni_fusion_turns WHERE id='{t2['turn_id']}';") == "t"
        t3 = begin(S1)
        assert t3["agent_id"] == "dread" and t3["turn_no"] == 2 and [x["reply"] for x in t3["transcript"]] == ["Draco plan"], t3
        out = finish(t3["turn_id"], reply="Dread review")
        assert out["session_finished"] is True
        assert sql(f"SELECT status FROM public.omni_fusion_sessions WHERE id='{S1}';") == "finished"
        assert begin(S1)["reason"] == "session_closed"

        # Attempt limit: max_replies + 2 attempts per session.
        S2 = create(first="dread", n=2)
        for _ in range(4):
            t = begin(S2)
            assert t["ok"], t
            finish(t["turn_id"], "failed", reply=None)
        assert begin(S2)["reason"] == "attempt_limit"

        # Stop: re-check cancels an in-progress reply; delete needs a stopped/finished session.
        caller(OWNER, f"SELECT public.omni_fusion_session_delete('{S2}');", False)
        assert caller(OWNER, f"SELECT public.omni_fusion_session_stop('{S2}');") == "t"
        caller(OWNER, f"SELECT public.omni_fusion_session_delete('{S2}');")
        assert sql(f"SELECT count(*) FROM public.omni_fusion_turns WHERE session_id='{S2}';") == "0"
        S3 = create(n=3)
        t = begin(S3)
        caller(OTHER, f"SELECT public.omni_fusion_session_stop('{S3}');", False)
        caller(OWNER, f"SELECT public.omni_fusion_session_stop('{S3}');")
        assert check(t["turn_id"])["reason"] == "session_stopped"
        caller(OWNER, f"SELECT public.omni_fusion_session_delete('{S3}');", False)  # reply still running
        finish(t["turn_id"], "cancelled", reply=None)
        # Provider credit refusal keeps the guard as a pause for owner review.
        assert sql("SELECT count(*) FROM public.ai_gateway_state;") == "0"

        # Sessions per day: 5 per rolling 24 hours (S1..S3 used three).
        S4 = create(n=2)
        caller(OWNER, f"SELECT public.omni_fusion_session_stop('{S4}');")
        S5 = create(n=2)
        t = begin(S5)
        assert finish(t["turn_id"], "denied", reply=None, pause="402", msg="'Credits exhausted.'")["paused"] is True
        assert sql("SELECT blocked_status FROM public.ai_gateway_state WHERE feature='evolution-omni';") == "402"
        sql("DELETE FROM public.ai_gateway_state;")
        caller(OWNER, f"SELECT public.omni_fusion_session_stop('{S5}');")
        # Five approvals in 24 hours, even though S2 was deleted (quota counts the audit, 0073).
        create(n=2, ok=False)
        sql("UPDATE public.razul_control_audit SET occurred_at = occurred_at - interval '25 hours' WHERE action='fusion_session_approved';")

        # Replies per day: 20 attempts per rolling 24 hours across sessions, deleted ones included.
        used = int(sql(f"SELECT count(*) FROM public.razul_control_audit WHERE actor_id='{OWNER}' AND action='fusion_turn_start';"))
        assert used > int(sql(f"SELECT count(*) FROM public.omni_fusion_turns WHERE owner_id='{OWNER}';"))  # S2's turns were deleted
        sql(f"INSERT INTO public.razul_control_audit(actor_id,action,record_type,record_id) SELECT '{OWNER}','fusion_turn_start','omni_fusion_turn',g::text FROM generate_series(1,{20 - used}) g;")
        S6 = create(n=2)
        assert begin(S6)["reason"] == "daily_limit"

        # Owner isolation on reads.
        assert caller(OTHER, "SELECT count(*) FROM public.omni_fusion_sessions;", amr=STALE) == "0"
        assert caller(OWNER, "SELECT count(*) > 0 FROM public.omni_fusion_turns;", amr=STALE) == "t"
        acts = sql("SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.razul_control_audit WHERE action LIKE 'fusion_%';")
        for want in ["fusion_session_approved", "fusion_turn_start", "fusion_turn_completed", "fusion_session_stopped", "fusion_session_deleted"]:
            assert want in acts, (want, acts)

        print(f"PASS: {checks} isolated SQL checks: fresh-code owner approval, 2–4 replies, alternating speakers, one reply/one session at a time, Stop/AI-approval/guard at begin and re-check, attempt/session/daily limits, service-only outcomes with pause, stop/delete, owner isolation and privileges. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
