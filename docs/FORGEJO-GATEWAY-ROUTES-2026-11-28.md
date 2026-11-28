# Forgejo gateway route additions (owner action, not deployed)

Diagnosis (2026-11-28):
- Branches for `omniblock/jackboy-dev-control` returned HTTP 404 because the Omni-Staging gateway only allows `GET /api/v1/user/repos`. The app now refuses Forgejo feature reads without sending a request until each route is enabled.
- Two-step sign-in reaches the server through the session token's `aal` claim. Repository pages now show the session state the server actually sees. If it doesn't say "two-step verified" right after you enter a code, sign out and back in with your code.
- Writes are unavailable by design. The gateway is GET-only and no reviewed mutation contract or per-repository grant exists. Two-step sign-in never grants writes on its own.

## Exact GET routes to allowlist (read-only, owner/repo path params only)
- GET /api/v1/repos/{owner}/{repo}/branches
- GET /api/v1/repos/{owner}/{repo}/commits
- GET /api/v1/repos/{owner}/{repo}/pulls
- GET /api/v1/repos/{owner}/{repo}/issues
- GET /api/v1/repos/{owner}/{repo}/releases
- GET /api/v1/repos/{owner}/{repo}/actions/runs

Restrict `{owner}`/`{repo}` to `[A-Za-z0-9_.-]+`. Allow only the `page` and `limit` query parameters, with limit capped at 50. Keep every other method and path refused. Keep Forgejo bound to localhost behind Cloudflare Access.

## Owner steps
1. Add the routes above to the gateway's allowlist on Omni-Staging and reload the gateway.
2. Check each route with the existing service token: `curl` one route and confirm HTTP 200 and a JSON array.
3. In Project Settings → Secrets, add `FORGEJO_GATEWAY_READ_ROUTES` set to the features you enabled, for example `branches,commits,pull-requests,issues,releases,actions`.
4. Open Branches in Evolution, pick a repository, then press "Read records".
