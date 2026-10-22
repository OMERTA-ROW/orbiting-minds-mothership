"""Explicit localhost account QA with temporary accounts; no email/provider calls.

Run with --run and EVOLUTION_QA_APPROVED_BACKEND_URL matching configured Cloud.
Recovery uses an admin-generated test link/OTP, not delivered email; distinguish it
from real inbox delivery and signup confirmation acceptance. Never print secrets.
"""
import asyncio
import os
import secrets
import sys
import uuid
from pathlib import Path
import requests
from playwright.async_api import async_playwright
from qa_target import require_qa_target


async def main():
    base = require_qa_target()
    admin = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    users = []
    screenshots = Path("/tmp/browser/account-foundation")
    screenshots.mkdir(parents=True, exist_ok=True)

    def call(method, path, data=None):
        headers = {"apikey": admin, "Content-Type": "application/json", "Prefer": "return=representation"}
        if not admin.startswith("sb_"):
            headers["Authorization"] = "Bearer " + admin
        response = requests.request(method, base + path, json=data, headers=headers, timeout=30)
        if not response.ok:
            raise RuntimeError("Temporary account QA request failed (" + str(response.status_code) + ")")
        return response

    async def login(page, account, password=None):
        await page.goto("http://localhost:8080/auth", wait_until="networkidle")
        await page.get_by_label("Email", exact=True).fill(account["email"])
        await page.get_by_label("Password", exact=True).fill(password or account["password"])
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.wait_for_url("**/beta")

    async def signout(page):
        await page.get_by_role("button", name="Sign out", exact=True).click()
        await page.wait_for_url("**/auth")

    try:
        for _ in range(2):
            account = {"email": "account-foundation-" + uuid.uuid4().hex + "@example.test", "password": secrets.token_urlsafe(30)}
            response = call("POST", "/auth/v1/admin/users", {**account, "email_confirm": True})
            account["id"] = response.json()["id"]
            users.append(account)
        a, b = users
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda _error: errors.append("page error"))
            await page.goto("http://localhost:8080/reset-password?type=recovery", wait_until="networkidle")
            await page.get_by_text("Open the recovery link from your email.", exact=False).wait_for()
            if await page.get_by_role("button", name="Update password", exact=True).count():
                raise RuntimeError("URL flag alone exposed reset submission")
            print("PASS reset URL flag alone does not enable password submission")
            await login(page, a)
            name = "Foundation QA " + uuid.uuid4().hex[:8]
            await page.get_by_label("Project name", exact=True).fill(name)
            await page.get_by_label("Non-sensitive brief", exact=True).fill("Temporary session persistence check")
            await page.get_by_role("button", name="Save private project", exact=True).click()
            await page.get_by_role("heading", name=name, exact=True).wait_for()
            await signout(page)
            await login(page, a)
            await page.get_by_role("heading", name=name, exact=True).wait_for()
            print("PASS saved owner project reads back after logout and a new login")
            renewed = await page.evaluate("""async () => {
                const { supabase } = await import('/src/integrations/supabase/client.ts');
                const { data, error } = await supabase.auth.refreshSession();
                return !error && !!data.user;
            }""")
            if not renewed:
                raise RuntimeError("Explicit real session renewal failed")
            await page.reload(wait_until="networkidle")
            await page.get_by_role("heading", name=name, exact=True).wait_for()
            print("PASS actual session refresh and hard reload retain owner-scoped project")
            await signout(page)
            await login(page, b)
            if await page.get_by_role("heading", name=name, exact=True).count():
                raise RuntimeError("Other account saw prior owner project")
            print("PASS account switch does not show prior owner project")
            await signout(page)
            # Generate/verify a real temporary recovery challenge without sending mail.
            link = call("POST", "/auth/v1/admin/generate_link", {"type": "recovery", "email": a["email"], "options": {"redirect_to": "http://localhost:8080/reset-password"}}).json()
            token_hash = link.get("hashed_token") or link.get("properties", {}).get("hashed_token")
            if not token_hash:
                raise RuntimeError("Temporary recovery challenge unavailable")
            await page.goto("http://localhost:8080/reset-password", wait_until="networkidle")
            verified = await page.evaluate("""async (token_hash) => {
                const { supabase } = await import('/src/integrations/supabase/client.ts');
                const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' });
                return !error && !!data.user;
            }""", token_hash)
            if not verified:
                raise RuntimeError("Temporary recovery session verification failed")
            await page.get_by_label("New password", exact=True).wait_for()
            await page.reload(wait_until="networkidle")
            await page.screenshot(path=str(screenshots / "recovery-reload-check.png"))
            print("Recovery reload path:", page.url.split("?")[0].split("#")[0].replace("http://localhost:8080", ""))
            print("Recovery hint matches session:", await page.evaluate("""async () => { const { supabase } = await import('/src/integrations/supabase/client.ts'); const { data } = await supabase.auth.getUser(); return !!data.user && sessionStorage.getItem('evolution-password-recovery') === data.user.id; }"""))
            await page.get_by_label("New password", exact=True).wait_for()
            await page.set_viewport_size({"width": 390, "height": 1800})
            if not await page.evaluate("document.documentElement.scrollWidth <= innerWidth"):
                raise RuntimeError("Recovery page overflowed mobile viewport")
            new_password = secrets.token_urlsafe(30)
            await page.get_by_label("New password", exact=True).fill(new_password)
            await page.get_by_label("Confirm password", exact=True).fill(new_password)
            await page.get_by_role("button", name="Update password", exact=True).click()
            await page.get_by_text("Password updated. You can return to your projects.", exact=True).wait_for()
            await page.screenshot(path=str(screenshots / "recovered-mobile.png"))
            print("PASS generated recovery session survives reload and updates password on mobile; success persists")
            await signout(page)
            await login(page, a, new_password)
            await page.get_by_role("heading", name=name, exact=True).wait_for()
            await signout(page)
            print("PASS fresh login with recovered password reads back the saved project")
            await page.goto("http://localhost:8080/reset-password?type=recovery", wait_until="networkidle")
            await page.get_by_text("Open the recovery link from your email.", exact=False).wait_for()
            if errors:
                raise RuntimeError("Observed browser errors during account QA")
            print("RESULT account recovery/refresh/persistence flow passed; email delivery, signup inbox confirmation and OAuth not tested")
            await browser.close()
    finally:
        failures = []
        for account in users:
            for table, field in [("beta_agent_profiles", "owner_id"), ("beta_projects", "owner_id"), ("beta_audit", "owner_id"), ("beta_access", "user_id")]:
                try:
                    call("DELETE", "/rest/v1/" + table + "?" + field + "=eq." + account["id"])
                except Exception:
                    failures.append("temporary record cleanup failed")
            try:
                call("DELETE", "/auth/v1/admin/users/" + account["id"])
            except Exception:
                failures.append("temporary account cleanup failed")
        if failures:
            raise RuntimeError("; ".join(failures))
        print("Temporary QA accounts, projects and generated audit removed")


if __name__ == "__main__":
    if sys.argv[1:] != ["--run"]:
        raise SystemExit("Use --run with explicit backend confirmation for temporary QA.")
    asyncio.run(main())