"""Disposable PostgreSQL only: invitation revoke/decline/accept transitions, races and member removal.
Loads the invitation schema (0018 equivalent) plus migration 0041. Never uses hosted credentials."""
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER = "11111111-1111-4111-8111-111111111111"
ADMIN = "22222222-2222-4222-8222-222222222222"
TESTER = "33333333-3333-4333-8333-333333333333"
GUEST = "44444444-4444-4444-8444-444444444444"
STRANGER = "55555555-5555-4555-8555-555555555555"


def main():
    base = Path(tempfile.mkdtemp(prefix="invites-sql-"))
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
        r = subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", text], env=env, capture_output=True, text=True)
        if ok and r.returncode: raise AssertionError(r.stderr)
        if not ok and not r.returncode: raise AssertionError("Expected SQL refusal: " + text)
        return r.stdout.strip() if ok else r.stderr
    def as_(uid, text, ok=True):
        nonlocal checks
        checks += 1
        return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; {text}", ok)
    def invite(by, email, role="tester", h=None, hours=72):
        h = h or (email[0] * 64)
        return as_(by, f"SELECT public.create_invitation('{email}','{role}', now() + interval '{hours} hours', '{h}');").splitlines()[-1]
    started = False
    try:
        command(["initdb", "-D", str(base / "db"), "-U", "fixture", "-A", "trust", "--no-locale"])
        command(["pg_ctl", "-D", str(base / "db"), "-l", str(base / "server.log"), "-o", f"-k {base} -p 55449 -c listen_addresses=''", "-w", "start"])
        started = True
        sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO authenticated, anon, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
        CREATE TABLE public.beta_access(user_id uuid PRIMARY KEY, ai_approved boolean NOT NULL DEFAULT false, studio_approved boolean NOT NULL DEFAULT false, paused boolean NOT NULL DEFAULT false);
        """)
        sql((ROOT / ".lovable/pending/owner-invitations.sql").read_text())
        sql((ROOT / "drizzle/migrations/0041_invitations_truthful_transitions.sql").read_text())
        sql(f"""INSERT INTO auth.users VALUES
          ('{OWNER}','owner@fixture.invalid',now()),('{ADMIN}','admin@fixture.invalid',now()),
          ('{TESTER}','tester@fixture.invalid',now()),('{GUEST}','guest@fixture.invalid',now()),
          ('{STRANGER}','stranger@fixture.invalid',now());
          INSERT INTO public.user_roles(user_id,role) VALUES('{OWNER}','owner'),('{ADMIN}','admin'),('{TESTER}','tester');
          INSERT INTO public.beta_access(user_id,ai_approved,studio_approved) VALUES('{TESTER}',true,true),('{ADMIN}',true,false);""")

        # Function privileges: nothing callable anonymously.
        for fn in ["decline_invitation(text)", "revoke_invitation(uuid)", "accept_invitation(text)", "remove_member(uuid)"]:
            assert sql(f"SELECT has_function_privilege('anon','public.{fn}','execute');") == 'f', fn
            checks += 1

        # Revoke: open -> revoked once; second revoke refused (no silent success).
        g1 = invite(OWNER, "guest@fixture.invalid", h="1" * 64)
        as_(OWNER, f"SELECT public.revoke_invitation('{g1}');")
        assert "already revoked" in as_(OWNER, f"SELECT public.revoke_invitation('{g1}');", ok=False)
        assert "not valid" in as_(GUEST, f"SELECT public.accept_invitation('{'1' * 64}');", ok=False)

        # Accept then revoke (race): revoke refused with a truthful reason.
        g2 = invite(OWNER, "guest@fixture.invalid", h="2" * 64)
        assert as_(GUEST, f"SELECT public.accept_invitation('{'2' * 64}');").endswith("tester")
        assert "already accepted" in as_(OWNER, f"SELECT public.revoke_invitation('{g2}');", ok=False)
        assert "not valid" in as_(GUEST, f"SELECT public.accept_invitation('{'2' * 64}');", ok=False)  # single use

        # Decline: only the invited, confirmed email; then neither accept nor revoke works.
        s1 = invite(OWNER, "stranger@fixture.invalid", h="3" * 64)
        assert "different account" in as_(GUEST, f"SELECT public.decline_invitation('{'3' * 64}');", ok=False)
        as_(STRANGER, f"SELECT public.decline_invitation('{'3' * 64}');")
        assert "not valid" in as_(STRANGER, f"SELECT public.accept_invitation('{'3' * 64}');", ok=False)
        assert "already declined" in as_(OWNER, f"SELECT public.revoke_invitation('{s1}');", ok=False)
        assert as_(OWNER, f"SELECT declined_at IS NOT NULL FROM public.list_invitations() WHERE id='{s1}';").endswith('t')

        # Expired invitations cannot be accepted or declined.
        sql(f"INSERT INTO public.invitations(email,role,token_hash,created_by,expires_at) VALUES('stranger@fixture.invalid','tester','{'4' * 64}','{OWNER}',now() - interval '1 minute');")
        assert "not valid" in as_(STRANGER, f"SELECT public.accept_invitation('{'4' * 64}');", ok=False)
        assert "not valid" in as_(STRANGER, f"SELECT public.decline_invitation('{'4' * 64}');", ok=False)

        # Role boundaries: testers can't revoke; admins can't revoke admin invites.
        a1 = invite(OWNER, "stranger@fixture.invalid", role="admin", h="5" * 64)
        as_(TESTER, f"SELECT public.revoke_invitation('{a1}');", ok=False)
        as_(ADMIN, f"SELECT public.revoke_invitation('{a1}');", ok=False)

        # Removal: invitations the removed admin sent or received are closed; approvals withdrawn.
        sent = invite(ADMIN, "stranger@fixture.invalid", h="6" * 64)
        received = invite(OWNER, "admin@fixture.invalid", role="tester", h="7" * 64)
        as_(ADMIN, f"SELECT public.remove_member('{OWNER}');", ok=False)  # never the owner
        as_(ADMIN, f"SELECT public.remove_member('{ADMIN}');", ok=False)  # never yourself
        as_(OWNER, f"SELECT public.remove_member('{ADMIN}');")
        assert sql(f"SELECT count(*) FROM public.user_roles WHERE user_id='{ADMIN}';") == "0"
        assert sql(f"SELECT count(*) FROM public.invitations WHERE id IN ('{sent}','{received}') AND revoked_at IS NOT NULL;") == "2"
        assert "not valid" in as_(STRANGER, f"SELECT public.accept_invitation('{'6' * 64}');", ok=False)
        assert sql(f"SELECT ai_approved::text || studio_approved::text FROM public.beta_access WHERE user_id='{ADMIN}';") == "falsefalse"
        # The removed admin immediately loses every member capability.
        as_(ADMIN, "SELECT count(*) FROM public.list_members();", ok=False)
        as_(ADMIN, "SELECT count(*) FROM public.list_invitations();", ok=False)
        as_(ADMIN, f"SELECT public.create_invitation('x@fixture.invalid','tester', now() + interval '1 hour', '{'8' * 64}');", ok=False)
        # Second removal is refused, not silently "successful".
        assert "already removed" in as_(OWNER, f"SELECT public.remove_member('{ADMIN}');", ok=False)

        # Untouched: other members' approvals.
        assert sql(f"SELECT ai_approved::text FROM public.beta_access WHERE user_id='{TESTER}';") == "true"
        print(f"PASS: {checks} isolated SQL checks: truthful revoke, accept/revoke race, single use, invitee-only decline, expiry, role boundaries, removal closes sent/received invitations, approval withdrawal, immediate loss of member functions, repeated removal refused. No hosted fixtures.")
    finally:
        if started:
            command(["pg_ctl", "-D", str(base / "db"), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    main()
