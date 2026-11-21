"""Disposable PostgreSQL only: installed migrations 0070 (Dread/Draco memory + "use in chat" switch) and
0071 ("save chats" switch) on top of every earlier migration. Owner/aal2 switches (off by default),
agent and owner isolation, read-once-per-reply inside the chat checks (delegation, Stop, AI approval),
the 40-entry / 6,000-character budget, saving only completed replies once while switched on, secret
refusal, the 500 cap, delete-all, privileges and metadata-only audit. Never uses hosted credentials."""
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
CLIENT = "omni-web"
AUD = "omni-mothership"
CB = "https://omni-orbit-command-companion.lovable.app/mothership/callback"
CH = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
MODEL = "openai/gpt-6-astra"
PORT = "55471"


def migrations():
    found = []
    for number in range(20, 72):
        paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
        if not paths:
            break
        assert len(paths) == 1, number
        found.append(paths[0])
    assert found[-1].name.startswith("0071_"), found[-1]
    return found


def h(ch):
    return ch * 64


def main():
    base = Path(tempfile.mkdtemp(prefix="omni-dd-memory-sql-"))
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

    def caller(uid, text, ok=True, aal="aal2"):
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{FRESH}'; {text}", ok)

    def service(text, ok=True):
        return sql(f"SET ROLE service_role; {text}", ok)

    def connect(code_ch, token_ch, who=OWNER):
        sql("UPDATE public.omni_delegation_codes SET created_at=created_at-interval '11 minutes', expires_at=expires_at-interval '11 minutes';")
        caller(who, f"SELECT public.omni_delegation_authorize('{CLIENT}','{AUD}','{CB}',ARRAY['chat:write'],'{h(code_ch)}','{CH}');")
        out = service(f"SELECT public.omni_delegation_exchange('{h(code_ch)}','{CH}','{CLIENT}','{CB}','{h(token_ch)}','omnid_aaaaaa')::text;")
        assert '"ok": true' in out, out
        return h(token_ch)

    def begin(token):
        out = service(f"SELECT public.omni_delegation_begin_chat('{token}','{AUD}','{MODEL}',1,10)::text;")
        m = re.search(r'"run_id": "([0-9a-f-]{36})"', out)
        assert m, out
        return m.group(1)

    def finish(run, status="completed"):
        return service(f"SELECT public.omni_delegation_finish_chat('{run}','{status}',12,10,4,14,NULL,NULL,'gw-1',NULL,NULL)::text;")

    def memory(token, run, agent="dread"):
        return json.loads(service(f"SELECT public.omni_delegation_chat_memory('{token}','{AUD}','{run}','{agent}')::text;"))

    def save_chat(run, agent="dread", title="Chat: hi", body="Owner: hi\n\nDread: hello"):
        return json.loads(service(f"SELECT public.omni_delegation_chat_save('{run}','{agent}','{title}',$b${body}$b$)::text;"))

    def save(uid, agent, title, body):
        return caller(uid, f"SELECT public.omni_memory_save('{agent}','note','{title}',$b${body}$b$,'owner_typed','');")

    def events():
        return sql("SELECT coalesce(string_agg(event || ':' || n, ',' ORDER BY event), '') FROM (SELECT event, count(*) n FROM public.omni_agent_memory_audit GROUP BY event) a;")

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

        # Privileges: chat read/save are service-only; switches/delete-all are owner functions, never anon.
        for fn in ["omni_delegation_chat_memory(text,text,uuid,text)", "omni_delegation_chat_save(uuid,text,text,text)"]:
            for role in ["anon", "authenticated"]:
                assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','execute');") == "f", (fn, role)
            assert sql(f"SELECT has_function_privilege('service_role','public.{fn}','execute');") == "t", fn
        for fn in ["omni_memory_set_chat_use(text,boolean)", "omni_memory_set_save_chats(text,boolean)", "omni_memory_delete_all(text)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == "f", fn
        for priv in ["insert", "update", "delete"]:
            assert sql(f"SELECT has_table_privilege('authenticated','public.omni_agent_memory_settings','{priv}');") == "f", priv
        assert sql("SELECT has_table_privilege('anon','public.omni_agent_memory_settings','select');") == "f"

        # Switches: owner + aal2 only; only Dread and Draco.
        caller(OTHER, "SELECT public.omni_memory_set_chat_use('dread', true);", False)
        caller(OWNER, "SELECT public.omni_memory_set_chat_use('dread', true);", False, aal="aal1")
        caller(OWNER, "SELECT public.omni_memory_set_chat_use('omni', true);", False)
        caller(OWNER, "SELECT public.omni_memory_set_save_chats('jackboy', true);", False)
        caller(OWNER, "SELECT public.omni_memory_set_chat_use('dread', NULL);", False)

        # Dread and Draco memories are separate; another account's entries stay out.
        save(OWNER, "dread", "Dread fact", "Check the logs first")
        save(OWNER, "draco", "Draco fact", "Sketch three options")
        sql(f"INSERT INTO public.omni_agent_memories(owner_id,agent_id,kind,title,body,source_kind,body_sha256) VALUES('{OTHER}','dread','note','Other','Not yours','owner_typed',repeat('a',64));")

        T = connect("1", "a")
        # Default off: the reply reads nothing, but the read is recorded once.
        R1 = begin(T)
        m = memory(T, R1)
        assert m == {"ok": True, "enabled": False, "entries": [], "omitted": 0}, m
        assert memory(T, R1)["reason"] == "memory_already_read"
        assert memory(T, R1, "omni")["reason"] == "agent_without_memory"
        finish(R1)
        assert save_chat(R1)["reason"] == "save_chats_off"
        assert sql("SELECT count(*) FROM public.omni_agent_memories WHERE source_kind='omni_chat';") == "0"

        # Switched on: only the owner's Dread entries, newest first.
        caller(OWNER, "SELECT public.omni_memory_set_chat_use('dread', true);")
        assert caller(OWNER, f"SELECT use_in_chat || ',' || save_chats FROM public.omni_agent_memory_settings WHERE owner_id='{OWNER}' AND agent_id='dread';") == "true,false"
        assert caller(OTHER, "SELECT count(*) FROM public.omni_agent_memory_settings;") == "0"
        R2 = begin(T)
        m = memory(T, R2)
        assert m["enabled"] is True and [e["title"] for e in m["entries"]] == ["Dread fact"], m
        assert sql(f"SELECT memory_agent_id || ',' || memory_entries || ',' || memory_chars FROM public.omni_delegated_chat_runs WHERE id='{R2}';") == f"dread,1,{len('Dread fact') + len('Check the logs first')}"
        # Draco's switch is independent and still off.
        assert memory(T, R2, "draco")["reason"] == "memory_already_read"

        # Save chats: only a completed run, once, for the same agent, while on.
        assert save_chat(R2)["reason"] == "run_not_completed"
        finish(R2)
        caller(OWNER, "SELECT public.omni_memory_set_save_chats('dread', true);")
        assert save_chat(R2, agent="draco")["reason"] == "agent_mismatch"
        assert save_chat(R2, body="key sk-proj-abcdefghijklmnopqrstuvwxyz")["reason"] == "secret_like"
        assert save_chat(R2, title="")["reason"] == "invalid_request"
        assert save_chat(R2)["ok"] is True
        assert save_chat(R2)["reason"] == "already_saved"
        assert caller(OWNER, "SELECT count(*) FROM public.omni_memory_list('dread') WHERE source_kind='omni_chat';") == "1"

        # A failed reply is never saved.
        R3 = begin(T)
        memory(T, R3)
        finish(R3, "failed")
        assert save_chat(R3)["reason"] == "run_not_completed"

        # Emergency Stop, AI approval and revocation refuse the memory read (and nothing is marked read).
        R4 = begin(T)
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        assert memory(T, R4)["reason"] == "emergency_stop_engaged"
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        sql(f"UPDATE public.beta_access SET ai_approved=false WHERE user_id='{OWNER}';")
        assert memory(T, R4)["reason"] == "ai_not_approved"
        sql(f"UPDATE public.beta_access SET ai_approved=true WHERE user_id='{OWNER}';")
        assert memory(h("f"), R4)["reason"] == "invalid"
        assert sql(f"SELECT memory_agent_id IS NULL FROM public.omni_delegated_chat_runs WHERE id='{R4}';") == "t"
        finish(R4, "cancelled")
        service(f"SELECT public.omni_delegation_revoke('{T}');")
        T2 = connect("2", "b")
        R5 = begin(T2)
        assert memory(T, R5)["reason"] == "revoked"

        # Budget: at most 6,000 characters and 40 entries per reply, newest first.
        caller(OWNER, "SELECT public.omni_memory_delete_all('dread');")
        for i in range(3):
            save(OWNER, "dread", f"Big {i}", "word " * 500)
        m = memory(T2, R5)
        assert len(m["entries"]) == 2 and m["omitted"] == 1, (len(m["entries"]), m["omitted"])
        assert [e["title"] for e in m["entries"]] == ["Big 2", "Big 1"], m
        finish(R5)
        caller(OWNER, "SELECT public.omni_memory_delete_all('dread');")
        for i in range(45):
            sql(f"INSERT INTO public.omni_agent_memories(owner_id,agent_id,kind,title,body,source_kind,body_sha256,created_at) VALUES('{OWNER}','dread','note','T{i}','b','owner_typed',repeat('a',64), now() - interval '{i} minutes');")
        R6 = begin(T2)
        m = memory(T2, R6)
        assert len(m["entries"]) == 40 and m["omitted"] == 5 and m["entries"][0]["title"] == "T0", (len(m["entries"]), m["omitted"])
        finish(R6)

        # 500 cap applies to saved chats too.
        sql(f"INSERT INTO public.omni_agent_memories(owner_id,agent_id,kind,title,body,source_kind,body_sha256) SELECT '{OWNER}','dread','note','F'||g,'b','owner_typed',repeat('a',64) FROM generate_series(1,455) g;")
        R7 = begin(T2)
        memory(T2, R7)
        finish(R7)
        assert save_chat(R7)["reason"] == "memory_full"

        # Delete all: owner-only, agent-scoped, really removes the text, keeps Draco's.
        caller(OTHER, "SELECT public.omni_memory_delete_all('dread');", False)
        assert caller(OWNER, "SELECT public.omni_memory_delete_all('dread');") == "500"
        assert sql(f"SELECT count(*) FROM public.omni_agent_memories WHERE owner_id='{OWNER}' AND agent_id='dread';") == "0"
        assert sql(f"SELECT count(*) FROM public.omni_agent_memories WHERE owner_id='{OWNER}' AND agent_id='draco';") == "1"
        assert sql(f"SELECT count(*) FROM public.omni_agent_memories WHERE owner_id='{OTHER}';") == "1"

        # Audit stays metadata only and append-only.
        ev = events()
        for want in ["chat_use_on:1", "save_chats_on:1", "saved_from_chat:1", "used_in_chat:5", "deleted_all:3"]:
            assert want in ev, (want, ev)
        assert sql("SELECT count(*) FROM information_schema.columns WHERE table_name IN ('omni_agent_memory_audit','omni_delegated_chat_runs') AND column_name IN ('title','body','body_sha256','reply','message');") == "0"
        sql("DELETE FROM public.omni_agent_memory_audit;", False)

        print(f"PASS: {checks} isolated SQL checks: service-only chat memory, owner/aal2 switches off by default, Dread/Draco/owner isolation, read once per reply under delegation/Stop/AI-approval checks, 40-entry/6,000-char budget, completed-only single save with secret refusal and 500 cap, delete-all, metadata-only append-only audit. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)


if __name__ == "__main__":
    main()
