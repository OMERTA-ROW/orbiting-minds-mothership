"""Opt-in live owner-isolation regression, never logs tokens or credentials.

Run explicitly with --run against the configured backend. Creates and removes
two confirmed temporary QA accounts; does not alter signup confirmation settings.
Requires QA management credentials in the environment, never committed values.
"""
import os
import secrets
import sys
import uuid
import requests


def main():
    if sys.argv[1:] != ["--run"]:
        raise SystemExit("Use --run to explicitly approve temporary QA accounts.")
    base = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    admin = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    users = []
    checks = 0

    def call(method, path, data=None, token=None, privileged=False):
        credential = admin if privileged else key
        headers = {"apikey": credential, "Content-Type": "application/json", "Prefer": "return=representation"}
        if token:
            headers["Authorization"] = "Bearer " + token
        elif privileged and not admin.startswith("sb_"):
            headers["Authorization"] = "Bearer " + admin
        return requests.request(method, base + path, headers=headers, json=data, timeout=30)

    def check(name, condition):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name)

    try:
        for _ in range(2):
            email = "evolution-isolation-" + uuid.uuid4().hex + "@example.test"
            password = secrets.token_urlsafe(30)
            r = call("POST", "/auth/v1/admin/users", {"email": email, "password": password, "email_confirm": True}, privileged=True)
            if not r.ok:
                raise RuntimeError("QA account creation denied: " + str(r.status_code))
            user = {"id": r.json()["id"]}
            users.append(user)
            session = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password})
            if not session.ok:
                raise RuntimeError("QA sign-in denied: " + str(session.status_code))
            user["token"] = session.json()["access_token"]
        a, b = users
        p = call("POST", "/rest/v1/beta_projects", {"name": "Isolation QA project", "brief": "Temporary non-sensitive record"}, a["token"])
        check("owner creates project", p.status_code == 201)
        project = p.json()[0]["id"]
        path = "/rest/v1/beta_projects?id=eq." + project
        check("owner reads own project", len(call("GET", path, token=a["token"]).json()) == 1)
        check("other account cannot read project", call("GET", path, token=b["token"]).json() == [])
        check("other account cannot update project", call("PATCH", path, {"name": "Forbidden"}, b["token"]).json() == [])
        check("other account cannot delete project", call("DELETE", path, token=b["token"]).json() == [])
        check("owner spoof insert denied", call("POST", "/rest/v1/beta_projects", {"name": "Spoof", "owner_id": a["id"]}, b["token"]).status_code == 403)
        body = {"project_id": project, "name": "QA declared agent", "provider": "Unconnected", "model": "Unconnected", "operator_consent": True}
        agent = call("POST", "/rest/v1/beta_agent_profiles", body, a["token"])
        check("owner creates declaration", agent.status_code == 201)
        agent_path = "/rest/v1/beta_agent_profiles?id=eq." + agent.json()[0]["id"]
        check("other account cannot read agent", call("GET", agent_path, token=b["token"]).json() == [])
        check("other account cannot update agent", call("PATCH", agent_path, {"status": "Revoked"}, b["token"]).json() == [])
        check("other account cannot delete agent", call("DELETE", agent_path, token=b["token"]).json() == [])
        check("cross-owner project attachment denied", call("POST", "/rest/v1/beta_agent_profiles", {**body, "owner_id": b["id"]}, b["token"]).status_code >= 400)
        check("verified status denied", call("POST", "/rest/v1/beta_agent_profiles", {**body, "status": "Verified"}, a["token"]).status_code >= 400)
        check("missing operator consent denied", call("POST", "/rest/v1/beta_agent_profiles", {**body, "operator_consent": False}, a["token"]).status_code >= 400)
        access = "/rest/v1/beta_access?user_id=eq." + a["id"]
        check("self AI approval denied", call("PATCH", access, {"ai_approved": True}, a["token"]).status_code == 403)
        check("owner pause allowed", call("PATCH", access, {"paused": True}, a["token"]).ok)
        check("other account pause denied", call("PATCH", access, {"paused": False}, b["token"]).json() == [])
        access_audit = call("GET", "/rest/v1/beta_audit?capability=eq.beta_access", token=a["token"]).json()
        check("access initialization and owner pause generate audit", len(access_audit) == 2 and {r["action"] for r in access_audit} == {"INSERT", "UPDATE"})
        check("access audit hidden from other owner", call("GET", "/rest/v1/beta_audit?capability=eq.beta_access&owner_id=eq." + a["id"], token=b["token"]).json() == [])
        audit = "/rest/v1/beta_audit?owner_id=eq." + a["id"]
        check("database audit generated", len(call("GET", audit, token=a["token"]).json()) >= 2)
        check("other account audit hidden", call("GET", audit, token=b["token"]).json() == [])
        check("audit forge insert denied", call("POST", "/rest/v1/beta_audit", {"owner_id": a["id"], "record_id": project, "capability": "fake", "action": "INSERT"}, a["token"]).status_code == 403)
        check("audit forge update denied", call("PATCH", audit, {"action": "DELETE"}, a["token"]).status_code == 403)
        check("anonymous projects denied", call("GET", "/rest/v1/beta_projects").status_code in (401, 403))
        check("anonymous agents denied", call("GET", "/rest/v1/beta_agent_profiles").status_code in (401, 403))
        check("forged bearer denied", call("GET", "/rest/v1/beta_projects", token="invalid-qa-token").status_code == 401)
        print("RESULT", checks, "live checks passed")
    finally:
        for u in users:
            for table, field in [("beta_agent_profiles", "owner_id"), ("beta_projects", "owner_id"), ("beta_audit", "owner_id"), ("beta_access", "user_id")]:
                r = call("DELETE", "/rest/v1/" + table + "?" + field + "=eq." + u["id"], privileged=True)
                if not r.ok:
                    print("QA cleanup failed:", table, r.status_code)
            r = call("DELETE", "/auth/v1/admin/users/" + u["id"], privileged=True)
            if not r.ok:
                print("QA account cleanup failed:", r.status_code)


if __name__ == "__main__":
    main()