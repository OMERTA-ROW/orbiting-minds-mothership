import { describe, expect, it } from "vitest";
import { classify, importInto, safeRelative, recategorize, loadIntake, saveIntake, type IntakeProject } from "@/lib/omni-intake";

const now = "2026-10-25T00:00:00Z";
const empty: IntakeProject = { id: "p", name: "g", category: "Games", source: "drop", files: [], history: [] };
const f = (path: string, sha256 = "a", bytes = 3) => ({ path, sha256, bytes });

describe("Omni intake", () => {
  it("classifies a game project", () => expect(classify(["g/project.godot", "g/main.gd"])).toBe("Games"));
  it("classifies a book file", () => expect(classify(["My Book.epub"])).toBe("Books"));
  it("ambiguous goes to Inbox", () => expect(classify(["x.epub", "y.wav"])).toBe("Inbox"));
  it("refuses traversal and self-import", () => {
    expect(safeRelative("../etc/passwd")).toBeNull();
    expect(safeRelative("Omni Projects/Games/x")).toBeNull();
  });
  it("unchanged reimport does not duplicate", () => {
    const a = importInto(empty, [f("a.txt")], now).project;
    const b = importInto(a, [f("a.txt")], now);
    expect(b.project.files).toHaveLength(1); expect(b.report.unchanged).toBe(1);
  });
  it("changed same-name file is versioned, not overwritten", () => {
    const a = importInto(empty, [f("a.txt")], now).project;
    const b = importInto(a, [f("a.txt", "b")], now).project;
    expect(b.files.map((x) => x.version)).toEqual([1, 2]); expect(b.files[0]!.sha256).toBe("a");
  });
  it("oversized files are rejected and reported", () => expect(importInto(empty, [f("a", "a", 6_000_000)], now).report.rejected).toHaveLength(1));
  it("recategorize keeps source", () => expect(recategorize(empty, "Books", now).source).toBe("drop"));
  it("persists across reload", () => expect(loadIntake(saveIntake([empty]))[0]!.id).toBe("p"));
});
