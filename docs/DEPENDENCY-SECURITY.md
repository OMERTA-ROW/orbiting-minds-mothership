# Dependency advisory remediation

The base dependency tree had **27 advisory entries across 11 packages**:
1 critical, 11 high, 13 moderate and 2 low. The entries included duplicate
advisories for transitive packages at different dependency paths. After
upgrading the affected direct dependencies and applying scoped overrides,
`bun audit` reports **zero vulnerabilities across 851 packages**.

| Affected package(s) | Previous affected dependency path | Fix | Runtime exposure and relevant conditions |
| --- | --- | --- | --- |
| `@vitest/mocker` (2 entries) | Vitest test runner | Vitest `4.1.12` | Test-only tooling; not part of the production server. |
| `brace-expansion` (9 entries) | ESLint/minimatch and related tooling | `1.1.21` and `5.0.12` overrides | Pattern parsing is used by development/test tools; patched in the lockfile. |
| `esbuild` (1 entry) | Older `drizzle-kit` and Vite toolchain paths | Patched affected ranges to `0.28.2`; safe `0.25.12` retained | Build/dev tooling. The reported network exposure requires an affected development server; no esbuild server runs in the deployed artifact. |
| `katex` (1 entry) | Streamdown math/mermaid rendering | `0.18.2` | KaTeX ships in the browser bundle and renders formatted content. The advisory requires existing prototype pollution; upgrade closes this extra trust-boundary risk. |
| `launch-editor` (3 entries) | Lovable/Vite developer tooling | `2.14.2` override | Development-only editor launcher, not included in the production artifact. |
| `minimatch` (1 entry) | TypeScript ESLint dependency | `11.0.1` for affected `>=7` range | Lint-time glob matching only. Legacy `3.1.5` remains outside the affected `>=7` range. |
| `nanoid` (1 entry) | Older transitive v3 path in tooling | `3.3.20` override; v6 dependency is already outside the affected range | Affected v3 path is tooling-only; the current direct v6 package is not affected. |
| `seroval` (2 entries) | TanStack Start serialization | `1.6.11` override | Included in the production server/runtime path; server-function serialization can receive request-derived data. Patched rather than assuming input is trusted. |
| `shell-quote` (1 critical entry) | Lovable development tools | `1.11.0` override | Development-tool command parsing only; the package is not part of the deployed runtime. No production command execution path was found in the audited dependency route. |
| `vite` (5 entries, including editor-launcher paths) | Build and development server | `8.1.6`; patched `launch-editor` above | Build/dev dependency. No Vite development server is used as the production listener. |
| `zod` (1 high entry) | Direct application schemas | `4.6.6` | Runtime-reachable: server functions and API inputs use these schemas. Existing schema behavior was migrated and covered by the application test suite. |

The exposure descriptions distinguish package reachability from exploitability:
an advisory in a dependency tree is not proof that its vulnerable operation
was remotely reachable. Runtime bundles were rebuilt after remediation, and
the complete application suite and Railway startup smoke tests passed. No
advisory was suppressed, no lint rule was disabled, and no production
credential or setting was changed.

The complete repository lint baseline remains separate from dependency
security: **5,902 Prettier errors and 35 warnings** remain (32 React Fast
Refresh and 3 hook-dependency warnings).
They are not dependency advisories and are not represented as passing checks.
