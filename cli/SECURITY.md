# Security and release architecture — not certification

## Current trust boundary

Core CLI contains no network client, API credential intake, telemetry,
auto-updates, background agent or elevated permissions. Owner-approved sandbox
runs execute fixed Go/npm argv in the selected local project, never a shell.
Project code/package scripts are executable and may read user-accessible files
or use the network: this is NOT container/VM isolation. The environment allowlist
does not sandbox the filesystem. Linux timeout/Ctrl-C signal only the new task's
process group and cleanup stops attached descendants; deliberately detached
descendants can escape. Other hosts retain direct-process/pipe-wait bounds only.
Unknown operations fail closed.
PATH doctor checks names without executing them.
Opt-in `discover --approve` broadens the fixed name catalog only: PATH metadata,
no content/version/configuration access, no subprocesses or network client, no paths
in output. Discovery skips relative paths, UNC paths and symlink directories/files;
tools reached only through these or outside PATH are intentionally missed. The
operator must provide a local PATH; OS-mounted remote filesystems cannot be certified
local by this source prototype. Name matches are not verified compatibility.
A local filesystem receipt is not a signature and cannot defeat an attacker
with write access to the folder.
Sandbox output is capped and synchronized, then best-effort credential-redacted
before display or saving (not streamed live). Structured tokens, auth/cookie
headers and incomplete private-key blocks are covered; unknown secrets may still
escape. Do not execute untrusted projects or rely on redaction as credential custody.
Use a private dedicated directory, never a shared/writable system binary path.
Run logs use a pre-opened Go directory handle and exclusive writes; a task replacing
the run directory is rejected. This bounds log persistence, not project execution
or bind mounts. Native ACLs, other install paths and interrupted uninstall recovery
require additional review before distribution.

## Local Guardian development increment — 2026-10-25

- Task, routing and change-manifest boundaries reload the full saved project
  profile; changed/withdrawn profiles fail closed. This is local binding, not
  authenticated owner identity or a short-lived capability. Reselection requires
  explicit operator approval and must retain the same reviewed project identity.
- Actual unknown-task/approval/binding denials, advisory routing indicators and
  task authorization/results are recorded in `.evolution/security/events.jsonl`.
  Fixed evidence contains no submitted prompts, file contents, credential values
  or paths. Existing child logs retain best-effort redaction and the 1 MiB cap.
- Security evidence uses a 0700 directory, 0600 file, exclusive directory lock,
  bounded 2 MiB append and SHA-256 previous-event chain. Audit failure blocks new
  execution; incomplete/corrupt/oversized evidence is preserved, never repaired
  automatically. An interrupted `.lock` needs owner inspection, not blind removal.
  Native Windows ACL semantics are unverified. A same-user writer can alter
  metadata/evidence, replace the chain or race path checks; there is no privileged
  service boundary or external anchor. Hashes are not signatures/immutable logs.
- `guardian audit --project <absolute-dir> --json` verifies/exports real records.
  The Guardian Development Evidence tab checks an explicitly selected export in
  memory only, with optional independently saved head; no upload/remote control.
- Literal prompt indicators are advisory, not AI classification or policy. Tests
  explicitly show a benign quote false-positive and obfuscated false-negative;
  neither changes the fixed task allowlist or grants secrets/permissions.
- No auth-failure feed, compromised-session revoke, expiring server capabilities,
  durable per-user rate limiter, remote jobs, container isolation, macOS/Windows
  descendant adapter, code-version restoration or Parrot integration exists here.
  No standard backend limiter exists; custom durable tradeoffs/quotas need explicit
  confirmation. Auth/capability/rate acceptance is not claimed by local tests.
- Interrupted local lock recovery is deliberately manual: verify the originating
  writer/task is stopped, retain the original evidence and independently stored
  head, then remove only the empty `.evolution/security/.lock` directory after
  owner review. Never remove a possibly active lock, rewrite corrupt evidence or
  delete project files. Capacity/corruption needs preserved archival and separately
  reviewed repair; this increment provides no automated repair command.
- Authorization and result evidence name the same run ID. Authorization-only
  records are outcome unknown, not execution, completion or containment proof;
  the imported owner view flags them. CANCELLED means context cancelled/signal
  requested; the tests separately observe attached descendant termination.

## Future identity / secret storage (disabled)

- Owner-approved OAuth via browser, PKCE/state, exact verified callback/origin
  and short-lived caller identity; secure session refresh/revocation.
- Use macOS Keychain, Windows Credential Manager, Linux Secret Service through
  separately audited adapters; fail closed if secure storage is unavailable.
  No plaintext fallback, command-line keys, token logging or `.env` copying.
- Backend checks real caller/project ownership and scopes on every action.
  Local preferences and unsigned records are not authenticated authorization.
- Explicit source/context selection, budget disclosure and human gates. OMNI
  is an approved model/API coordinator, not a proprietary foundation model.
  Preserve status/denial/cancellation behavior; never fabricate model replies.
- Official opt-in adapters only; each tool retains its own authorization. No
  existing toolchain config, shell startup file, alias or PATH modification.

## Future signed packages (not available)

1. Confirm owner-selected source repo and license; protect branch/release
   environments and review full commit-pinned CI actions, dependencies, SBOM,
   vulnerabilities and source provenance. Offline source archives are NOT
   distribution approval. Do not upload any artifact until owner authorizes.
2. Build/test each native OS/architecture in clean hosts and popular terminals.
   Cover help, offline failures, command/alias collisions, permissions, consent,
   running-file locks, interruptions, install/uninstall, config preservation,
   path/symlink/race abuse, update rollback and negative account/scope tests.
3. macOS: Developer ID executable/package signing, hardened-runtime review,
   notarization and stapling as appropriate; verify `codesign`/Gatekeeper on
   fresh hosts. Windows: Authenticode via approved signing custody and verify
   trust/installer ACLs on fresh hosts. Linux: signed checksums/artifact manifest
   using pinned publisher verification keys and tested distribution format.
4. Record exact source revision, target, toolchain, SBOM, digest, signature,
   signer, expiry/revocation and independently generated provenance. A checksum
   by itself never means publisher trust. Do not use self-created sample keys
   as a production signature or pretend signing credentials are available.
5. Pin signer/trust roots before first install; refuse tampering, invalid or
   expired signatures and unsupported targets. Future self-updates need an
   explicit verified manifest, proposed changes, approval, version pin and
   tested adapter-specific recovery. No automatic modifications to other tools.
6. Owner approves exact repository, packages, channel and release. Register
   verified Homebrew/WinGet identities or an optional tested npm wrapper only
   after signing and native evidence. No fake registry names, download URLs,
   curl-pipe-shell installer or public release now.

Auth, OS key stores, CI distribution, native signed release verification and
OMNI/model connectivity are **not implemented** by this source scaffold.