# OMNI cloud sandbox (reference service for Railway)

**Execution quarantined:** this reference does not establish filesystem or PID isolation,
aggregate resource limits, restart quarantine, or cancellation of
descendants that escape a process group. Its network probe and signed health reply do not prove
containment. Session creation and all work are refused; signed health and stop/end requests remain
available. Mothership also rejects historical self-test passes and keeps the workspace gate closed.
Do not deploy or enable this reference as a working sandbox.

Signed request nonces are claimed transactionally in SQLite before an action is handled. A replay
is rejected across concurrent processes and restarts **only when they use the same intact,
locking-capable persistent filesystem**. The private `.state/nonces.sqlite` database lives under
`OMNI_SANDBOX_ROOT`; use a dedicated durable volume, preserve it across restarts and rollbacks,
and never replace or clear it while old signed requests could be accepted. State loss can permit
replay, so it requires credential rotation before the service is contacted again. SQLite lock or
write failures refuse the request. Nonces are retained indefinitely to avoid making a clock change
re-enable a previously accepted request; capacity must be monitored. This replay store does not
make the in-memory sessions safe to run across replicas or provide restart recovery for jobs.
Node 22.13 or later with `node:sqlite` is required. Verify volume locking, flush semantics and
capacity on the actual serving runtime; these are not established by local tests.

Implements `omni.workspace/v1` for Mothership's cloud shell. **Not deployed by Lovable.** Copy this
folder only after the missing containment and replay guarantees have been implemented and verified.

Historical design (not currently available):

- Verifies every request: client ID, ±60 s timestamp, single-use nonce, HMAC-SHA256 signature; signs every reply (`x-omni-proof`).
- One working folder and one unprivileged Linux user per session (max 5 sessions, 10 min idle, 60 min total).
- Each command runs only after the owner approves it in Mothership (`step.decide`), with no network (user+network namespace), a scrubbed environment, CPU/memory/process/file-size limits, a wall-clock limit and an output cap. Stop kills the whole process group.
- Repository checkout from an allow-list; a draft pull request is opened only after a passkey approval. It never merges or deploys.
- Optional OpenAI and Claude adapters. Keys stay in this service; a provider shows "connected" only after its key is accepted by the provider's model list.
- Autonomy is ignored: commands always wait for approval.

## Deploy on Railway (owner steps)

The steps below are historical and insufficient for safe execution. Do not follow them until a
reviewed implementation and real Linux containment tests establish the missing guarantees above.

1. In the OMNI GitHub repository, add this folder (for example `omni-sandbox/`).
2. Railway → your project → **New service → GitHub repo** → set **Root directory** to that folder. Railway builds the `Dockerfile`.
3. Do **not** attach a database, shared variables, private networking to other services, or volumes holding secrets.
4. **Settings → Networking → Generate domain**. Note the `https://…up.railway.app` address.
5. **Variables** (this service only):

| Name                                                                      | Required   | Value                                                                                                                         |
| ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `OMNI_SANDBOX_CLIENT_ID`                                                  | yes        | e.g. `mothership`                                                                                                             |
| `OMNI_SANDBOX_HMAC_SECRET`                                                | yes        | new random value, ≥32 chars (`openssl rand -hex 32`). Not the Jackboy secret.                                                 |
| `OMNI_SANDBOX_PROJECT_ID`                                                 | no         | defaults to `omni`; must match Mothership                                                                                     |
| `OMNI_REPO_ALLOWLIST`                                                     | for GitHub | `owner/repo,owner/repo2`                                                                                                      |
| `GITHUB_TOKEN`                                                            | for GitHub | fine-grained token for **only** those repos: Contents read/write, Pull requests read/write. No admin, workflow or org scopes. |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                                          | for OpenAI | key and model name you are entitled to                                                                                        |
| `OPENAI_PRICE_IN_CENTS_PER_MTOK`, `OPENAI_PRICE_OUT_CENTS_PER_MTOK`       | for OpenAI | your model's prices in cents per million tokens (chat is refused without them)                                                |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`                                    | for Claude | key and model name                                                                                                            |
| `ANTHROPIC_PRICE_IN_CENTS_PER_MTOK`, `ANTHROPIC_PRICE_OUT_CENTS_PER_MTOK` | for Claude | prices in cents per million tokens                                                                                            |
| `OMNI_SANDBOX_COMMAND_TIMEOUT_SEC` etc.                                   | no         | limits; Mothership refuses values above its ceilings                                                                          |

6. Deploy, then open the service logs. The first line must say `network isolated`. If it says `network open`, this host cannot cut the network and Mothership's self-test will fail (by design). Do **not** set `OMNI_SANDBOX_ALLOW_NETWORK` to work around it; see the backend guide for alternatives.
7. In Lovable → Project settings → Secrets, add `OMNI_SANDBOX_ORIGIN` (the Railway address), `OMNI_SANDBOX_CLIENT_ID`, `OMNI_SANDBOX_HMAC_SECRET` (same value as step 5), optionally `OMNI_SANDBOX_PROJECT_ID`, and finally `OMNI_SANDBOX_ENABLED=true`.
8. In Mothership → OMNI Terminal → agent workspace: **Enable terminal** (passkey), **Run sandbox self-test** (passkey). It must pass before any session starts.

## Historical tests

`src/test/omni-sandbox-interop.test.ts` checks the signed fail-closed protocol using synthetic
credentials. It does not verify Linux containment.

The manually dispatched `OMNI Linux isolation` workflow builds the workspace image and runs all
11 historical execution tests against that image on disposable Linux, without bypassing the
quarantine. The local image ID and build metadata digests are printed; Docker's local exporter may
report a config digest rather than a distributable OCI manifest digest. The test container has
no network and uses only synthetic credentials; this outer network restriction means even a pass
would not independently prove per-workspace network isolation. The image test is expected to fail
while execution is quarantined. It does not cover detached descendants, aggregate limits,
owner-bound approvals, Stop races or restart recovery.

## Namespace diagnosis

On the disposable Ubuntu 22.04 GitHub-hosted VM in
[run 44799837115](https://github.com/OMERTA-ROW/orbiting-minds-mothership/actions/runs/44799837115),
unprivileged user namespaces were enabled and the following probe succeeded on the host after
dropping to UID/GID 20000:

```
setpriv --reuid=20000 --regid=20000 --clear-groups --inh-caps=-all -- \
  unshare --user --map-current-user --net -- true
```

The same probe, and a user-namespace-only probe, failed with `Operation not permitted` inside the
unprivileged image under Docker 28.0.4's default seccomp and AppArmor profiles. The container used
no added capabilities, no custom security options and `--network none`. Its effective capabilities
were empty and seccomp filter mode was active. Docker's
[28.0.4 default profile](https://github.com/moby/moby/blob/v28.0.4/profiles/seccomp/default.json)
allows `unshare` only with `CAP_SYS_ADMIN`; the default action otherwise returns an error.
This identifies a blocking default seccomp rule; the available evidence does not independently
exclude additional AppArmor or runtime restrictions.

The host probe demonstrates only that this namespace primitive is available on that VM. It does
not establish filesystem or PID isolation, cgroup delegation, aggregate resource limits, safe
cancellation or any production runtime capability. A future executor must use a reviewed runtime
that supports all required primitives without privileged containers or broad capability grants,
and must verify them on its actual serving host. Do not disable seccomp or add `CAP_SYS_ADMIN`
to make this reference pass.

## Known limits

- Disk use per session is bounded only by per-file size and the 60-minute session; Railway's disk limit applies overall.
- Sessions and jobs live in memory, and unfinished jobs are not durably quarantined on restart.
- One instance only (nonces and sessions are not shared). Do not scale replicas above 1.
