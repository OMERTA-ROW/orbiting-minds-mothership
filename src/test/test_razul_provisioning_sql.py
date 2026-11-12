"""Disposable PostgreSQL only: Razul intelligence provisioning guards (manifests are proposals,
forbidden tools/over-cap budgets/secret-like text refused, digest computed by the database,
approval needs owner + fresh second factor + proof-verified sandbox pass of the exact manifest,
staged 10/50/100 rollout one healthy stage at a time, Emergency Stop blocks widening, rollback
always allowed and restores the previous release, append-only history, no direct writes,
owner-managed knowledge). Never uses hosted credentials."""
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


def manifest(version="1.0.0", tools=("knowledge.search",), task=50, **over):
    m = {
        "contract": "razul.manifest/v1", "appId": "shop-app", "agentId": "support", "version": version,
        "identity": {"name": "Support", "purpose": "Answers questions about the shop app."},
        "tools": list(tools),
        "model": {"provider": "lovable_ai", "model": "google/gemini-2.5-flash", "temperature": 0.2, "maxOutputTokens": 1024},
        "knowledgeNamespace": "app/shop-app/support",
        "memory": {"scope": "agent", "ownerManaged": True, "retentionDays": 30},
        "budgets": {"taskCents": task, "dayCents": 200, "totalCents": 500},
        "requiredSettings": ["SHOP_API_URL"],
    }
    m.update(over)
    return json.dumps(m).replace("'", "''")


def main():
    base = Path(tempfile.mkdtemp(prefix="razul-prov-sql-"))
    demote = None
    if os.getuid() == 0:
        os.chown(base, 1000, 1000)
        def demote():
            os.setgid(1000)
            os.setuid(1000)
    def command(args):
        return subprocess.run(args, preexec_fn=demote, check=True, capture_output=True, text=True)
    env = dict(os.environ, PGHOST=str(base), PGPORT="55451", PGUSER="fixture", PGDATABASE="postgres")
    checks = 0
    def sql(text, ok=True):
        result = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and result.returncode: raise AssertionError(result.stderr + "\n" + text[:300])
        if not ok and not result.returncode: raise AssertionError("Expected SQL denial: " + text[:300])
        return result.stdout.strip()
    now = int(time.time())
    FRESH = f'[{{"method":"password","timestamp":{now - 3600}}},{{"method":"totp","timestamp":{now - 60}}}]'
    STALE = f'[{{"method":"totp","timestamp":{now - 20 * 60}}}]'
    def as_user(uid, amr, text, ok=True, aal="aal2"):
        nonlocal checks
        checks += 1
        out = sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claim.aal='{aal}'; SET request.jwt.claim.amr='{amr}'; {text}", ok)
        return out.splitlines()[-1] if out else out
    def svc(text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE service_role; {text}", ok)
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55451 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),'amr',nullif(current_setting('request.jwt.claim.amr',true),'')::jsonb) $$;
        GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated, anon, service_role;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE FUNCTION public.is_knowledge_reader() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        for number in list(range(20, 35)) + [36, 47, 48, 50]:
            paths = list((ROOT / "drizzle/migrations").glob(f"{number:04d}_*.sql"))
            assert len(paths) == 1, number
            sql(paths[0].read_text())
        sql(f"INSERT INTO auth.users VALUES('{OWNER}','owner@fixture.invalid',now()),('{OTHER}','other@fixture.invalid',now()); INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{OTHER}','admin');")
        sql("INSERT INTO public.omni_terminal_controls(id,emergency_stop,changed_at,reason,revision) VALUES(1,false,now(),'t',1); INSERT INTO public.omni_workspace_settings(id,terminal_enabled) VALUES(1,true) ON CONFLICT (id) DO UPDATE SET terminal_enabled=true;")

        def propose(m, esc='["New agent."]', who=OWNER, ok=True):
            return as_user(who, FRESH, f"SELECT public.razul_propose_manifest('{m}'::jsonb,'{esc}'::jsonb,'[]'::jsonb,'','{{}}'::jsonb);", ok)
        def decide(pid, action, stage="NULL", ack="false", amr=FRESH, ok=True):
            return as_user(OWNER, amr, f"SELECT public.razul_decide_proposal('{pid}','{action}',{stage}::smallint,{ack});", ok)
        def sandbox(pid, passed="true", proof="true", ok=True):
            sha = sql(f"SELECT m.manifest_sha256 FROM public.razul_update_proposals p JOIN public.razul_agent_manifests m ON m.id=p.manifest_id WHERE p.id='{pid}';")
            return svc(f"INSERT INTO public.razul_evaluations(proposal_id,manifest_sha256,kind,passed,proof_verified,runner) VALUES('{pid}','{sha}','sandbox',{passed},{proof},'omni-sandbox');", ok)
        status = lambda pid: sql(f"SELECT status FROM public.razul_update_proposals WHERE id='{pid}';")

        # Manifests: forbidden tools, over-cap budgets, wrong namespace, secret-like text, setting values refused.
        propose(manifest(tools=["shell"]), ok=False)
        propose(manifest(tools=["secrets.write"]), ok=False)
        propose(manifest(tools=["permissions.grant"]), ok=False)
        propose(manifest(task=101), ok=False)
        propose(manifest(knowledgeNamespace="app/other/support"), ok=False)
        propose(manifest(requiredSettings=["sk-live-abcdefghijklmnopqrstuvwx"]), ok=False)
        propose(manifest(identity={"name": "Support", "purpose": "token ghp_abcdefghijklmnopqrstuvwxyz0123456789"}), ok=False)
        # Non-owner and signed-in non-MFA users cannot propose.
        propose(manifest(), who=OTHER, ok=False)
        as_user(OWNER, FRESH, f"SELECT public.razul_propose_manifest('{manifest()}'::jsonb,'[]','[]','','{{}}');", ok=False, aal="aal1")

        p1 = propose(manifest())
        assert status(p1) == "proposed"
        # Digest is the database's own; manifests are immutable.
        assert sql("SELECT count(*) FROM public.razul_agent_manifests WHERE manifest_sha256 = encode(sha256(convert_to(manifest::text,'UTF8')),'hex');") == "1"
        svc("UPDATE public.razul_agent_manifests SET version='9.9.9';", ok=False)
        svc("DELETE FROM public.razul_agent_manifests;", ok=False)
        # One open proposal per agent; versions only go up.
        propose(manifest("1.1.0"), ok=False)
        # Approval before any sandbox evaluation is refused; static lint alone is not enough.
        decide(p1, "approve", ack="true", ok=False)
        # Sandbox results must carry verified proof and the exact digest.
        sandbox(p1, proof="false", ok=False)
        svc(f"INSERT INTO public.razul_evaluations(proposal_id,manifest_sha256,kind,passed,proof_verified,runner) VALUES('{p1}','{'a'*64}','sandbox',true,true,'x');", ok=False)
        sandbox(p1)
        assert status(p1) == "evaluated"
        # Razul/service cannot approve; the owner needs a fresh code and must acknowledge escalations.
        svc(f"UPDATE public.razul_update_proposals SET status='approved', approved_by='{OWNER}', approved_at=now(), escalations_acknowledged=true WHERE id='{p1}';", ok=False)
        decide(p1, "approve", ack="true", amr=STALE, ok=False)
        decide(p1, "approve", ack="false", ok=False)
        decide(p1, "approve", ack="true")
        assert status(p1) == "approved"
        # Staged rollout: start at 10 %, widen one healthy stage at a time, Stop blocks widening.
        decide(p1, "stage", stage="50", ok=False)
        decide(p1, "stage", stage="10")
        decide(p1, "stage", stage="50", ok=False)  # not yet healthy
        svc(f"UPDATE public.razul_update_proposals SET stage_healthy=true WHERE id='{p1}';")
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        decide(p1, "stage", stage="50", ok=False)
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        decide(p1, "stage", stage="100", ok=False)  # skipping a stage
        decide(p1, "stage", stage="50")
        svc(f"UPDATE public.razul_update_proposals SET stage_healthy=true WHERE id='{p1}';")
        decide(p1, "promote", ok=False)  # not at 100 %
        decide(p1, "stage", stage="100")
        svc(f"UPDATE public.razul_update_proposals SET stage_healthy=true WHERE id='{p1}';")
        svc(f"UPDATE public.razul_update_proposals SET status='promoted' WHERE id='{p1}';", ok=False)  # never automatic
        decide(p1, "promote", amr=STALE, ok=False)
        decide(p1, "promote")
        m1 = sql(f"SELECT manifest_id FROM public.razul_update_proposals WHERE id='{p1}';")
        assert sql("SELECT manifest_id FROM public.razul_agent_releases;") == m1
        svc("UPDATE public.razul_agent_releases SET manifest_id=manifest_id;", ok=False)  # releases are trigger-only

        # v1.1.0: failing health at a stage → rollback; a failed evaluation blocks approval.
        p2 = propose(manifest("1.1.0", tools=["knowledge.search", "code.propose"], task=60), esc='["Adds tool code.propose."]')
        sandbox(p2, passed="false")
        decide(p2, "approve", ack="true", ok=False)
        decide(p2, "reject")
        decide(p2, "approve", ack="true", ok=False)  # closed
        p3 = propose(manifest("1.2.0", tools=["knowledge.search", "code.propose"]))
        sandbox(p3)
        decide(p3, "approve", ack="true")
        decide(p3, "stage", stage="10")
        svc(f"UPDATE public.razul_update_proposals SET stage_healthy=false WHERE id='{p3}';")
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=true;")
        decide(p3, "rollback")  # allowed even during Emergency Stop
        sql("UPDATE public.omni_terminal_controls SET emergency_stop=false;")
        assert sql("SELECT manifest_id FROM public.razul_agent_releases;") == m1  # untouched by a staged rollback
        # Promote v1.3.0, then roll back to v1.0.0.
        p4 = propose(manifest("1.3.0"))
        sandbox(p4)
        decide(p4, "approve", ack="true")
        for st in ("10", "50", "100"):
            decide(p4, "stage", stage=st)
            svc(f"UPDATE public.razul_update_proposals SET stage_healthy=true WHERE id='{p4}';")
        decide(p4, "promote")
        assert sql("SELECT manifest_id FROM public.razul_agent_releases;") != m1
        decide(p4, "rollback")
        assert sql("SELECT manifest_id FROM public.razul_agent_releases;") == m1
        # History is append-only; proposals cannot be deleted; signed-in users cannot write directly.
        svc("DELETE FROM public.razul_provisioning_events;", ok=False)
        svc("UPDATE public.razul_provisioning_events SET event='x';", ok=False)
        svc("DELETE FROM public.razul_update_proposals;", ok=False)
        svc("DELETE FROM public.razul_evaluations;", ok=False)
        as_user(OWNER, FRESH, f"INSERT INTO public.razul_agent_manifests(app_id,agent_id,version,manifest,manifest_sha256,created_by) VALUES('a-b','c-d','1.0.0','{{}}','{'a'*64}','owner');", ok=False)
        as_user(OWNER, FRESH, f"UPDATE public.razul_update_proposals SET status='promoted' WHERE id='{p3}';", ok=False)
        assert int(sql("SELECT count(*) FROM public.razul_provisioning_events WHERE event LIKE 'proposal_%';")) >= 10

        # Knowledge: owner-managed, namespaced, digest computed here, secret-like text refused, audited.
        add = lambda ns, body, ok=True, who=OWNER: as_user(who, FRESH, f"SELECT public.razul_add_knowledge('{ns}','Refunds','{body}','official_url','https://example.org/refunds',now());", ok)
        d = add("app/shop-app/support", "Refunds take five days.")
        add("app/shop-app/support", "key sk-live-abcdefghijklmnopqrstuvwx", ok=False)
        add("shared", "x", ok=False)
        add("app/shop-app/support", "x", who=OTHER, ok=False)
        as_user(OWNER, FRESH, f"SELECT public.razul_add_knowledge('app/shop-app/support','t','b','owner_typed','me',now()+interval '1 day');", ok=False)
        assert sql(f"SELECT source_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex') FROM public.razul_knowledge_docs WHERE id='{d}';") == "t"
        assert as_user(OTHER, FRESH, "SELECT count(*) FROM public.razul_knowledge_docs;") == "0"  # RLS: owner only
        as_user(OWNER, FRESH, f"SELECT public.razul_delete_knowledge('{d}');")
        assert sql("SELECT count(*) FROM public.razul_knowledge_docs;") == "0"
        assert sql("SELECT count(*) FROM public.razul_provisioning_events WHERE event IN ('knowledge_added','knowledge_deleted');") == "2"
        assert sql("SELECT count(*) FROM public.razul_provisioning_events WHERE detail::text LIKE '%Refunds take%';") == "0"  # metadata only

        print(f"PASS: {checks} isolated SQL checks: forbidden tools/caps/secret-like text refused, DB digest, immutable manifests, one open proposal, rising versions, approval needs owner + fresh code + acknowledged escalations + proof-verified sandbox pass, no service/automatic approval or promotion, 10/50/100 healthy staged rollout, Stop blocks widening, rollback always allowed and restores the previous release, trigger-only releases, append-only history, owner-only namespaced knowledge with metadata audit. No hosted fixtures.")
    finally:
        if started: command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])
        shutil.rmtree(base)

if __name__ == "__main__": main()
