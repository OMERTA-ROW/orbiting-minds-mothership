import { describe, expect, it } from "vitest";
import {
  approvalProblems,
  buildMovePlan,
  folderGrantInput,
  grantPathProblem,
  organizeRule,
  planSummary,
  undoOps,
  type FolderGrant,
  type Inventory,
  type PlanOp,
} from "./omni-file-plan";

const NOW = Date.parse("2026-11-12T20:00:00Z");
const G = "/Users/me/Downloads";
const grant: FolderGrant = {
  id: "00000000-0000-4000-8000-000000000001",
  path: G,
  mode: "organize",
  expiresAt: NOW + 86_400_000,
  revokedAt: null,
};
const f = (path: string, o: Partial<Inventory["entries"][number]> = {}) => ({
  path,
  isDir: false,
  isSymlink: false,
  size: 10,
  mtimeMs: NOW - 86_400_000,
  ...o,
});
const inv = (entries: Inventory["entries"]): Inventory => ({
  grantId: grant.id,
  root: G,
  takenAt: NOW,
  truncated: false,
  entries,
});
const rules = [organizeRule.parse({ id: "pdf", extensions: ["pdf"], target: "Documents/PDF" })];

describe("folder permissions (no full disk access)", () => {
  it("accepts a specific folder in your home folder", () => expect(grantPathProblem(G)).toBeNull());
  it.each([
    ["/", "home"],
    ["/Users/me", "whole home"],
    ["/Users/me/Library/Mail", "Library"],
    ["/Users/me/.ssh", ".ssh"],
    ["/Users/me/Downloads/../.ssh", ".."],
    ["/System/Library", "system"],
    ["/Users/Shared/x", "shared"],
    ["/Users/me/Downloads/", "trailing slash"],
  ])("refuses %s (%s)", (p) => expect(grantPathProblem(p)).not.toBeNull());
  it("limits grants to 30 days", () => {
    expect(folderGrantInput.safeParse({ path: G, mode: "organize", days: 30 }).success).toBe(true);
    expect(folderGrantInput.safeParse({ path: G, mode: "organize", days: 31 }).success).toBe(false);
  });
  it("refuses rule targets that escape the folder", () => {
    expect(
      organizeRule.safeParse({ id: "x", extensions: ["pdf"], target: "../Desktop" }).success,
    ).toBe(false);
    expect(organizeRule.safeParse({ id: "x", extensions: ["pdf"], target: "/tmp" }).success).toBe(
      false,
    );
  });
});

describe("dry-run move plan", () => {
  it("plans folder creation and moves, never overwrite or delete", () => {
    const { ops, skipped } = buildMovePlan(
      inv([f(`${G}/a.pdf`), f(`${G}/b.txt`)]),
      grant,
      rules,
      NOW,
    );
    expect(ops.map((o) => o.kind)).toEqual(["mkdir", "mkdir", "move"]);
    expect(planSummary(ops)).toEqual({ folders: 2, moves: 1, renamed: 0, destructive: 0 });
    expect(skipped).toEqual([]);
  });
  it("renames on a name clash instead of overwriting", () => {
    const { ops } = buildMovePlan(
      inv([
        f(`${G}/Documents`, { isDir: true }),
        f(`${G}/Documents/PDF`, { isDir: true }),
        f(`${G}/Documents/PDF/a.pdf`),
        f(`${G}/a.pdf`),
      ]),
      grant,
      rules,
      NOW,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "move",
      to: `${G}/Documents/PDF/a (2).pdf`,
      renamed: true,
    });
  });
  it("skips symlinks, hidden files and anything outside the folder", () => {
    const { ops, skipped } = buildMovePlan(
      inv([f(`${G}/l.pdf`, { isSymlink: true }), f(`${G}/.x.pdf`), f(`/Users/me/Desktop/z.pdf`)]),
      grant,
      rules,
      NOW,
    );
    expect(ops).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      "Outside the granted folder.",
      "Hidden files are left alone.",
      "Symlinks are never moved.",
    ]);
  });
  it("produces nothing for read-only, expired or revoked folders", () => {
    const e = inv([f(`${G}/a.pdf`)]);
    expect(buildMovePlan(e, { ...grant, mode: "read" }, rules, NOW).ops).toEqual([]);
    expect(buildMovePlan(e, { ...grant, expiresAt: NOW - 1 }, rules, NOW).ops).toEqual([]);
    expect(buildMovePlan(e, { ...grant, revokedAt: NOW - 1 }, rules, NOW).ops).toEqual([]);
  });
});

describe("approval and undo", () => {
  const exp = { size: 10, mtimeMs: 1 };
  it("needs each overwrite or trash step confirmed separately", () => {
    const ops: PlanOp[] = [
      { kind: "move", from: `${G}/a`, to: `${G}/b`, expect: exp, rule: "r", renamed: false },
      { kind: "trash", from: `${G}/c`, expect: exp },
    ];
    expect(approvalProblems(ops, grant, new Set(), NOW)).toEqual([
      "Step 2 (trash) needs its own confirmation.",
    ]);
    expect(approvalProblems(ops, grant, new Set([1]), NOW)).toEqual([]);
  });
  it("refuses overwrites without a backup, and steps leaving the folder", () => {
    const bad: PlanOp[] = [
      { kind: "overwrite", from: `${G}/a`, to: `${G}/b`, backup: `${G}/b.bak`, expect: exp },
      {
        kind: "move",
        from: `${G}/a`,
        to: `/Users/me/Desktop/a`,
        expect: exp,
        rule: "r",
        renamed: false,
      },
    ];
    const p = approvalProblems(bad, grant, new Set([0]), NOW);
    expect(p).toContain("Step 1 overwrites without a backup.");
    expect(p).toContain("Step 2 leaves the granted folder.");
  });
  it("undoes applied steps in reverse, restoring backups and trashed files", () => {
    const u = undoOps([
      { index: 0, op: { kind: "mkdir", to: `${G}/D` }, result: "applied" },
      {
        index: 1,
        op: {
          kind: "move",
          from: `${G}/a`,
          to: `${G}/D/a`,
          expect: exp,
          rule: "r",
          renamed: false,
        },
        result: "applied",
      },
      {
        index: 2,
        op: {
          kind: "overwrite",
          from: `${G}/n`,
          to: `${G}/D/n`,
          backup: `${G}/.omni-undo/n`,
          expect: exp,
        },
        result: "applied",
      },
      {
        index: 3,
        op: { kind: "trash", from: `${G}/t`, expect: exp },
        result: "applied",
        trashedTo: "/Users/me/.Trash/t",
      },
      {
        index: 4,
        op: {
          kind: "move",
          from: `${G}/s`,
          to: `${G}/D/s`,
          expect: exp,
          rule: "r",
          renamed: false,
        },
        result: "skipped_changed",
      },
    ]);
    expect(
      u.map((o) =>
        o.kind === "move"
          ? `${o.from}>${o.to}`
          : o.kind === "trash"
            ? `trash:${o.from}`
            : `${o.kind}:${o.to}`,
      ),
    ).toEqual([
      `/Users/me/.Trash/t>${G}/t`,
      `${G}/D/n>${G}/n`,
      `${G}/.omni-undo/n>${G}/D/n`,
      `${G}/D/a>${G}/a`,
      `rmdir_if_empty:${G}/D`,
    ]);
  });
});
