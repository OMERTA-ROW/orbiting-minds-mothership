"""Opt-in hosted private-media regression. Run with --run.

Uses environment-only QA management credentials and two temporary accounts.
Never prints secrets. Removes files, records and accounts in finally.
"""
import io
import os
import secrets
import sys
import uuid
import wave
import requests


def main():
    if sys.argv[1:] != ["--run"]:
        raise SystemExit("Use --run for temporary hosted media QA.")
    base = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    admin = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    users = []
    checks = 0

    def call(method, path, data=None, token=None, privileged=False, binary=None, mime="audio/wav", overwrite=False):
        credential = admin if privileged else key
        headers = {"apikey": credential, "Content-Type": mime if binary is not None else "application/json", "Prefer": "return=representation"}
        if token:
            headers["Authorization"] = "Bearer " + token
        elif privileged and not admin.startswith("sb_"):
            headers["Authorization"] = "Bearer " + admin
        if overwrite:
            headers["x-upsert"] = "true"
        return requests.request(method, base + path, headers=headers, json=data if binary is None else None, data=binary, timeout=30)

    def check(name, condition):
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name)

    def denied(response):
        return response.status_code >= 400

    try:
        for _ in range(2):
            email = "quantum-isolation-" + uuid.uuid4().hex + "@example.test"
            password = secrets.token_urlsafe(30)
            created = call("POST", "/auth/v1/admin/users", {"email": email, "password": password, "email_confirm": True}, privileged=True)
            if not created.ok:
                raise RuntimeError("QA account creation denied")
            user = {"id": created.json()["id"]}
            users.append(user)
            session = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": password})
            if not session.ok:
                raise RuntimeError("QA login denied")
            user["token"] = session.json()["access_token"]
        a, b = users
        project = call("POST", "/rest/v1/beta_projects", {"name": "Media isolation QA"}, a["token"]).json()[0]["id"]
        body = {"project_id": project, "role": "original", "byte_size": 46, "rights_consent": True, "privacy_consent": True}
        check("default-deny media upload reservation", denied(call("POST", "/rest/v1/studio_assets", body, a["token"])))
        check("self media approval denied", denied(call("PATCH", "/rest/v1/beta_access?user_id=eq." + a["id"], {"studio_approved": True}, a["token"])))
        for user in users:
            approved = call("PATCH", "/rest/v1/beta_access?user_id=eq." + user["id"], {"studio_approved": True}, privileged=True)
            if not approved.ok:
                raise RuntimeError("Temporary media QA approval failed")
        saved = call("POST", "/rest/v1/studio_assets", body, a["token"])
        check("approved owner reservation", saved.status_code == 201)
        asset = saved.json()[0]["id"]
        record = "/rest/v1/studio_assets?id=eq." + asset
        path = a["id"] + "/" + asset + "/audio.wav"
        storage = "/storage/v1/object/quantum-studio/" + path
        stream = io.BytesIO()
        with wave.open(stream, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(b"\xe8\x03")
        audio = stream.getvalue()
        check("owner private upload", call("POST", storage, token=a["token"], binary=audio).ok)
        check("owner authenticated audio read", call("GET", storage, token=a["token"]).content == audio)
        check("other-owner metadata hidden", call("GET", record, token=b["token"]).json() == [])
        check("other-owner audio read denied", denied(call("GET", storage, token=b["token"])))
        check("anonymous audio read denied", denied(call("GET", storage)))
        check("anonymous public-url read denied", denied(call("GET", "/storage/v1/object/public/quantum-studio/" + path)))
        check("forged bearer read denied", denied(call("GET", storage, token="invalid-token")))
        check("other-owner delete has no effect", call("DELETE", record, token=b["token"]).json() == [])
        call("DELETE", "/storage/v1/object/quantum-studio", {"prefixes": [path]}, b["token"])
        check("other-owner storage delete has no effect", call("GET", storage, token=a["token"]).content == audio)
        check("other-owner upload path denied", denied(call("POST", storage, token=b["token"], binary=audio, overwrite=True)))
        check("owner overwrite original denied", denied(call("POST", storage, token=a["token"], binary=audio, overwrite=True)))
        check("immutable media metadata", denied(call("PATCH", record, {"sha256": "a" * 64}, a["token"])))
        check("spoofed owner reservation denied", denied(call("POST", "/rest/v1/studio_assets", {**body, "owner_id": a["id"]}, b["token"])))
        check("cross-owner project attachment denied", denied(call("POST", "/rest/v1/studio_assets", body, b["token"])))
        check("missing rights consent denied", denied(call("POST", "/rest/v1/studio_assets", {**body, "rights_consent": False}, a["token"])))
        check("missing file consent denied", denied(call("POST", "/rest/v1/studio_assets", {**body, "privacy_consent": False}, a["token"])))
        check("oversize reservation denied", denied(call("POST", "/rest/v1/studio_assets", {**body, "byte_size": 4194305}, a["token"])))
        check("unreserved path upload denied", denied(call("POST", "/storage/v1/object/quantum-studio/" + a["id"] + "/" + str(uuid.uuid4()) + "/audio.wav", token=a["token"], binary=audio)))
        for _ in range(7):
            check("bounded reservation slot", call("POST", "/rest/v1/studio_assets", body, a["token"]).status_code == 201)
        check("ninth reservation denied", denied(call("POST", "/rest/v1/studio_assets", body, a["token"])))
        empty_asset = call("GET", "/rest/v1/studio_assets?owner_id=eq." + a["id"] + "&id=neq." + asset, token=a["token"]).json()[0]["id"]
        empty_path = "/storage/v1/object/quantum-studio/" + a["id"] + "/" + empty_asset + "/audio.wav"
        check("non-WAV MIME denied by bucket", denied(call("POST", empty_path, token=a["token"], binary=audio, mime="text/html")))
        check("oversized file denied by bucket", denied(call("POST", empty_path, token=a["token"], binary=b"x" * 4194305)))
        check("project deletion blocks media orphans", denied(call("DELETE", "/rest/v1/beta_projects?id=eq." + project, token=a["token"])))
        call("PATCH", "/rest/v1/beta_access?user_id=eq." + a["id"], {"paused": True}, a["token"])
        check("paused account read/recovery allowed", call("GET", storage, token=a["token"]).content == audio)
        check("paused account upload denied", denied(call("POST", empty_path, token=a["token"], binary=audio)))
        audit = call("GET", "/rest/v1/beta_audit?capability=eq.studio_assets", token=a["token"])
        check("database change audit recorded", len(audit.json()) == 8)
        check("cross-account audit hidden", call("GET", "/rest/v1/beta_audit?capability=eq.studio_assets", token=b["token"]).json() == [])
        print("RESULT", checks, "hosted private-media checks passed")
    finally:
        for user in users:
            assets = call("GET", "/rest/v1/studio_assets?owner_id=eq." + user["id"], privileged=True)
            if not assets.ok:
                raise RuntimeError("QA file listing cleanup failed")
            paths = [user["id"] + "/" + asset["id"] + "/audio.wav" for asset in assets.json()]
            if paths:
                if not call("DELETE", "/storage/v1/object/quantum-studio", {"prefixes": paths}, privileged=True).ok:
                    raise RuntimeError("QA file cleanup failed")
            for role in ["enhanced", "original"]:
                if not call("DELETE", "/rest/v1/studio_assets?owner_id=eq." + user["id"] + "&role=eq." + role, privileged=True).ok:
                    raise RuntimeError("QA media metadata cleanup failed")
            for table, field in [("beta_agent_profiles", "owner_id"), ("beta_projects", "owner_id"), ("beta_audit", "owner_id"), ("beta_access", "user_id")]:
                if not call("DELETE", "/rest/v1/" + table + "?" + field + "=eq." + user["id"], privileged=True).ok:
                    raise RuntimeError("QA record cleanup failed")
            if not call("DELETE", "/auth/v1/admin/users/" + user["id"], privileged=True).ok:
                raise RuntimeError("QA account cleanup failed")
        print("Temporary QA media and accounts removed")


if __name__ == "__main__":
    main()