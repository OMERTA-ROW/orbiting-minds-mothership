# OMNI repository → Mothership Fusion intake

Status: **integration preparation only; not a live connection**.

## Verified source boundaries (2026-11-19)
- Source: `OMERTA-ROW/Omni` (`main`). Its README says the Evolution CLI was **copied from the Mothership Lovable project**; it is an unreleased, primarily offline CLI. The optional `omni` alias is not AI connectivity.
- Destination: `OMERTA-ROW/orbiting-minds-mothership` (`main`). It already contains `cli/internal/companion/` and the existing `docs/OMNI-BACKEND-CONTRACT.md`.
- Both repositories contain `cli/internal/companion/project.go`, with different blob hashes. Do **not** copy the source repository over the destination or treat a cross-repository PR as an ordinary branch merge.
- The existing backend contract records that the Mothership-to-Railway signed handshake was not verified as of its November 12 audit, and the reference sandbox service was not deployed. These facts require fresh runtime verification.

## Integration work for the next code PR
1. Inventory the Omni source tree and compare each overlapping CLI, inbox, terminal, and service path against the destination. Identify unique features, divergence, tests, and migration dependencies.
2. Import only missing, compatible components under explicit ownership, preserving existing Mothership code and Lovable Git sync. No force push, repository replacement, or new production service.
3. Adapt configuration and signed API contracts without placing secrets in frontend code. Preserve owner-only auth, explicit approvals, Emergency Stop, spend caps, and off-by-default autonomous execution.
4. Add contract tests for authentication, nonce replay rejection, handshake, job dispatch/status/cancel, failure recovery, and frontend-to-backend task visibility.
5. Run builds and tests for the touched Go/Node packages. Obtain owner review before merging or deploying; test live connections separately with approved credentials.

## Acceptance
- The imported component and its source commit are documented.
- A real owner-authorized UI request reaches a verified backend and returns an auditable result.
- No claim of operational Fusion, agent autonomy, isolated execution, or Lovable connectivity without successful end-to-end tests.
- Original `OMERTA-ROW/Omni` repository remains intact.
