// Evolution Racing Arena: deterministic simulated races and points-only predictions.
// Points have no monetary value, cannot be bought, redeemed or transferred.
export interface Racer {
  id: string;
  name: string;
  creator: string;
  speed: number;
  grip: number;
  consistency: number;
}
export const arenaRacers: readonly Racer[] = [
  {
    id: "aurum",
    name: "Aurum Drift",
    creator: "Sample creator A · DEMO",
    speed: 8,
    grip: 6,
    consistency: 7,
  },
  {
    id: "nebula",
    name: "Nebula Pace",
    creator: "Sample creator B · DEMO",
    speed: 7,
    grip: 8,
    consistency: 6,
  },
  {
    id: "photon",
    name: "Photon Line",
    creator: "Sample creator C · DEMO",
    speed: 9,
    grip: 5,
    consistency: 5,
  },
  {
    id: "orbit",
    name: "Orbit Steady",
    creator: "Sample creator D · DEMO",
    speed: 6,
    grip: 7,
    consistency: 9,
  },
];
export const TRACK = { laps: 3, sectorsPerLap: 4, sectorLength: 100 } as const;
export const PREDICTION_POINTS = { winner: 10, podium: 3 } as const;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SectorEvent {
  racerId: string;
  sector: number;
  time: number;
}
export interface RaceResult {
  seed: number;
  events: SectorEvent[];
  totals: { racerId: string; time: number }[];
  order: string[];
}

/** Same seed and racers always produce the same race, enabling exact replays. */
export function simulateRace(seed: number, racers: readonly Racer[] = arenaRacers): RaceResult {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("Seed must be an integer from 0 to 4294967295");
  const rand = mulberry32(seed);
  const events: SectorEvent[] = [];
  const totals = new Map(racers.map((r) => [r.id, 0]));
  const sectors = TRACK.laps * TRACK.sectorsPerLap;
  for (let s = 0; s < sectors; s++) {
    const corner = s % 2 === 1;
    for (const r of racers) {
      const base = TRACK.sectorLength / (corner ? 4 + r.grip * 0.5 : 4 + r.speed * 0.5);
      const noise = (rand() - 0.5) * (11 - r.consistency) * 0.12;
      const time = Math.round((base + noise) * 1000) / 1000;
      events.push({ racerId: r.id, sector: s, time });
      totals.set(r.id, Math.round(((totals.get(r.id) ?? 0) + time) * 1000) / 1000);
    }
  }
  const sorted = [...totals.entries()]
    .map(([racerId, time]) => ({ racerId, time }))
    .sort((a, b) => a.time - b.time || a.racerId.localeCompare(b.racerId));
  return { seed, events, totals: sorted, order: sorted.map((t) => t.racerId) };
}

export function scorePrediction(pickId: string, order: readonly string[]): number {
  const place = order.indexOf(pickId);
  if (place === 0) return PREDICTION_POINTS.winner;
  if (place > 0 && place < 3) return PREDICTION_POINTS.podium;
  return 0;
}

/** Exact numeric replay, not authentication of browser-local records. */
export function verifyReplay(result: RaceResult, racers: readonly Racer[] = arenaRacers): boolean {
  try {
    return JSON.stringify(simulateRace(result.seed, racers)) === JSON.stringify(result);
  } catch {
    return false;
  }
}

export const ARENA_KEY = "evolution-arena-v1";
export interface ArenaHistory {
  seed: number;
  pick: string;
  earned: number;
  winner: string;
}
export interface ArenaSaved {
  points: number;
  history: ArenaHistory[];
}
export function readArenaSaved(raw: string | null): ArenaSaved {
  const empty = { points: 0, history: [] };
  try {
    const v: unknown = JSON.parse(raw ?? "null");
    if (!v || typeof v !== "object") return empty;
    const state = v as Record<string, unknown>;
    if (
      !Number.isSafeInteger(state["points"]) ||
      (state["points"] as number) < 0 ||
      !Array.isArray(state["history"]) ||
      state["history"].length > 20
    )
      return empty;
    for (const h of state["history"]) {
      if (!h || typeof h !== "object") return empty;
      const r = h as Record<string, unknown>;
      if (
        typeof r["seed"] !== "number" ||
        !Number.isSafeInteger(r["seed"]) ||
        r["seed"] < 0 ||
        r["seed"] > 0xffffffff ||
        typeof r["pick"] !== "string" ||
        !arenaRacers.some((x) => x.id === r["pick"])
      )
        return empty;
      const result = simulateRace(r["seed"]);
      if (
        r["winner"] !== result.order[0] ||
        r["earned"] !== scorePrediction(r["pick"], result.order)
      )
        return empty;
    }
    return { points: state["points"] as number, history: state["history"] as ArenaHistory[] };
  } catch {
    return empty;
  }
}

export const realMoneyBetting = {
  enabled: false,
  status: "Research only: requires counsel, licensing, age/geo checks and explicit owner approval.",
} as const;

/** Standings describe only the retained local sample races, never shared telemetry. */
export function arenaStandings(history: readonly ArenaHistory[]) {
  const results = history.map((h) => simulateRace(h.seed));
  return arenaRacers.map((r) => {
    const times = results.map((result) => result.totals.find((t) => t.racerId === r.id)?.time ?? 0);
    return { id: r.id, wins: results.filter((result) => result.order[0] === r.id).length, races: results.length, averageSeconds: times.length ? times.reduce((sum, t) => sum + t, 0) / times.length : null };
  }).sort((a, b) => b.wins - a.wins || (a.averageSeconds ?? Infinity) - (b.averageSeconds ?? Infinity) || a.id.localeCompare(b.id));
}
