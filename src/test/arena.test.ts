import { describe, expect, it } from "vitest";
import { readArenaSaved, realMoneyBetting, scorePrediction, simulateRace, verifyReplay } from "@/lib/arena";

describe("Racing Arena rules", () => {
  it("replays the same seed exactly", () => {
    const r = simulateRace(4242);
    expect(simulateRace(4242).order).toEqual(r.order);
    expect(verifyReplay(r)).toBe(true);
  });
  it("detects a tampered stored result", () => {
    const r = simulateRace(7);
    expect(verifyReplay({ ...r, order: [...r.order].reverse() })).toBe(false);
  });
  it("awards 10 points for the winner, 3 for 2nd/3rd, 0 otherwise", () => {
    const order = ["a", "b", "c", "d"];
    expect([scorePrediction("a", order), scorePrediction("b", order), scorePrediction("c", order), scorePrediction("d", order)]).toEqual([10, 3, 3, 0]);
  });
  it("keeps real-money betting disabled", () => { expect(realMoneyBetting.enabled).toBe(false); });
  it("rejects modified events, racer identifiers and extra totals", () => {
    const r = simulateRace(7);
    expect(verifyReplay({ ...r, events: r.events.map((e, i) => i === 0 ? { ...e, time: e.time + 1 } : e) })).toBe(false);
    expect(verifyReplay({ ...r, totals: r.totals.map((t, i) => i === 0 ? { ...t, racerId: "forged" } : t) })).toBe(false);
    expect(verifyReplay({ ...r, totals: [...r.totals, { racerId: "extra", time: 0 }] })).toBe(false);
  });
  it("rejects seeds outside the deterministic unsigned 32-bit range", () => {
    for (const seed of [-1, 1.5, 4294967296, Infinity]) expect(() => simulateRace(seed)).toThrow();
    expect(simulateRace(4294967295).seed).toBe(4294967295);
  });
  it("rejects malformed local history instead of trusting arbitrary arrays", () => {
    for (const state of [{ points: -1, history: [] }, { points: 0, history: [null] }, { points: 0, history: [{ seed: 1, pick: "forged", earned: 10, winner: "forged" }] }]) expect(readArenaSaved(JSON.stringify(state))).toEqual({ points: 0, history: [] });
    const race = simulateRace(42), winner = race.order[0] ?? "";
    const state = { points: 10, history: [{ seed: 42, pick: winner, winner, earned: 10 }] };
    expect(readArenaSaved(JSON.stringify(state))).toEqual(state);
  });
});
