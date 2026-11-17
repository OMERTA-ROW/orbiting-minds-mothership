# Genesis Historical Code Brain — Evolution Backend Foundation

Status: **architecture committed for implementation; no live agents or consciousness claims**.
Owner direction: integrate Project Genesis with Evolution's backend intelligence, separately from OmniForge's creative Genesis Mode.

## Concept
- **Agents = atoms**: independent identities, goals, memory namespaces and bounded tool capabilities.
- **Interactions = bonds**: typed messages with provenance, confidence, consent and audit.
- **Communities = molecules**: temporary collaborations with defined tasks, evaluation and lifecycle.
- **Genesis Core**: simulation scheduler, event sourcing, reproducible experiments, individual self-models, planning, reflection and uncertainty reporting.
- **Historical Code Deep Well**: versioned, curated programming knowledge and lineage graph, retrievable by agents with citations and test evidence. It is a reference and learning system, not executable trusted code by default.

## Historical code ingestion
1. Start with public, legally usable primary sources: language specifications, official documentation, compiler histories, standards, and appropriately licensed source repositories.
2. Record each item's language, era, author/project attribution where known, source URL, retrieved date, license, content hash, version, and trust classification.
3. Represent **lineage** as a graph: predecessor, successor, influence, alternative, deprecation, vulnerability, and compatibility; distinguish documented lineage from inference.
4. Parse and index in a no-execution environment. Scan licenses, secrets, malware indicators, and dependency risks. Historical examples are never silently promoted into production code.
5. Allow an agent to ask *why* a pattern exists, compare historical and modern implementations, propose a safer adaptation, and produce a reproducible test. Require provenance and verified results before labeling a lesson reliable.
6. Separate immutable source records, agent hypotheses, verified lessons, and owner-approved reusable packages. Retain correction history.

## Backend interfaces (proposed)
- `genesis.agent.create(profile)`: identity, scoped goals, private memory namespace and budget.
- `genesis.experiment.run(spec, seed, days)`: isolated deterministic simulation, event log and metrics.
- `deepwell.search(query, filters)`: returns provenance-rich source excerpts and confidence.
- `deepwell.propose(entry)`: stages a lesson for validation; no direct trusted-write.
- `deepwell.verify(entry_id, evidence)`: test, review, version, rollback and audit.
- `genesis.evaluate(run_id)`: compare against stateless/scripted baselines.

## First experiment
Create three distinct **simulated** agents: Archivist (code lineage), Builder (implementation proposals), and Skeptic (testing and uncertainty). Run 100 simulated days of tasks: research an old algorithm, compare to a modern implementation, produce a testable improvement, and record disagreements/corrections. Measure factual grounding, successful tests, cooperation, retained learning, hallucination rate, cost and safety violations. No metric proves subjective consciousness.

## Integration with OMNI / Jackboy
- OMNI coordinates experiments and agent dispatch; keep agent intelligence namespaces isolated.
- Jackboy remains the authorization and safety boundary for execution. Do not override emergency stop, spend caps, isolation, permits, owner approval or existing activation steps.
- The Deep Well must not expose secrets, private Vault records or copyrighted source beyond permitted licenses.
- Build on a review branch; require tests, owner review and separate deployment authorization.
- UI should distinguish *documented*, *implemented*, *simulated*, *live verified*.

## Implementation acceptance
- Three isolated agent profiles and a reproducible simulation runner with trace logs.
- Deep Well source metadata, license/provenance enforcement, review queue and version history.
- Retrieval responses cite sources; historical code remains non-executable until reviewed.
- 100-day evaluation report against baseline, including failure cases.
- No production deployment or claims of consciousness until supported by actual evidence; subjective consciousness is not currently verifiable.

## Next engineering work
Inspect existing agent-intelligence foundation and backend schema; map real interfaces before adding tables or routes. Build tests first, then open a PR. Keep the original creative Genesis Mode intact.
