import { describe, expect, it } from "vitest";
import { initialEngine, noteProject, tick, decide, stop, resume, rollback, type Evaluator } from "@/lib/omni-enhance";

const now = "t";
const better: Evaluator = () => ({ baseline: [{ name: "a", score: 0 }], changes: ["x"], checks: [{ name: "a", score: 1 }] });
const worse: Evaluator = () => ({ baseline: [{ name: "a", score: 1 }], changes: ["x"], checks: [{ name: "a", score: 0 }] });

describe("Omni enhancement", () => {
  it("is enabled by default", () => expect(initialEngine().enabled).toBe(true));
  it("import queues work without opt-in", () => expect(noteProject(initialEngine(), "p", "h1").queue).toEqual(["p"]));
  it("passing candidate is promoted", () => expect(tick(noteProject(initialEngine(), "p", "h"), better, now).accepted.p).toBeDefined());
  it("regression fails promotion", () => {
    const s = tick(noteProject(initialEngine(), "p", "h"), worse, now);
    expect(s.candidates[0]!.state).toBe("rejected"); expect(s.accepted.p).toBeUndefined();
  });
  it("equal scores are inconclusive", () => expect(decide([{ name: "a", score: 1 }], [{ name: "a", score: 1 }])).toBe("inconclusive"));
  it("unchanged files and Omni writes do not loop", () => {
    const s = tick(noteProject(initialEngine(), "p", "h"), better, now);
    expect(noteProject(s, "p", "h").queue).toEqual([]);
    expect(noteProject(s, "p", "h2", true).queue).toEqual([]);
  });
  it("emergency stop halts and resume continues", () => {
    const s = stop(noteProject(initialEngine(), "p", "h"), now);
    expect(tick(s, better, now).queue).toEqual(["p"]);
    expect(tick(resume(s, now), better, now).queue).toEqual([]);
  });
  it("offline queues instead of running", () => expect(tick({ ...noteProject(initialEngine(), "p", "h"), offline: true }, better, now).queue).toEqual(["p"]));
  it("budget bounds work per tick", () => {
    let s = initialEngine(); for (const id of ["a", "b", "c", "d"]) s = noteProject(s, id, id);
    expect(tick(s, better, now).queue).toEqual(["d"]);
  });
  it("rollback restores original", () => expect(rollback(tick(noteProject(initialEngine(), "p", "h"), better, now), "p", now).accepted.p).toBeUndefined());
});
