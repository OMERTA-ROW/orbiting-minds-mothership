"""Browser smoke test for every Mothership page and OMNI connection endpoint.

Usage: python3 scripts/smoke_site.py [BASE_URL]   (default http://localhost:8080)
Signed out, read-only: opens each page, records load status, runtime errors and any in-page
link that does not resolve to a route file; then calls each OMNI/Mothership endpoint without
credentials (or with an obviously invalid one) and checks the documented refusal. It never signs
in, issues credentials, creates tasks or presses Stop. Exits 1 on any failure.
"""
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent

routes = set()
for f in (ROOT / "src/routes").rglob("*.ts*"):
    m = re.search(r'createFileRoute\(\s*["\']([^"\']+)["\']', f.read_text())
    if m:
        routes.add(m.group(1).replace("/_authenticated", "").rstrip("/") or "/")
patterns = [re.compile("^" + re.sub(r"\$[A-Za-z_]+", "[^/]+", r) + "$") for r in routes]
def resolves(p):
    p = p.split("?")[0].split("#")[0].rstrip("/") or "/"
    return p in routes or any(x.match(p) for x in patterns) or p in ("/favicon.svg", "/og-home.jpg", "/robots.txt")

pages = sorted(r for r in routes if not r.startswith("/api") and "$" not in r)
BAD_KEY = "Bearer omni_invalid_smoke_test_key"
ENDPOINTS = [
    # (method, path, headers, expected status, label)
    ("GET", "/api/omni/health", {}, 401, "OMNI health · no key"),
    ("GET", "/api/omni/manifest", {}, 401, "OMNI manifest · no key"),
    ("GET", "/api/omni/manifest", {"authorization": BAD_KEY}, 401, "OMNI manifest · invalid key"),
    ("GET", "/api/omni/tasks", {}, 401, "OMNI tasks · no credential"),
    ("POST", "/api/omni/tasks", {}, 401, "OMNI held-task create · no delegation"),
    ("GET", "/api/omni/held-tasks", {}, 401, "OMNI held-task reads · no delegation"),
    ("POST", "/api/omni/chat", {}, 401, "OMNI chat · no delegation"),
    ("POST", "/api/omni/fusion/plans", {}, 401, "Fusion plan · no delegation"),
    ("POST", "/api/omni/emergency-stop", {}, 401, "OMNI Stop engage · no delegation"),
    ("POST", "/api/omni/tasks/x/approve", {}, 401, "OMNI task decision · no credential"),
    ("GET", "/api/public/omni/delegation/status", {}, 401, "Delegation status · no token"),
    ("POST", "/api/public/omni/delegation/token", {"content-type": "application/json"}, 400, "Delegation token · empty body"),
    ("POST", "/api/public/omni/delegation/revoke", {}, 401, "Delegation revoke · no token"),
    ("GET", "/api/public/approval-flow", {}, 200, "Approval-flow version marker"),
]

async def main():
    out = {"base": BASE, "pages": [], "endpoints": [], "failures": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        for path in pages:
            page = await ctx.new_page()
            errors = []
            page.on("pageerror", lambda e, errors=errors: errors.append(str(e)[:200]))
            status = None
            try:
                resp = await page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
                status = resp.status if resp else None
                await page.wait_for_timeout(1200)
                hrefs = await page.eval_on_selector_all("a[href^='/']", "as => as.map(a => a.getAttribute('href'))")
                heading = (await page.locator("h1").first.text_content(timeout=3000) or "").strip()[:60] if await page.locator("h1").count() else ""
            except Exception as e:
                hrefs, heading = [], ""
                errors.append(f"load: {str(e)[:160]}")
            broken = sorted({h for h in hrefs if not resolves(h)})
            row = {"path": path, "status": status, "h1": heading, "errors": errors, "brokenLinks": broken}
            out["pages"].append(row)
            if status != 200 or errors or broken:
                out["failures"].append(row)
            await page.close()
        for method, path, headers, want, label in ENDPOINTS:
            r = await ctx.request.fetch(BASE + path, method=method, headers=headers,
                                        data="{}" if method == "POST" else None, fail_on_status_code=False)
            try:
                body = await r.json()
            except Exception:
                body = None
            ok = r.status == want and isinstance(body, dict)
            row = {"label": label, "method": method, "path": path, "status": r.status, "expected": want,
                   "json": isinstance(body, dict), "error": (body or {}).get("error") if isinstance(body, dict) else None}
            out["endpoints"].append(row)
            if not ok:
                out["failures"].append(row)
        await browser.close()
    print(json.dumps(out, indent=1))
    sys.exit(1 if out["failures"] else 0)

asyncio.run(main())
