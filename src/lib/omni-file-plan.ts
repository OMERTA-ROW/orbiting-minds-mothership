/**
 * Mac file organization (pure model). The opt-in Mac companion reads only folders the owner
 * granted (never full disk access by default), reports an inventory, and the Mothership builds a
 * dry-run move plan. Nothing is moved until the owner approves the exact plan; overwrite and
 * trash ops need a separate explicit confirmation; every applied op is journaled with an inverse
 * so the plan can be undone. No companion is connected and nothing here touches a filesystem.
 */
import { z } from "zod";

export const FILE_PLAN_LIMITS = {
  maxEntries: 20_000,
  maxOps: 5_000,
  maxPath: 512,
  grantMaxDays: 30,
  maxRules: 20,
} as const;

/** Never grantable, even by the owner: system, credential and app-data locations. */
const BLOCKED_SEGMENTS = new Set([
  "Library",
  "Applications",
  ".ssh",
  ".gnupg",
  ".aws",
  ".config",
  ".kube",
  ".docker",
  ".Trash",
  ".omni-undo",
]);

const CONTROL = /[\u0000-\u001f\u007f]/;

/** A grant must be a folder at least one level inside a macOS home folder, e.g. /Users/me/Downloads. */
export function grantPathProblem(path: string): string | null {
  if (path.length === 0 || path.length > FILE_PLAN_LIMITS.maxPath)
    return "Folder path is empty or too long.";
  if (CONTROL.test(path)) return "Folder path has control characters.";
  if (!path.startsWith("/Users/"))
    return "Only folders inside your home folder (/Users/you/…) can be granted.";
  if (path.endsWith("/")) return "Remove the trailing slash.";
  const parts = path.split("/").slice(1);
  if (parts.some((p) => p === "" || p === "." || p === ".."))
    return "Folder path has empty, '.' or '..' parts.";
  if (parts.length < 3)
    return "Grant a specific folder (for example Downloads), not your whole home folder.";
  if (parts[1] === "Shared") return "The shared Users folder cannot be granted.";
  const blocked = parts.slice(2).find((p) => BLOCKED_SEGMENTS.has(p));
  if (blocked) return `${blocked} cannot be granted.`;
  return null;
}

export const folderGrantInput = z.object({
  path: z
    .string()
    .max(FILE_PLAN_LIMITS.maxPath)
    .refine((p) => grantPathProblem(p) === null, { message: "Folder cannot be granted." }),
  mode: z.enum(["read", "organize"]),
  days: z.number().int().min(1).max(FILE_PLAN_LIMITS.grantMaxDays),
});

export type FolderGrant = {
  id: string;
  path: string;
  mode: "read" | "organize";
  expiresAt: number;
  revokedAt: number | null;
};

export const grantActive = (g: FolderGrant, now: number) =>
  g.revokedAt === null && g.expiresAt > now;

export function insideGrant(path: string, grantPath: string) {
  if (CONTROL.test(path) || path.split("/").some((p) => p === "." || p === "..")) return false;
  return path.startsWith(grantPath + "/");
}

// ---------------------------------------------------------------- inventory and rules

export const inventoryEntry = z.object({
  path: z.string().min(2).max(FILE_PLAN_LIMITS.maxPath),
  isDir: z.boolean(),
  isSymlink: z.boolean(),
  size: z.number().int().min(0),
  mtimeMs: z.number().int().min(0),
});
export type InventoryEntry = z.infer<typeof inventoryEntry>;
export const inventory = z.object({
  grantId: z.string().uuid(),
  root: z.string().max(FILE_PLAN_LIMITS.maxPath),
  takenAt: z.number().int(),
  truncated: z.boolean(),
  entries: z.array(inventoryEntry).max(FILE_PLAN_LIMITS.maxEntries),
});
export type Inventory = z.infer<typeof inventory>;

const relFolder = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (p) =>
      !p.startsWith("/") &&
      !p.endsWith("/") &&
      !CONTROL.test(p) &&
      p.split("/").every((s) => s && s !== "." && s !== ".." && !BLOCKED_SEGMENTS.has(s)),
    {
      message: "Target must be a plain folder inside the granted folder.",
    },
  );
export const organizeRule = z.object({
  id: z.string().min(1).max(40),
  extensions: z
    .array(z.string().regex(/^[a-z0-9]{1,10}$/))
    .max(40)
    .optional(),
  olderThanDays: z.number().int().min(1).max(3650).optional(),
  nameContains: z.string().min(1).max(60).optional(),
  target: relFolder,
});
export type OrganizeRule = z.infer<typeof organizeRule>;
export const rulesInput = z.array(organizeRule).min(1).max(FILE_PLAN_LIMITS.maxRules);

// ---------------------------------------------------------------- plans

export type PlanOp =
  | { kind: "mkdir"; to: string }
  /** `expect: null` only on undo restores of a backup the companion wrote itself. */
  | {
      kind: "move";
      from: string;
      to: string;
      expect: { size: number; mtimeMs: number } | null;
      rule: string;
      renamed: boolean;
    }
  /** Undo only: removes a folder the plan created, and only if it is empty. */
  | { kind: "rmdir_if_empty"; to: string }
  /** Destructive: replaces an existing file. The old file is kept in .omni-undo/ so it can be restored. */
  | {
      kind: "overwrite";
      from: string;
      to: string;
      backup: string;
      expect: { size: number; mtimeMs: number };
    }
  /** Destructive: moves to the macOS Trash (never permanent delete). */
  | { kind: "trash"; from: string; expect: { size: number; mtimeMs: number } };

export const isDestructive = (op: PlanOp) => op.kind === "overwrite" || op.kind === "trash";

const ext = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
};
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const dir = (p: string) => p.slice(0, p.lastIndexOf("/"));
function withSuffix(name: string, n: number) {
  const i = name.lastIndexOf(".");
  return i > 0 ? `${name.slice(0, i)} (${n})${name.slice(i)}` : `${name} (${n})`;
}

function matches(e: InventoryEntry, r: OrganizeRule, now: number) {
  const name = base(e.path);
  if (r.extensions && !r.extensions.includes(ext(name))) return false;
  if (r.olderThanDays && now - e.mtimeMs < r.olderThanDays * 86_400_000) return false;
  if (r.nameContains && !name.toLowerCase().includes(r.nameContains.toLowerCase())) return false;
  return Boolean(r.extensions || r.olderThanDays || r.nameContains);
}

/**
 * Dry run. Only regular files inside the grant are considered; symlinks and folders are skipped.
 * Name clashes get a "name (2).ext" rename, so the generated plan never overwrites or deletes.
 */
export function buildMovePlan(
  inv: Inventory,
  grant: FolderGrant,
  rules: OrganizeRule[],
  now: number,
) {
  const skipped: { path: string; reason: string }[] = [];
  if (!grantActive(grant, now))
    return {
      ops: [] as PlanOp[],
      skipped: [{ path: grant.path, reason: "Folder permission expired or revoked." }],
    };
  if (grant.mode !== "organize")
    return {
      ops: [] as PlanOp[],
      skipped: [{ path: grant.path, reason: "This folder is granted read-only." }],
    };
  if (inv.root !== grant.path)
    return {
      ops: [] as PlanOp[],
      skipped: [{ path: inv.root, reason: "Inventory is for a different folder." }],
    };
  const taken = new Set(inv.entries.map((e) => e.path));
  const dirs = new Set(inv.entries.filter((e) => e.isDir && !e.isSymlink).map((e) => e.path));
  const ops: PlanOp[] = [];
  const mk = new Set<string>();
  const targets = new Set(rules.map((r) => `${grant.path}/${r.target}`));
  for (const e of [...inv.entries].sort((a, b) => a.path.localeCompare(b.path))) {
    if (ops.length >= FILE_PLAN_LIMITS.maxOps) {
      skipped.push({ path: e.path, reason: "Plan size limit reached." });
      continue;
    }
    if (!insideGrant(e.path, grant.path)) {
      skipped.push({ path: e.path, reason: "Outside the granted folder." });
      continue;
    }
    if (e.isSymlink) {
      skipped.push({ path: e.path, reason: "Symlinks are never moved." });
      continue;
    }
    if (e.isDir) continue;
    if ([...targets].some((t) => e.path.startsWith(t + "/"))) continue; // already organized
    if (base(e.path).startsWith(".")) {
      skipped.push({ path: e.path, reason: "Hidden files are left alone." });
      continue;
    }
    const rule = rules.find((r) => matches(e, r, now));
    if (!rule) continue;
    const folder = `${grant.path}/${rule.target}`;
    // Create each missing parent folder once, outermost first.
    const parts = rule.target.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const d = `${grant.path}/${parts.slice(0, i).join("/")}`;
      if (!dirs.has(d) && !mk.has(d)) {
        if (taken.has(d)) {
          skipped.push({ path: e.path, reason: `${d} exists and is not a folder.` });
          break;
        }
        mk.add(d);
        ops.push({ kind: "mkdir", to: d });
      }
    }
    let to = `${folder}/${base(e.path)}`;
    let n = 2;
    while (taken.has(to) && n < 1000) to = `${folder}/${withSuffix(base(e.path), n++)}`;
    if (taken.has(to)) {
      skipped.push({ path: e.path, reason: "No free name found." });
      continue;
    }
    taken.add(to);
    ops.push({
      kind: "move",
      from: e.path,
      to,
      expect: { size: e.size, mtimeMs: e.mtimeMs },
      rule: rule.id,
      renamed: n > 2,
    });
  }
  return { ops, skipped };
}

export function planSummary(ops: PlanOp[]) {
  return {
    folders: ops.filter((o) => o.kind === "mkdir").length,
    moves: ops.filter((o) => o.kind === "move").length,
    renamed: ops.filter((o) => o.kind === "move" && o.renamed).length,
    destructive: ops.filter(isDestructive).length,
  };
}

/** Stable text the plan digest is computed over; the companion must recompute and match it before applying. */
export const canonicalPlan = (planId: string, grantPath: string, ops: PlanOp[]) =>
  JSON.stringify({ contract: "omni.files/v1", planId, grantPath, ops });

/**
 * Approval check before applying. Every op must stay inside the grant, and destructive ops must
 * be confirmed individually (by index) in addition to approving the plan.
 */
export function approvalProblems(
  ops: PlanOp[],
  grant: FolderGrant,
  confirmedDestructive: ReadonlySet<number>,
  now: number,
): string[] {
  const p: string[] = [];
  if (!grantActive(grant, now)) p.push("Folder permission expired or revoked.");
  if (grant.mode !== "organize") p.push("This folder is granted read-only.");
  ops.forEach((op, i) => {
    const paths =
      op.kind === "mkdir" || op.kind === "rmdir_if_empty"
        ? [op.to]
        : op.kind === "trash"
          ? [op.from]
          : op.kind === "overwrite"
            ? [op.from, op.to, op.backup]
            : [op.from, op.to];
    if (!paths.every((x) => insideGrant(x, grant.path)))
      p.push(`Step ${i + 1} leaves the granted folder.`);
    if (op.kind === "overwrite" && !op.backup.startsWith(`${grant.path}/.omni-undo/`))
      p.push(`Step ${i + 1} overwrites without a backup.`);
    if (isDestructive(op) && !confirmedDestructive.has(i))
      p.push(`Step ${i + 1} (${op.kind}) needs its own confirmation.`);
  });
  return p;
}

// ---------------------------------------------------------------- journal and undo

export type JournalEntry = {
  index: number;
  op: PlanOp;
  result: "applied" | "skipped_changed" | "skipped_missing" | "failed";
  /** For trash: where the companion reports the file now is. */
  trashedTo?: string;
};

/** Inverse ops for applied entries, newest first. Undo re-checks identity before each step. */
export function undoOps(journal: JournalEntry[]): PlanOp[] {
  const out: PlanOp[] = [];
  for (const j of [...journal].sort((a, b) => b.index - a.index)) {
    if (j.result !== "applied") continue;
    const op = j.op;
    if (op.kind === "move")
      out.push({
        kind: "move",
        from: op.to,
        to: op.from,
        expect: op.expect,
        rule: "undo",
        renamed: false,
      });
    else if (op.kind === "overwrite") {
      out.push({
        kind: "move",
        from: op.to,
        to: op.from,
        expect: op.expect,
        rule: "undo",
        renamed: false,
      });
      out.push({
        kind: "move",
        from: op.backup,
        to: op.to,
        expect: null,
        rule: "undo-restore",
        renamed: false,
      });
    } else if (op.kind === "trash" && j.trashedTo)
      out.push({
        kind: "move",
        from: j.trashedTo,
        to: op.from,
        expect: op.expect,
        rule: "undo-trash",
        renamed: false,
      });
  }
  // Folders created by the plan are removed last, deepest first, only if empty (companion checks).
  for (const j of [...journal].sort((a, b) => b.index - a.index))
    if (j.result === "applied" && j.op.kind === "mkdir")
      out.push({ kind: "rmdir_if_empty", to: j.op.to });
  return out;
}

export const parentFolder = dir;
