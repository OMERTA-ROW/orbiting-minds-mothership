import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = resolve("scripts/omni-sandbox/install-staging.sh");

function runWithHostname(hostname, args = []) {
  const fakeBin = mkdtempSync(join(tmpdir(), "omni-sandbox-hostname-"));
  const hostnamePath = join(fakeBin, "hostname");
  writeFileSync(hostnamePath, `#!/bin/sh\nprintf '%s\\n' '${hostname}'\n`);
  chmodSync(hostnamePath, 0o755);

  try {
    return spawnSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      },
    });
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

test("dry-run prints the staging install plan without applying changes", () => {
  const result = runWithHostname("Omni-Staging");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /ACTION:/);
  assert.match(result.stdout, /Dry-run on host Omni-Staging/);
  assert.match(result.stdout, /omni-worker-1/);
  assert.match(result.stdout, /omni-worker-2/);
  assert.match(result.stdout, /opt\/omni-workspace/);
  assert.match(result.stdout, /omni-workspace\.slice/);
  assert.match(result.stdout, /omni-workspace@\.service/);
  assert.match(result.stdout, /AppArmor profile/);
  assert.match(result.stdout, /apparmor_parser/);
  assert.match(result.stdout, /Summary \(dry-run mode/);
});

test("--apply refuses a non-staging hostname before taking action", () => {
  const result = runWithHostname("Production", ["--apply"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing --apply on host Production/);
  assert.doesNotMatch(result.stdout, /ACTION:/);
});

test("installer excludes host-wide sysctl, firewall, and unit activation commands", () => {
  const source = readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /\bsysctl\s+-w\b/);
  assert.doesNotMatch(source, /\bufw\s+allow\b/);
  assert.doesNotMatch(source, /\bsystemctl\s+(?:enable|start)\b/);
});
