/** Default-on enhancement loop (browser model). Candidates are metadata checks only; no AI, upload or file writes. */
export type Check = { name: string; score: number };
export type Candidate = {
  id: string;
  projectId: string;
  basis: string;
  changes: string[];
  checks: Check[];
  state: "queued" | "promoted" | "rejected" | "inconclusive";
};
export type EngineState = {
  enabled: true;
  stopped: boolean;
  offline: boolean;
  budgetPerTick: number;
  accepted: Record<string, { basis: string; checks: Check[] }>;
  seen: Record<string, string>;
  queue: string[];
  candidates: Candidate[];
  log: string[];
};

export const initialEngine = (): EngineState => ({
  enabled: true,
  stopped: false,
  offline: false,
  budgetPerTick: 3,
  accepted: {},
  seen: {},
  queue: [],
  candidates: [],
  log: ["Enhancement enabled by default on first launch."],
});

/** Enqueue only when a project's content fingerprint changed and the change was not Omni's own write. */
export function noteProject(
  s: EngineState,
  projectId: string,
  fingerprint: string,
  byOmni = false,
): EngineState {
  if (byOmni || s.seen[projectId] === fingerprint || s.queue.includes(projectId)) return s;
  return { ...s, seen: { ...s.seen, [projectId]: fingerprint }, queue: [...s.queue, projectId] };
}

/** Promotion requires every check ≥ baseline and at least one strictly better. */
export function decide(baseline: Check[], checks: Check[]): Candidate["state"] {
  const b = Object.fromEntries(baseline.map((c) => [c.name, c.score]));
  if (checks.some((c) => b[c.name] !== undefined && c.score < b[c.name]!)) return "rejected";
  return checks.some((c) => c.score > (b[c.name] ?? -Infinity)) ? "promoted" : "inconclusive";
}

export type Evaluator = (projectId: string) => {
  baseline: Check[];
  changes: string[];
  checks: Check[];
};

export function tick(s: EngineState, evaluate: Evaluator, now: string): EngineState {
  if (s.stopped || s.offline || !s.queue.length) return s;
  const take = s.queue.slice(0, s.budgetPerTick);
  let next: EngineState = { ...s, queue: s.queue.slice(take.length) };
  for (const id of take) {
    const { baseline, changes, checks } = evaluate(id);
    const base = next.accepted[id]?.checks ?? baseline;
    const state = decide(base, checks);
    const c: Candidate = {
      id: `${id}:${next.candidates.length}`,
      projectId: id,
      basis: next.seen[id] ?? "",
      changes,
      checks,
      state,
    };
    next = {
      ...next,
      candidates: [...next.candidates, c],
      log: [...next.log, `${now} ${id}: ${state}`],
    };
    if (state === "promoted")
      next = { ...next, accepted: { ...next.accepted, [id]: { basis: c.basis, checks } } };
  }
  return next;
}

export const stop = (s: EngineState, now: string): EngineState => ({
  ...s,
  stopped: true,
  log: [...s.log, `${now} emergency stop`],
});
export const resume = (s: EngineState, now: string): EngineState => ({
  ...s,
  stopped: false,
  log: [...s.log, `${now} resumed`],
});
export function rollback(s: EngineState, projectId: string, now: string): EngineState {
  const { [projectId]: _, ...accepted } = s.accepted;
  return {
    ...s,
    accepted,
    log: [...s.log, `${now} ${projectId}: rolled back to imported original`],
  };
}

/** Browser evaluator: honest metadata completeness checks over the intake record. */
export function metadataChecks(
  files: { path: string }[],
  category: string,
): { baseline: Check[]; changes: string[]; checks: Check[] } {
  const has = (re: RegExp) => files.some((f) => re.test(f.path));
  const baseline: Check[] = [
    { name: "readme", score: has(/readme/i) ? 1 : 0 },
    { name: "categorised", score: category === "Inbox" ? 0 : 1 },
    { name: "license", score: has(/licen[cs]e/i) ? 1 : 0 },
  ];
  const changes = baseline
    .filter((c) => !c.score)
    .map((c) => `Propose ${c.name} (draft only, not written to disk)`);
  return {
    baseline,
    changes,
    checks: baseline.map((c) => ({ ...c, score: c.score || (c.name === "categorised" ? 0 : 1) })),
  };
}
