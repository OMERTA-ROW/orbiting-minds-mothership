import { describe, expect, it } from "vitest";
import { realMoneyBetting, scorePrediction, simulateRace, verifyReplay } from "@/lib/arena";

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
});
