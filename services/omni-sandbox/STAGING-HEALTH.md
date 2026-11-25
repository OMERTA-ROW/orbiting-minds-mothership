# Quarantined workspace health on staging

This is a health-only staging procedure, not authorization to deploy, enable
workspace execution, release Emergency Stop or enable Autonomous Mode.
Obtain separate owner authorization before changing the staging host. Do not
use a production host, credentials, database or service. The bounded executor
and its isolation test are separate and do not certify this service.

The quarantined service has a bubblewrap command path, but refuses session
and command admission and still uses its historical launcher for the health probe.
Its signed evidence must report `bubblewrapActive: false` and
`persistence: "unverified"`. The packaged non-root host intentionally does
not run the historical root-only probe; `nonRootObserved` is false and
`observedLimits` and `observedNamespaces` are null. A passing self-test or
execution is not expected. When that historical probe is available, namespace
booleans compare the child with the service process; they do not prove
aggregate limits, process cleanup or confinement.

## Separate supervisor diagnostic

`tests/omni-workspace-linux.test.mjs` directly exercises the experimental
bubblewrap supervisor; it does not call the serving workspace endpoint or
remove its execution quarantine. Run it only on a dedicated, idle Linux
staging host after separate owner authorization. It needs Node 22.13 or newer,
`bwrap`, Python 3 and an already provisioned delegated cgroup v2 with CPU,
memory and PID controllers enabled. Use a dedicated non-root staging identity
and an otherwise unused parent cgroup named `omni-workspace-diagnostic`;
see `HOST-SETUP.md` for delegation and confinement prerequisites. Do not
weaken AppArmor or host security controls to force a pass.

From the exact reviewed checkout, with `DIAGNOSTIC_CGROUP` set to the absolute
path of that dedicated parent:

```bash
OMNI_WORKSPACE_ISOLATION_TEST=true \
  OMNI_WORKSPACE_TEST_CGROUP="$DIAGNOSTIC_CGROUP" \
  node --test tests/omni-workspace-linux.test.mjs
```

For this revision expect five passes; the original `207704b` diagnostic has four.
The deadline test invokes Stop from the test harness. The session-workspace
test exercises the command lifecycle directly, not the serving endpoint. A
passing result does not establish durable storage, renewable authority,
serving-runtime containment, or approval to deploy or execute.

## Preparation

Use an idle, dedicated Linux staging VM. Review `HOST-SETUP.md`, including
systemd, Node 22.13+, cgroup v2 delegation and worker identity prerequisites.
Verify port 18080 is unused. The steps below reserve a new `omni-worker-1`
identity, `/opt/omni-workspace`, `/etc/omni-workspace` and
`/var/lib/omni-workspace-1`; stop if any already exist rather than overwriting
an existing installation or state. Provision a separate synthetic HMAC secret
through the owner's approved secret process.

On the staging VM, check out the exact reviewed PR commit into a new temporary
directory and verify it:

```bash
REVISION='<reviewed-commit-sha>'
CHECKOUT="$(mktemp -d)"
git clone --no-checkout https://github.com/OMERTA-ROW/orbiting-minds-mothership.git "$CHECKOUT/repo"
git -C "$CHECKOUT/repo" checkout --detach "$REVISION"
git -C "$CHECKOUT/repo" rev-parse HEAD
```

After separate staging deployment approval, reserve the identity and install
the quarantined worker and slice from that checkout:

```bash
(
  set -eu
  if getent passwd omni-worker-1 || getent group omni-worker-1 ||
    [ -e /opt/omni-workspace ] || [ -e /etc/omni-workspace ] ||
    [ -e /var/lib/omni-workspace-1 ] || [ -e /etc/systemd/system/omni-workspace.slice ] ||
    [ -e /etc/systemd/system/omni-workspace@.service ]; then
    echo 'Staging identity, files or state already exist; stop.' >&2
    exit 1
  fi
  sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin omni-worker-1
  sudo install -d -o root -g root -m 0755 /opt/omni-workspace/services
  sudo cp -R "$CHECKOUT/repo/services/omni-sandbox" /opt/omni-workspace/services/
  sudo install -d -o root -g root -m 0700 /etc/omni-workspace
  sudo install -o root -g root -m 0644 "$CHECKOUT/repo/services/omni-sandbox/systemd/omni-workspace.slice" /etc/systemd/system/
  sudo install -o root -g root -m 0644 "$CHECKOUT/repo/services/omni-sandbox/systemd/omni-workspace@.service" /etc/systemd/system/
)
```

Create `/etc/omni-workspace/worker-1.env`, owned by root with mode `0600`,
using the approved secret process. Supply exactly these staging values, with
an independently generated secret of at least 32 characters:

```text
PORT=18080
OMNI_SANDBOX_CLIENT_ID=mothership-test
OMNI_SANDBOX_PROJECT_ID=omni
OMNI_SANDBOX_HMAC_SECRET=<independent-staging-secret>
```

Do not set provider keys, repository credentials or network escape hatches.
The packaged unit creates and retains the private state directory. Keep it
intact across restarts and rollbacks; do not reuse or delete a replay database.
Start the unit only after verifying the file and host prerequisites:

```bash
sudo systemctl daemon-reload
sudo systemctl start omni-workspace@1.service
sudo systemctl status --no-pager omni-workspace@1.service
```

It listens on loopback only. Do not expose it publicly or configure the
Mothership production switch. `/healthz` alone does not verify the signed link.

## Signed health check

Run this locally on the staging host. It reads the protected staging secret
without printing it and verifies the response HMAC and request nonce before
printing the health object:

```bash
sudo /usr/bin/node --input-type=module <<'NODE'
import fs from "node:fs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const env = Object.fromEntries(fs.readFileSync("/etc/omni-workspace/worker-1.env", "utf8")
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const secret = env.OMNI_SANDBOX_HMAC_SECRET;
if (!secret || env.OMNI_SANDBOX_CLIENT_ID !== "mothership-test" || env.OMNI_SANDBOX_PROJECT_ID !== "omni")
  throw new Error("Staging credentials or project are invalid");
const route = "/api/public/omni/workspace";
const nonce = randomBytes(16).toString("hex");
const timestamp = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ action: "health.check", projectId: "omni" });
const hash = createHash("sha256").update(body).digest("hex");
const mac = (message) => createHmac("sha256", secret).update(message).digest("hex");
const signature = mac(`omni.workspace/v1\nPOST\n${route}\n${timestamp}\n${nonce}\n${hash}`);
const response = await fetch(`http://127.0.0.1:18080${route}`, {
  method: "POST", body,
  headers: { "content-type": "application/json", "x-omni-client": env.OMNI_SANDBOX_CLIENT_ID,
    "x-omni-timestamp": timestamp, "x-omni-nonce": nonce, "x-omni-signature": signature },
  signal: AbortSignal.timeout(5000), redirect: "error",
});
const text = await response.text();
const proof = Buffer.from(response.headers.get("x-omni-proof") ?? "");
const expected = Buffer.from(mac(`omni.workspace/v1\nresponse\n${nonce}\n${response.status}\n${text}`));
if (response.status !== 200 || proof.length !== expected.length || !timingSafeEqual(proof, expected))
  throw new Error("Signed health verification failed");
const reply = JSON.parse(text);
if (reply.contract !== "omni.workspace/v1" || reply.requestNonce !== nonce || !reply.health)
  throw new Error("Invalid health response");
console.log(JSON.stringify(reply.health, null, 2));
NODE
```

`pathSha256` hashes the canonical SQLite filename; compare it locally without
printing the private filename:

```bash
sudo sh -c 'printf %s "$(realpath /var/lib/omni-workspace-1/.state/nonces.sqlite)" | sha256sum'
```

`stateFile` compares the current file identity with the file opened at
startup; a mismatch or inaccessible path makes the reboot observation
unavailable. `filesystem` is a best-effort kernel filesystem type, not a
persistence guarantee. The reboot
observation records only that this same machine and canonical path retained a
marker written by this version across a different boot. It does not prove a
specific nonce survived, future durability, volume locking, or flush behavior.
An actual reboot/replay test needs separate owner approval and a fresh,
independently signed request. Do not reset the database to repeat a test.

Stop the service with `sudo systemctl stop omni-workspace@1.service` when the
staging check is finished. Preserve its state and do not deploy, migrate or
activate anything in production.
