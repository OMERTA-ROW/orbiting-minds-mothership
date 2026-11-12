# src/lib rules

- OMNI agent memory is owner/aal2-only, one agent per RPC call, no direct table reads, metadata-only append-only audit; no agent or Railway reads it, why: no cross-agent leakage or external-memory claims.
- The cloud shell relays only to the separate `OMNI_SANDBOX_*` service (never the Jackboy host or secret); sessions need a proof-checked passing sandbox self-test <24 h, every command waits for owner `step.decide`, why: Railway owns execution and the browser holds no credentials.
- Autonomous Mode opens only when every `autonomyGates` gate passes from recorded proof-checked evidence, including a non-null reviewed `AUTONOMY_VERIFIED_RELEASE`; the database also refuses Jackboy, non-15/30/60 windows, stop/kill/paused states and ends windows on them, why: readiness must be proven live before any unattended run.
