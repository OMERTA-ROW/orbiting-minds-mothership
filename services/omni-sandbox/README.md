# OMNI cloud sandbox (reference service for Railway)

Implements `omni.workspace/v1` for Mothership's cloud shell. **Not deployed by Lovable.** Copy this
folder into the OMNI GitHub repository and deploy it as a separate Railway service.

What it does:
- Verifies every request: client ID, ±60 s timestamp, single-use nonce, HMAC-SHA256 signature; signs every reply (`x-omni-proof`).
- One working folder and one unprivileged Linux user per session (max 5 sessions, 10 min idle, 60 min total).
- Each command runs only after the owner approves it in Mothership (`step.decide`), with no network (user+network namespace), a scrubbed environment, CPU/memory/process/file-size limits, a wall-clock limit and an output cap. Stop kills the whole process group.
- Repository checkout from an allow-list; a draft pull request is opened only after a passkey approval. It never merges or deploys.
- Optional OpenAI and Claude adapters. Keys stay in this service; a provider shows "connected" only after its key is accepted by the provider's model list.
- Autonomy is ignored: commands always wait for approval.

## Deploy on Railway (owner steps)

1. In the OMNI GitHub repository, add this folder (for example `omni-sandbox/`).
2. Railway → your project → **New service → GitHub repo** → set **Root directory** to that folder. Railway builds the `Dockerfile`.
3. Do **not** attach a database, shared variables, private networking to other services, or volumes holding secrets.
4. **Settings → Networking → Generate domain**. Note the `https://…up.railway.app` address.
5. **Variables** (this service only):

| Name | Required | Value |
|---|---|---|
| `OMNI_SANDBOX_CLIENT_ID` | yes | e.g. `mothership` |
| `OMNI_SANDBOX_HMAC_SECRET` | yes | new random value, ≥32 chars (`openssl rand -hex 32`). Not the Jackboy secret. |
| `OMNI_SANDBOX_PROJECT_ID` | no | defaults to `omni`; must match Mothership |
| `OMNI_REPO_ALLOWLIST` | for GitHub | `owner/repo,owner/repo2` |
| `GITHUB_TOKEN` | for GitHub | fine-grained token for **only** those repos: Contents read/write, Pull requests read/write. No admin, workflow or org scopes. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | for OpenAI | key and model name you are entitled to |
| `OPENAI_PRICE_IN_CENTS_PER_MTOK`, `OPENAI_PRICE_OUT_CENTS_PER_MTOK` | for OpenAI | your model's prices in cents per million tokens (chat is refused without them) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | for Claude | key and model name |
| `ANTHROPIC_PRICE_IN_CENTS_PER_MTOK`, `ANTHROPIC_PRICE_OUT_CENTS_PER_MTOK` | for Claude | prices in cents per million tokens |
| `OMNI_SANDBOX_COMMAND_TIMEOUT_SEC` etc. | no | limits; Mothership refuses values above its ceilings |

6. Deploy, then open the service logs. The first line must say `network isolated`. If it says `network open`, this host cannot cut the network and Mothership's self-test will fail (by design). Do **not** set `OMNI_SANDBOX_ALLOW_NETWORK` to work around it; see the backend guide for alternatives.
7. In Lovable → Project settings → Secrets, add `OMNI_SANDBOX_ORIGIN` (the Railway address), `OMNI_SANDBOX_CLIENT_ID`, `OMNI_SANDBOX_HMAC_SECRET` (same value as step 5), optionally `OMNI_SANDBOX_PROJECT_ID`, and finally `OMNI_SANDBOX_ENABLED=true`.
8. In Mothership → OMNI Terminal → agent workspace: **Enable terminal** (passkey), **Run sandbox self-test** (passkey). It must pass before any session starts.

## Test locally

```sh
sudo node server.mjs   # with the variables above; needs root to drop to per-session users
```
Mothership's `src/test/omni-sandbox-interop.test.ts` runs this service and checks the full flow.

## Known limits
- Disk use per session is bounded only by per-file size and the 60-minute session; Railway's disk limit applies overall.
- Sessions live in memory: a restart ends them (Mothership then reports "Session not found").
- One instance only (nonces and sessions are not shared). Do not scale replicas above 1.
