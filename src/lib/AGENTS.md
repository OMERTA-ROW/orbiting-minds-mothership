# src/lib rules

- OMNI agent memory is owner/aal2-only, one agent per RPC call, no direct table reads, metadata-only append-only audit; no agent or Railway reads it, why: no cross-agent leakage or external-memory claims.
