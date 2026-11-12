# src/lib rules

- OMNI agent memory is owner/aal2-only, one agent per RPC call, no direct table reads, metadata-only append-only audit; no agent or Railway reads it, why: no cross-agent leakage or external-memory claims.
- The cloud shell relays only to the separate `OMNI_SANDBOX_*` service (never the Jackboy host or secret); sessions need a proof-checked passing sandbox self-test <24 h, every command waits for owner `step.decide`, and autonomy is refused server-side, why: Railway owns execution and the browser holds no credentials.
